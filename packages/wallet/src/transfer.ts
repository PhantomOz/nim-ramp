import { type ChainSlug, chainBySlug, toMinor, tokenOn, type TokenSymbol } from "@ramp/core";
import { encodeFunctionData, isAddress } from "viem";

import { currentChain, type Eip1193, WalletError } from "./connect.js";

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
 * Move a stablecoin from the user's Nimiq Pay wallet to an address — in
 * practice the `receiveAddress` Paycrest returns on an off-ramp order.
 *
 * Two things this makes impossible. The transaction goes *to the token
 * contract* carrying a `transfer` call, never to the recipient — doing the
 * latter sends native gas currency and moves no token. And decimals come from
 * the chain registry rather than a constant, because BNB Smart Chain's USDT
 * carries eighteen where every other chain we serve carries six.
 *
 * Nimiq Pay raises its own confirmation dialog before this is signed. We are
 * never in the custody path.
 */
export async function sendToken(
  provider: Eip1193,
  transfer: {
    chain: ChainSlug;
    symbol: TokenSymbol;
    from: string;
    to: string;
    amount: string;
  },
): Promise<string> {
  const chain = chainBySlug(transfer.chain);
  if (chain === null) {
    throw new WalletError(`we do not ramp on ${transfer.chain}`);
  }

  // Addresses first, and as our own error rather than one thrown from deep
  // inside ABI encoding. A token sent to a wrong-but-valid address is gone,
  // so the checksum is the last cheap guard we get.
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

  const token = tokenOn(transfer.chain, transfer.symbol);

  // Per-token decimals, never a constant. `toMinor` also refuses more
  // precision than the token carries rather than truncating it into an
  // amount the user never agreed to.
  const amount = toMinor(transfer.amount, token.decimals);

  const present = await currentChain(provider);
  if (present?.slug !== chain.slug) {
    throw new WalletError(
      `wallet is on ${present?.name ?? "an unsupported chain"}; this transfer is for ${chain.name}`,
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
        to: token.address,
        // Nothing native moves: the value rides in the ERC-20 call data.
        value: "0x0",
        data,
      },
    ],
  })) as string;
}
