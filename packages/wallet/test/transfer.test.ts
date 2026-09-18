import { tokenOn } from "@ramp/core";
import { decodeFunctionData } from "viem";
import { expect, test } from "vitest";

import { ERC20_ABI, sendToken, WalletError, type Eip1193 } from "../src/index.js";

const FROM = "0xABC0000000000000000000000000000000000001";
const TO = "0xDEF0000000000000000000000000000000000002";

function wallet(chainIdHex: string) {
  const sent: Record<string, string>[] = [];
  const provider: Eip1193 = {
    request: async ({ method, params }) => {
      if (method === "eth_chainId") return chainIdHex;
      if (method === "eth_sendTransaction") {
        sent.push((params as Record<string, string>[])[0] ?? {});
        return "0xhash";
      }
      throw new Error(`unstubbed ${method}`);
    },
  };
  return { provider, sent };
}

const decode = (data: string) =>
  decodeFunctionData({ abi: ERC20_ABI, data: data as `0x${string}` });

test("the transaction is addressed to the token contract, not the recipient", async () => {
  // Addressing it to the recipient sends native gas currency and moves no
  // token at all — the most common ERC-20 integration mistake.
  const { provider, sent } = wallet("0x89");
  await sendToken(provider, {
    chain: "polygon",
    symbol: "USDT",
    from: FROM,
    to: TO,
    amount: "0.5",
  });

  expect(sent[0]?.to).toBe(tokenOn("polygon", "USDT").address);
  expect(sent[0]?.to?.toLowerCase()).not.toBe(TO.toLowerCase());
  expect(sent[0]?.value).toBe("0x0");
});

test("six-decimal chains encode six decimals", async () => {
  const { provider, sent } = wallet("0x89");
  await sendToken(provider, {
    chain: "polygon",
    symbol: "USDT",
    from: FROM,
    to: TO,
    amount: "1",
  });
  expect(decode(sent[0]?.data ?? "").args?.[1]).toBe(1_000_000n);
});

test("BNB Smart Chain encodes eighteen, not six", async () => {
  // The whole reason the registry reads decimals per chain. Encoding BSC as
  // six decimals would send one trillionth of the intended amount; assuming
  // the reverse would send a trillion times too much.
  const { provider, sent } = wallet("0x38");
  await sendToken(provider, {
    chain: "bnb-smart-chain",
    symbol: "USDT",
    from: FROM,
    to: TO,
    amount: "1",
  });

  expect(decode(sent[0]?.data ?? "").args?.[1]).toBe(1_000_000_000_000_000_000n);
  expect(sent[0]?.to).toBe(tokenOn("bnb-smart-chain", "USDT").address);
});

test("BSC accepts precision that Polygon must refuse", async () => {
  // Eighteen decimals means 0.0000001 is representable on BSC and is not on
  // a six-decimal chain. The guard is per-token, not a constant.
  const bsc = wallet("0x38");
  await expect(
    sendToken(bsc.provider, {
      chain: "bnb-smart-chain",
      symbol: "USDT",
      from: FROM,
      to: TO,
      amount: "0.0000001",
    }),
  ).resolves.toBeDefined();

  const polygon = wallet("0x89");
  await expect(
    sendToken(polygon.provider, {
      chain: "polygon",
      symbol: "USDT",
      from: FROM,
      to: TO,
      amount: "0.0000001",
    }),
  ).rejects.toThrow(/precision/i);
});

test("sending while the wallet sits on another chain is refused before broadcast", async () => {
  const { provider, sent } = wallet("0x89"); // wallet on Polygon
  await expect(
    sendToken(provider, {
      chain: "base", // caller asked for Base
      symbol: "USDC",
      from: FROM,
      to: TO,
      amount: "1",
    }),
  ).rejects.toThrow(WalletError);
  expect(sent).toHaveLength(0);
});

test("a recipient that fails its checksum is refused before broadcast", async () => {
  const { provider, sent } = wallet("0x89");
  await expect(
    sendToken(provider, {
      chain: "polygon",
      symbol: "USDT",
      from: FROM,
      to: "0xdEF0000000000000000000000000000000000002",
      amount: "1",
    }),
  ).rejects.toThrow(WalletError);
  expect(sent).toHaveLength(0);
});

test("sets the fee fields itself rather than letting the wallet guess", async () => {
  // Polygon rejects a priority fee under 25 gwei as underpriced, and a wallet
  // carrying Ethereum defaults picks well under that. The rejection mentions
  // the fee, not the balance, on a wallet holding plenty of POL.
  const GWEI = 1_000_000_000n;
  const provider: Eip1193 = {
    request: async ({ method, params }) => {
      if (method === "eth_chainId") return "0x89";
      if (method === "eth_getBlockByNumber") {
        return { baseFeePerGas: `0x${(100n * GWEI).toString(16)}` };
      }
      // A node suggesting far below Polygon's floor.
      if (method === "eth_maxPriorityFeePerGas") return `0x${(2n * GWEI).toString(16)}`;
      if (method === "eth_getBalance") return `0x${(10n ** 18n).toString(16)}`;
      if (method === "eth_gasPrice") return `0x${(100n * GWEI).toString(16)}`;
      if (method === "eth_sendTransaction") {
        sent.push((params as Record<string, string>[])[0] ?? {});
        return "0xhash";
      }
      throw new Error(`unstubbed ${method}`);
    },
  };
  const sent: Record<string, string>[] = [];

  await sendToken(provider, {
    chain: "polygon",
    symbol: "USDT",
    from: FROM,
    to: TO,
    amount: "0.5",
  });

  expect(BigInt(sent[0]?.maxPriorityFeePerGas ?? "0x0")).toBe(25n * GWEI);
  expect(BigInt(sent[0]?.maxFeePerGas ?? "0x0")).toBe(225n * GWEI);
});

test("still sends when the wallet cannot answer fee questions at all", async () => {
  // Omitting the fields is what we did before; a provider that cannot be
  // questioned must not lose the ability to transfer.
  const { provider, sent } = wallet("0x89");
  await sendToken(provider, {
    chain: "polygon",
    symbol: "USDT",
    from: FROM,
    to: TO,
    amount: "0.5",
  });

  expect(sent[0]?.maxFeePerGas).toBeUndefined();
  expect(sent[0]?.to).toBe(tokenOn("polygon", "USDT").address);
});
