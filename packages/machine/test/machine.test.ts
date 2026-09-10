import { expect, test } from "vitest";

import {
  type Event,
  autoAdvance,
  escalate,
  next,
  reachableFrom,
  type State,
  STATES,
  TERMINAL_STATES,
  EVENTS,
} from "../src/index.js";

test("a quoted transaction becomes confirmed when the user confirms", () => {
  expect(next("quoted", "confirm")).toEqual({ ok: true, state: "confirmed" });
});

test("a transaction walks quoted through to completed", () => {
  const events: Event[] = ["confirm", "submit", "settle", "complete"];
  let state: State = "quoted";
  for (const event of events) {
    const result = next(state, event);
    if (!result.ok) throw new Error(`${event} refused from ${state}: ${result.reason}`);
    state = result.state;
  }
  expect(state).toBe("completed");
});

test("every state the brief enumerates is reachable from a fresh quote", () => {
  const reached = reachableFrom("quoted");
  for (const state of STATES) {
    expect(reached).toContain(state);
  }
});

test("a terminal state refuses every event", () => {
  for (const state of TERMINAL_STATES) {
    for (const event of EVENTS) {
      expect(next(state, event)).toMatchObject({ ok: false });
    }
  }
});

test("stalled is not terminal, because a quiet rail can still settle", () => {
  expect(TERMINAL_STATES).not.toContain("stalled");
  expect(next("stalled", "complete")).toEqual({ ok: true, state: "completed" });
});

test("a settling transaction stalls automatically once the rail's window elapses", () => {
  const windowMs = 15 * 60_000;
  const tx = { state: "settling" as const, enteredAt: 1_000_000 };

  expect(autoAdvance(tx, tx.enteredAt + windowMs - 1, windowMs)).toBeNull();
  expect(autoAdvance(tx, tx.enteredAt + windowMs, windowMs)).toEqual({
    ok: true,
    state: "stalled",
  });
});

test("a settled transaction never auto-advances, however long it sits", () => {
  const tx = { state: "completed" as const, enteredAt: 0 };
  expect(autoAdvance(tx, Number.MAX_SAFE_INTEGER, 1)).toBeNull();
});

test("escalating without a reference is refused", () => {
  const tx = { state: "settling" as const, enteredAt: 0 };
  expect(
    escalate(tx, { reference: "  ", support: "help@fourcorridors.app" }),
  ).toMatchObject({ ok: false });
});

test("escalating without a way to reach a human is refused", () => {
  const tx = { state: "settling" as const, enteredAt: 0 };
  expect(escalate(tx, { reference: "FC-7QK2", support: "" })).toMatchObject({
    ok: false,
  });
});

test("an escalated transaction carries its reference and its support contact", () => {
  const tx = { state: "settling" as const, enteredAt: 0 };
  expect(
    escalate(tx, { reference: "FC-7QK2", support: "help@fourcorridors.app" }),
  ).toEqual({
    ok: true,
    state: "failed_manual",
    reference: "FC-7QK2",
    support: "help@fourcorridors.app",
  });
});
