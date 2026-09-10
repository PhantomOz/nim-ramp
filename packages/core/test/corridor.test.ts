import { expect, test } from "vitest";

import { CORRIDORS, corridorOf, type Corridor } from "../src/index.js";

test("the corridors are the four Paycrest actually serves", () => {
  expect([...CORRIDORS]).toEqual(["NGN", "KES", "TZS", "UGX"]);
});

test("Ghana is not a corridor, because the rail does not serve it", () => {
  expect(corridorOf("GHS")).toBeNull();
});

test("a supported currency code resolves to its corridor", () => {
  const ngn: Corridor | null = corridorOf("NGN");
  expect(ngn).toBe("NGN");
});
