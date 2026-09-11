import { reachableFrom, STATES, TERMINAL_STATES } from "@ramp/machine";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { SCREENS, StatusScreen } from "../src/screens.js";

const SUPPORT = "help@nimramp.app";

test("every state a transaction can reach has a screen", () => {
  for (const state of reachableFrom("quoted")) {
    expect(SCREENS[state]).toBeDefined();
  }
  expect(Object.keys(SCREENS).sort()).toEqual([...STATES].sort());
});

test("every screen tells the user something, never just spins", () => {
  for (const state of STATES) {
    const spec = SCREENS[state];
    expect(spec.title.trim().length).toBeGreaterThan(0);
    expect(spec.happened.trim().length).toBeGreaterThan(0);
  }
});

test("every failure answers 'your money', because that is the only question", () => {
  // The design gives failures one skeleton — what happened, your money,
  // reference — so people learn where to look before they need to. A failure
  // screen that omits the money line breaks that promise.
  const failures = STATES.filter((s) => SCREENS[s].tone === "failed");
  expect(failures.length).toBeGreaterThan(0);
  for (const state of failures) {
    expect(SCREENS[state].money, `${state} must say where the money is`)
      .toBeTruthy();
  }
});

test("a manual failure shows a reference and a way to reach a human", () => {
  render(<StatusScreen state="failed_manual" reference="NR-7QK2" support={SUPPORT} />);
  expect(screen.getByText(/NR-7QK2/)).toBeTruthy();
  expect(screen.getByText(new RegExp(SUPPORT))).toBeTruthy();
});

test("a refund in flight reads as a failure being repaid, not as progress", () => {
  render(<StatusScreen state="refunding" support={SUPPORT} />);
  expect(document.body.textContent ?? "").toMatch(/back|refund|return/i);
  expect(SCREENS.refunding.tone).toBe("failed");
  expect(SCREENS.settling.tone).toBe("progress");
});

test("a stalled transaction says what to do next rather than sitting there", () => {
  render(<StatusScreen state="stalled" reference="NR-1AB2" support={SUPPORT} />);
  const text = document.body.textContent ?? "";
  expect(text).toMatch(/longer than expected|taking longer|slow/i);
  expect(text).toMatch(/NR-1AB2/);
});

test("the stamp lands only on the moments that matter", () => {
  // The board is explicit: the stamp is the only decoration, and it belongs on
  // arrival, refunding and not-sent. A stamp on every screen is no stamp.
  const stamped = STATES.filter((s) => SCREENS[s].stamp !== null);
  expect(stamped).toContain("completed");
  expect(stamped).toContain("refunding");
  expect(stamped).toContain("quote_expired");
  expect(stamped).not.toContain("settling");
  expect(stamped).not.toContain("submitted");
});

test("terminal states never invite the user to keep waiting", () => {
  for (const state of TERMINAL_STATES) {
    expect(SCREENS[state].tone).not.toBe("progress");
  }
});
