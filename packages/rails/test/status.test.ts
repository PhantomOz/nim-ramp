import { expect, test } from "vitest";

import { STATES } from "@ramp/machine";

import { PAYCREST_STATUSES, mapStatus } from "../src/index.js";

test("every status the rail can report maps onto a state we can screen", () => {
  for (const status of PAYCREST_STATUSES) {
    const mapped = mapStatus(status);
    expect(mapped.kind).not.toBe("unknown");
    if (mapped.kind === "state") {
      expect(STATES).toContain(mapped.state);
    }
  }
});

test("only settled means completed", () => {
  expect(mapStatus("settled")).toEqual({ kind: "state", state: "completed" });
  // `validated` means the provider confirmed the fiat payout, but the onchain
  // release has not happened. Telling the user "done" here is a lie we would
  // have to take back.
  expect(mapStatus("validated")).toEqual({ kind: "state", state: "settling" });
});

test("a refund in flight is reported as a failure, not as progress", () => {
  expect(mapStatus("refunding")).toEqual({ kind: "state", state: "refunding" });
  expect(mapStatus("refunded")).toEqual({
    kind: "state",
    state: "failed_refunded",
  });
});

test("compliance_hold does not move the transaction", () => {
  // The rail's own docs say this one is not a status change.
  expect(mapStatus("compliance_hold")).toMatchObject({ kind: "no_change" });
});

test("a status we have never seen is surfaced, never swallowed", () => {
  expect(mapStatus("teleported")).toEqual({
    kind: "unknown",
    status: "teleported",
  });
});
