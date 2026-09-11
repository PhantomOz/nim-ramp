import { fromMinor, toMinor } from "@ramp/core";

/** Our cut, as shown on the amount screen. Paycrest takes it as senderFeePercent. */
export const SENDER_FEE_PERCENT = 0.5;

export type Breakdown = {
  /** What the user typed, normalised. */
  send: string;
  /** Our fee, in token units. */
  fee: string;
  /** What actually gets priced. */
  afterFee: string;
  /** Local currency that lands. */
  receive: number;
};

/**
 * Split an amount into fee and remainder, in exact minor units.
 *
 * The fee rounds *up* — against the user, in the protocol's favour. That is
 * the correct direction: rounding a fee down hands away value on every single
 * transaction, and the difference is only ever noticed in aggregate, by us,
 * much later.
 */
/** "0.250000" → "0.25". Trailing zeros carry no information. */
function trim(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
}

export function breakdown(input: {
  send: string;
  rate: number;
  decimals: number;
}): Breakdown {
  const { send, rate, decimals } = input;

  // Throws on anything that is not a plain decimal, and on more precision
  // than the token carries.
  const total = toMinor(send.trim(), decimals);
  if (total === 0n) throw new Error("amount is too small to send");

  const numerator = total * BigInt(Math.round(SENDER_FEE_PERCENT * 1000));
  const denominator = 100_000n;

  // Ceiling division, so a fee never rounds to the user's advantage.
  let fee = numerator / denominator;
  if (numerator % denominator !== 0n) fee += 1n;

  if (fee === 0n) {
    throw new Error("amount is too small: the fee would round to zero");
  }
  if (fee >= total) {
    throw new Error("amount is too small: the fee would take all of it");
  }

  const afterFee = total - fee;

  return {
    send: trim(fromMinor(total, decimals)),
    fee: trim(fromMinor(fee, decimals)),
    afterFee: trim(fromMinor(afterFee, decimals)),
    receive: Number(fromMinor(afterFee, decimals)) * rate,
  };
}
