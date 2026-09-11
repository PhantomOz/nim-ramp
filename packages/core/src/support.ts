import type { ChainSlug } from "./chains.js";
import { CHAINS } from "./chains.js";
import type { Corridor } from "./corridor.js";
import { CORRIDORS } from "./corridor.js";
import type { TokenSymbol } from "./chains.js";

/**
 * Which (direction, chain, token, corridor) combinations the rail actually
 * fills — probed live on 11 Sep 2026, because none of it is documented.
 *
 * Two things this exists to prevent. Offering a combination that cannot work
 * and letting the user discover it after they have chosen; and assuming the
 * two directions mirror each other, which they emphatically do not.
 *
 * Cash-out fills 34 of 40 combinations. Cash-in fills 7. Tanzania, Uganda
 * and Ethereum cannot be cashed into at all, and every working cash-in
 * combination has exactly one provider behind it — so this is thin, and it
 * will move.
 *
 * Treat this as a fast local answer, not the authority. The rate call at
 * order time is the authority, and `useQuote` already surfaces the rail's own
 * refusal. A live canary keeps the two honest.
 */

export type Direction = "cash_out" | "cash_in";

type Matrix = Record<
  Direction,
  Partial<Record<ChainSlug, Partial<Record<TokenSymbol, readonly Corridor[]>>>>
>;

const ALL = CORRIDORS;

export const SUPPORT: Matrix = {
  cash_out: {
    polygon: { USDT: ALL, USDC: ALL },
    base: { USDT: ["NGN"], USDC: ALL },
    "arbitrum-one": { USDT: ALL, USDC: ALL },
    ethereum: { USDT: ["NGN"], USDC: ["NGN", "TZS"] },
    "bnb-smart-chain": { USDT: ALL, USDC: ALL },
  },
  cash_in: {
    polygon: { USDT: ["KES"], USDC: ["NGN"] },
    base: { USDT: ["KES"], USDC: ["NGN", "KES"] },
    "arbitrum-one": { USDT: ["KES"], USDC: [] },
    ethereum: { USDT: [], USDC: [] },
    "bnb-smart-chain": { USDT: ["KES"], USDC: [] },
  },
};

export function supports(
  direction: Direction,
  chain: ChainSlug,
  token: TokenSymbol,
  corridor: Corridor,
): boolean {
  return (SUPPORT[direction][chain]?.[token] ?? []).includes(corridor);
}

/** Corridors reachable for a given chain and token. */
export function corridorsFor(
  direction: Direction,
  chain: ChainSlug,
  token: TokenSymbol,
): Corridor[] {
  return [...(SUPPORT[direction][chain]?.[token] ?? [])];
}

/** Tokens that work for a given chain and corridor. */
export function tokensFor(
  direction: Direction,
  chain: ChainSlug,
  corridor: Corridor,
): TokenSymbol[] {
  return (["USDT", "USDC"] as const).filter((token) =>
    supports(direction, chain, token, corridor),
  );
}

/** Chains that work for a given token and corridor. */
export function chainsFor(
  direction: Direction,
  token: TokenSymbol,
  corridor: Corridor,
): ChainSlug[] {
  return CHAINS.map((c) => c.slug).filter((slug) =>
    supports(direction, slug, token, corridor),
  );
}
