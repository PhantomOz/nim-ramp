import { type ChainSlug } from "@ramp/core";

import { type Eip1193 } from "./connect.js";

/**
 * EIP-1559 fee fields, chosen by us rather than by the wallet.
 *
 * Sending a transaction with no fee fields leaves the wallet to pick, and a
 * wallet carrying Ethereum-shaped defaults picks a priority fee Polygon
 * rejects outright — its validators enforce a 25 gwei floor. The rejection is
 * about the fee, not the balance, so it surfaces as "insufficient fee" on a
 * wallet holding plenty of POL, which sends everyone looking at the wrong
 * problem.
 */

const GWEI = 1_000_000_000n;

/**
 * The lowest priority fee a chain's validators will accept.
 *
 * Only networks that enforce one are listed. Elsewhere the node's own
 * suggestion is better than a number we invented.
 */
const PRIORITY_FLOOR: Record<ChainSlug, bigint> = {
  polygon: 25n * GWEI,
  "bnb-smart-chain": 1n * GWEI,
  base: 0n,
  "arbitrum-one": 0n,
  ethereum: 0n,
};

export type FeeFields = {
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
};

const hex = (n: bigint) => `0x${n.toString(16)}`;

async function ask(provider: Eip1193, method: string, params?: unknown[]) {
  try {
    return await provider.request(
      params === undefined ? { method } : { method, params },
    );
  } catch {
    return undefined;
  }
}

/**
 * What should this transaction offer to pay?
 *
 * Returns null when the chain cannot be read, or when it has no base fee at
 * all — letting the wallet use its own defaults is better than inventing
 * numbers, and a pre-1559 chain does not take these fields.
 */
export async function feeFields(
  provider: Eip1193,
  chain: ChainSlug,
): Promise<FeeFields | null> {
  const block = (await ask(provider, "eth_getBlockByNumber", ["latest", false])) as
    | { baseFeePerGas?: string }
    | undefined;

  const baseRaw = block?.baseFeePerGas;
  if (typeof baseRaw !== "string") return null;

  let base: bigint;
  try {
    base = BigInt(baseRaw);
  } catch {
    return null;
  }

  // The node's suggestion first; plenty of injected providers do not
  // implement it, so fall back to deriving it from the gas price.
  let priority: bigint | undefined;
  const suggested = await ask(provider, "eth_maxPriorityFeePerGas");
  if (typeof suggested === "string") {
    try {
      priority = BigInt(suggested);
    } catch {
      priority = undefined;
    }
  }

  if (priority === undefined) {
    const price = await ask(provider, "eth_gasPrice");
    if (typeof price !== "string") return null;
    try {
      const asPrice = BigInt(price);
      priority = asPrice > base ? asPrice - base : 0n;
    } catch {
      return null;
    }
  }

  const floor = PRIORITY_FLOOR[chain];
  if (priority < floor) priority = floor;

  // Base doubled, so the transaction survives a rise while it is pending.
  // The priority fee sits inside the cap, never on top of it.
  return {
    maxFeePerGas: hex(base * 2n + priority),
    maxPriorityFeePerGas: hex(priority),
  };
}
