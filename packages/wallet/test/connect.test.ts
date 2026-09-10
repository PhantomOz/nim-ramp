import { expect, test } from "vitest";

import {
  connect,
  getProvider,
  POLYGON_CHAIN_ID,
  WalletError,
  type Eip1193,
} from "../src/index.js";

type Reply = Record<string, unknown>;

function fakeWallet(replies: Reply) {
  const seen: { method: string; params?: unknown[] }[] = [];
  const provider: Eip1193 = {
    request: async (args) => {
      seen.push(args);
      if (!(args.method in replies)) {
        throw new Error(`unstubbed method ${args.method}`);
      }
      return replies[args.method];
    },
  };
  return { provider, seen };
}

test("running outside Nimiq Pay explains itself instead of returning undefined", () => {
  expect(() => getProvider({})).toThrow(WalletError);
  expect(() => getProvider({})).toThrow(/nimiq pay/i);
});

test("the injected provider is found when Nimiq Pay has supplied one", () => {
  const { provider } = fakeWallet({});
  expect(getProvider({ ethereum: provider })).toBe(provider);
});

test("connecting asks the wallet for accounts and reports the chain", async () => {
  const { provider, seen } = fakeWallet({
    eth_requestAccounts: ["0xABC0000000000000000000000000000000000001"],
    eth_chainId: "0x89",
  });

  const session = await connect(provider);

  expect(seen.map((s) => s.method)).toContain("eth_requestAccounts");
  expect(session.address).toBe("0xABC0000000000000000000000000000000000001");
  expect(session.chainId).toBe(POLYGON_CHAIN_ID);
});

test("a wallet on the wrong chain is asked to switch to Polygon", async () => {
  const { provider, seen } = fakeWallet({
    eth_requestAccounts: ["0xABC0000000000000000000000000000000000001"],
    eth_chainId: "0x1", // Ethereum mainnet
    wallet_switchEthereumChain: null,
  });

  await connect(provider);

  const switched = seen.find((s) => s.method === "wallet_switchEthereumChain");
  expect(switched?.params).toEqual([{ chainId: "0x89" }]);
});

test("a wallet that returns no accounts is an error, not an empty session", async () => {
  const { provider } = fakeWallet({
    eth_requestAccounts: [],
    eth_chainId: "0x89",
  });
  await expect(connect(provider)).rejects.toThrow(WalletError);
});
