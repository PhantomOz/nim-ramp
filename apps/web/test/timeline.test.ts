import { STATES } from "@ramp/machine";
import { expect, test } from "vitest";

import { timeline } from "../src/timeline.js";

test("a cash-in timeline names who holds the money at each step", () => {
  const steps = timeline("cash_in", "settling");
  expect(steps).toHaveLength(4);
  expect(steps.map((s) => s.state)).toEqual(["done", "done", "active", "todo"]);
});

test("the two directions tell different stories", () => {
  const out = timeline("cash_out", "settling").map((s) => s.title);
  const into = timeline("cash_in", "settling").map((s) => s.title);
  expect(out).not.toEqual(into);
  // Cash-out starts at the wallet; cash-in starts at the bank.
  expect(out[0]).toMatch(/wallet/i);
  expect(into[0]).toMatch(/bank|transfer/i);
});

test("a completed transfer has no step still waiting", () => {
  for (const direction of ["cash_in", "cash_out"] as const) {
    const steps = timeline(direction, "completed");
    expect(steps.every((s) => s.state === "done")).toBe(true);
  }
});

test("exactly one step is active while a transfer is in flight", () => {
  for (const direction of ["cash_in", "cash_out"] as const) {
    for (const state of ["submitted", "settling"] as const) {
      const active = timeline(direction, state).filter((s) => s.state === "active");
      expect(active, `${direction}/${state}`).toHaveLength(1);
    }
  }
});

test("a failed transfer shows no active step, because nothing is progressing", () => {
  // A spinner on a dead transfer is the exact thing the brief forbids.
  for (const state of ["failed_refunded", "rejected", "quote_expired"] as const) {
    expect(timeline("cash_out", state).some((s) => s.state === "active")).toBe(false);
  }
});

test("every state produces a timeline rather than throwing", () => {
  for (const state of STATES) {
    expect(timeline("cash_in", state).length).toBeGreaterThan(0);
    expect(timeline("cash_out", state).length).toBeGreaterThan(0);
  }
});
