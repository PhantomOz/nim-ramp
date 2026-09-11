import { expect, test } from "vitest";

import { breakdown, SENDER_FEE_PERCENT } from "../src/breakdown.js";

test("the fee comes off the amount, and the rest is priced", () => {
  // 50 USDT at 0.5% = 0.25 fee, 49.75 priced at 1,360 = 67,660 NGN.
  const b = breakdown({ send: "50", rate: 1360, decimals: 6 });
  expect(b.fee).toBe("0.25");
  expect(b.afterFee).toBe("49.75");
  expect(b.receive).toBe(67660);
});

test("the fee rounds in the protocol's favour, never the user's", () => {
  // 3.33 USDT at 0.5% is 0.01665 exactly, which six decimals can hold.
  const b = breakdown({ send: "3.33", rate: 1000, decimals: 6 });
  expect(b.fee).toBe("0.01665");
  expect(Number(b.afterFee) + Number(b.fee)).toBeCloseTo(3.33, 9);
});

test("a fee that does not divide evenly rounds up, not down", () => {
  // 1 USDT at 0.5% on a 2-decimal token is 0.005 — it cannot be expressed, so
  // it must become 0.01 rather than 0. Rounding down hands away value on
  // every transaction and is only ever noticed in aggregate, by us, later.
  const b = breakdown({ send: "1", rate: 1, decimals: 2 });
  expect(b.fee).toBe("0.01");
  expect(b.afterFee).toBe("0.99");
});

test("an amount the fee would swallow whole is refused, not zeroed", () => {
  // At two decimals, one minor unit is entirely consumed by its own fee.
  expect(() => breakdown({ send: "0.01", rate: 1360, decimals: 2 })).toThrow(
    /too small/i,
  );
});

test("the quoted percentage is the one we actually charge", () => {
  const b = breakdown({ send: "100", rate: 1, decimals: 6 });
  expect(Number(b.fee)).toBeCloseTo(100 * (SENDER_FEE_PERCENT / 100), 9);
});

test("a nonsense amount does not produce a confident wrong number", () => {
  expect(() => breakdown({ send: "", rate: 1360, decimals: 6 })).toThrow();
  expect(() => breakdown({ send: "1.2.3", rate: 1360, decimals: 6 })).toThrow();
});
