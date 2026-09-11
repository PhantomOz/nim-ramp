import {
  chainBySlug,
  chainsFor,
  type ChainSlug,
  type Corridor,
  type Direction,
  supports,
  type TokenSymbol,
  tokensFor,
} from "@ramp/core";

const COUNTRY: Record<Corridor, string> = {
  NGN: "Nigeria",
  KES: "Kenya",
  TZS: "Tanzania",
  UGX: "Uganda",
};

const list = (items: string[]): string =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1] ?? ""}`;

/**
 * Why this combination will not work, and what would.
 *
 * The rail's two directions are wildly asymmetric — cash-out fills 34 of 40
 * combinations, cash-in fills 7 — so people will land on dead ends through no
 * fault of their own. Telling them "unsupported" and stopping is the kind of
 * dead end §4 exists to prevent; naming the route that does work is the
 * difference between a wall and a signpost.
 *
 * Returns null when the combination is fine.
 */
export function explainUnsupported(
  direction: Direction,
  chain: ChainSlug,
  token: TokenSymbol,
  corridor: Corridor,
): string | null {
  if (supports(direction, chain, token, corridor)) return null;

  const verb = direction === "cash_in" ? "cash in" : "cash out";
  const where = direction === "cash_in" ? "from" : "to";
  const country = COUNTRY[corridor];

  // Would a different token on this same chain work?
  const otherTokens = tokensFor(direction, chain, corridor);
  if (otherTokens.length > 0) {
    const here = chainBySlug(chain)?.name ?? chain;
    return `On ${here} you can only ${verb} ${where} ${country} with ${list(otherTokens)}.`;
  }

  // Would this token work on a different chain?
  const otherChains = chainsFor(direction, token, corridor)
    .map((slug) => chainBySlug(slug)?.name ?? slug);
  if (otherChains.length > 0) {
    return `${token} can only ${verb} ${where} ${country} on ${list(otherChains)}.`;
  }

  // Nothing reaches this corridor in this direction at all.
  const anyToken = (["USDT", "USDC"] as const).some(
    (t) => chainsFor(direction, t, corridor).length > 0,
  );
  if (!anyToken) {
    return direction === "cash_in"
      ? `${country} cannot be cashed in yet — our rail has no provider buying ${corridor}. Cashing out works.`
      : `${country} cannot be cashed out yet.`;
  }

  return `${token} cannot ${verb} ${where} ${country}. Try the other token.`;
}
