/**
 * Exact decimal money. Amounts are strings on the way in and out, and bigint
 * minor units in between — a payment amount never touches a float.
 */

const DECIMAL = /^\d+(\.\d+)?$/;

/**
 * "1234.56" at 2 decimals becomes 123456n.
 *
 * Refuses more precision than the currency carries rather than rounding it
 * away: silently dropping a user's third decimal place is the kind of bug
 * nobody can reproduce afterwards.
 */
export function toMinor(amount: string, decimals: number): bigint {
  if (!DECIMAL.test(amount)) {
    throw new Error(`not a decimal amount: ${JSON.stringify(amount)}`);
  }

  const parts = amount.split(".");
  const whole = parts[0] ?? "";
  const fraction = parts[1] ?? "";

  if (fraction.length > decimals) {
    throw new Error(
      `precision: ${amount} carries ${fraction.length} decimal places, currency allows ${decimals}`,
    );
  }

  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

/** 123456n at 2 decimals becomes "1234.56". */
export function fromMinor(minor: bigint, decimals: number): string {
  if (decimals === 0) return minor.toString();

  const digits = minor.toString().padStart(decimals + 1, "0");
  return `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
}
