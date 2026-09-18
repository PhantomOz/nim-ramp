/**
 * The chains we can actually ramp on.
 *
 * This is the intersection of two lists that do not match. Nimiq Pay supports
 * Ethereum, Polygon, Arbitrum One, Optimism, Base, BNB Smart Chain and
 * Sepolia. Paycrest — probed live on 10 Sep 2026, because its documentation
 * disagrees with its API in both directions — serves ethereum, polygon,
 * arbitrum-one, base, bnb-smart-chain, celo, lisk and starknet.
 *
 * So Optimism is out: Nimiq Pay has it, Paycrest's docs claim it, and the API
 * answers "Token USDT is not supported on network optimism". Celo, Lisk and
 * Starknet are out the other way — Paycrest serves them, Nimiq Pay does not.
 * Sepolia is out because Paycrest is mainnet-only.
 *
 * Every contract address and decimal below was read from the chain itself,
 * not from memory. That matters most for BNB Smart Chain, where USDT and USDC
 * carry eighteen decimals rather than the six everywhere else — treating it
 * as six would send a trillion times the intended amount.
 */

export type ChainSlug =
  | "polygon"
  | "base"
  | "arbitrum-one"
  | "ethereum"
  | "bnb-smart-chain";

export type TokenSymbol = "USDT" | "USDC";

export type Token = {
  symbol: TokenSymbol;
  address: string;
  decimals: number;
};

export type Chain = {
  /** Paycrest's network slug. Exact: "arbitrum-one", never "arbitrum". */
  slug: ChainSlug;
  /** What a person calls it. */
  name: string;
  evmId: number;
  evmIdHex: string;
  tokens: Record<TokenSymbol, Token>;
};

const chain = (
  slug: ChainSlug,
  name: string,
  evmId: number,
  usdt: [string, number],
  usdc: [string, number],
): Chain => ({
  slug,
  name,
  evmId,
  evmIdHex: `0x${evmId.toString(16)}`,
  tokens: {
    USDT: { symbol: "USDT", address: usdt[0], decimals: usdt[1] },
    USDC: { symbol: "USDC", address: usdc[0], decimals: usdc[1] },
  },
});

export const CHAINS: readonly Chain[] = [
  chain(
    "polygon",
    "Polygon",
    137,
    ["0xc2132D05D31c914a87C6611C10748AEb04B58e8F", 6],
    ["0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", 6],
  ),
  chain(
    "base",
    "Base",
    8453,
    ["0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", 6],
    ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 6],
  ),
  chain(
    "arbitrum-one",
    "Arbitrum One",
    42161,
    ["0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", 6],
    ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831", 6],
  ),
  chain(
    "ethereum",
    "Ethereum",
    1,
    ["0xdAC17F958D2ee523a2206206994597C13D831ec7", 6],
    ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 6],
  ),
  chain(
    "bnb-smart-chain",
    "BNB Smart Chain",
    56,
    // Eighteen decimals. Verified on-chain; this is the outlier.
    ["0x55d398326f99059fF775485246999027B3197955", 18],
    ["0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", 18],
  ),
];

/**
 * Gas for a plain ERC-20 transfer, with room to spare.
 *
 * Shared deliberately. The client uses it to tell someone how much native
 * token they need; the server uses it to decide how much to send them. Two
 * copies of this number drift, and the drift shows up as a top-up that does
 * not quite cover the transfer it was meant to pay for.
 */
export const TRANSFER_GAS = 90_000n;

export function chainBySlug(slug: string): Chain | null {
  return CHAINS.find((c) => c.slug === slug) ?? null;
}

/** Resolve whatever chain the wallet is currently on. */
export function chainByEvmId(evmId: number): Chain | null {
  return CHAINS.find((c) => c.evmId === evmId) ?? null;
}

export function tokenOn(slug: ChainSlug, symbol: TokenSymbol): Token {
  const found = chainBySlug(slug);
  if (found === null) throw new Error(`unsupported chain: ${slug}`);
  return found.tokens[symbol];
}
