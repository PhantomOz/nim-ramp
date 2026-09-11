import { classifyRefusal } from "@ramp/rails";
import { expect, test } from "vitest";

import { explainRefusal } from "../src/explain.js";

const ctx = { chainName: "Ethereum", corridor: "UGX" as const };

test("an unsupported token names the networks that do work", () => {
  const said = explainRefusal(
    classifyRefusal("Token USDT is not supported on network optimism"),
    ctx,
  );
  expect(said.text).toMatch(/USDT/);
  expect(said.action).toBe("switch-network");
});

test("no liquidity reads as 'not right now', never as 'not supported'", () => {
  // The distinction the rail draws and we must preserve. A provider stepping
  // away for an hour is not Uganda being closed.
  const said = explainRefusal(
    classifyRefusal(
      "no provider available for USDC to UGX conversion with amount 100 on base",
    ),
    ctx,
  );
  expect(said.text).toMatch(/right now|at the moment|just now/i);
  expect(said.text).not.toMatch(/not supported|unsupported|cannot be cashed/i);
  expect(said.action).toBe("change-amount");
});

test("no liquidity suggests something the user can actually do", () => {
  const said = explainRefusal(
    classifyRefusal(
      "no provider available for USDC to UGX conversion with amount 100 on base",
    ),
    ctx,
  );
  expect(said.text).toMatch(/amount|network/i);
});

test("an unsupported currency is the one case that is genuinely permanent", () => {
  const said = explainRefusal(
    classifyRefusal("Fiat currency GHS is not supported"),
    ctx,
  );
  expect(said.action).toBe("none");
});

test("an unrecognised refusal is passed through rather than reinterpreted", () => {
  const said = explainRefusal(
    classifyRefusal("the flux capacitor is misaligned"),
    ctx,
  );
  expect(said.text).toMatch(/flux capacitor/);
  expect(said.action).toBe("none");
});
