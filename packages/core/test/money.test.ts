import { expect, test } from "vitest";

import { fromMinor, toMinor } from "../src/index.js";

test("a fiat amount converts to minor units exactly", () => {
  expect(toMinor("1234.56", 2)).toBe(123456n);
});

test("an amount floating point cannot represent stays exact", () => {
  // 0.07 * 100 is 7.000000000000001 in IEEE-754. Doing this with numbers
  // costs a user a shilling now and then, which is exactly the kind of thing
  // nobody can reproduce afterwards.
  expect(toMinor("0.07", 2)).toBe(7n);
  expect(toMinor("1.15", 2)).toBe(115n);
});

test("a whole number needs no decimal point", () => {
  expect(toMinor("500", 2)).toBe(50000n);
});

test("minor units render back as a decimal string", () => {
  expect(fromMinor(123456n, 2)).toBe("1234.56");
  expect(fromMinor(7n, 2)).toBe("0.07");
});

test("USDT's six decimals survive the round trip", () => {
  expect(fromMinor(toMinor("12.345678", 6), 6)).toBe("12.345678");
});

test("more precision than the currency allows is refused, never rounded", () => {
  expect(() => toMinor("1.005", 2)).toThrow(/precision/i);
});

test("an amount that is not a number is refused", () => {
  expect(() => toMinor("1,234.56", 2)).toThrow();
  expect(() => toMinor("", 2)).toThrow();
});
