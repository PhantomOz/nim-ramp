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

import { CashinPay, type PayAccount } from "./buy.js";
import { explainRefusal } from "./explain.js";
import { Amount, COUNTRY, Home, Intro, Review } from "./flow.js";
import { HostPanel } from "./HostPanel.js";
import { Progress } from "./progress.js";
import { StatusScreen } from "./screens.js";
import { useQuote } from "./useQuote.js";

const SUPPORT = "help@nimramp.app";
const SEEN_INTRO = "nimramp.seen-intro";

type Step = "intro" | "home" | "amount" | "review" | "cashin_pay";

/** States where something is genuinely in flight and a timeline makes sense. */
const IN_FLIGHT: State[] = ["submitted", "settling", "stalled"];

/**
 * A stand-in so the pay screen can be reviewed on a phone before `apps/api`
 * can create a real order. Deliberately not a plausible account number — a
 * screen that shows real-looking bank details nobody owns is how money gets
 * sent into the void. Never rendered outside development.
 */
const EXAMPLE_ACCOUNT: PayAccount = {
  bank: "Example Bank — not a real account",
  accountNumber: "0000000000",
  accountName: "EXAMPLE ONLY — DO NOT SEND",
  amount: "0.00",
};

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
  const [account] = useState<PayAccount | null>(
    import.meta.env.DEV ? EXAMPLE_ACCOUNT : null,
  );

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

  const cashOut = direction === "cash_out";
  const receive =
    quote === null || amount === ""
      ? 0
      : cashOut
        ? Number(amount) * quote.rate
        : Number(amount) / quote.rate;

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

  function home() {
    setTxState(null);
    setAmount("");
    setStep("home");
  }

  const body = (() => {
    if (txState !== null) {
      return IN_FLIGHT.includes(txState) ? (
        <Progress
          direction={direction}
          state={txState}
          reference="NR-7QK2"
          heading={cashOut ? "Cashing out" : "Cashing in"}
          onClose={home}
        />
      ) : (
        <StatusScreen
          state={txState}
          reference="NR-7QK2"
          support={SUPPORT}
          onDone={home}
        />
      );
    }

    switch (step) {
      case "intro":
        return (
          <Intro
            onStart={() => {
              try {
                localStorage.setItem(SEEN_INTRO, "1");
              } catch {
                /* private browsing — the intro simply shows again */
              }
              setStep("home");
            }}
          />
        );

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
              // Cash-in has no separate review: the rail's own one-time
              // account carries the locked price, so the pay screen is the
              // review.
              setStep(cashOut ? "review" : "cashin_pay");
            }}
          />
        );

      case "cashin_pay":
        return (
          <CashinPay
            account={account}
            receive={receive}
            corridor={corridor}
            onBack={() => setStep("amount")}
            onCancel={home}
            onSent={() => setTxState("submitted")}
          />
        );

      case "review":
        return (
          <Review
            send={amount}
            receive={receive}
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
        <span className="topbar__sub">
          Mini app · Nimiq Pay{step === "home" ? ` · ${COUNTRY[corridor].name}` : ""}
        </span>
      </div>
      {import.meta.env.DEV ? <HostPanel /> : null}
      {walletError !== null && step === "home" ? (
        <p className="small" style={{ margin: "12px 20px 0", color: "var(--warn)" }}>
          {walletError}
        </p>
      ) : null}
      {body}
    </div>
  );
}
