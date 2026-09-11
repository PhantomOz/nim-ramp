import { expect, test } from "vitest";

import { checkGas, type Eip1193, WalletError } from "../src/index.js";

const FROM = "0xABC0000000000000000000000000000000000001";

function wallet(balanceWei: bigint, gasPriceWei = 278_700_000_000n) {
  const provider: Eip1193 = {
    request: async ({ method }) => {
      if (method === "eth_getBalance") return `0x${balanceWei.toString(16)}`;
      if (method === "eth_gasPrice") return `0x${gasPriceWei.toString(16)}`;
      throw new Error(`unstubbed ${method}`);
    },
  };
  return provider;
}

test("a wallet holding stablecoin but no gas is caught before anything is sent", async () => {
  // The common case, and the one that produced a raw "insufficient gas" from
  // the wallet: the cash-in landed USDT and there is no native token at all.
  const result = await checkGas(wallet(0n), { chain: "polygon", from: FROM });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.symbol).toBe("POL");
    expect(Number(result.needed)).toBeGreaterThan(0);
    expect(result.have).toBe("0");
  }
});

test("a funded wallet passes", async () => {
  const result = await checkGas(wallet(50_000_000_000_000_000n), {
    chain: "polygon",
    from: FROM,
  });
  expect(result.ok).toBe(true);
});

test("the gas token is named per chain, not called ETH everywhere", async () => {
  // Telling someone on Polygon they need ETH sends them to buy the wrong
  // thing on the wrong chain.
  const polygon = await checkGas(wallet(0n), { chain: "polygon", from: FROM });
  const bnb = await checkGas(wallet(0n), { chain: "bnb-smart-chain", from: FROM });
  const base = await checkGas(wallet(0n), { chain: "base", from: FROM });

  if (!polygon.ok) expect(polygon.symbol).toBe("POL");
  if (!bnb.ok) expect(bnb.symbol).toBe("BNB");
  if (!base.ok) expect(base.symbol).toBe("ETH");
});

test("a provider that cannot answer does not block the transfer", async () => {
  // Same rule as everywhere else: not being able to ask is not a failure.
  // The wallet will reject it for real if there is genuinely no gas.
  const provider: Eip1193 = {
    request: async () => {
      throw new Error("method not supported");
    },
  };
  expect((await checkGas(provider, { chain: "polygon", from: FROM })).ok).toBe(true);
});

test("sending without gas fails with an explanation, not a raw wallet error", async () => {
  const { sendToken } = await import("../src/index.js");
  const provider: Eip1193 = {
    request: async ({ method }) => {
      if (method === "eth_chainId") return "0x89";
      if (method === "eth_getBalance") return "0x0";
      if (method === "eth_gasPrice") return "0x40e5a1a800";
      if (method === "eth_sendTransaction") throw new Error("must not be reached");
      throw new Error(`unstubbed ${method}`);
    },
  };

  await expect(
    sendToken(provider, {
      chain: "polygon",
      symbol: "USDT",
      from: FROM,
      to: "0xDEF0000000000000000000000000000000000002",
      amount: "1",
    }),
  ).rejects.toThrow(WalletError);
});
