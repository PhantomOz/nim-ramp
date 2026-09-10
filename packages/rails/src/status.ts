import type { State } from "@ramp/machine";

/**
 * Paycrest's order lifecycle, as documented in the Sender API integration
 * guide. `compliance_hold` is in the list because the rail emits it, but its
 * own docs are explicit that it is not a status change.
 */
export const PAYCREST_STATUSES = [
  "initiated",
  "deposited",
  "pending",
  "validated",
  "settling",
  "settled",
  "refunding",
  "refunded",
  "expired",
  "compliance_hold",
] as const;

export type PaycrestStatus = (typeof PAYCREST_STATUSES)[number];

/**
 * The result of reading a rail status.
 *
 * `unknown` exists deliberately. A payments bridge that silently ignores a
 * status it does not recognise will one day leave a real transaction frozen
 * on a screen that never updates, and nobody will know why. The caller is
 * forced to handle it.
 */
export type StatusMapping =
  | { kind: "state"; state: State }
  | { kind: "no_change"; reason: string }
  | { kind: "unknown"; status: string };

const MAPPING: Record<PaycrestStatus, StatusMapping> = {
  // The order exists on the rail and is waiting for its deposit.
  initiated: { kind: "state", state: "submitted" },
  // Value is moving. Everything between the deposit landing and the rail
  // calling it done is `settling` to a user — the distinctions Paycrest draws
  // here are about which party holds it, which is not the user's question.
  deposited: { kind: "state", state: "settling" },
  pending: { kind: "state", state: "settling" },
  validated: { kind: "state", state: "settling" },
  settling: { kind: "state", state: "settling" },
  settled: { kind: "state", state: "completed" },
  refunding: { kind: "state", state: "refunding" },
  refunded: { kind: "state", state: "failed_refunded" },
  // No deposit arrived before `validUntil`. The quote, not the transaction,
  // is what ran out.
  expired: { kind: "state", state: "quote_expired" },
  compliance_hold: {
    kind: "no_change",
    reason: "under compliance review; the rail does not treat this as a status change",
  },
};

export function mapStatus(status: string): StatusMapping {
  const known = PAYCREST_STATUSES.find((candidate) => candidate === status);
  if (known === undefined) return { kind: "unknown", status };
  return MAPPING[known];
}
