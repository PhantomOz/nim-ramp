import type { Direction } from "@ramp/core";
import type { State } from "@ramp/machine";

import { PARTNER } from "./flow.js";

export type StepState = "done" | "active" | "todo";
export type Step = { title: string; detail: string; state: StepState };

/**
 * The progress timeline, which the board picks as the default because it
 * names who has the money at each step — that is the whole promise.
 *
 * Which step is active is derived from the transaction state rather than
 * animated on a timer. A timeline that keeps spinning on a dead transfer is
 * the dead end the brief exists to prevent.
 */
const COPY: Record<Direction, [string, string][]> = {
  cash_in: [
    ["You send the bank transfer", "From an account in your own name"],
    [`${PARTNER} confirms it arrived`, "Usually a few minutes"],
    ["Stablecoin sent to your wallet", "Straight to Nimiq Pay"],
    ["Arrived", "It is yours to spend"],
  ],
  cash_out: [
    ["Your wallet sends it", "Approved by you in Nimiq Pay"],
    [`${PARTNER} receives it`, "Our licensed partner takes it from here"],
    ["They pay your account", "Bank or mobile money"],
    ["Arrived", "Your recipient has the money"],
  ],
};

/** How far along the flow each state sits. -1 means nothing is progressing. */
function reached(state: State): number {
  switch (state) {
    case "quoted":
    case "confirmed":
      return 0;
    case "submitted":
      return 1;
    case "settling":
    case "stalled":
      return 2;
    case "completed":
      return 4;
    // Nothing is in flight on any of these, so no step is active.
    case "quote_expired":
    case "rejected":
    case "refunding":
    case "failed_refunded":
    case "failed_manual":
      return -1;
  }
}

export function timeline(direction: Direction, state: State): Step[] {
  const at = reached(state);

  return COPY[direction].map(([title, detail], i) => {
    let stepState: StepState = "todo";
    if (at >= 0) {
      if (i < at) stepState = "done";
      else if (i === at) stepState = "active";
    }
    return { title, detail, state: stepState };
  });
}
