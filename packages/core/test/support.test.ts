import { expect, test } from "vitest";

import {
  chainsFor,
  corridorsFor,
  supports,
  tokensFor,
} from "../src/index.js";

test("cash-out reaches every corridor on Polygon, either token", () => {
  for (const token of ["USDT", "USDC"] as const) {
    expect(corridorsFor("cash_out", "polygon", token)).toEqual([
      "NGN",
      "KES",
      "TZS",
      "UGX",
    ]);
  }
});

test("on Base, USDT reaches Nigeria only while USDC reaches everywhere", () => {
  expect(corridorsFor("cash_out", "base", "USDT")).toEqual(["NGN"]);
  expect(corridorsFor("cash_out", "base", "USDC")).toEqual([
    "NGN",
    "KES",
    "TZS",
    "UGX",
  ]);
});

test("Tanzania and Uganda cannot be cashed into at all", () => {
  // Not a limitation we chose. No chain, no token, no provider.
  for (const corridor of ["TZS", "UGX"] as const) {
    expect(chainsFor("cash_in", "USDT", corridor)).toEqual([]);
    expect(chainsFor("cash_in", "USDC", corridor)).toEqual([]);
  }
});

test("Ethereum cannot be cashed into at all", () => {
  expect(tokensFor("cash_in", "ethereum", "NGN")).toEqual([]);
  expect(tokensFor("cash_in", "ethereum", "KES")).toEqual([]);
});

test("cashing into Nigeria is USDC-only, and only on two chains", () => {
  expect(chainsFor("cash_in", "USDC", "NGN")).toEqual(["polygon", "base"]);
  expect(chainsFor("cash_in", "USDT", "NGN")).toEqual([]);
});

test("direction changes the answer for the same pair", () => {
  // The asymmetry in one assertion: you can cash NGN out over Polygon USDT,
  // and you cannot cash NGN in the same way.
  expect(supports("cash_out", "polygon", "USDT", "NGN")).toBe(true);
  expect(supports("cash_in", "polygon", "USDT", "NGN")).toBe(false);
});
