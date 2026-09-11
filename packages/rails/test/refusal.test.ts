import { expect, test } from "vitest";

import { classifyRefusal } from "../src/index.js";

test("an unsupported token on a network is structural", () => {
  const r = classifyRefusal("Token USDT is not supported on network optimism");
  expect(r.kind).toBe("structural");
  if (r.kind === "structural") {
    expect(r.subject).toBe("token");
    expect(r.what).toBe("USDT");
    expect(r.where).toBe("optimism");
  }
});

test("an unsupported fiat currency is structural", () => {
  const r = classifyRefusal("Fiat currency GHS is not supported");
  expect(r.kind).toBe("structural");
  if (r.kind === "structural") {
    expect(r.subject).toBe("currency");
    expect(r.what).toBe("GHS");
  }
});

test("no provider available is liquidity, not support", () => {
  // This is the distinction that matters. Treating it as "we do not serve
  // Uganda" turns a provider being briefly absent into a permanent product
  // limitation, and bakes a snapshot into a constant.
  const r = classifyRefusal(
    "no provider available for USDC to UGX conversion with amount 100 on base",
  );
  expect(r.kind).toBe("no-liquidity");
  if (r.kind === "no-liquidity") {
    expect(r.from).toBe("USDC");
    expect(r.to).toBe("UGX");
    expect(r.amount).toBe("100");
    expect(r.network).toBe("base");
  }
});

test("the cash-in direction parses the same way", () => {
  const r = classifyRefusal(
    "no provider available for NGN to USDT conversion with amount 1 on polygon",
  );
  expect(r.kind).toBe("no-liquidity");
  if (r.kind === "no-liquidity") {
    expect(r.from).toBe("NGN");
    expect(r.to).toBe("USDT");
  }
});

test("a message we have never seen is unknown, not silently structural", () => {
  // Guessing "structural" would tell a user a corridor is closed forever on
  // the strength of a message we do not understand.
  const r = classifyRefusal("the flux capacitor is misaligned");
  expect(r.kind).toBe("unknown");
});
