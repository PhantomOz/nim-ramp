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
  /** "Your money" — the lead line. Required wherever tone is `failed`. */
  money: string | null;
  /** The smaller line under it. */
  moneyDetail?: string;
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
    money: "Nothing was sent.",
    moneyDetail: "Nothing left your wallet, and you were not charged.",
    stamp: { text: "Not sent", tone: "warn" },
    tone: "attention",
    showsReference: false,
  },
  rejected: {
    title: "The account was rejected",
    happened:
      "Our payments partner could not pay that account. Usually the number or the name does not match.",
    money: "Nothing left your wallet.",
    moneyDetail: "Check the account number and the name, then try again.",
    stamp: { text: "Not sent", tone: "fail" },
    tone: "failed",
    showsReference: true,
  },
  refunding: {
    title: "Sending your money back",
    happened:
      "This transfer could not be completed, so your money is on its way back to your wallet.",
    money: "Your money is on its way back.",
    moneyDetail: "It returns to the wallet it came from. You do not need to do anything.",
    stamp: { text: "Refunding", tone: "fail" },
    tone: "failed",
    showsReference: true,
  },
  failed_refunded: {
    title: "Returned to your wallet",
    happened: "The transfer did not go through.",
    money: "Your money is back in your wallet.",
    moneyDetail: "The transfer did not complete, and you were not charged.",
    stamp: { text: "Returned", tone: "fail" },
    tone: "failed",
    showsReference: true,
  },
  failed_manual: {
    title: "We have to sort this one out by hand",
    happened:
      "Something went wrong that we have to fix ourselves rather than automatically.",
    money:
      "Your money is accounted for.",
    moneyDetail: "Quote the reference below and we will come back to you.",
    stamp: null,
    tone: "failed",
    showsReference: true,
  },
  stalled: {
    title: "This is slow today",
    happened:
      "Our payments partner has not confirmed yet. Delays like this usually clear on their own.",
    money:
      "Your money is with our payments partner.",
    moneyDetail: "If it does not land, it comes back to your wallet automatically.",
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
  const edge =
    spec.tone === "done"
      ? "var(--ok)"
      : spec.tone === "failed"
        ? "var(--fail)"
        : "var(--plum)";

  return (
    <>
      <div className="scroll" aria-live="polite">
        {spec.stamp !== null ? (
          <div className={`stamp stamp--${spec.stamp.tone}`}>{spec.stamp.text}</div>
        ) : null}

        <h1 className="h1" style={{ marginTop: 20 }}>{spec.title}</h1>

        <div className="section--lead">
          <div className="label">What happened</div>
          <p className="body" style={{ marginTop: 8 }}>{spec.happened}</p>
        </div>

        {spec.money !== null ? (
          <div className="section">
            <div className="label">Your money</div>
            <div className="panel panel--edge" style={{ color: edge, marginTop: 8 }}>
              <p className="panel__lead">{spec.money}</p>
              {spec.moneyDetail !== undefined ? (
                <p className="panel__detail">{spec.moneyDetail}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {spec.showsReference && reference !== undefined ? (
          <div className="section">
            <div className="label">Reference</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 8,
              }}
            >
              <span className="num num--md" style={{ letterSpacing: ".04em" }}>
                {reference}
              </span>
              <button
                className="chipbtn"
                type="button"
                onClick={() => void navigator.clipboard?.writeText(reference)}
              >
                Copy
              </button>
            </div>
            <p className="small" style={{ marginTop: 6 }}>
              Quote this to a human and they&rsquo;ll see exactly what you see —{" "}
              <a href={`mailto:${support}`} style={{ color: "var(--plum)" }}>
                {support}
              </a>
            </p>
          </div>
        ) : null}
      </div>

      {onDone !== undefined ? (
        <div className="foot">
          <button className="btn" type="button" onClick={onDone}>Done</button>
        </div>
      ) : null}
    </>
  );
}
