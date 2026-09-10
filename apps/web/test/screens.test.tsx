import { reachableFrom, STATES, type State } from "@ramp/machine";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { SCREENS, StatusScreen } from "../src/screens.js";

const SUPPORT = "help@fourcorridors.app";

test("every state a transaction can reach has a screen", () => {
  // The brief §4 claims every state has a screen, including the ugly ones.
  // This is the claim, enforced.
  for (const state of reachableFrom("quoted")) {
    expect(SCREENS[state]).toBeDefined();
  }
  expect(Object.keys(SCREENS).sort()).toEqual([...STATES].sort());
});

test("every screen tells the user something, never just spins", () => {
  for (const state of STATES) {
    const spec = SCREENS[state];
    expect(spec.title.trim().length).toBeGreaterThan(0);
    expect(spec.explanation.trim().length).toBeGreaterThan(0);
  }
});

test("a manual failure shows a reference and a way to reach a human", () => {
  render(
    <StatusScreen
      state="failed_manual"
      reference="FC-7QK2"
      support={SUPPORT}
    />,
  );
  expect(screen.getByText(/FC-7QK2/)).toBeTruthy();
  expect(screen.getByText(new RegExp(SUPPORT))).toBeTruthy();
});

test("a refund in flight reads as a failure being repaid, not as progress", () => {
  render(<StatusScreen state="refunding" support={SUPPORT} />);
  const text = document.body.textContent ?? "";
  expect(text).toMatch(/back|refund|return/i);
  expect(SCREENS.refunding.tone).toBe("failed");
  // The distinction the rail forced on us in the first place.
  expect(SCREENS.settling.tone).toBe("progress");
});

test("a stalled transaction says what to do next rather than sitting there", () => {
  render(<StatusScreen state="stalled" reference="FC-1AB2" support={SUPPORT} />);
  const text = document.body.textContent ?? "";
  expect(text).toMatch(/longer than expected|taking longer|delayed/i);
  expect(text).toMatch(/FC-1AB2/);
});
