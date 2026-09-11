import { type Chain, chainByEvmId, chainBySlug, type ChainSlug } from "@ramp/core";

/**
 * The EVM half of Nimiq Pay.
 *
 * Nimiq Pay injects two providers: `window.nimiq` (Nimiq L1, wrapped by
 * `@nimiq/mini-app-sdk`) and `window.ethereum` (standard EIP-1193). Stablecoin
 * settlement lives behind the second one, which is why there is no
 * Nimiq-specific SDK in this file — it is an ordinary injected wallet.
 */

/** The slice of EIP-1193 we use. */
export type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export class WalletError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletError";
  }
}

/** Where we send someone whose wallet is on a chain we cannot ramp. */
export const DEFAULT_CHAIN: ChainSlug = "polygon";

export type Session = { address: string; chain: Chain };

export function getProvider(
  win: { ethereum?: unknown } = globalThis as never,
): Eip1193 {
  const injected = win.ethereum;
  if (injected === undefined || injected === null) {
    throw new WalletError(
      "no wallet provider injected — open this inside Nimiq Pay, or via a nimiqpay:// deeplink",
    );
  }
  return injected as Eip1193;
}

export async function currentChain(provider: Eip1193): Promise<Chain | null> {
  const raw = (await provider.request({ method: "eth_chainId" })) as string;
  return chainByEvmId(Number.parseInt(raw, 16));
}

export async function switchChain(
  provider: Eip1193,
  chain: Chain,
): Promise<void> {
  await provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: chain.evmIdHex }],
  });
}

/**
 * What the wallet says about itself right now.
 *
 * Three answers, not two. `none` means the wallet told us nothing is
 * connected. `unknown` means we could not ask — not every injected provider
 * implements `eth_accounts`, and reading a thrown method as "the user is not
 * connected" turns a wallet we merely failed to question into a blocked
 * transfer.
 */
export type LiveAccount =
  | { kind: "live"; session: Session }
  | { kind: "none" }
  | { kind: "unknown" };

/**
 * Read the live account and chain without prompting.
 *
 * `eth_accounts` reports what is already authorised. `eth_requestAccounts`
 * raises a dialog, and raising one silently before every order would be an
 * ambush.
 */
export async function liveAccount(provider: Eip1193): Promise<LiveAccount> {
  let accounts: string[];
  try {
    accounts = (await provider.request({ method: "eth_accounts" })) as string[];
  } catch {
    return { kind: "unknown" };
  }

  const address = accounts?.[0];
  if (address === undefined) return { kind: "none" };

  let chain;
  try {
    chain = await currentChain(provider);
  } catch {
    return { kind: "unknown" };
  }
  if (chain === null) return { kind: "unknown" };

  return { kind: "live", session: { address, chain } };
}

/** Convenience for callers that only care about a definite live session. */
export async function currentSession(provider: Eip1193): Promise<Session | null> {
  const result = await liveAccount(provider);
  return result.kind === "live" ? result.session : null;
}

/**
 * Ask the wallet for an account and settle which chain we are ramping on.
 *
 * If the wallet is already on a chain both Nimiq Pay and Paycrest serve, it
 * stays there — someone holding USDC on Base should not be yanked onto
 * Polygon for our convenience. We only switch when we have to: their chain is
 * one we cannot ramp (Optimism, say), or the caller insists on a specific one.
 *
 * Nimiq Pay raises its own confirmation dialog for all of this, which we
 * cannot bypass or restyle. That is the property keeping us out of the
 * custody path, so it is a feature rather than an obstacle.
 */
export async function connect(
  provider: Eip1193,
  options: { require?: ChainSlug } = {},
): Promise<Session> {
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];

  const address = accounts[0];
  if (address === undefined) {
    throw new WalletError("wallet returned no accounts");
  }

  const required =
    options.require === undefined ? null : chainBySlug(options.require);
  if (options.require !== undefined && required === null) {
    throw new WalletError(`we do not ramp on ${options.require}`);
  }

  const present = await currentChain(provider);

  if (required !== null) {
    if (present?.slug !== required.slug) await switchChain(provider, required);
    return { address, chain: required };
  }

  if (present !== null) return { address, chain: present };

  const fallback = chainBySlug(DEFAULT_CHAIN);
  if (fallback === null) throw new WalletError("no default chain configured");
  await switchChain(provider, fallback);
  return { address, chain: fallback };
}
