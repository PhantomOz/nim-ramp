import type { Chain, Corridor, TokenSymbol } from "@ramp/core";
import { useEffect, useState } from "react";

/**
 * Rates come straight from Paycrest's public endpoint — it needs no key, so
 * the browser can ask for itself. Everything requiring the API key goes
 * through our own server instead: a key in a front-end bundle is a key
 * published to the world.
 */
const RATES = "https://api.paycrest.io/v2/rates";

export type Direction = "cash_out" | "cash_in";

export type Quote = {
  /** Fiat per one unit of the token. */
  rate: number;
  /** What the other side ends up with, already converted. */
  receive: number;
};

export function useQuote(input: {
  direction: Direction;
  chain: Chain;
  symbol: TokenSymbol;
  corridor: Corridor;
  amount: string;
}): { quote: Quote | null; loading: boolean; error: string | null } {
  const { direction, chain, symbol, corridor, amount } = input;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const entered = Number(amount);
    if (amount.trim() === "" || !Number.isFinite(entered) || entered <= 0) {
      setQuote(null);
      setError(null);
      return;
    }

    const side = direction === "cash_out" ? "sell" : "buy";
    // On a cash-out the user types the token amount, so we can price it
    // directly. On a cash-in they type fiat, and the endpoint prices in token
    // units — so we ask for a unit rate and divide. This is indicative; the
    // binding number comes back on the order itself.
    const priced = direction === "cash_out" ? amount : "1";

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${RATES}/${chain.slug}/${symbol}/${priced}/${corridor}?side=${side}`)
      .then((r) => r.json())
      .then((body: { status?: string; message?: string; data?: Record<string, { rate?: string }> }) => {
        if (cancelled) return;
        if (body.status !== "success") {
          setQuote(null);
          setError(body.message ?? "no rate available");
          return;
        }
        const raw = body.data?.[side]?.rate;
        const rate = Number(raw);
        if (raw === undefined || !Number.isFinite(rate) || rate <= 0) {
          setQuote(null);
          setError("no rate available for this pair");
          return;
        }
        setQuote({
          rate,
          receive: direction === "cash_out" ? entered * rate : entered / rate,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setQuote(null);
          setError("could not reach the rate service");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [direction, chain.slug, symbol, corridor, amount]);

  return { quote, loading, error };
}
