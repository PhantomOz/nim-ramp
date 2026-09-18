import type { PaycrestClient } from "@ramp/rails";
import { expect, test } from "vitest";

import { createApp, type Funder } from "../src/app.js";
import type { DripRecord } from "../src/driplog.js";
import type { OrderRecord, Store } from "../src/store.js";

const USER = "0xAbC0000000000000000000000000000000000001";

function deps(over: { funder?: Partial<Funder> | null } = {}) {
  const records: OrderRecord[] = [
    {
      ref: "NR-SELLSELL",
      orderId: "ord-1",
      direction: "cash_out",
      corridor: "NGN",
      chain: "polygon",
      symbol: "USDT",
      amount: "10",
      address: USER,
      createdAt: new Date().toISOString(),
    },
  ];
  const store: Store = {
    put: (r) => void records.push(r),
    byRef: (ref) => records.find((r) => r.ref === ref),
    byOrderId: (id) => records.find((r) => r.orderId === id),
  };

  const drips: DripRecord[] = [];
  const dripLog = {
    put: (r: DripRecord) => void drips.push(r),
    dripped: (ref: string) => drips.some((d) => d.ref === ref),
    spentToday: () => 0n,
  };

  const funder: Funder | undefined =
    over.funder === null
      ? undefined
      : ({
          read: async () => ({ balance: 0n, gasPrice: 100_000_000_000n }),
          send: async () => "0xfeed",
          ...over.funder,
        } as Funder);

  return {
    app: createApp({
      client: {} as unknown as PaycrestClient,
      store,
      dripLog,
      ...(funder === undefined ? {} : { funder }),
      webhookSecret: "s",
      maxTxUsdt: "50",
      onStatus: () => undefined,
    }),
    drips,
  };
}

const post = (app: ReturnType<typeof deps>["app"], body: unknown) =>
  app.request("/api/gas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("funds a cash-out wallet that cannot pay for its own transfer", async () => {
  const { app, drips } = deps();
  const res = await post(app, { ref: "NR-SELLSELL", address: USER });

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ txHash: "0xfeed" });

  // Recorded, or the one-shot guard has nothing to read.
  expect(drips).toHaveLength(1);
  expect(drips[0]).toMatchObject({ ref: "NR-SELLSELL", chain: "polygon" });
});

test("refuses a second request for the same reference", async () => {
  const { app } = deps();
  await post(app, { ref: "NR-SELLSELL", address: USER });
  const res = await post(app, { ref: "NR-SELLSELL", address: USER });
  expect(res.status).toBe(409);
});

test("refuses an address that does not own the order", async () => {
  const { app, drips } = deps();
  const res = await post(app, {
    ref: "NR-SELLSELL",
    address: "0x000000000000000000000000000000000000dEaD",
  });
  expect(res.status).toBe(403);
  expect(drips).toHaveLength(0);
});

test("says so plainly when no funding wallet is configured", async () => {
  // Running without a key must be a clear refusal, never a crash — the rest
  // of the app works fine without the faucet.
  const { app } = deps({ funder: null });
  const res = await post(app, { ref: "NR-SELLSELL", address: USER });
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ error: expect.stringMatching(/gas/i) });
});

test("a failed send does not burn the one attempt", async () => {
  // Recording before the chain confirms would mark the order funded when
  // nothing was sent, and the user could never ask again.
  const { app, drips } = deps({
    funder: { send: async () => Promise.reject(new Error("rpc down")) },
  });

  const res = await post(app, { ref: "NR-SELLSELL", address: USER });
  expect(res.status).toBe(502);
  expect(drips).toHaveLength(0);
});

test("an unknown API route answers in JSON, like every other API route", async () => {
  // The app reads every API response as JSON. A plain-text 404 from the
  // framework's default makes a mistyped route surface as a parse error,
  // which points at the payload rather than at the wrong URL.
  const { app } = deps();
  const res = await app.request("/api/does-not-exist");

  expect(res.status).toBe(404);
  expect(res.headers.get("content-type")).toMatch(/application\/json/);
  expect(await res.json()).toMatchObject({ error: expect.any(String) });
});
