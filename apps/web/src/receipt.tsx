import type { Corridor } from "@ramp/core";

import { COUNTRY, PARTNER } from "./flow.js";

export type ReceiptData = {
  direction: "cash_in" | "cash_out";
  corridor: Corridor;
  symbol: string;
  /** Stablecoin amount on the order. */
  amount: string | null;
  rate: string | null;
  senderFee: string | null;
  txHash: string | null;
  updatedAt: string | null;
  recipient: { accountIdentifier?: string; accountName?: string } | null;
  ref: string;
};

const money = (n: number, dp = 2) =>
  n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

const when = (iso: string | null) => {
  if (iso === null) return "just now";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "just now"
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

/**
 * The receipt.
 *
 * Every figure comes from the rail's own record of the order rather than from
 * what this app remembered typing — a receipt that can disagree with the
 * ledger it describes is worse than no receipt.
 */
export function Receipt({ data, onDone }: { data: ReceiptData; onDone: () => void }) {
  const country = COUNTRY[data.corridor];
  const cashOut = data.direction === "cash_out";

  const amount = data.amount === null ? null : Number(data.amount);
  const rate = data.rate === null ? null : Number(data.rate);
  const fiat = amount !== null && rate !== null ? amount * rate : null;

  const to =
    data.recipient?.accountName !== undefined && data.recipient.accountName !== ""
      ? data.recipient.accountName
      : (data.recipient?.accountIdentifier ?? "your wallet");

  return (
    <>
      <div className="nav">
        <span className="nav__title" style={{ paddingLeft: 14 }}>Receipt</span>
      </div>

      <div className="scroll">
        <div className="stamp stamp--ok">Arrived</div>

        <div className="num num--xl" style={{ marginTop: 20 }}>
          {cashOut ? <span className="sym">{country.sym}</span> : null}
          {cashOut
            ? fiat === null ? "—" : money(fiat, 0)
            : amount === null ? "—" : money(amount, 6)}
          {cashOut ? "" : ` ${data.symbol}`}
        </div>
        <p className="body body--muted" style={{ marginTop: 4, fontSize: 16 }}>
          {cashOut
            ? `Paid to ${to}.`
            : `In your Nimiq Pay wallet, on ${data.symbol}.`}
        </p>

        <div className="details details--tight">
          <div className="details__row">
            <span className="details__k">You sent</span>
            <span>
              {cashOut
                ? `${amount === null ? "—" : money(amount, 6)} ${data.symbol}`
                : `${country.sym}${fiat === null ? "—" : money(fiat, 0)}`}
            </span>
          </div>
          <div className="details__row">
            <span className="details__k">Price</span>
            <span>
              1 {data.symbol} = {country.sym}
              {rate === null ? "—" : money(rate)}
            </span>
          </div>
          <div className="details__row">
            <span className="details__k">Fee</span>
            <span>
              {data.senderFee === null ? "—" : `${data.senderFee} ${data.symbol}`}
            </span>
          </div>
          <div className="details__row">
            <span className="details__k" style={{ flex: "none" }}>To</span>
            <span style={{ textAlign: "right" }}>{to}</span>
          </div>
          <div className="details__row">
            <span className="details__k">When</span>
            <span>{when(data.updatedAt)}</span>
          </div>
          <div className="details__row details__row--last">
            <span className="details__k">Reference</span>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 600, letterSpacing: ".04em" }}>{data.ref}</span>
              <button
                className="chipbtn"
                type="button"
                style={{ padding: "6px 10px" }}
                onClick={() => void navigator.clipboard?.writeText(data.ref)}
              >
                Copy
              </button>
            </span>
          </div>
        </div>

        <div className="section">
          <div className="label">How this worked</div>
          <p className="small" style={{ marginTop: 8 }}>
            NimRamp never held your money. {PARTNER} is licensed for payments in{" "}
            {country.name}, and {cashOut ? "your wallet paid them directly" : "they sent the stablecoin straight to your wallet"}.
          </p>
          {data.txHash !== null ? (
            <p className="small" style={{ marginTop: 8, wordBreak: "break-all" }}>
              On-chain: {data.txHash}
            </p>
          ) : null}
        </div>
      </div>

      <div className="foot">
        <button className="btn" type="button" onClick={onDone}>Done</button>
      </div>
    </>
  );
}
