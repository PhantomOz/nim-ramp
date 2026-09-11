import {
  CHAINS,
  type Chain,
  CORRIDORS,
  type Corridor,
  type Direction,
  supports,
  type TokenSymbol,
} from "@ramp/core";
import type { State } from "@ramp/machine";
import { connect, getProvider, hostLanguage, type Session } from "@ramp/wallet";
import { useEffect, useState } from "react";

import { HostPanel } from "./HostPanel.js";
import { StatusScreen } from "./screens.js";
import { explainUnsupported } from "./explain.js";
import { useQuote } from "./useQuote.js";

const SUPPORT = "help@fourcorridors.app";
const TOKENS: TokenSymbol[] = ["USDT", "USDC"];

const money = (n: number, dp = 2) =>
  n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

export function App() {
  const [direction, setDirection] = useState<Direction>("cash_out");
  const [chain, setChain] = useState<Chain>(CHAINS[0] as Chain);
  const [symbol, setSymbol] = useState<TokenSymbol>("USDT");
  const [corridor, setCorridor] = useState<Corridor>("NGN");
  const [amount, setAmount] = useState("10");

  const [session, setSession] = useState<Session | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [txState] = useState<State | null>(null);

  const language = hostLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const blocked = explainUnsupported(direction, chain.slug, symbol, corridor);

  const { quote, loading, error } = useQuote({
    direction,
    chain,
    symbol,
    corridor,
    amount,
    enabled: blocked === null,
  });

  const cashOut = direction === "cash_out";
  const sendUnit = cashOut ? symbol : corridor;
  const receiveUnit = cashOut ? corridor : symbol;

  async function onConnect() {
    setWalletError(null);
    try {
      const next = await connect(getProvider(), { require: chain.slug });
      setSession(next);
      // Follow the wallet if it landed somewhere else.
      setChain(next.chain);
    } catch (e) {
      setWalletError(e instanceof Error ? e.message : "could not reach a wallet");
    }
  }

  if (txState !== null) {
    return (
      <main className="app">
        <StatusScreen state={txState} support={SUPPORT} />
      </main>
    );
  }

  return (
    <main className="app">
      <header className="head">
        <h1 className="head__title">Four Corridors</h1>
        <p className="head__sub">
          Move value between stablecoin and local currency
        </p>
      </header>

      {import.meta.env.DEV ? <HostPanel /> : null}

      <div className="toggle" role="tablist" aria-label="Direction">
        {(
          [
            ["cash_out", "Cash out"],
            ["cash_in", "Cash in"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            id={`dir-${value}`}
            role="tab"
            type="button"
            aria-selected={direction === value}
            className={`toggle__opt${direction === value ? " toggle__opt--on" : ""}`}
            onClick={() => setDirection(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="card">
        <label className="field">
          <span className="field__label">You send</span>
          <div className="field__row">
            <input
              id="amount"
              className="field__input"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label={`Amount in ${sendUnit}`}
            />
            {cashOut ? (
              <select
                id="symbol"
                className="field__unit field__unit--select"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value as TokenSymbol)}
                aria-label="Token"
              >
                {TOKENS.map((t) => (
                  <option
                    key={t}
                    value={t}
                    disabled={!supports(direction, chain.slug, t, corridor)}
                  >
                    {t}
                  </option>
                ))}
              </select>
            ) : (
              <select
                id="corridor-send"
                className="field__unit field__unit--select"
                value={corridor}
                onChange={(e) => setCorridor(e.target.value as Corridor)}
                aria-label="Currency"
              >
                {CORRIDORS.map((c) => (
                  <option
                    key={c}
                    value={c}
                    disabled={!supports(direction, chain.slug, symbol, c)}
                  >
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>
        </label>

        <label className="field">
          <span className="field__label">They receive</span>
          <div className="field__row">
            <output className="field__input field__input--readonly">
              {loading
                ? "…"
                : quote === null
                  ? "—"
                  : money(quote.receive, cashOut ? 2 : 4)}
            </output>
            {cashOut ? (
              <select
                id="corridor-recv"
                className="field__unit field__unit--select"
                value={corridor}
                onChange={(e) => setCorridor(e.target.value as Corridor)}
                aria-label="Currency"
              >
                {CORRIDORS.map((c) => (
                  <option
                    key={c}
                    value={c}
                    disabled={!supports(direction, chain.slug, symbol, c)}
                  >
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <select
                id="symbol-recv"
                className="field__unit field__unit--select"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value as TokenSymbol)}
                aria-label="Token"
              >
                {TOKENS.map((t) => (
                  <option
                    key={t}
                    value={t}
                    disabled={!supports(direction, chain.slug, t, corridor)}
                  >
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>
        </label>

        <label className="field">
          <span className="field__label">Settles on</span>
          <div className="field__row">
            <select
              id="chain"
              className="field__input field__input--select"
              value={chain.slug}
              onChange={(e) => {
                const next = CHAINS.find((c) => c.slug === e.target.value);
                if (next !== undefined) setChain(next);
              }}
              aria-label="Chain"
            >
              {CHAINS.map((c) => (
                <option
                  key={c.slug}
                  value={c.slug}
                  disabled={!supports(direction, c.slug, symbol, corridor)}
                >
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </label>

        <p className={blocked !== null ? "rate rate--blocked" : "rate"}>
          {blocked !== null
            ? blocked
            : error !== null
            ? error
            : quote === null
              ? "Enter an amount to see today's rate"
              : `1 ${symbol} = ${money(quote.rate)} ${corridor} · ${chain.name}`}
        </p>
      </section>

      {session === null ? (
        <>
          <button className="cta" type="button" onClick={onConnect}>
            Connect wallet
          </button>
          {walletError !== null ? (
            <p className="notice">
              {walletError}
              <span className="notice__hint">
                Open this inside Nimiq Pay to continue.
              </span>
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="connected">
            Connected <code>{session.address.slice(0, 6)}…{session.address.slice(-4)}</code>{" "}
            on {session.chain.name}
          </p>
          <button className="cta" type="button" disabled={blocked !== null}>
            {blocked !== null
              ? "Not available on this route"
              : "Continue — recipient details next"}
          </button>
        </>
      )}
    </main>
  );
}
