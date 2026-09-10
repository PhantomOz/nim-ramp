import { decodeFunctionData } from "viem";
import { expect, test } from "vitest";

import {
  ERC20_ABI,
  sendUsdt,
  USDT_POLYGON,
  WalletError,
  type Eip1193,
} from "../src/index.js";

const FROM = "0xABC0000000000000000000000000000000000001";
const TO = "0xDEF0000000000000000000000000000000000002";

function wallet(chainIdHex = "0x89") {
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

test("the transaction is addressed to the USDT contract, not the recipient", async () => {
  // Addressing it to the recipient would send native MATIC to them and move
  // no USDT at all — the single most common ERC-20 integration mistake.
  const { provider, sent } = wallet();
  await sendUsdt(provider, { from: FROM, to: TO, amount: "0.5" });

  expect(sent[0]?.to?.toLowerCase()).toBe(USDT_POLYGON.toLowerCase());
  expect(sent[0]?.to?.toLowerCase()).not.toBe(TO.toLowerCase());
  expect(sent[0]?.value).toBe("0x0");
  expect(sent[0]?.from).toBe(FROM);
});

test("the recipient and an exact six-decimal amount ride in the call data", async () => {
  const { provider, sent } = wallet();
  await sendUsdt(provider, { from: FROM, to: TO, amount: "0.5" });

  const decoded = decodeFunctionData({
    abi: ERC20_ABI,
    data: sent[0]?.data as `0x${string}`,
  });

  expect(decoded.functionName).toBe("transfer");
  expect(decoded.args?.[0]).toBe(TO);
  // USDT has six decimals on Polygon: 0.5 USDT is 500000, not 5e17.
  expect(decoded.args?.[1]).toBe(500_000n);
});

test("an amount carrying more precision than USDT is refused, not truncated", async () => {
  const { provider } = wallet();
  await expect(
    sendUsdt(provider, { from: FROM, to: TO, amount: "0.0000001" }),
  ).rejects.toThrow(/precision/i);
});

test("sending on a chain that is not Polygon is refused before broadcast", async () => {
  const { provider, sent } = wallet("0x1");
  await expect(
    sendUsdt(provider, { from: FROM, to: TO, amount: "0.5" }),
  ).rejects.toThrow(WalletError);
  expect(sent).toHaveLength(0);
});

test("a malformed recipient address is refused before broadcast", async () => {
  // A truncated or mistyped address must not reach the wallet. USDT sent to a
  // wrong-but-valid address is gone; sent to a malformed one it would fail
  // confusingly deep inside encoding.
  const { provider, sent } = wallet();
  await expect(
    sendUsdt(provider, { from: FROM, to: "0xdeadbeef", amount: "0.5" }),
  ).rejects.toThrow(WalletError);
  expect(sent).toHaveLength(0);
});

test("an address that fails its checksum is refused", async () => {
  const { provider, sent } = wallet();
  await expect(
    sendUsdt(provider, {
      from: FROM,
      // Correct length, wrong EIP-55 casing.
      to: "0xdEF0000000000000000000000000000000000002",
      amount: "0.5",
    }),
  ).rejects.toThrow(WalletError);
  expect(sent).toHaveLength(0);
});
