import { type ChainSlug, chainBySlug, toMinor, tokenOn, type TokenSymbol } from "@ramp/core";
import { encodeFunctionData, isAddress } from "viem";

import { currentChain, type Eip1193, WalletError } from "./connect.js";
import { feeFields } from "./fees.js";
import { checkGas } from "./gas.js";

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

  // Gas last, once everything else is known good. A wallet holding
  // stablecoin and no native token is the ordinary case here — a cash-in puts
  // the one there without the other — and "insufficient gas" from the wallet
  // is a dead end the user cannot act on.
  const gas = await checkGas(provider, { chain: transfer.chain, from: transfer.from });
  if (!gas.ok) {
    throw new WalletError(
      `Not enough ${gas.symbol} to pay the network fee on ${chain.name}. ` +
        `This transfer needs about ${gas.needed} ${gas.symbol} and the wallet has ${gas.have}. ` +
        `${gas.symbol} pays the fee; your ${transfer.symbol} is untouched.`,
    );
  }

  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [transfer.to as `0x${string}`, amount],
  });

  /*
   * Price the transaction ourselves.
   *
   * Left to choose, a wallet applies whatever defaults it ships with, and
   * Ethereum-shaped defaults are below the 25 gwei priority fee Polygon's
   * validators require — the transaction is then refused for being
   * underpriced, which reads as a fee complaint from a wallet holding ample
   * POL. Null when the chain cannot be read, and then the wallet's own guess
   * is still better than one we invented.
   */
  const fees = await feeFields(provider, transfer.chain);

  return (await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: transfer.from,
        to: token.address,
        // Nothing native moves: the value rides in the ERC-20 call data.
        value: "0x0",
        data,
        ...(fees ?? {}),
      },
    ],
  })) as string;
}
