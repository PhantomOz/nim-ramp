import type { State } from "@ramp/machine";

/**
 * Tone drives colour and nothing else. It exists so that `refunding` cannot
 * accidentally be styled like progress — the rail reports it between a
 * failure and the money landing back, and telling someone their transfer is
 * "on its way" at that moment is the exact failure the rubric calls out.
 */
export type Tone = "progress" | "done" | "failed" | "attention";

export type ScreenSpec = {
  title: string;
  explanation: string;
  tone: Tone;
  /** Terminal-ish states the user may need to quote to a human. */
  showsReference: boolean;
};

export const SCREENS: Record<State, ScreenSpec> = {
  quoted: {
    title: "Check the details",
    explanation:
      "This is the exact amount your recipient will get. The rate holds until the timer runs out.",
    tone: "attention",
    showsReference: false,
  },
  confirmed: {
    title: "Confirm in your wallet",
    explanation:
      "Nimiq Pay will ask you to approve the transfer. Nothing moves until you do.",
    tone: "progress",
    showsReference: false,
  },
  submitted: {
    title: "Waiting for your USDT",
    explanation:
      "We have reserved the rate. As soon as your transfer lands on Polygon, the payout starts.",
    tone: "progress",
    showsReference: true,
  },
  settling: {
    title: "On its way",
    explanation:
      "Your USDT arrived and the payout is being made. This usually takes a couple of minutes.",
    tone: "progress",
    showsReference: true,
  },
  completed: {
    title: "Sent",
    explanation: "Your recipient has been paid. Keep this receipt.",
    tone: "done",
    showsReference: true,
  },
  quote_expired: {
    title: "That rate expired",
    explanation:
      "Rates only hold for a few minutes. Nothing was sent and nothing was charged — start again for a fresh one.",
    tone: "attention",
    showsReference: false,
  },
  rejected: {
    title: "The transfer was declined",
    explanation:
      "The payout provider could not accept this one. Nothing left your wallet. Check the recipient details and try again.",
    tone: "failed",
    showsReference: true,
  },
  refunding: {
    title: "Returning your money",
    explanation:
      "This transfer could not be completed, so your USDT is being sent back to your wallet. You do not need to do anything.",
    tone: "failed",
    showsReference: true,
  },
  failed_refunded: {
    title: "Returned to your wallet",
    explanation:
      "The transfer did not go through and your USDT is back. You were not charged.",
    tone: "failed",
    showsReference: true,
  },
  failed_manual: {
    title: "We need to sort this one out by hand",
    explanation:
      "Something went wrong that we have to fix ourselves. Your money is accounted for. Quote the reference below and we will come back to you.",
    tone: "failed",
    showsReference: true,
  },
  stalled: {
    title: "This is taking longer than expected",
    explanation:
      "The payout provider has not confirmed yet. It may still complete on its own. If it does not, quote the reference below and we will chase it.",
    tone: "attention",
    showsReference: true,
  },
};

export function StatusScreen({
  state,
  reference,
  support,
}: {
  state: State;
  reference?: string;
  support: string;
}) {
  const spec = SCREENS[state];

  return (
    <section className={`status status--${spec.tone}`} aria-live="polite">
      <p className="status__tag">{state.replace(/_/g, " ")}</p>
      <h1 className="status__title">{spec.title}</h1>
      <p className="status__explanation">{spec.explanation}</p>

      {spec.showsReference && reference !== undefined ? (
        <p className="status__reference">
          Reference <code>{reference}</code>
        </p>
      ) : null}

      {spec.tone === "failed" || state === "stalled" ? (
        <p className="status__support">
          Reach a person at <a href={`mailto:${support}`}>{support}</a>
        </p>
      ) : null}
    </section>
  );
}
