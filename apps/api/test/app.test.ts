import { createHmac } from "node:crypto";

import type { PaycrestClient } from "@ramp/rails";
import { expect, test } from "vitest";

import { createApp } from "../src/app.js";
import type { OrderRecord, Store } from "../src/store.js";

const SECRET = "webhook-secret";

function deps(over: Partial<{ client: Partial<PaycrestClient> }> = {}) {
  const records: OrderRecord[] = [];
  const store: Store = {
    put: (r) => void records.push(r),
    byRef: (ref) => records.find((r) => r.ref === ref),
    byOrderId: (id) => records.find((r) => r.orderId === id),
  };

  const client = {
    createOrder: async () => ({
      id: "ord-1",
      status: "initiated",
      amount: "10",
      providerAccount: {
        institution: "Guaranty Trust Bank",
        accountIdentifier: "0123456789",
        accountName: "Provider A / NimRamp",
        amountToTransfer: "13595",
        currency: "NGN",
        validUntil: "2026-09-11T10:30:00Z",
      },
    }),
    getOrder: async () => ({ id: "ord-1", status: "settled", amount: "10" }),
    ...over.client,
  } as unknown as PaycrestClient;

  return {
    app: createApp({
      client,
      store,
      webhookSecret: SECRET,
      onStatus: () => undefined,
    }),
    records,
  };
}

const body = (o: unknown) => JSON.stringify(o);

test("creating an order returns the rail's own account details and our reference", async () => {
  const { app, records } = deps();
  const res = await app.request("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body({
      direction: "cash_in",
      corridor: "NGN",
      chain: "polygon",
      symbol: "USDT",
      amount: "10",
      address: "0xABC0000000000000000000000000000000000001",
    }),
  });

  expect(res.status).toBe(201);
  const json = (await res.json()) as Record<string, unknown>;
  expect(String(json["ref"])).toMatch(/^NR-/);
  expect(json["account"]).toMatchObject({ accountIdentifier: "0123456789" });
  expect(records).toHaveLength(1);
});

test("a response never carries the API key or the webhook secret", async () => {
  const { app } = deps();
  const res = await app.request("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body({
      direction: "cash_in",
      corridor: "NGN",
      chain: "polygon",
      symbol: "USDT",
      amount: "10",
      address: "0xABC0000000000000000000000000000000000001",
    }),
  });
  expect(await res.text()).not.toContain(SECRET);
});

test("a malformed order request is refused before the rail is called", async () => {
  let reached = false;
  const { app } = deps({
    client: {
      createOrder: async () => {
        reached = true;
        throw new Error("should not be called");
      },
    } as Partial<PaycrestClient>,
  });

  const res = await app.request("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body({ direction: "sideways", corridor: "XXX" }),
  });

  expect(res.status).toBe(400);
  expect(reached).toBe(false);
});

test("status is read back from the rail, not from our own store", async () => {
  const { app } = deps();
  const created = await app.request("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body({
      direction: "cash_in",
      corridor: "NGN",
      chain: "polygon",
      symbol: "USDT",
      amount: "10",
      address: "0xABC0000000000000000000000000000000000001",
    }),
  });
  const { ref } = (await created.json()) as { ref: string };

  const res = await app.request(`/api/orders/${ref}`);
  expect(res.status).toBe(200);
  // "settled" on the rail is "completed" in our machine.
  expect((await res.json()) as unknown).toMatchObject({ state: "completed" });
});

test("an unknown reference is a 404, not an empty order", async () => {
  const { app } = deps();
  expect((await app.request("/api/orders/NR-NOPE")).status).toBe(404);
});

test("a webhook with a bad signature is rejected", async () => {
  const { app } = deps();
  const payload = body({ event: "payment_order.settled", data: { id: "ord-1" } });
  const res = await app.request("/api/webhooks/paycrest", {
    method: "POST",
    headers: { "X-Paycrest-Signature": "0".repeat(64) },
    body: payload,
  });
  expect(res.status).toBe(401);
});

test("a webhook signed over the exact bytes is accepted", async () => {
  const { app } = deps();
  const payload = body({ event: "payment_order.settled", data: { id: "ord-1" } });
  const signature = createHmac("sha256", SECRET).update(payload, "utf8").digest("hex");

  const res = await app.request("/api/webhooks/paycrest", {
    method: "POST",
    headers: { "X-Paycrest-Signature": signature },
    body: payload,
  });
  expect(res.status).toBe(200);
});

test("verification uses the raw body, so key order cannot be normalised away", async () => {
  // A handler that verifies against JSON.stringify(parsedBody) accepts this.
  // Ours must not: the signature covers bytes, not meaning.
  const { app } = deps();
  const sent = '{"event":"payment_order.settled","data":{"id":"ord-1"}}';
  const reordered = '{"data":{"id":"ord-1"},"event":"payment_order.settled"}';
  const signature = createHmac("sha256", SECRET).update(sent, "utf8").digest("hex");

  const res = await app.request("/api/webhooks/paycrest", {
    method: "POST",
    headers: { "X-Paycrest-Signature": signature },
    body: reordered,
  });
  expect(res.status).toBe(401);
});

test("our own refusal is not reported as a rail failure", async () => {
  // The client's cap, kill switch and corridor guards throw before the rail
  // is contacted. Returning 502 would blame Paycrest for our configuration
  // and send whoever is on call to the wrong place.
  const { PaycrestError } = await import("@ramp/rails");
  const { app } = deps({
    client: {
      createOrder: async () => {
        throw new PaycrestError("corridor NGN is not enabled", 0);
      },
    } as Partial<PaycrestClient>,
  });

  const res = await app.request("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body({
      direction: "cash_in",
      corridor: "NGN",
      chain: "polygon",
      symbol: "USDT",
      amount: "10",
      address: "0xABC0000000000000000000000000000000000001",
    }),
  });

  expect(res.status).toBe(409);
});
