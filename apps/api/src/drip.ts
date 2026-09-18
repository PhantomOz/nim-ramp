import { type ChainSlug, TRANSFER_GAS } from "@ramp/core";

import type { OrderRecord } from "./store.js";

/**
 * Gas seeding for cash-out.
 *
 * A cash-in lands stablecoin in a wallet holding no native token at all, and
 * the very next thing someone tries is sending it back out — which they
 * cannot pay for. So the server sends them exactly the gas that transfer
 * costs, out of a wallet we fund.
 *
 * This module is the policy half and deliberately knows nothing about
 * signing: it is a faucet, and a faucet with a bug hands its balance to
 * whoever asks first. Everything below is the argument for why any particular
 * wei should leave our wallet, and it is the part worth testing.
 */

/** Gas prices move between our estimate and their send. Double it. */
const MARGIN = 2n;

const gwei = (n: bigint) => n * 1_000_000_000n;

/**
 * The most we will ever send in one go, and in one day, per chain.
 *
 * Priced per chain because the native tokens are not interchangeable: half a
 * POL is about twenty cents, half an ETH is a car. A single wei ceiling
 * across all five would either refuse every Polygon transfer or hand out
 * hundreds of dollars on Ethereum.
 *
 * These are ceilings, not amounts. A normal drip is far below them; the
 * ceiling exists so that a gas spike, or a bug in the estimate, cannot turn
 * one request into the whole wallet.
 */
const LIMITS: Record<ChainSlug, { perDrip: bigint; perDay: bigint }> = {
  // ~$0.20 and ~$2.
  polygon: { perDrip: gwei(500_000_000n), perDay: 5n * 10n ** 18n },
  // L2s: gas is fractions of a gwei, so these are enormous headroom already.
  base: { perDrip: 400_000_000_000_000n, perDay: 4_000_000_000_000_000n },
  "arbitrum-one": { perDrip: 400_000_000_000_000n, perDay: 4_000_000_000_000_000n },
  // Mainnet is the expensive one. ~$14 a drip, and we stop after five.
  ethereum: { perDrip: 4_000_000_000_000_000n, perDay: 20_000_000_000_000_000n },
  "bnb-smart-chain": { perDrip: 5_000_000_000_000_000n, perDay: 50_000_000_000_000_000n },
};

export type DripInputs = {
  /** The order the request claims to be for. */
  record: OrderRecord | undefined;
  /** The address asking to be funded. */
  address: string;
  /** What that address already holds, in wei. */
  balance: bigint;
  gasPrice: bigint;
  /** Whether this reference has been funded before. */
  alreadyDripped: boolean;
  /** Everything sent on this chain today, in wei. */
  spentToday: bigint;
};

export type DripDecision =
  | { ok: true; chain: ChainSlug; to: string; amountWei: bigint }
  | { ok: false; reason: string; status: number };

const refuse = (status: number, reason: string): DripDecision => ({
  ok: false,
  reason,
  status,
});

/** EIP-55 casing is not agreed between wallets, so compare on lowercase. */
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Should we fund this address, and with how much?
 *
 * Pure, so every refusal below can be tested without a chain or a key. The
 * order of the checks is the order of the risks: prove the request belongs to
 * a real order, prove it belongs to *this* caller, then prove the money is
 * both needed and bounded.
 */
export function decideDrip(input: DripInputs): DripDecision {
  const { record } = input;

  if (record === undefined) {
    return refuse(404, "unknown reference");
  }

  // Older log lines predate us storing the address. We cannot tell who owns
  // them, and "cannot tell" must not spend money.
  if (typeof record.address !== "string" || record.address === "") {
    return refuse(409, "this order has no address on record");
  }

  if (record.direction !== "cash_out") {
    return refuse(409, "only a cash-out needs gas");
  }

  if (!same(record.address, input.address)) {
    return refuse(403, "that address does not own this order");
  }

  if (input.alreadyDripped) {
    return refuse(409, "this order has already been topped up");
  }

  const needed = input.gasPrice * TRANSFER_GAS * MARGIN;
  if (input.balance >= needed) {
    return refuse(409, "this wallet can already pay for the transfer");
  }

  // Only the shortfall. A partially funded wallet does not need the lot.
  const amountWei = needed - input.balance;
  const limit = LIMITS[record.chain];

  // Refuse rather than clamp. Sending the ceiling when the ceiling is not
  // enough spends our money on a transfer that still fails, and leaves the
  // user in exactly the position they started in.
  if (amountWei > limit.perDrip) {
    return refuse(503, "gas costs too much on that chain right now");
  }

  if (input.spentToday + amountWei > limit.perDay) {
    return refuse(429, "today's gas budget for that chain is spent");
  }

  return { ok: true, chain: record.chain, to: record.address, amountWei };
}
