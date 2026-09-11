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
    // A cash-in converts fiat to stablecoin before the cap is checked, so
    // every cash-in path needs a rate.
    rates: async () => ({ rate: "1375", providerIds: ["AbCdEfGh"] }),
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
      maxTxUsdt: "50",
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
      refundAccount: {
        institution: "GTBINGLA",
        accountIdentifier: "0123456789",
        accountName: "ADAEZE OKAFOR",
      },
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
      refundAccount: {
        institution: "GTBINGLA",
        accountIdentifier: "0123456789",
        accountName: "ADAEZE OKAFOR",
      },
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
      refundAccount: {
        institution: "GTBINGLA",
        accountIdentifier: "0123456789",
        accountName: "ADAEZE OKAFOR",
      },
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
      refundAccount: {
        institution: "GTBINGLA",
        accountIdentifier: "0123456789",
        accountName: "ADAEZE OKAFOR",
      },
    }),
  });

  expect(res.status).toBe(409);
});

test("a cash-in without a refund account is refused before the rail sees it", async () => {
  // The rail requires `source.refundAccount` on a fiat source — it is where
  // the money goes back to if the on-ramp fails. Sending the order without it
  // earns "Failed to validate payload", which tells the user nothing.
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
    body: body({
      direction: "cash_in",
      corridor: "NGN",
      chain: "polygon",
      symbol: "USDT",
      amount: "10",
      address: "0xABC0000000000000000000000000000000000001",
    }),
  });

  expect(res.status).toBe(400);
  expect((await res.json()) as { error: string }).toMatchObject({
    error: expect.stringMatching(/refund/i) as unknown as string,
  });
  expect(reached).toBe(false);
});

test("a cash-in passes the refund account through to the rail", async () => {
  let sent: Record<string, unknown> | null = null;
  const { app } = deps({
    client: {
      createOrder: async (params: { body: Record<string, unknown> }) => {
        sent = params.body;
        return { id: "ord-2", status: "initiated", amount: "10" };
      },
    } as unknown as Partial<PaycrestClient>,
  });

  await app.request("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body({
      direction: "cash_in",
      corridor: "NGN",
      chain: "polygon",
      symbol: "USDT",
      amount: "10",
      address: "0xABC0000000000000000000000000000000000001",
      refundAccount: {
        institution: "GTBINGLA",
        accountIdentifier: "0123456789",
        accountName: "ADAEZE OKAFOR",
      },
    }),
  });

  expect(sent).not.toBeNull();
  expect((sent as unknown as { source: Record<string, unknown> }).source).toMatchObject({
    type: "fiat",
    refundAccount: { institution: "GTBINGLA" },
  });
});

test("institutions are proxied so the browser never needs the API key", async () => {
  const { app } = deps({
    client: {
      institutions: async () => [
        { name: "Guaranty Trust Bank", code: "GTBINGLA", type: "bank" },
      ],
    } as unknown as Partial<PaycrestClient>,
  });

  const res = await app.request("/api/institutions/NGN");
  expect(res.status).toBe(200);
  expect((await res.json()) as unknown[]).toHaveLength(1);
});

test("an account is verified before we commit an order to it", async () => {
  const { app } = deps({
    client: {
      verifyAccount: async () => "ADAEZE OKAFOR",
    } as unknown as Partial<PaycrestClient>,
  });

  const res = await app.request("/api/verify-account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body({ institution: "GTBINGLA", accountIdentifier: "0123456789" }),
  });

  expect(res.status).toBe(200);
  expect((await res.json()) as { accountName: string }).toMatchObject({
    accountName: "ADAEZE OKAFOR",
  });
});

test("an unavailable verifier is distinguished from a rejected account", async () => {
  // Paycrest's verify-account is answering 504 with a Cloudflare HTML page.
  // "We cannot check right now" and "that account is wrong" are different
  // answers, and collapsing them either blocks every transfer during an
  // outage or waves a mistyped account number through.
  const { PaycrestError } = await import("@ramp/rails");

  const unavailable = createApp({
    client: {
      verifyAccount: async () => {
        throw new PaycrestError("rail returned a non-JSON body (504): <!DOCTYPE", 504);
      },
    } as unknown as PaycrestClient,
    store: { put: () => undefined, byRef: () => undefined, byOrderId: () => undefined },
    webhookSecret: SECRET,
    maxTxUsdt: "50",
    onStatus: () => undefined,
  });

  const res = await unavailable.request("/api/verify-account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body({ institution: "GTBINGLA", accountIdentifier: "0123456789" }),
  });

  expect(res.status).toBe(503);
  expect((await res.json()) as { kind: string }).toMatchObject({ kind: "unavailable" });
});

test("a genuinely wrong account is still a rejection", async () => {
  const { PaycrestError } = await import("@ramp/rails");
  const rejecting = createApp({
    client: {
      verifyAccount: async () => {
        throw new PaycrestError("failed to verify account with any provider", 400);
      },
    } as unknown as PaycrestClient,
    store: { put: () => undefined, byRef: () => undefined, byOrderId: () => undefined },
    webhookSecret: SECRET,
    maxTxUsdt: "50",
    onStatus: () => undefined,
  });

  const res = await rejecting.request("/api/verify-account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body({ institution: "GTBINGLA", accountIdentifier: "0000000000" }),
  });

  expect(res.status).toBe(422);
  expect((await res.json()) as { kind: string }).toMatchObject({ kind: "rejected" });
});

test("a cash-in cap is applied to the stablecoin value, not the fiat typed", async () => {
  // 2000 NGN at ~1375 is about 1.45 USDT — far under a 50 USDT cap. Comparing
  // the typed 2000 against the cap reads naira as dollars and refuses a
  // transfer worth a dollar and a half.
  let capChecked: string | null = null;
  const { app } = deps({
    client: {
      rates: async () => ({ rate: "1375", providerIds: ["AbCdEfGh"] }),
      createOrder: async (p: { stablecoinAmount: string }) => {
        capChecked = p.stablecoinAmount;
        return { id: "ord-3", status: "initiated", amount: "2000" };
      },
    } as unknown as Partial<PaycrestClient>,
  });

  const res = await app.request("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body({
      direction: "cash_in",
      corridor: "NGN",
      chain: "polygon",
      symbol: "USDT",
      amount: "2000",
      address: "0xABC0000000000000000000000000000000000001",
      refundAccount: {
        institution: "GTBINGLA",
        accountIdentifier: "0123456789",
        accountName: "ADAEZE OKAFOR",
      },
    }),
  });

  expect(res.status).toBe(201);
  expect(Number(capChecked)).toBeCloseTo(2000 / 1375, 4);
});

test("a cash-out checks the cap against the amount as typed", async () => {
  // Cash-out is already denominated in the token, so it passes through.
  let capChecked: string | null = null;
  const { app } = deps({
    client: {
      createOrder: async (p: { stablecoinAmount: string }) => {
        capChecked = p.stablecoinAmount;
        return { id: "ord-4", status: "initiated", amount: "25" };
      },
    } as unknown as Partial<PaycrestClient>,
  });

  await app.request("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body({
      direction: "cash_out",
      corridor: "NGN",
      chain: "polygon",
      symbol: "USDT",
      amount: "25",
      address: "0x49A241Fda5A00BcE73F0CaD7A4F2b3885Ce08F4f",
      recipient: {
        institution: "GTBINGLA",
        accountIdentifier: "0123456789",
        accountName: "ADAEZE OKAFOR",
      },
    }),
  });

  expect(capChecked).toBe("25");
});

test("the client cannot tell us what its fiat is worth", async () => {
  // The cap is a safety control. If the browser supplied the conversion, any
  // amount could be declared worth a dollar and walk past it.
  let capChecked: string | null = null;
  const { app } = deps({
    client: {
      rates: async () => ({ rate: "1375", providerIds: ["AbCdEfGh"] }),
      createOrder: async (p: { stablecoinAmount: string }) => {
        capChecked = p.stablecoinAmount;
        return { id: "ord-5", status: "initiated", amount: "9999999" };
      },
    } as unknown as Partial<PaycrestClient>,
  });

  await app.request("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body({
      direction: "cash_in",
      corridor: "NGN",
      chain: "polygon",
      symbol: "USDT",
      amount: "9999999",
      stablecoinAmount: "0.01", // a lie the server must ignore
      address: "0xABC0000000000000000000000000000000000001",
      refundAccount: {
        institution: "GTBINGLA",
        accountIdentifier: "0123456789",
        accountName: "ADAEZE OKAFOR",
      },
    }),
  });

  expect(Number(capChecked)).toBeCloseTo(9999999 / 1375, 2);
});

test("the cap is readable, so the app can show it before someone hits it", async () => {
  const { app } = deps();
  const res = await app.request("/api/limits");
  expect(res.status).toBe(200);
  expect((await res.json()) as { maxTxUsdt: string }).toMatchObject({
    maxTxUsdt: "50",
  });
});

test("a cash-out sends a refund address, because the rail requires one", async () => {
  // "Invalid Ethereum refund address" is what the rail says without it. It is
  // where the stablecoin returns if the payout cannot be made — the mirror of
  // the refund account a cash-in needs.
  let sent: Record<string, unknown> | null = null;
  const { app } = deps({
    client: {
      createOrder: async (p: { body: Record<string, unknown> }) => {
        sent = p.body;
        return { id: "ord-6", status: "initiated", amount: "2" };
      },
    } as unknown as Partial<PaycrestClient>,
  });

  const res = await app.request("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body({
      direction: "cash_out",
      corridor: "NGN",
      chain: "polygon",
      symbol: "USDT",
      amount: "2",
      address: "0x49A241Fda5A00BcE73F0CaD7A4F2b3885Ce08F4f",
      recipient: {
        institution: "GTBINGLA",
        accountIdentifier: "0123456789",
        accountName: "ADAEZE OKAFOR",
      },
    }),
  });

  expect(res.status).toBe(201);
  expect((sent as unknown as { source: Record<string, unknown> }).source).toMatchObject({
    type: "crypto",
    network: "polygon",
    refundAddress: "0x49A241Fda5A00BcE73F0CaD7A4F2b3885Ce08F4f",
  });
});

test("a cash-out without a refund address is refused before the rail sees it", async () => {
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
    body: body({
      direction: "cash_out",
      corridor: "NGN",
      chain: "polygon",
      symbol: "USDT",
      amount: "2",
      recipient: {
        institution: "GTBINGLA",
        accountIdentifier: "0123456789",
        accountName: "ADAEZE OKAFOR",
      },
    }),
  });

  expect(res.status).toBe(400);
  expect(reached).toBe(false);
});

test("a cash-out response carries the address to send the stablecoin to", async () => {
  const { app } = deps({
    client: {
      createOrder: async () => ({
        id: "ord-7",
        status: "initiated",
        amount: "2",
        providerAccount: {
          network: "polygon",
          receiveAddress: "0xFB411cC6385AF50A562AFcB441864e9d541cdA67",
          validUntil: "2026-09-11T19:00:00Z",
        },
      }),
    } as unknown as Partial<PaycrestClient>,
  });

  const res = await app.request("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body({
      direction: "cash_out",
      corridor: "NGN",
      chain: "polygon",
      symbol: "USDT",
      amount: "2",
      address: "0x49A241Fda5A00BcE73F0CaD7A4F2b3885Ce08F4f",
      recipient: {
        institution: "GTBINGLA",
        accountIdentifier: "0123456789",
        accountName: "ADAEZE OKAFOR",
      },
    }),
  });

  const json = (await res.json()) as { receiveAddress?: string; validUntil?: string };
  expect(json.receiveAddress).toBe("0xFB411cC6385AF50A562AFcB441864e9d541cdA67");
  expect(json.validUntil).toBe("2026-09-11T19:00:00Z");
});

test("status carries what a receipt needs, from the rail's own record", async () => {
  // A receipt assembled from what the browser remembered is a receipt that
  // can disagree with the rail. These come back from the order itself.
  const { app } = deps({
    client: {
      getOrder: async () => ({
        id: "ord-1",
        status: "settled",
        amount: "1.454175",
        rate: "1375.35",
        senderFee: "0.0073",
        txHash: "0x19a646c0",
        updatedAt: "2026-09-11T18:23:15Z",
        destination: {
          recipient: {
            institution: "GTBINGLA",
            accountIdentifier: "0123456789",
            accountName: "ADAEZE OKAFOR",
          },
        },
      }),
    } as unknown as Partial<PaycrestClient>,
  });

  const created = await app.request("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body({
      direction: "cash_in",
      corridor: "NGN",
      chain: "polygon",
      symbol: "USDT",
      amount: "2000",
      address: "0xABC0000000000000000000000000000000000001",
      refundAccount: {
        institution: "GTBINGLA",
        accountIdentifier: "0123456789",
        accountName: "ADAEZE OKAFOR",
      },
    }),
  });
  const { ref } = (await created.json()) as { ref: string };

  const res = await app.request(`/api/orders/${ref}`);
  expect((await res.json()) as unknown).toMatchObject({
    state: "completed",
    amount: "1.454175",
    rate: "1375.35",
    senderFee: "0.0073",
    txHash: "0x19a646c0",
    recipient: { accountName: "ADAEZE OKAFOR" },
  });
});
