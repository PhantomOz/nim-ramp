import { expect, test } from "vitest";

import { loadConfig } from "../src/config.js";

const ok = {
  RAILS_API_BASE: "https://api.paycrest.io/v2",
  RAILS_API_KEY: "key",
  RAILS_WEBHOOK_SECRET: "secret",
};

test("a missing rails key stops the process, naming the variable", () => {
  // Discovering this on the first request means discovering it in front of a
  // user, with an order half-created.
  expect(() => loadConfig({ ...ok, RAILS_API_KEY: undefined })).toThrow(
    /RAILS_API_KEY/,
  );
  expect(() => loadConfig({ ...ok, RAILS_WEBHOOK_SECRET: "" })).toThrow(
    /RAILS_WEBHOOK_SECRET/,
  );
});

test("the transaction cap defaults to something safe, not to unlimited", () => {
  // If MAX_TX_USDT is unset, the safe reading is a small cap — never "no cap".
  const c = loadConfig(ok);
  expect(Number(c.maxTxUsdt)).toBeGreaterThan(0);
  expect(Number(c.maxTxUsdt)).toBeLessThanOrEqual(50);
});

test("the kill switch is on unless it is explicitly off", () => {
  expect(loadConfig({ ...ok, KILL_SWITCH: "true" }).killSwitch).toBe(true);
  expect(loadConfig({ ...ok, KILL_SWITCH: "TRUE" }).killSwitch).toBe(true);
  expect(loadConfig({ ...ok, KILL_SWITCH: "false" }).killSwitch).toBe(false);
  // Anything unparseable must fail closed.
  expect(loadConfig({ ...ok, KILL_SWITCH: "maybe" }).killSwitch).toBe(true);
});

test("a corridor is off unless switched on", () => {
  expect(loadConfig(ok).enabledCorridors).toEqual([]);
  expect(
    loadConfig({ ...ok, CORRIDOR_NGN_ENABLED: "true", CORRIDOR_KES_ENABLED: "false" })
      .enabledCorridors,
  ).toEqual(["NGN"]);
});

test("a nonsense cap is refused rather than silently treated as zero", () => {
  expect(() => loadConfig({ ...ok, MAX_TX_USDT: "lots" })).toThrow(/MAX_TX_USDT/);
});

test("the gas funder is optional, and unset means no faucet", () => {
  // The rest of the app works without it. Requiring a hot key to boot would
  // make a payments API refuse to start over an optional convenience.
  expect(loadConfig(ok).gasFunderKey).toBeUndefined();
});

test("a malformed funder key is refused at boot, not at the first top-up", () => {
  // Finding this out later means finding it out while someone is stuck
  // mid-cash-out with no gas.
  expect(() => loadConfig({ ...ok, GAS_FUNDER_KEY: "hunter2" })).toThrow(
    /GAS_FUNDER_KEY/,
  );
  expect(() => loadConfig({ ...ok, GAS_FUNDER_KEY: "0x1234" })).toThrow(
    /GAS_FUNDER_KEY/,
  );

  const key = `0x${"a".repeat(64)}`;
  expect(loadConfig({ ...ok, GAS_FUNDER_KEY: key }).gasFunderKey).toBe(key);
});
