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

import { AccountForm } from "./account.js";
import { type Account, createOrder, readOrder } from "./api.js";
import { CashinPay, type PayAccount } from "./buy.js";
import { explainRefusal } from "./explain.js";
import { Amount, COUNTRY, Home, Intro, Review } from "./flow.js";
import { HostPanel } from "./HostPanel.js";
import { Progress } from "./progress.js";
import { ChainSheet, CountrySheet } from "./sheets.js";
import { StatusScreen } from "./screens.js";
import { useQuote } from "./useQuote.js";

const SUPPORT = "help@nimramp.app";
const SEEN_INTRO = "nimramp.seen-intro";

type Step = "intro" | "home" | "amount" | "account" | "review" | "cashin_pay";

/** States where something is genuinely in flight and a timeline makes sense. */
const IN_FLIGHT: State[] = ["submitted", "settling", "stalled"];

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
  const [account, setAccount] = useState<PayAccount | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"country" | "chain" | null>(null);

  const language = hostLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // While a transfer is in flight, ask the rail. The server never serves a
  // cached verdict, so this is the live state rather than our memory of it.
  useEffect(() => {
    if (reference === null || txState === null) return;
    if (!IN_FLIGHT.includes(txState)) return;

    let stop = false;
    const tick = async () => {
      try {
        const latest = await readOrder(reference);
        if (!stop && latest.state !== null) setTxState(latest.state);
      } catch {
        // Transient. The next tick tries again; the stall window in the
        // machine is what eventually gives up, not this loop.
      }
    };

    const timer = setInterval(() => void tick(), 4000);
    void tick();
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [reference, txState]);

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
    setAccount(null);
    setReference(null);
    setOrderError(null);
    setStep("home");
  }

  /**
   * Create the order on the rail, which is what produces the one-time account
   * the user pays into. Until this succeeds there is nothing to show, and
   * the pay screen says so rather than inventing bank details.
   */
  async function startCashIn(typed: string, refundAccount: Account) {
    setOrderError(null);
    setAccount(null);
    setStep("cashin_pay");

    if (session === null) {
      setOrderError("Connect your Nimiq Pay wallet first — the stablecoin needs somewhere to land.");
      return;
    }

    try {
      const order = await createOrder({
        direction: "cash_in",
        corridor,
        chain: chain.slug,
        symbol,
        amount: typed,
        address: session.address,
        // Where the money returns if the on-ramp fails. The rail requires it
        // on a fiat source and refuses the order without one.
        refundAccount,
      });
      setReference(order.ref);
      setAccount(order.account);
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : "could not create the order");
    }
  }

  const body = (() => {
    if (txState !== null) {
      return IN_FLIGHT.includes(txState) ? (
        <Progress
          direction={direction}
          state={txState}
          reference={reference ?? "—"}
          heading={cashOut ? "Cashing out" : "Cashing in"}
          onClose={home}
        />
      ) : (
        <StatusScreen
          state={txState}
          {...(reference === null ? {} : { reference })}
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
            onOpenChain={() => setSheet("chain")}
            onOpenCountry={() => setSheet("country")}
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
              setStep(cashOut ? "review" : "account");
            }}
          />
        );

      case "account":
        return (
          <AccountForm
            corridor={corridor}
            purpose={cashOut ? "payout" : "refund"}
            onBack={() => setStep("amount")}
            onUse={(acct) => {
              if (cashOut) setStep("review");
              else void startCashIn(amount, acct);
            }}
          />
        );

      case "cashin_pay":
        return (
          <CashinPay
            account={account}
            error={orderError}
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

      {sheet === "country" ? (
        <CountrySheet
          current={corridor}
          onPick={setCorridor}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "chain" ? (
        <ChainSheet
          current={chain}
          onPick={setChain}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}
