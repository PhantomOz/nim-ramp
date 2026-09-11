import type { Corridor } from "@ramp/core";

import { COUNTRY, PARTNER } from "./flow.js";

/**
 * The one-time account Paycrest returns on a cash-in order — its
 * `providerAccount`. Never invented: when we do not have it yet, the screen
 * says so rather than showing a plausible-looking account number.
 */
export type PayAccount = {
  bank: string;
  accountNumber: string;
  accountName: string;
  /** Exact amount to send, as the rail stated it. */
  amount: string;
};

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Copyable({ value, label }: { value: string; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span className="num" style={{ fontSize: 20, fontWeight: 500 }}>{value}</span>
      <button
        className="chipbtn"
        type="button"
        style={{ padding: "6px 10px" }}
        onClick={() => void navigator.clipboard?.writeText(value)}
        aria-label={`Copy ${label}`}
      >
        Copy
      </button>
    </span>
  );
}

export function CashinPay({
  account,
  receive,
  corridor,
  onSent,
  onCancel,
  onBack,
}: {
  account: PayAccount | null;
  receive: number;
  corridor: Corridor;
  onSent: () => void;
  onCancel: () => void;
  onBack: () => void;
}) {
  const country = COUNTRY[corridor];

  return (
    <>
      <div className="nav">
        <button className="nav__back" type="button" onClick={onBack} aria-label="Back">‹</button>
        <span className="nav__title">Cash in</span>
      </div>

      <div className="scroll" style={{ paddingTop: 8 }}>
        <h1 className="h1" style={{ fontSize: 26 }}>Pay by bank transfer</h1>

        {account === null ? (
          <p className="body body--muted" style={{ marginTop: 8 }}>
            Getting your one-time account from {PARTNER}…
          </p>
        ) : (
          <>
            <p className="body body--muted" style={{ marginTop: 8 }}>
              Send exactly{" "}
              <strong style={{ color: "var(--ink)" }}>
                {country.sym}{account.amount}
              </strong>{" "}
              from your own bank app to this one-time account. It&rsquo;s yours
              for the next 30 minutes.
            </p>

            <div className="details">
              <div className="details__row">
                <span className="details__k">Bank</span>
                <span className="details__v">{account.bank}</span>
              </div>
              <div className="details__row">
                <span className="details__k">Account number</span>
                <Copyable value={account.accountNumber} label="account number" />
              </div>
              <div className="details__row">
                <span className="details__k" style={{ flex: "none" }}>Account name</span>
                <span className="details__v" style={{ textAlign: "right" }}>
                  {account.accountName}
                </span>
              </div>
              <div className="details__row details__row--last">
                <span className="details__k">Amount</span>
                <Copyable value={`${country.sym}${account.amount}`} label="amount" />
              </div>
            </div>
          </>
        )}

        <div
          style={{
            marginTop: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <span className="label">You&rsquo;ll get, exactly</span>
          <span className="minstamp">Locked</span>
        </div>
        <div className="num" style={{ fontSize: 40, lineHeight: 1.1, marginTop: 6, letterSpacing: "-.02em" }}>
          <span className="marked">{fmt(receive)} USDT</span>
        </div>

        <p className="small" style={{ marginTop: 14, textWrap: "pretty" }}>
          Send from an account in your own name. Transfers from other
          people&rsquo;s accounts are returned to where they came from. The
          account belongs to {PARTNER}; NimRamp never holds your money.
        </p>
      </div>

      <div className="foot">
        <button className="btn" type="button" disabled={account === null} onClick={onSent}>
          I&rsquo;ve sent it
        </button>
        <button className="linkbtn linkbtn--tall" type="button" onClick={onCancel}>
          Cancel. I haven&rsquo;t sent anything.
        </button>
      </div>
    </>
  );
}
