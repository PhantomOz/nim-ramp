import { toMinor } from "@ramp/core";
import { encodeFunctionData, isAddress } from "viem";

import {
  type Eip1193,
  POLYGON_CHAIN_ID,
  POLYGON_CHAIN_ID_HEX,
  WalletError,
} from "./connect.js";

/** USDT on Polygon PoS. */
export const USDT_POLYGON = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";

/** USDT carries six decimals — not eighteen. */
export const USDT_DECIMALS = 6;

export const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * Move USDT from the user's Nimiq Pay wallet to an address — in practice the
 * `receiveAddress` Paycrest returns on an off-ramp order.
 *
 * The transaction goes *to the token contract* carrying a `transfer` call.
 * Addressing it to the recipient instead would send native MATIC and move no
 * USDT at all, which is the mistake this module exists to make impossible.
 *
 * Nimiq Pay raises its own confirmation dialog before this is signed. We are
 * never in the custody path.
 */
export async function sendUsdt(
  provider: Eip1193,
  transfer: { from: string; to: string; amount: string },
): Promise<string> {
  // Addresses first, and as our own error rather than one thrown from deep
  // inside ABI encoding. USDT sent to a wrong-but-valid address is gone, so
  // the checksum is the last cheap guard we get.
  for (const [role, address] of [
    ["recipient", transfer.to],
    ["sender", transfer.from],
  ] as const) {
    if (!isAddress(address, { strict: true })) {
      throw new WalletError(
        `${role} address is not a valid checksummed address: ${address}`,
      );
    }
  }

  // Exact minor units. `toMinor` refuses more precision than USDT carries
  // rather than truncating it into an amount the user never agreed to.
  const amount = toMinor(transfer.amount, USDT_DECIMALS);

  const chainId = Number.parseInt(
    (await provider.request({ method: "eth_chainId" })) as string,
    16,
  );
  if (chainId !== POLYGON_CHAIN_ID) {
    throw new WalletError(
      `wallet is on chain ${chainId}; USDT settlement needs Polygon (${POLYGON_CHAIN_ID_HEX})`,
    );
  }

  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [transfer.to as `0x${string}`, amount],
  });

  return (await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: transfer.from,
        to: USDT_POLYGON,
        // Nothing native moves: the value rides in the ERC-20 call data.
        value: "0x0",
        data,
      },
    ],
  })) as string;
}
