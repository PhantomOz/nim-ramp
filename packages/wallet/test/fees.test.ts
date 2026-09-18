import { expect, test } from "vitest";

import { feeFields } from "../src/fees.js";

const GWEI = 1_000_000_000n;
const hex = (n: bigint) => `0x${n.toString(16)}`;

/** A provider answering the three reads with whatever we hand it. */
function provider(answers: Record<string, unknown>) {
  return {
    request: async ({ method }: { method: string }) => {
      if (!(method in answers)) throw new Error(`unsupported: ${method}`);
      const value = answers[method];
      if (value instanceof Error) throw value;
      return value;
    },
  };
}

test("caps the fee above the base fee, with the priority fee inside the cap", async () => {
  const fees = await feeFields(
    provider({
      eth_getBlockByNumber: { baseFeePerGas: hex(100n * GWEI) },
      eth_maxPriorityFeePerGas: hex(30n * GWEI),
    }),
    "polygon",
  );

  // base 100 doubled, plus 30 priority.
  expect(fees).toEqual({
    maxFeePerGas: hex(230n * GWEI),
    maxPriorityFeePerGas: hex(30n * GWEI),
  });
});

test("raises a priority fee below Polygon's enforced minimum", async () => {
  // Polygon rejects anything under 25 gwei as underpriced, and the error is
  // about the fee rather than the balance — which reads as "insufficient fee"
  // on a wallet holding plenty of POL.
  const fees = await feeFields(
    provider({
      eth_getBlockByNumber: { baseFeePerGas: hex(100n * GWEI) },
      eth_maxPriorityFeePerGas: hex(2n * GWEI),
    }),
    "polygon",
  );

  expect(fees?.maxPriorityFeePerGas).toBe(hex(25n * GWEI));
  // The cap has to rise with it, or the priority fee exceeds its own ceiling.
  expect(BigInt(fees?.maxFeePerGas ?? "0x0")).toBe(225n * GWEI);
});

test("leaves chains without a floor on what the node suggested", async () => {
  const fees = await feeFields(
    provider({
      eth_getBlockByNumber: { baseFeePerGas: hex(1n * GWEI) },
      eth_maxPriorityFeePerGas: hex(1_000_000n),
    }),
    "base",
  );

  expect(fees?.maxPriorityFeePerGas).toBe(hex(1_000_000n));
});

test("falls back to the gas price when the node has no priority-fee method", async () => {
  // Plenty of injected providers do not implement eth_maxPriorityFeePerGas.
  const fees = await feeFields(
    provider({
      eth_getBlockByNumber: { baseFeePerGas: hex(100n * GWEI) },
      eth_gasPrice: hex(140n * GWEI),
    }),
    "polygon",
  );

  // 140 suggested - 100 base = 40 of priority.
  expect(fees?.maxPriorityFeePerGas).toBe(hex(40n * GWEI));
});

test("says nothing rather than guessing when the chain cannot be read", async () => {
  // Sending no fee fields is what we did before, and the wallet's own
  // defaults are a better guess than ours invented from nothing.
  expect(await feeFields(provider({}), "polygon")).toBeNull();
});

test("says nothing on a pre-1559 chain with no base fee", async () => {
  const fees = await feeFields(
    provider({ eth_getBlockByNumber: {}, eth_gasPrice: hex(5n * GWEI) }),
    "bnb-smart-chain",
  );
  expect(fees).toBeNull();
});
