import {
  CHAINS,
  type Chain,
  type Corridor,
  type Direction,
  type TokenSymbol,
} from "@ramp/core";
import { useEffect, useState } from "react";

import { breakdown, SENDER_FEE_PERCENT } from "./breakdown.js";

/**
 * The licensed partner who actually pays the bank. The board calls this
 * "Sango Payments Ltd" as a stand-in; ours is Paycrest. One constant, because
 * the legal framing is likelier to change than the copy around it.
 */
export const PARTNER = "Paycrest";

export const COUNTRY: Record<Corridor, { name: string; money: string; method: string }> = {
  NGN: { name: "Nigeria", money: "naira", method: "bank account" },
  KES: { name: "Kenya", money: "shillings", method: "mobile money" },
  TZS: { name: "Tanzania", money: "shillings", method: "mobile money" },
  UGX: { name: "Uganda", money: "shillings", method: "mobile money" },
};

const fmt = (n: number, dp = 0) =>
  n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

/* ---------------------------------------------------------------- intro */

export function Intro({ onStart }: { onStart: () => void }) {
  const promises = [
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
    <section className="screen">
      <h1 className="title" style={{ fontSize: 28 }}>
        Digital dollars to naira or shillings, and back.
      </h1>
      <p className="sub">Straight to your bank or mobile money.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 6 }}>
        {promises.map(([heading, body], i) => (
          <div key={heading} style={{ display: "flex", gap: 14 }}>
            <span
              style={{
                fontFamily: "var(--num)",
                fontSize: 22,
                color: "var(--apricot)",
                lineHeight: 1,
                flex: "none",
                width: 28,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <p style={{ margin: 0, font: "600 15.5px/1.3 var(--ui)" }}>{heading}</p>
              <p className="sub" style={{ marginTop: 4 }}>{body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="spacer" />
      <button className="btn" type="button" onClick={onStart}>
        Let&rsquo;s go
      </button>
    </section>
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
  onChangeChain,
  onChangeCorridor,
}: {
  corridor: Corridor;
  chain: Chain;
  symbol: TokenSymbol;
  rate: number | null;
  connected: boolean;
  address: string | null;
  onPick: (d: Direction) => void;
  onConnect: () => void;
  onChangeChain: (c: Chain) => void;
  onChangeCorridor: (c: Corridor) => void;
}) {
  const country = COUNTRY[corridor];

  return (
    <section className="screen">
      <div className="panel">
        <p className="row__k">Today&rsquo;s price</p>
        <div className="promise">
          <div className="promise__value">
            1 {symbol} = {rate === null ? "—" : fmt(rate, 2)}
          </div>
          <div className="promise__rule" />
          <p className="promise__note">
            {corridor} · live. Locks when you review.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select
          id="home-corridor"
          className="chip"
          value={corridor}
          onChange={(e) => onChangeCorridor(e.target.value as Corridor)}
          aria-label="Country"
        >
          {(Object.keys(COUNTRY) as Corridor[]).map((c) => (
            <option key={c} value={c}>{COUNTRY[c].name}</option>
          ))}
        </select>
        <select
          id="home-chain"
          className="chip"
          value={chain.slug}
          onChange={(e) => {
            const next = CHAINS.find((c) => c.slug === e.target.value);
            if (next !== undefined) onChangeChain(next);
          }}
          aria-label="Network"
        >
          {CHAINS.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
      </div>

      <button className="bigchoice" type="button" onClick={() => onPick("cash_out")}>
        <span className="bigchoice__t">Cash out</span>
        <span className="bigchoice__p">{symbol} → {country.money}</span>
        <span className="bigchoice__s">
          To your {country.method}. Usually under two minutes.
        </span>
      </button>

      <button className="bigchoice" type="button" onClick={() => onPick("cash_in")}>
        <span className="bigchoice__t">Cash in</span>
        <span className="bigchoice__p">{country.money} → {symbol}</span>
        <span className="bigchoice__s">
          Pay by bank transfer. Lands in your wallet.
        </span>
      </button>

      <div className="spacer" />

      {connected && address !== null ? (
        <p className="trust">
          Nimiq Pay wallet · <span className="ref">{address.slice(0, 6)}…{address.slice(-4)}</span> on {chain.name}
        </p>
      ) : (
        <button className="btn btn--ghost" type="button" onClick={onConnect}>
          Connect Nimiq Pay wallet
        </button>
      )}
    </section>
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
  onBack,
  onReview,
}: {
  direction: Direction;
  corridor: Corridor;
  chain: Chain;
  symbol: TokenSymbol;
  rate: number | null;
  blocked: string | null;
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
    : rate !== null && amount !== ""
      ? Number(amount) / rate
      : undefined;

  const key = (k: string) => {
    if (k === "⌫") return setAmount((a) => a.slice(0, -1));
    if (k === "." && amount.includes(".")) return;
    setAmount((a) => (a === "0" && k !== "." ? k : a + k));
  };

  const ready = blocked === null && problem === null && receive !== undefined && receive > 0;

  return (
    <section className="screen">
      <button className="btn--quiet" type="button" onClick={onBack} style={{ alignSelf: "flex-start", padding: 0, background: "none", border: 0, color: "var(--plum)", cursor: "pointer" }}>
        ← Back
      </button>

      <div>
        <p className="row__k">You send</p>
        <div style={{ font: "400 40px/1 var(--num)", minHeight: 44 }}>
          {amount === "" ? <span style={{ color: "var(--muted)" }}>0</span> : amount}{" "}
          <span style={{ fontSize: 20, fontFamily: "var(--ui)", color: "var(--muted)" }}>
            {cashOut ? symbol : corridor}
          </span>
        </div>
      </div>

      <div className="promise">
        <span className="promise__label">You get, exactly</span>
        <div className="promise__value">
          {receive === undefined ? "—" : fmt(receive, cashOut ? 0 : 4)}{" "}
          <span style={{ fontSize: 18, fontFamily: "var(--ui)", color: "var(--muted)" }}>
            {cashOut ? corridor : symbol}
          </span>
        </div>
        <div className="promise__rule" />
      </div>

      {blocked !== null ? <p className="notice">{blocked}</p> : null}
      {problem !== null ? <p className="notice">{problem}</p> : null}

      {split !== null ? (
        <div className="panel">
          <div className="row">
            <span className="row__k">Price</span>
            <span className="row__v row__v--num">
              1 {symbol} = {rate === null ? "—" : fmt(rate, 2)}
            </span>
          </div>
          <div className="row">
            <span className="row__k">NimRamp fee ({SENDER_FEE_PERCENT}%)</span>
            <span className="row__v row__v--num">{split.fee} {symbol}</span>
          </div>
          <div className="row">
            <span className="row__k">Bank and network fees</span>
            <span className="row__v">Paid by {PARTNER}</span>
          </div>
        </div>
      ) : null}

      <p className="trust">
        {cashOut
          ? `Your wallet sends the money directly to ${PARTNER}, our licensed partner. They pay your ${country.method}. NimRamp never holds it.`
          : `You pay ${PARTNER}, our licensed partner, by bank transfer. They send the ${symbol} straight to your Nimiq Pay wallet on ${chain.name}. NimRamp never holds it.`}
      </p>

      <div className="pad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((k) => (
          <button key={k} type="button" onClick={() => key(k)}>
            {k}
          </button>
        ))}
      </div>

      <button
        className="btn"
        type="button"
        disabled={!ready}
        onClick={() => onReview(amount)}
      >
        {blocked !== null ? "Not available on this route" : "Review and lock the price"}
      </button>
    </section>
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
  onConfirm,
  onExpired,
  onBack,
}: {
  send: string;
  receive: number;
  corridor: Corridor;
  chain: Chain;
  symbol: TokenSymbol;
  onConfirm: () => void;
  onExpired: () => void;
  onBack: () => void;
}) {
  const [left, setLeft] = useState(LOCK_SECONDS);

  useEffect(() => {
    if (left <= 0) {
      onExpired();
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left, onExpired]);

  return (
    <section className="screen">
      <div>
        <span className="stamp stamp--warn">Price locked</span>
      </div>

      <div className="promise">
        <span className="promise__label">You get, exactly</span>
        <div className="promise__value">
          {fmt(receive)}{" "}
          <span style={{ fontSize: 18, fontFamily: "var(--ui)", color: "var(--muted)" }}>
            {corridor}
          </span>
        </div>
        <div className="promise__rule" />
        <p className="promise__note">
          This number is yours for <strong>{left}s</strong>
        </p>
      </div>

      <div className="panel">
        <div className="row">
          <span className="row__k">You send</span>
          <span className="row__v row__v--num">{send} {symbol}</span>
        </div>
        <div className="row">
          <span className="row__k">Network</span>
          <span className="row__v">{chain.name}</span>
        </div>
        <div className="row">
          <span className="row__k">Paid by</span>
          <span className="row__v">{PARTNER}</span>
        </div>
      </div>

      <p className="trust">
        NimRamp is not in this chain. {PARTNER} is licensed for payments in{" "}
        {COUNTRY[corridor].name}; your wallet pays them directly.
      </p>

      <div className="spacer" />
      <button className="btn" type="button" onClick={onConfirm}>
        Confirm in wallet
      </button>
      <button className="btn btn--quiet" type="button" onClick={onBack}>
        Back
      </button>
    </section>
  );
}
