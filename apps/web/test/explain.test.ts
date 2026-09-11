import { expect, test } from "vitest";

import { explainUnsupported } from "../src/explain.js";

test("a supported combination needs no explanation", () => {
  expect(explainUnsupported("cash_out", "polygon", "USDT", "NGN")).toBeNull();
});

test("when the token is the problem, it names the token that works", () => {
  const said = explainUnsupported("cash_in", "polygon", "USDT", "NGN");
  expect(said).toMatch(/USDC/);
  expect(said).not.toMatch(/USDT on Polygon works/i);
});

test("when the chain is the problem, it names the chains that work", () => {
  const said = explainUnsupported("cash_out", "ethereum", "USDT", "KES");
  expect(said).toMatch(/Polygon|Base|Arbitrum|BNB/);
});

test("a corridor with no route at all says so plainly rather than suggesting nothing", () => {
  const said = explainUnsupported("cash_in", "polygon", "USDT", "TZS");
  expect(said).toMatch(/cannot be cashed in|no way to cash in/i);
  expect(said).toMatch(/Tanzania|TZS/);
});
