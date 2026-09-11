import {
  type Chain,
  type Corridor,
  type Direction,
  type TokenSymbol,
} from "@ramp/core";
import { useEffect, useState } from "react";

import { breakdown, SENDER_FEE_PERCENT } from "./breakdown.js";
import { ChainMark, FLAG } from "./marks.js";
import type { Explanation } from "./explain.js";

/**
 * The licensed partner who actually pays the bank. The board calls this
 * "Sango Payments Ltd" as a stand-in; ours is Paycrest.
 */
export const PARTNER = "Paycrest";

export const COUNTRY: Record<
  Corridor,
  { name: string; money: string; sym: string; method: string }
> = {
  NGN: { name: "Nigeria", money: "Naira", sym: "₦", method: "bank account" },
  KES: { name: "Kenya", money: "Shillings", sym: "KSh", method: "mobile money" },
  TZS: { name: "Tanzania", money: "Shillings", sym: "TSh", method: "mobile money" },
  UGX: { name: "Uganda", money: "Shillings", sym: "USh", method: "mobile money" },
};

const fmt = (n: number, dp = 0) =>
  n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

/**
 * A figure, set in the serif, with its currency symbol in the sans face at
 * .6em. Keeping the symbol out of the serif is what makes the number read as
 * the number rather than as a line of type.
 */
function Num({
  sym,
  value,
  size = "num--md",
  marked = false,
}: {
  sym?: string;
  value: string;
  size?: string;
  marked?: boolean;
}) {
  const inner = (
    <>
      {sym !== undefined ? <span className="sym">{sym}</span> : null}
      {value}
    </>
  );
  return (
    <div className={`num ${size}`}>
      {marked ? <span className="marked">{inner}</span> : inner}
    </div>
  );
}

/* ---------------------------------------------------------------- intro */

export function Intro({ onStart }: { onStart: () => void }) {
  const promises: [string, string][] = [
    [
      "We never touch your money.",
      "Your own wallet sends it, directly. A licensed payments company does the bank side. We're the shop window, not the vault.",
    ],
    [
      "You see the real number before you agree.",
      "Not an estimate that changes later. The number on the screen is the number that lands.",
    ],
    [
      "When something goes wrong, we say so.",
      "Every way a transfer can fail has its own screen: what happened, whether your money is coming back, and a reference you can quote to a human.",
    ],
  ];

  return (
    <>
      <div className="scroll">
        <h1 className="h1" style={{ marginTop: 16 }}>
          Digital dollars to naira or shillings, and back.
        </h1>
        <p className="body body--muted" style={{ marginTop: 8 }}>
          Straight to your bank or mobile money.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 28 }}>
          {promises.map(([heading, detail], i) => (
            <div key={heading} style={{ display: "flex", gap: 14 }}>
              <span className="num num--sm" style={{ color: "var(--apricot)", flex: "none", width: 30 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p style={{ margin: 0, font: "600 16px/1.3 var(--ui)" }}>{heading}</p>
                <p className="body body--muted" style={{ marginTop: 5 }}>{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="foot">
        <button className="btn" type="button" onClick={onStart}>Let&rsquo;s go</button>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- home */

export function Home({
  corridor,
  chain,
  symbol,
  rate,
  connected,
  address,
  onPick,
  onConnect,
  onOpenChain,
  onOpenCountry,
}: {
  corridor: Corridor;
  chain: Chain;
  symbol: TokenSymbol;
  rate: number | null;
  connected: boolean;
  address: string | null;
  onPick: (d: Direction) => void;
  onConnect: () => void;
  onOpenChain: () => void;
  onOpenCountry: () => void;
}) {
  const country = COUNTRY[corridor];

  return (
    <>
      <div className="scroll">
        {/* Country and network sit together, above the price they both
            determine. Country was at the foot of the screen, below the two
            buttons whose entire copy depends on it. */}
        <div className="pickers">
          <button type="button" className="picker" onClick={onOpenCountry}>
            <span className="picker__flag" aria-hidden="true">{FLAG[corridor]}</span>
            <span className="picker__text">
              <span className="picker__k">Country</span>
              <span className="picker__v">{country.name}</span>
            </span>
            <span className="picker__caret" aria-hidden="true">▼</span>
          </button>

          <button type="button" className="picker" onClick={onOpenChain}>
            <ChainMark slug={chain.slug} size={19} />
            <span className="picker__text">
              <span className="picker__k">Network</span>
              <span className="picker__v">{chain.name}</span>
            </span>
            <span className="picker__caret" aria-hidden="true">▼</span>
          </button>
        </div>

        <div className="pricecard">
          <div className="label">Today&rsquo;s price</div>
          <div className="num num--md" style={{ marginTop: 8 }}>
            1 {symbol} = <span className="sym">{country.sym}</span>
            {rate === null ? "—" : fmt(rate, 2)}
          </div>
          <div className="live">
            <span className="live__dot" />
            Live. Locks when you review.
          </div>
        </div>

        <button className="choice" type="button" onClick={() => onPick("cash_out")}>
          <span className="choice__top">
            <span className="choice__kind">Cash out</span>
            <span className="choice__arrow">→</span>
          </span>
          <span className="choice__pair">{symbol} → {country.money}</span>
          <p className="choice__note">
            To your {country.method}. Usually under two minutes.
          </p>
        </button>

        <button className="choice choice--out" type="button" onClick={() => onPick("cash_in")}>
          <span className="choice__top">
            <span className="choice__kind">Cash in</span>
            <span className="choice__arrow">→</span>
          </span>
          <span className="choice__pair">{country.money} → {symbol}</span>
          <p className="choice__note">Pay by bank transfer. Lands in your wallet.</p>
        </button>

        {connected && address !== null ? (
          <p className="small" style={{ marginTop: 16 }}>
            Nimiq Pay wallet · {address.slice(0, 6)}…{address.slice(-4)}
          </p>
        ) : null}
      </div>

      {!connected ? (
        <div className="foot">
          <button className="btn" type="button" onClick={onConnect}>
            Connect Nimiq Pay wallet
          </button>
        </div>
      ) : null}
    </>
  );
}

/* --------------------------------------------------------------- amount */

export function Amount({
  direction,
  corridor,
  chain,
  symbol,
  rate,
  blocked,
  maxTxUsdt,
  onBack,
  onReview,
}: {
  direction: Direction;
  corridor: Corridor;
  chain: Chain;
  symbol: TokenSymbol;
  rate: number | null;
  blocked: Explanation | null;
  maxTxUsdt: string | null;
  onBack: () => void;
  onReview: (amount: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const country = COUNTRY[corridor];
  const decimals = chain.tokens[symbol].decimals;
  const cashOut = direction === "cash_out";

  let split: ReturnType<typeof breakdown> | null = null;
  let problem: string | null = null;
  if (rate !== null && amount !== "" && cashOut) {
    try {
      split = breakdown({ send: amount, rate, decimals });
    } catch (e) {
      problem = e instanceof Error ? e.message : "that amount will not work";
    }
  }

  const receive = cashOut
    ? split?.receive
    : rate !== null && amount !== "" ? Number(amount) / rate : undefined;

  const key = (k: string) => {
    if (k === "⌫") return setAmount((a) => a.slice(0, -1));
    if (k === "." && amount.includes(".")) return;
    setAmount((a) => (a === "0" && k !== "." ? k : a + k));
  };

  /*
   * The cap is denominated in stablecoin, but on a cash-in people type fiat.
   * Showing "50 USDT" to someone entering naira is how they end up refused
   * after the fact with a number in a currency they are not using, so it is
   * converted into whatever they are actually typing.
   */
  const capHere =
    maxTxUsdt === null
      ? null
      : cashOut
        ? Number(maxTxUsdt)
        : rate === null
          ? null
          : Number(maxTxUsdt) * rate;

  const typed = Number(amount);
  const overCap =
    capHere !== null && amount !== "" && Number.isFinite(typed) && typed > capHere;

  const ready =
    blocked === null &&
    problem === null &&
    !overCap &&
    receive !== undefined &&
    receive > 0;

  return (
    <>
      <div className="nav">
        <button className="nav__back" type="button" onClick={onBack} aria-label="Back">‹</button>
        <span className="nav__title">{cashOut ? "Cash out" : "Cash in"}</span>
      </div>

      <div className="scroll">
        <div className="label">You send</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
          <div className="num num--input" style={{ flex: 1, minWidth: 0 }}>
            {cashOut ? null : <span className="sym">{country.sym}</span>}
            {amount === "" ? <span style={{ color: "var(--muted)" }}>0</span> : amount}
          </div>
          <span className="unit">{cashOut ? symbol : corridor}</span>
        </div>

        <div className="section">
          <div className="label">You get, exactly</div>
          <div style={{ marginTop: 6 }}>
            <Num
              size="num--xl"
              marked
              {...(cashOut ? { sym: country.sym } : {})}
              value={receive === undefined ? "—" : fmt(receive, cashOut ? 0 : 4)}
            />
          </div>
        </div>

        {capHere !== null && !overCap ? (
          <p className="small" style={{ marginTop: 10 }}>
            Up to {cashOut ? "" : country.sym}
            {fmt(capHere, cashOut ? 0 : 0)} {cashOut ? symbol : ""} per transfer
            while we are in testing.
          </p>
        ) : null}

        {overCap && capHere !== null ? (
          <p className="body" style={{ marginTop: 12, color: "var(--warn)" }}>
            That is over the {cashOut ? "" : country.sym}
            {fmt(capHere, 0)} {cashOut ? symbol : ""} limit we have set for
            each transfer while we are in testing.
          </p>
        ) : null}

        {blocked !== null ? (
          <p className="body" style={{ marginTop: 12, color: "var(--warn)" }}>{blocked.text}</p>
        ) : null}
        {problem !== null ? (
          <p className="body" style={{ marginTop: 12, color: "var(--warn)" }}>{problem}</p>
        ) : null}

        {split !== null ? (
          <div className="panel">
            <div className="row">
              <span className="row__k">Price</span>
              <span className="row__v">
                1 {symbol} = {country.sym}{rate === null ? "—" : fmt(rate, 2)}
              </span>
            </div>
            <div className="row">
              <span className="row__k">NimRamp fee ({SENDER_FEE_PERCENT}%)</span>
              <span className="row__v">{split.fee} {symbol}</span>
            </div>
            <div className="row">
              <span className="row__k">Bank and network fees</span>
              <span className="row__v">Paid by {PARTNER}</span>
            </div>
          </div>
        ) : null}

        <p className="small" style={{ marginTop: 14 }}>
          {cashOut
            ? `Your wallet sends the money directly to ${PARTNER}, our licensed partner. They pay your ${country.method}. NimRamp never holds it.`
            : `You pay ${PARTNER}, our licensed partner, by bank transfer. They send the ${symbol} straight to your Nimiq Pay wallet on ${chain.name}. NimRamp never holds it.`}
        </p>

        <div className="pad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((k) => (
            <button key={k} type="button" onClick={() => key(k)}>{k}</button>
          ))}
        </div>
      </div>

      <div className="foot">
        <button className="btn" type="button" disabled={!ready} onClick={() => onReview(amount)}>
          {overCap
            ? "Over the limit"
            : blocked === null
            ? "Review and lock the price"
            : blocked.action === "switch-network"
              ? "Switch network"
              : blocked.action === "change-amount"
                ? "Try another amount"
                : "Not available"}
        </button>
      </div>
    </>
  );
}

/* --------------------------------------------------------------- review */

const LOCK_SECONDS = 90;

export function Review({
  send,
  receive,
  corridor,
  chain,
  symbol,
  recipient,
  sending,
  error,
  onConfirm,
  onExpired,
  onBack,
}: {
  send: string;
  receive: number;
  corridor: Corridor;
  chain: Chain;
  symbol: TokenSymbol;
  recipient: { institution: string; accountIdentifier: string; accountName: string } | null;
  sending: boolean;
  error: string | null;
  onConfirm: () => void;
  onExpired: () => void;
  onBack: () => void;
}) {
  const [left, setLeft] = useState(LOCK_SECONDS);
  const country = COUNTRY[corridor];
  const expired = left <= 0;

  useEffect(() => {
    // The lock stops counting once the wallet has the transfer: the price is
    // committed at that point and a countdown would only be theatre.
    if (sending || expired) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left, sending, expired]);

  useEffect(() => {
    if (expired && !sending) onExpired();
  }, [expired, sending, onExpired]);

  return (
    <>
      <div className="nav">
        <button className="nav__back" type="button" onClick={onBack} aria-label="Back">‹</button>
        <span className="nav__title">Review</span>
      </div>

      <div className="scroll">
        <div className={expired ? "stamp stamp--fail" : "stamp stamp--warn"}>
          {expired ? "Price expired" : "Price locked"}
        </div>

        <div className="section--lead">
          <div className="label">You send</div>
          <div style={{ marginTop: 6 }}>
            <Num size="num--lg" value={`${send} ${symbol}`} />
          </div>
        </div>

        <div className="section">
          <div className="label">You get, exactly</div>
          <div style={{ marginTop: 6 }}>
            <Num size="num--xl" marked sym={country.sym} value={fmt(receive)} />
          </div>
          <p className="body body--muted" style={{ marginTop: 8 }}>
            {sending
              ? "Approve the transfer in Nimiq Pay."
              : expired
                ? "The lock ran out. Nothing was sent."
                : <>This number is yours for <strong>{left}s</strong>.</>}
          </p>
        </div>

        <div className="panel">
          {recipient !== null ? (
            <>
              <div className="row">
                <span className="row__k">To</span>
                <span className="row__v">
                  {recipient.accountName === ""
                    ? recipient.accountIdentifier
                    : recipient.accountName}
                </span>
              </div>
              <div className="row">
                <span className="row__k">Account</span>
                <span className="row__v">{recipient.accountIdentifier}</span>
              </div>
            </>
          ) : null}
          <div className="row">
            <span className="row__k">Network</span>
            <span className="row__v">{chain.name}</span>
          </div>
          <div className="row">
            <span className="row__k">Paid by</span>
            <span className="row__v">{PARTNER}</span>
          </div>
        </div>

        {error !== null ? (
          <div className="section">
            <div className="label">Couldn&rsquo;t send it</div>
            <div className="panel panel--edge" style={{ color: "var(--fail)", marginTop: 8 }}>
              <p className="panel__detail" style={{ marginTop: 0 }}>{error}</p>
            </div>
          </div>
        ) : null}

        <p className="small" style={{ marginTop: 14 }}>
          Your wallet sends it directly to {PARTNER}, our licensed partner. They
          pay your {country.method}. NimRamp never holds it.
        </p>
      </div>

      <div className="foot">
        <button className="btn" type="button" disabled={sending || expired} onClick={onConfirm}>
          {sending ? "Waiting for your wallet…" : expired ? "Price expired" : "Confirm in wallet"}
        </button>
        <button className="btn btn--secondary" type="button" onClick={onBack}>
          Back
        </button>
      </div>
    </>
  );
}
