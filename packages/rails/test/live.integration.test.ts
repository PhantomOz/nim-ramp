import { describe, expect, test } from "vitest";

import { CHAINS, CORRIDORS } from "@ramp/core";

import {
  classifyRefusal,
  createClient,
  type FetchLike,
  PaycrestError,
} from "../src/index.js";

const apiKey = process.env["RAILS_API_KEY"];
const baseUrl = process.env["RAILS_API_BASE"] ?? "https://api.paycrest.io";

const realFetch: FetchLike = (url, init) => globalThis.fetch(url, init);

// Skipped unless credentials are present, so `pnpm test` never touches the
// network. Run deliberately with `pnpm test:live`.
describe.skipIf(apiKey === undefined)("Paycrest, live", () => {
  // Kill switch on, zero cap, no corridors enabled. This client cannot create
  // an order even if a test asks it to — read-only by construction, which is
  // the only safe way to talk to a mainnet-only rail from a test suite.
  const client = createClient({
    baseUrl,
    apiKey: apiKey ?? "",
    fetch: realFetch,
    maxTxUsdt: "0",
    killSwitch: true,
    enabledCorridors: [],
  });

  test("the public rates endpoint answers for every corridor we serve", async () => {
    for (const corridor of CORRIDORS) {
      const rate = await client.rates({
        network: "polygon",
        from: "USDT",
        amount: "100",
        to: corridor,
        side: "sell",
      });
      expect(Number(rate.rate)).toBeGreaterThan(0);
      expect(rate.providerIds.length).toBeGreaterThan(0);
    }
  }, 30_000);

  test("Paycrest still serves every chain in our registry", async () => {
    // The registry is the intersection of two lists that move independently.
    // Paycrest's own docs already disagree with its API — they list optimism,
    // which the API rejects, and omit ethereum and bnb-smart-chain, which it
    // serves. So the API is the authority and this is the canary.
    for (const chain of CHAINS) {
      for (const symbol of ["USDT", "USDC"] as const) {
        const rate = await client.rates({
          network: chain.slug,
          from: symbol,
          amount: "100",
          to: "NGN",
          side: "sell",
        });
        expect(Number(rate.rate)).toBeGreaterThan(0);
      }
    }
  }, 90_000);

  test("a gap in coverage is liquidity, never support", async () => {
    // The error this exists to prevent: reading "no provider available" as
    // "this corridor is unsupported", and baking one minute's liquidity into
    // a constant that outlives it. Every corridor the rail lists works both
    // ways; whether anyone is quoting a given size right now does not.
    const probes = [
      ["base", "USDT", "UGX", "sell"],
      ["ethereum", "USDT", "TZS", "sell"],
      ["polygon", "USDT", "NGN", "buy"],
      ["polygon", "USDT", "UGX", "buy"],
    ] as const;

    for (const [network, from, to, side] of probes) {
      const refusal = await client
        .rates({ network, from, amount: "100", to, side })
        .then(() => null)
        .catch((e: unknown) =>
          classifyRefusal(e instanceof Error ? e.message : String(e)),
        );

      // Filled is fine — liquidity comes and goes, which is the point.
      if (refusal === null) continue;

      expect(
        refusal.kind,
        `${side} ${network} ${from}->${to}: ${refusal.message}`,
      ).toBe("no-liquidity");
    }
  }, 90_000);

  test("the only structural refusals are the two we know about", async () => {
    const optimism = await client
      .rates({
        network: "optimism" as never,
        from: "USDT",
        amount: "100",
        to: "NGN",
        side: "sell",
      })
      .then(() => null)
      .catch((e: unknown) =>
        classifyRefusal(e instanceof Error ? e.message : String(e)),
      );
    expect(optimism?.kind).toBe("structural");

    const ghs = await client
      .rates({
        network: "polygon",
        from: "USDT",
        amount: "100",
        to: "GHS" as never,
        side: "sell",
      })
      .then(() => null)
      .catch((e: unknown) =>
        classifyRefusal(e instanceof Error ? e.message : String(e)),
      );
    expect(ghs?.kind).toBe("structural");
  }, 60_000);

  test("our API key authenticates", async () => {
    // A well-formed but nonexistent order id. Paycrest answers 404 "Payment
    // order not found" for a valid key and 400 "Invalid API key ID" for a
    // bad one — so the message is the assertion, not the status. Checking
    // only for "not 401" would pass with a completely wrong key.
    const error: unknown = await client
      .getOrder("00000000-0000-4000-8000-000000000000")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PaycrestError);
    expect((error as PaycrestError).message).toMatch(/payment order not found/i);
    expect((error as PaycrestError).status).toBe(404);
  }, 30_000);

  test("the corridors disagree about what a recipient even is", async () => {
    // Nigeria is banks-only, Uganda is mobile-money-only. Anything that
    // collects a recipient depends on this, so it is worth a canary: if
    // Paycrest adds Nigerian mobile money or a Ugandan bank, a failing test
    // should tell us before a user does.
    const ngn = await client.institutions("NGN");
    const ugx = await client.institutions("UGX");

    expect(ngn.length).toBeGreaterThan(100);
    expect(ngn.every((i) => i.type === "bank")).toBe(true);
    expect(ugx.every((i) => i.type === "mobile_money")).toBe(true);
  }, 30_000);

  test("this client refuses to create an order", async () => {
    await expect(
      client.createOrder({ corridor: "NGN", usdtAmount: "1", body: {} }),
    ).rejects.toThrow(/kill switch/i);
  });
});
