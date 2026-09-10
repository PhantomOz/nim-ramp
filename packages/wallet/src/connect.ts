/**
 * The EVM half of Nimiq Pay.
 *
 * Nimiq Pay injects two providers: `window.nimiq` (Nimiq L1, wrapped by
 * `@nimiq/mini-app-sdk`) and `window.ethereum` (standard EIP-1193). USDT on
 * Polygon lives behind the second one, which is why there is no Nimiq-specific
 * SDK in this file — it is an ordinary injected wallet.
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

/** Polygon PoS. */
export const POLYGON_CHAIN_ID = 137;
export const POLYGON_CHAIN_ID_HEX = "0x89";

export type Session = { address: string; chainId: number };

/**
 * The injected provider, or a readable failure.
 *
 * A mini app opened in a plain browser has no provider at all, and that is a
 * normal thing to happen during development. It should say so rather than
 * fail later with `undefined is not a function`.
 */
export function getProvider(win: { ethereum?: unknown } = globalThis as never): Eip1193 {
  const injected = win.ethereum;
  if (injected === undefined || injected === null) {
    throw new WalletError(
      "no wallet provider injected — open this inside Nimiq Pay, or via a nimiqpay:// deeplink",
    );
  }
  return injected as Eip1193;
}

async function chainIdOf(provider: Eip1193): Promise<number> {
  const raw = (await provider.request({ method: "eth_chainId" })) as string;
  return Number.parseInt(raw, 16);
}

/**
 * Ask the wallet for an account and make sure we are on Polygon.
 *
 * Nimiq Pay raises its own confirmation dialog for both, which we cannot
 * bypass or restyle — that is the property that keeps us out of the custody
 * path, so it is a feature rather than an obstacle.
 */
export async function connect(provider: Eip1193): Promise<Session> {
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];

  const address = accounts[0];
  if (address === undefined) {
    throw new WalletError("wallet returned no accounts");
  }

  let chainId = await chainIdOf(provider);
  if (chainId !== POLYGON_CHAIN_ID) {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: POLYGON_CHAIN_ID_HEX }],
    });
    chainId = POLYGON_CHAIN_ID;
  }

  return { address, chainId };
}
