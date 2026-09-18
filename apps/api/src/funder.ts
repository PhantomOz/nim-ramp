import { type ChainSlug } from "@ramp/core";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain as ViemChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, base, bsc, mainnet, polygon } from "viem/chains";

import type { Funder } from "./app.js";

/**
 * The chain half of gas seeding: a funded wallet that sends native token.
 *
 * Thin by design — every question about *whether* to send lives in
 * `decideDrip`. This file only knows how.
 */

const VIEM_CHAINS: Record<ChainSlug, ViemChain> = {
  polygon,
  base,
  "arbitrum-one": arbitrum,
  ethereum: mainnet,
  "bnb-smart-chain": bsc,
};

/**
 * `POLYGON_RPC_URL`, `ARBITRUM_ONE_RPC_URL`, and so on — matching the naming
 * already in `.env.example` rather than inventing a second convention.
 */
const rpcVar = (slug: ChainSlug) => `${slug.toUpperCase().replace(/-/g, "_")}_RPC_URL`;

/**
 * Run tasks strictly one after another.
 *
 * Two sends from one EOA built at the same time read the same nonce, and the
 * chain rejects the second as an underpriced replacement — so the second user
 * to ask gets nothing while our wallet is debited once. A queue is a smaller,
 * more honest fix than tracking nonces ourselves.
 */
export function serialise() {
  let tail: Promise<unknown> = Promise.resolve();

  return <T>(task: () => Promise<T>): Promise<T> => {
    // `catch` keeps a rejected task from poisoning every task behind it; the
    // caller still sees the rejection through the promise we return.
    const next = tail.then(task, task);
    tail = next.catch(() => undefined);
    return next;
  };
}

export type FunderOptions = {
  /** 0x-prefixed private key of the wallet that pays. */
  privateKey: string;
  env: Record<string, string | undefined>;
};

export function createFunder(options: FunderOptions): Funder {
  const account = privateKeyToAccount(options.privateKey as `0x${string}`);
  const run = serialise();

  const transportFor = (slug: ChainSlug) => {
    const url = options.env[rpcVar(slug)]?.trim();
    // No URL falls back to viem's bundled public endpoint. Fine for a faucet
    // sending cents; worth setting properly for anything busier.
    return url === undefined || url === "" ? http() : http(url);
  };

  const publicFor = (slug: ChainSlug) =>
    createPublicClient({ chain: VIEM_CHAINS[slug], transport: transportFor(slug) });

  return {
    async read(chain, address) {
      const client = publicFor(chain);
      const [balance, gasPrice] = await Promise.all([
        client.getBalance({ address: address as `0x${string}` }),
        client.getGasPrice(),
      ]);
      return { balance, gasPrice };
    },

    send(chain, to, amountWei) {
      return run(async () => {
        const wallet = createWalletClient({
          account,
          chain: VIEM_CHAINS[chain],
          transport: transportFor(chain),
        });

        const hash = await wallet.sendTransaction({
          to: to as `0x${string}`,
          value: amountWei,
        });

        /*
         * Wait for it to land before telling the app it is funded.
         *
         * Returning on broadcast alone sends the user straight back to the
         * wallet, which reads a balance that has not changed yet and refuses
         * again — the same error we just spent money to remove.
         */
        await publicFor(chain).waitForTransactionReceipt({ hash, timeout: 60_000 });
        return hash;
      });
    },
  };
}

/** The address that pays, so it can be printed at boot and topped up. */
export function funderAddress(privateKey: string): string {
  return privateKeyToAccount(privateKey as `0x${string}`).address;
}
