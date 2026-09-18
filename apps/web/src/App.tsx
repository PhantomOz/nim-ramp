import {
  CHAINS,
  type Chain,
  type Corridor,
  type Direction,
  type TokenSymbol,
} from "@ramp/core";
import type { State } from "@ramp/machine";
import {
  connect,
  liveAccount,
  getProvider,
  hostLanguage,
  sendToken,
  type Session,
} from "@ramp/wallet";
import { useEffect, useState } from "react";

import { AccountForm } from "./account.js";
import {
  type Account,
  createOrder,
  type OrderStatus,
  readLimits,
  readOrder,
  requestGas,
} from "./api.js";
import { CashinPay, type PayAccount } from "./buy.js";
import { explainRefusal } from "./explain.js";
import { Amount, COUNTRY, Home, Intro, Review } from "./flow.js";
import { HostPanel } from "./HostPanel.js";
import { Progress } from "./progress.js";
import { ChainSheet, CountrySheet } from "./sheets.js";
import { Receipt } from "./receipt.js";
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
  const [maxTxUsdt, setMaxTxUsdt] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<Account | null>(null);
  const [sending, setSending] = useState(false);
  const [gasNote, setGasNote] = useState<string | null>(null);
  const [settled, setSettled] = useState<OrderStatus | null>(null);

  const language = hostLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  /*
   * Nimiq Pay can change account or network under us. Without this the header
   * keeps showing the address from connect time, and an order would be built
   * against a wallet the user has already moved on from.
   */
  useEffect(() => {
    let provider;
    try {
      provider = getProvider();
    } catch {
      return; // No wallet here — a browser during development.
    }

    const resync = () => {
      void liveAccount(provider)
        .then((result) => {
          // Only a definite "none" clears the session. An unanswerable read
          // must not log someone out of a wallet they are still using.
          if (result.kind === "live") setSession(result.session);
          else if (result.kind === "none") setSession(null);
        })
        .catch(() => undefined);
    };

    const injected = provider as unknown as {
      on?: (event: string, handler: () => void) => void;
      removeListener?: (event: string, handler: () => void) => void;
    };

    injected.on?.("accountsChanged", resync);
    injected.on?.("chainChanged", resync);
    return () => {
      injected.removeListener?.("accountsChanged", resync);
      injected.removeListener?.("chainChanged", resync);
    };
  }, []);

  useEffect(() => {
    let stop = false;
    readLimits()
      .then((l) => {
        if (!stop) setMaxTxUsdt(l.maxTxUsdt);
      })
      .catch(() => {
        // The server still enforces it. Not knowing the number only costs us
        // the hint on the amount screen.
      });
    return () => {
      stop = true;
    };
  }, []);

  // While a transfer is in flight, ask the rail. The server never serves a
  // cached verdict, so this is the live state rather than our memory of it.
  useEffect(() => {
    if (reference === null || txState === null) return;
    if (!IN_FLIGHT.includes(txState)) return;

    let stop = false;
    const tick = async () => {
      try {
        const latest = await readOrder(reference);
        if (stop) return;
        // Keep the settled order so the receipt reads the rail's figures
        // rather than what this app remembered typing.
        if (latest.state === "completed") setSettled(latest);
        if (latest.state !== null) setTxState(latest.state);
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
    setRecipient(null);
    setSending(false);
    setSettled(null);
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

    try {
      const live = await resolveWallet();
      if (live === null) {
        setOrderError(
          "Connect your Nimiq Pay wallet first — the stablecoin needs somewhere to land.",
        );
        return;
      }
      setSession(live);

      const order = await createOrder({
        direction: "cash_in",
        corridor,
        chain: chain.slug,
        symbol,
        amount: typed,
        address: live.address,
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

  /**
   * Create the order, then hand the transfer to the wallet.
   *
   * Two steps that must happen in this order: the rail issues the address to
   * send to, and only then does anything move. Nimiq Pay raises its own
   * approval dialog for the transfer, which we cannot bypass — that is the
   * property that keeps us out of the custody path.
   */
  /**
   * The wallet to build an order against.
   *
   * Prefers what the wallet reports now; falls back to the session from
   * connect when the provider cannot answer. Only a definite empty account
   * list counts as disconnected.
   */
  async function resolveWallet(): Promise<Session | null> {
    try {
      const result = await liveAccount(getProvider());
      if (result.kind === "live") return result.session;
      if (result.kind === "none") return null;
      return session; // unknown — keep what we have
    } catch {
      return session;
    }
  }

  async function startCashOut() {
    if (recipient === null) {
      setOrderError("Choose where the money should go first.");
      return;
    }

    setOrderError(null);
    setSending(true);

    try {
      // Read the wallet now rather than trusting the session from connect
      // time: the refund address has to be the account the stablecoin
      // actually leaves. But a provider that cannot answer `eth_accounts` is
      // not a disconnected one, so fall back to the session we already hold
      // rather than blocking a wallet we merely failed to question.
      const live = await resolveWallet();
      if (live === null) {
        setOrderError("Your wallet is not connected. Open this inside Nimiq Pay and connect.");
        return;
      }
      setSession(live);

      const order = await createOrder({
        direction: "cash_out",
        corridor,
        chain: live.chain.slug,
        symbol,
        amount,
        // The connected wallet: where the stablecoin returns if the payout
        // cannot be made.
        address: live.address,
        recipient,
      });
      setReference(order.ref);

      if (order.receiveAddress === null) {
        setOrderError("The rail did not give us an address to send to.");
        return;
      }

      /*
       * Cover the network fee before asking for a signature.
       *
       * A wallet that has just been paid by a cash-in holds stablecoin and no
       * native token at all, so this transfer is unaffordable — and the only
       * thing the wallet can say about that is "insufficient gas".
       *
       * Asked unconditionally, rather than only when our own `checkGas` says
       * the wallet is short. That check runs through the injected provider,
       * which returns ok when it cannot answer at all — so gating a repair on
       * it means the repair silently never runs on exactly the wallets that
       * cannot be questioned. The server reads the balance over its own RPC
       * and refuses when nothing is needed, which is the more reliable place
       * for the decision to live.
       *
       * Best-effort either way: if it refuses we still try the transfer and
       * let the wallet be the authority on whether it can pay.
       */
      setGasNote("Checking the network fee…");
      const gas = await requestGas(order.ref, live.address);
      setGasNote(null);

      try {
        await sendToken(getProvider(), {
          chain: live.chain.slug,
          symbol,
          from: live.address,
          to: order.receiveAddress,
          amount,
        });
      } catch (e) {
        // If the transfer failed for want of gas, say what happened to the
        // top-up too. Swallowing that leaves the user staring at a fee they
        // were told would be covered, with no idea why it was not.
        const message = e instanceof Error ? e.message : "the transfer failed";
        const fee = /gas|fee/i.test(message);
        throw new Error(
          fee && !gas.funded && gas.reason !== undefined
            ? `${message} (the fee top-up was refused: ${gas.reason})`
            : message,
        );
      }

      setTxState("submitted");
    } catch (e) {
      // A rejected wallet dialog lands here too, which is correct: nothing
      // moved, and the order simply expires unpaid.
      setOrderError(e instanceof Error ? e.message : "could not start the transfer");
    } finally {
      setGasNote(null);
      setSending(false);
    }
  }

  const body = (() => {
    if (txState === "completed" && settled !== null) {
      return <Receipt data={{ ...settled, ref: settled.ref }} onDone={home} />;
    }

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
            maxTxUsdt={maxTxUsdt}
            onBack={() => setStep("home")}
            onReview={(a) => {
              setAmount(a);
              // Both directions need an account first: where the money goes
              // on a cash-out, where it comes back on a cash-in. Cash-out was
              // jumping straight to review and skipping the payout step.
              setStep("account");
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
              if (cashOut) {
                setRecipient(acct);
                setStep("review");
              } else {
                void startCashIn(amount, acct);
              }
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
            recipient={recipient}
            sending={sending}
            note={gasNote}
            error={orderError}
            onBack={() => setStep("account")}
            onExpired={() => setTxState("quote_expired")}
            onConfirm={() => void startCashOut()}
          />
        );
    }
  })();

  return (
    <div className="phone">
      <div className="topbar">
        <span className="topbar__name">nimRamp</span>
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
