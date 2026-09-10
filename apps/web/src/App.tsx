import { CORRIDORS, type Corridor } from "@ramp/core";
import type { State } from "@ramp/machine";
import { connect, getProvider, hostLanguage, type Session } from "@ramp/wallet";
import { useEffect, useState } from "react";

import { HostPanel } from "./HostPanel.js";
import { StatusScreen } from "./screens.js";

const SUPPORT = "help@fourcorridors.app";

/**
 * Rates come straight from Paycrest's public endpoint — it needs no key, so
 * the browser can ask for itself. Everything that needs the API key goes
 * through our own server instead: an API key in a front-end bundle is an API
 * key published to the world.
 */
const RATES = "https://api.paycrest.io/v2/rates";

type Quote = { corridor: Corridor; rate: string; usdt: string; receive: string };

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [corridor, setCorridor] = useState<Corridor>("NGN");
  const [usdt, setUsdt] = useState("10");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [txState] = useState<State | null>(null);

  const language = hostLanguage();

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Live rate for whatever the user has typed.
  useEffect(() => {
    if (usdt === "" || Number(usdt) <= 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuoting(true);

    fetch(`${RATES}/polygon/USDT/${usdt}/${corridor}?side=sell`)
      .then((r) => r.json())
      .then((body: { data?: { sell?: { rate?: string } } }) => {
        if (cancelled) return;
        const rate = body.data?.sell?.rate;
        if (rate === undefined) {
          setQuote(null);
          return;
        }
        setQuote({
          corridor,
          rate,
          usdt,
          receive: (Number(usdt) * Number(rate)).toFixed(2),
        });
      })
      .catch(() => {
        if (!cancelled) setQuote(null);
      })
      .finally(() => {
        if (!cancelled) setQuoting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [usdt, corridor]);

  async function onConnect() {
    setWalletError(null);
    try {
      setSession(await connect(getProvider()));
    } catch (error) {
      setWalletError(
        error instanceof Error ? error.message : "could not reach a wallet",
      );
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
        <p className="head__sub">Cash out USDT to local currency</p>
      </header>

      {import.meta.env.DEV ? <HostPanel /> : null}

      <section className="card">
        <label className="field">
          <span className="field__label">You send</span>
          <div className="field__row">
            <input
              id="usdt"
              className="field__input"
              inputMode="decimal"
              value={usdt}
              onChange={(e) => setUsdt(e.target.value)}
              aria-label="Amount in USDT"
            />
            <span className="field__unit">USDT</span>
          </div>
        </label>

        <label className="field">
          <span className="field__label">They receive</span>
          <div className="field__row">
            <output className="field__input field__input--readonly">
              {quoting ? "…" : (quote?.receive ?? "—")}
            </output>
            <select
              id="corridor"
              className="field__unit field__unit--select"
              value={corridor}
              onChange={(e) => setCorridor(e.target.value as Corridor)}
              aria-label="Currency"
            >
              {CORRIDORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </label>

        <p className="rate">
          {quote === null
            ? "Enter an amount to see today's rate"
            : `1 USDT = ${Number(quote.rate).toLocaleString()} ${quote.corridor}`}
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
            Connected <code>{session.address.slice(0, 6)}…{session.address.slice(-4)}</code>
          </p>
          <button className="cta" type="button" disabled>
            Continue — recipient details next
          </button>
        </>
      )}
    </main>
  );
}
