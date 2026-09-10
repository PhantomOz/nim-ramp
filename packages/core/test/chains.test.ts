import { expect, test } from "vitest";

import {
  CHAINS,
  chainByEvmId,
  chainBySlug,
  type ChainSlug,
  tokenOn,
} from "../src/index.js";

test("we support every chain Nimiq Pay and Paycrest both serve", () => {
  expect(CHAINS.map((c) => c.slug)).toEqual([
    "polygon",
    "base",
    "arbitrum-one",
    "ethereum",
    "bnb-smart-chain",
  ]);
});

test("Optimism is absent even though Nimiq Pay has it", () => {
  // Paycrest's docs list optimism, but the live API answers "Token USDT is
  // not supported on network optimism". The API wins.
  expect(chainBySlug("optimism" as ChainSlug)).toBeNull();
});

test("BNB Smart Chain carries eighteen decimals where the others carry six", () => {
  // The bug this exists to prevent: treating BSC as six decimals sends a
  // trillion times the intended amount. Verified on-chain, not from memory.
  expect(tokenOn("bnb-smart-chain", "USDT").decimals).toBe(18);
  expect(tokenOn("bnb-smart-chain", "USDC").decimals).toBe(18);

  for (const slug of ["polygon", "base", "arbitrum-one", "ethereum"] as const) {
    expect(tokenOn(slug, "USDT").decimals).toBe(6);
    expect(tokenOn(slug, "USDC").decimals).toBe(6);
  }
});

test("a token resolves to a checksummed contract address", () => {
  const usdt = tokenOn("polygon", "USDT");
  expect(usdt.address).toBe("0xc2132D05D31c914a87C6611C10748AEb04B58e8F");
  expect(usdt.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
});

test("a wallet's numeric chain id resolves to the chain we know", () => {
  expect(chainByEvmId(137)?.slug).toBe("polygon");
  expect(chainByEvmId(56)?.slug).toBe("bnb-smart-chain");
  expect(chainByEvmId(42161)?.slug).toBe("arbitrum-one");
  // Optimism's id, which we deliberately do not serve.
  expect(chainByEvmId(10)).toBeNull();
});

test("every chain exposes the hex id a wallet switch needs", () => {
  for (const chain of CHAINS) {
    expect(chain.evmIdHex).toBe(`0x${chain.evmId.toString(16)}`);
  }
});
