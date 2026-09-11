import { expect, test } from "vitest";

import {
  connect,
  currentSession,
  getProvider,
  WalletError,
  type Eip1193,
} from "../src/index.js";

function fakeWallet(replies: Record<string, unknown>) {
  const seen: { method: string; params?: unknown[] }[] = [];
  const provider: Eip1193 = {
    request: async (args) => {
      seen.push(args);
      if (!(args.method in replies)) throw new Error(`unstubbed ${args.method}`);
      return replies[args.method];
    },
  };
  return { provider, seen };
}

const ACCOUNT = "0xABC0000000000000000000000000000000000001";

test("running outside Nimiq Pay explains itself instead of returning undefined", () => {
  expect(() => getProvider({})).toThrow(WalletError);
  expect(() => getProvider({})).toThrow(/nimiq pay/i);
});

test("a wallet already on a chain we serve is left where it is", async () => {
  // Someone holding USDC on Base should not be yanked onto Polygon.
  const { provider, seen } = fakeWallet({
    eth_requestAccounts: [ACCOUNT],
    eth_chainId: "0x2105", // Base
  });

  const session = await connect(provider);

  expect(session.chain.slug).toBe("base");
  expect(seen.map((s) => s.method)).not.toContain("wallet_switchEthereumChain");
});

test("a wallet on BNB Smart Chain is recognised, not treated as Polygon", async () => {
  const { provider } = fakeWallet({
    eth_requestAccounts: [ACCOUNT],
    eth_chainId: "0x38", // 56
  });
  const session = await connect(provider);
  expect(session.chain.slug).toBe("bnb-smart-chain");
  expect(session.chain.tokens.USDT.decimals).toBe(18);
});

test("a wallet on a chain we cannot ramp is moved to one we can", async () => {
  // Optimism: Nimiq Pay supports it, Paycrest does not.
  const { provider, seen } = fakeWallet({
    eth_requestAccounts: [ACCOUNT],
    eth_chainId: "0xa", // 10
    wallet_switchEthereumChain: null,
  });

  const session = await connect(provider);

  const switched = seen.find((s) => s.method === "wallet_switchEthereumChain");
  expect(switched?.params).toEqual([{ chainId: "0x89" }]);
  expect(session.chain.slug).toBe("polygon");
});

test("a caller can insist on a particular chain", async () => {
  const { provider, seen } = fakeWallet({
    eth_requestAccounts: [ACCOUNT],
    eth_chainId: "0x89",
    wallet_switchEthereumChain: null,
  });

  const session = await connect(provider, { require: "base" });

  expect(seen.find((s) => s.method === "wallet_switchEthereumChain")?.params).toEqual([
    { chainId: "0x2105" },
  ]);
  expect(session.chain.slug).toBe("base");
});

test("a wallet that returns no accounts is an error, not an empty session", async () => {
  const { provider } = fakeWallet({
    eth_requestAccounts: [],
    eth_chainId: "0x89",
  });
  await expect(connect(provider)).rejects.toThrow(WalletError);
});

test("the live account is re-read, not remembered from connect time", async () => {
  // Someone can switch accounts in Nimiq Pay after connecting. On a cash-out
  // that matters twice over: the stablecoin leaves whichever account the
  // wallet is on now, while the refund address would still point at the one
  // we captured earlier — so a failed payout returns the money to an account
  // the sender is no longer using.
  const { provider } = fakeWallet({
    eth_accounts: ["0xDEF0000000000000000000000000000000000002"],
    eth_chainId: "0x89",
  });

  const live = await currentSession(provider);
  expect(live?.address).toBe("0xDEF0000000000000000000000000000000000002");
  expect(live?.chain.slug).toBe("polygon");
});

test("a wallet that has been disconnected reports no session", async () => {
  // eth_accounts returns empty when the user revokes access — distinct from
  // eth_requestAccounts, which would prompt them again.
  const { provider } = fakeWallet({ eth_accounts: [], eth_chainId: "0x89" });
  expect(await currentSession(provider)).toBeNull();
});

test("re-reading does not prompt the user", async () => {
  // eth_requestAccounts raises a dialog. Doing that silently before every
  // order would be an ambush.
  const { provider, seen } = fakeWallet({
    eth_accounts: ["0xABC0000000000000000000000000000000000001"],
    eth_chainId: "0x89",
  });
  await currentSession(provider);
  expect(seen.map((s) => s.method)).not.toContain("eth_requestAccounts");
});
