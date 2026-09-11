import type { State } from "@ramp/machine";

/**
 * Transaction screens, in the board's language.
 *
 * Failures share one skeleton every time — what happened, your money, the
 * reference — so people learn where to look before they need to. The stamp is
 * the only decoration and lands on the moments that matter: arrived,
 * refunding, not sent.
 *
 * Copy is deliberately plain. Adaeze is outdoors on a phone, not reading a
 * status page.
 */

export type Tone = "progress" | "done" | "failed" | "attention";

/** The stamp's own palette — ink colours, not screen semantics. */
export type StampTone = "ok" | "fail" | "warn";

export type ScreenSpec = {
  title: string;
  /** "What happened" — always present. */
  happened: string;
  /** "Your money" — required wherever tone is `failed`. */
  money: string | null;
  stamp: { text: string; tone: StampTone } | null;
  tone: Tone;
  showsReference: boolean;
};

export const SCREENS: Record<State, ScreenSpec> = {
  quoted: {
    title: "Check the details",
    happened:
      "This is the exact amount that lands. The price holds until the timer runs out.",
    money: null,
    stamp: { text: "Price locked", tone: "warn" },
    tone: "attention",
    showsReference: false,
  },
  confirmed: {
    title: "Confirm in your wallet",
    happened:
      "Nimiq Pay will ask you to approve it. Nothing moves until you do.",
    money: null,
    stamp: null,
    tone: "progress",
    showsReference: false,
  },
  submitted: {
    title: "Waiting for your USDT",
    happened:
      "The price is held. As soon as your transfer arrives, the payout starts.",
    money: null,
    stamp: null,
    tone: "progress",
    showsReference: true,
  },
  settling: {
    title: "On its way",
    happened:
      "Your money reached our payments partner and they are paying your account now. Usually under two minutes.",
    money: null,
    stamp: null,
    tone: "progress",
    showsReference: true,
  },
  completed: {
    title: "Arrived",
    happened: "Your recipient has been paid. Keep this receipt.",
    money: null,
    stamp: { text: "Arrived", tone: "ok" },
    tone: "done",
    showsReference: true,
  },
  quote_expired: {
    title: "The price ran out",
    happened:
      "Prices only hold for a short time, and this one expired before it was confirmed.",
    money: "Nothing was sent and nothing left your wallet.",
    stamp: { text: "Not sent", tone: "warn" },
    tone: "attention",
    showsReference: false,
  },
  rejected: {
    title: "The account was rejected",
    happened:
      "Our payments partner could not pay that account. Usually the number or the name does not match.",
    money: "Nothing left your wallet. Check the details and try again.",
    stamp: { text: "Not sent", tone: "fail" },
    tone: "failed",
    showsReference: true,
  },
  refunding: {
    title: "Sending your money back",
    happened:
      "This transfer could not be completed, so your money is on its way back to your wallet.",
    money: "Your USDT is being returned. You do not need to do anything.",
    stamp: { text: "Refunding", tone: "fail" },
    tone: "failed",
    showsReference: true,
  },
  failed_refunded: {
    title: "Returned to your wallet",
    happened: "The transfer did not go through.",
    money: "Your USDT is back in your wallet. You were not charged.",
    stamp: { text: "Returned", tone: "fail" },
    tone: "failed",
    showsReference: true,
  },
  failed_manual: {
    title: "We have to sort this one out by hand",
    happened:
      "Something went wrong that we have to fix ourselves rather than automatically.",
    money:
      "Your money is accounted for. Quote the reference below and we will come back to you.",
    stamp: null,
    tone: "failed",
    showsReference: true,
  },
  stalled: {
    title: "This is slow today",
    happened:
      "Our payments partner has not confirmed yet. Delays like this usually clear on their own.",
    money:
      "Your money is with our partner. If it does not land, it comes back to your wallet.",
    stamp: null,
    tone: "attention",
    showsReference: true,
  },
};

export function StatusScreen({
  state,
  reference,
  support,
  onDone,
}: {
  state: State;
  reference?: string;
  support: string;
  onDone?: () => void;
}) {
  const spec = SCREENS[state];
  const stampClass =
    spec.stamp === null ? "" : `stamp stamp--${spec.stamp.tone}`;

  return (
    <section className="screen" aria-live="polite">
      {spec.stamp !== null ? (
        <div>
          <span className={stampClass}>{spec.stamp.text}</span>
        </div>
      ) : null}

      <h1 className="title">{spec.title}</h1>

      <div className="panel">
        <div>
          <p className="row__k">What happened</p>
          <p className="sub" style={{ color: "var(--ink)" }}>
            {spec.happened}
          </p>
        </div>

        {spec.money !== null ? (
          <>
            <hr className="rule" />
            <div>
              <p className="row__k">Your money</p>
              <p className="sub" style={{ color: "var(--ink)" }}>
                {spec.money}
              </p>
            </div>
          </>
        ) : null}

        {spec.showsReference && reference !== undefined ? (
          <>
            <hr className="rule" />
            <div>
              <p className="row__k">Reference</p>
              <p className="ref">{reference}</p>
              <p className="trust">
                Quote this to a human and they will see exactly what you see —{" "}
                <a href={`mailto:${support}`}>{support}</a>
              </p>
            </div>
          </>
        ) : null}
      </div>

      <div className="spacer" />
      {onDone !== undefined ? (
        <button className="btn" type="button" onClick={onDone}>
          Done
        </button>
      ) : null}
    </section>
  );
}
