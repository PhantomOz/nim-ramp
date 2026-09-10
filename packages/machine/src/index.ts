/**
 * The transaction state machine.
 *
 * Built before either leg, per the engineering brief §4. One machine serves
 * both directions: the states are direction-agnostic — `settling` is settling
 * whether we are waiting on a bank payout or an inbound deposit — and the
 * reconciliation branches cash-in needs hang off `submitted` and `stalled`
 * rather than duplicating the flow.
 */

export const STATES = [
  "quoted",
  "confirmed",
  "submitted",
  "settling",
  "completed",
  "quote_expired",
  "rejected",
  "failed_refunded",
  "failed_manual",
  "stalled",
  "refunding",
] as const;

export type State = (typeof STATES)[number];

export const EVENTS = [
  "confirm",
  "expire",
  "submit",
  "reject",
  "settle",
  "complete",
  "stall",
  "refund",
  "refund_complete",
  "escalate",
] as const;

export type Event = (typeof EVENTS)[number];

export type Result =
  | { ok: true; state: State }
  | { ok: false; reason: string };

const TRANSITIONS: Record<State, Partial<Record<Event, State>>> = {
  quoted: {
    confirm: "confirmed",
    expire: "quote_expired",
  },
  confirmed: {
    submit: "submitted",
    reject: "rejected",
    // The rate we quoted can go stale between confirmation and submission.
    expire: "quote_expired",
  },
  submitted: {
    settle: "settling",
    reject: "rejected",
    stall: "stalled",
    refund: "refunding",
    escalate: "failed_manual",
  },
  settling: {
    complete: "completed",
    stall: "stalled",
    refund: "refunding",
    escalate: "failed_manual",
  },
  // The rail reports a refund in flight before it reports one finished.
  // Showing that as `settling` would tell a user their transaction is
  // progressing when it has in fact failed.
  refunding: {
    refund_complete: "failed_refunded",
    stall: "stalled",
    escalate: "failed_manual",
  },
  // Stalled is not terminal. A rail that went quiet can still settle, and the
  // brief is explicit that the user must never be left staring at `settling`.
  stalled: {
    complete: "completed",
    refund: "refunding",
    refund_complete: "failed_refunded",
    escalate: "failed_manual",
  },
  completed: {},
  quote_expired: {},
  rejected: {},
  failed_refunded: {},
  failed_manual: {},
};

/**
 * States from which nothing further can happen. Derived from the transition
 * table rather than listed by hand, so a table edit cannot leave this stale.
 */
export const TERMINAL_STATES: readonly State[] = STATES.filter(
  (state) => Object.keys(TRANSITIONS[state]).length === 0,
);

export function next(state: State, event: Event): Result {
  const to = TRANSITIONS[state][event];
  if (to === undefined) {
    return { ok: false, reason: `cannot ${event} from ${state}` };
  }
  return { ok: true, state: to };
}

/**
 * Every state reachable from `start`, including `start` itself.
 *
 * This is how we hold ourselves to "every state needs a screen": a state that
 * is reachable but unscreened is a dead end in front of a real user.
 */
export function reachableFrom(start: State): State[] {
  const seen = new Set<State>([start]);
  const queue: State[] = [start];
  while (queue.length > 0) {
    const state = queue.shift();
    if (state === undefined) break;
    for (const to of Object.values(TRANSITIONS[state])) {
      if (!seen.has(to)) {
        seen.add(to);
        queue.push(to);
      }
    }
  }
  return [...seen];
}

/** A transaction with the timestamp at which it entered its current state. */
export type Timed = { state: State; enteredAt: number };

/**
 * The transition a transaction makes on its own, with no user or rail input.
 *
 * The brief §4 is explicit: `stalled` must appear automatically after a
 * settlement window we define per rail, rather than leaving the user staring
 * at `settling` indefinitely. The window is a parameter because it belongs to
 * the rail, not to the machine — NGN and TZS do not settle at the same speed.
 *
 * Returns `null` when nothing is due yet, or when the state cannot stall.
 */
export function autoAdvance(
  tx: Timed,
  now: number,
  windowMs: number,
): Result | null {
  if (TRANSITIONS[tx.state].stall === undefined) return null;
  if (now - tx.enteredAt < windowMs) return null;
  return next(tx.state, "stall");
}

/**
 * What a `failed_manual` transaction must carry before a user ever sees it.
 *
 * `reference` is the string the user quotes back to us. `support` is how they
 * reach a person. The brief §4 makes both mandatory, so the machine refuses
 * the transition rather than trusting every call site to remember.
 */
export type Escalation = { reference: string; support: string };

export type EscalateResult =
  | ({ ok: true; state: "failed_manual" } & Escalation)
  | { ok: false; reason: string };

export function escalate(tx: Timed, escalation: Escalation): EscalateResult {
  const reference = escalation.reference.trim();
  const support = escalation.support.trim();

  if (reference === "") {
    return { ok: false, reason: "failed_manual needs a reference the user can quote" };
  }
  if (support === "") {
    return { ok: false, reason: "failed_manual needs a way to reach a human" };
  }

  const moved = next(tx.state, "escalate");
  if (!moved.ok) return moved;

  return { ok: true, state: "failed_manual", reference, support };
}
