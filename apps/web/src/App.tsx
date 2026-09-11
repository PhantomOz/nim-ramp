import {
  CHAINS,
  type Chain,
  type Corridor,
  type Direction,
  type TokenSymbol,
} from "@ramp/core";
import type { State } from "@ramp/machine";
import { connect, getProvider, hostLanguage, type Session } from "@ramp/wallet";
import { useEffect, useState } from "react";

import { explainRefusal } from "./explain.js";
import { Amount, Home, Intro, Review } from "./flow.js";
import { HostPanel } from "./HostPanel.js";
import { StatusScreen } from "./screens.js";
import { useQuote } from "./useQuote.js";

const SUPPORT = "help@nimramp.app";
const SEEN_INTRO = "nimramp.seen-intro";

type Step = "intro" | "home" | "amount" | "review";

export function App() {
  const [step, setStep] = useState<Step>(() => {
    try {
      return localStorage.getItem(SEEN_INTRO) === "1" ? "home" : "intro";
    } catch {
      return "intro";
    }
  });

  const [direction, setDirection] = useState<Direction>("cash_out");
  const [corridor, setCorridor] = useState<Corridor>("NGN");
  const [chain, setChain] = useState<Chain>(CHAINS[0] as Chain);
  const [symbol] = useState<TokenSymbol>("USDT");
  const [amount, setAmount] = useState("");

  const [session, setSession] = useState<Session | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [txState, setTxState] = useState<State | null>(null);

  const language = hostLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const { quote, refusal } = useQuote({
    direction,
    chain,
    symbol,
    corridor,
    amount: amount === "" ? "1" : amount,
  });

  const blocked =
    refusal === null
      ? null
      : explainRefusal(refusal, { chainName: chain.name, corridor });

  async function onConnect() {
    setWalletError(null);
    try {
      const next = await connect(getProvider(), { require: chain.slug });
      setSession(next);
      setChain(next.chain);
    } catch (e) {
      setWalletError(e instanceof Error ? e.message : "could not reach a wallet");
    }
  }

  function begin() {
    try {
      localStorage.setItem(SEEN_INTRO, "1");
    } catch {
      /* private browsing — the intro simply shows again */
    }
    setStep("home");
  }

  const body = (() => {
    if (txState !== null) {
      return (
        <StatusScreen
          state={txState}
          reference="NR-7QK2"
          support={SUPPORT}
          onDone={() => {
            setTxState(null);
            setAmount("");
            setStep("home");
          }}
        />
      );
    }

    switch (step) {
      case "intro":
        return <Intro onStart={begin} />;

      case "home":
        return (
          <Home
            corridor={corridor}
            chain={chain}
            symbol={symbol}
            rate={quote?.rate ?? null}
            connected={session !== null}
            address={session?.address ?? null}
            onPick={(d) => {
              setDirection(d);
              setStep("amount");
            }}
            onConnect={onConnect}
            onChangeChain={setChain}
            onChangeCorridor={setCorridor}
          />
        );

      case "amount":
        return (
          <Amount
            direction={direction}
            corridor={corridor}
            chain={chain}
            symbol={symbol}
            rate={quote?.rate ?? null}
            blocked={blocked}
            onBack={() => setStep("home")}
            onReview={(a) => {
              setAmount(a);
              setStep("review");
            }}
          />
        );

      case "review":
        return (
          <Review
            send={amount}
            receive={quote === null ? 0 : Number(amount) * quote.rate}
            corridor={corridor}
            chain={chain}
            symbol={symbol}
            onBack={() => setStep("amount")}
            onExpired={() => setTxState("quote_expired")}
            onConfirm={() => setTxState("confirmed")}
          />
        );
    }
  })();

  return (
    <div className="phone">
      <div className="topbar">
        <span className="topbar__name">NimRamp</span>
        <span className="topbar__sub">Mini app · Nimiq Pay</span>
      </div>
      {import.meta.env.DEV ? <HostPanel /> : null}
      {walletError !== null && step === "home" ? (
        <p className="small" style={{ margin: "12px 20px 0", color: "var(--warn)" }}>{walletError}</p>
      ) : null}
      {body}
    </div>
  );
}
