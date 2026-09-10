import { expect, test } from "vitest";

import { createClient, type FetchLike } from "../src/index.js";

/** Fails the test if the rail is ever reached. */
const forbidden: FetchLike = async () => {
  throw new Error("the rail must not be called");
};

const client = (over: Partial<Parameters<typeof createClient>[0]> = {}) =>
  createClient({
    baseUrl: "https://api.paycrest.io",
    apiKey: "test-key",
    fetch: forbidden,
    maxTxUsdt: "50",
    killSwitch: false,
    enabledCorridors: ["NGN"],
    ...over,
  });

const order = (usdtAmount: string, corridor: "NGN" | "KES" = "NGN") => ({
  corridor,
  usdtAmount,
  body: {},
});

// Paycrest is mainnet-only. Each of these guards protects real money, so each
// one asserts the rail was never reached, not merely that we threw.

test("the kill switch refuses an order before the rail is reached", async () => {
  await expect(
    client({ killSwitch: true }).createOrder(order("1")),
  ).rejects.toThrow(/kill switch/i);
});

test("an amount over the cap is refused", async () => {
  await expect(client().createOrder(order("50.01"))).rejects.toThrow(/cap/i);
});

test("an amount exactly at the cap is allowed through the guard", async () => {
  // Reaches the rail, which our fake refuses — proving the guard passed.
  await expect(client().createOrder(order("50"))).rejects.toThrow(
    "the rail must not be called",
  );
});

test("a corridor that is switched off is refused", async () => {
  await expect(client().createOrder(order("1", "KES"))).rejects.toThrow(
    /KES is not enabled/i,
  );
});

test("an amount carrying more precision than USDT is refused, not truncated", async () => {
  // USDT has six decimals. Quietly truncating the seventh would send an
  // amount the user never agreed to, and the difference would only ever
  // surface as an unreconcilable receipt.
  await expect(client().createOrder(order("1.0000001"))).rejects.toThrow(
    /precision/i,
  );
});
