import { type ChainSlug } from "@ramp/core";

import { type Eip1193 } from "./connect.js";

/**
 * The native token each chain charges gas in.
 *
 * Named per chain on purpose. Telling someone on Polygon they need ETH sends
 * them to buy the wrong thing on the wrong chain, and the whole point of this
 * check is that they are about to be stuck.
 */
const GAS_TOKEN: Record<ChainSlug, string> = {
  polygon: "POL",
  base: "ETH",
  "arbitrum-one": "ETH",
  ethereum: "ETH",
  "bnb-smart-chain": "BNB",
};

/** A plain ERC-20 transfer, with room to spare. */
const TRANSFER_GAS = 90_000n;

export type GasCheck =
  | { ok: true }
  | { ok: false; symbol: string; needed: string; have: string };

const fromWei = (wei: bigint): string => {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, 6);
  return `${whole}.${frac}`.replace(/\.?0+$/, "") || "0";
};

/**
 * Will this wallet be able to pay for the transfer?
 *
 * Worth asking before sending, because the failure mode otherwise is a raw
 * "insufficient gas" from the wallet on a screen that cannot explain it — and
 * the situation is common rather than exotic: a cash-in lands stablecoin in a
 * wallet holding no native token at all, and the very next thing someone
 * tries is sending it back out.
 *
 * A provider that cannot answer returns ok. Not being able to ask is not a
 * failure, and the wallet still rejects a genuinely unfundable transfer.
 */
export async function checkGas(
  provider: Eip1193,
  params: { chain: ChainSlug; from: string },
): Promise<GasCheck> {
  try {
    const [balanceHex, priceHex] = (await Promise.all([
      provider.request({ method: "eth_getBalance", params: [params.from, "latest"] }),
      provider.request({ method: "eth_gasPrice" }),
    ])) as [string, string];

    const balance = BigInt(balanceHex);
    const needed = BigInt(priceHex) * TRANSFER_GAS;

    if (balance >= needed) return { ok: true };

    return {
      ok: false,
      symbol: GAS_TOKEN[params.chain],
      needed: fromWei(needed),
      have: fromWei(balance),
    };
  } catch {
    return { ok: true };
  }
}
