import { describe, expect, test } from "vitest";

import { CHAINS, CORRIDORS, supports } from "@ramp/core";

import { createClient, type FetchLike, PaycrestError } from "../src/index.js";

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

  test("the support matrix still matches the rail", async () => {
    // The matrix is hardcoded for a fast local answer, so it can drift. These
    // are the load-bearing claims rather than all eighty cells: the two
    // directions are wildly asymmetric, and a UI built on a stale matrix
    // offers people transfers that cannot happen.
    const claims = [
      ["cash_out", "polygon", "USDT", "NGN"],
      ["cash_out", "base", "USDC", "UGX"],
      ["cash_out", "base", "USDT", "KES"], // expected unsupported
      ["cash_in", "polygon", "USDC", "NGN"],
      ["cash_in", "polygon", "USDT", "NGN"], // expected unsupported
      ["cash_in", "base", "USDT", "KES"],
      ["cash_in", "polygon", "USDT", "TZS"], // expected unsupported
      ["cash_in", "base", "USDC", "UGX"], // expected unsupported
    ] as const;

    for (const [direction, chain, token, corridor] of claims) {
      const side = direction === "cash_out" ? "sell" : "buy";
      const live = await client
        .rates({ network: chain, from: token, amount: "100", to: corridor, side })
        .then(() => true)
        .catch(() => false);

      expect(
        live,
        `${direction} ${chain} ${token} ${corridor}: matrix says ${supports(
          direction,
          chain,
          token,
          corridor,
        )}, rail says ${live}`,
      ).toBe(supports(direction, chain, token, corridor));
    }
  }, 90_000);

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
