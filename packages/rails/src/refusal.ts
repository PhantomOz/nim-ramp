/**
 * What the rail means when it says no.
 *
 * Paycrest refuses a rate for two entirely different reasons, in prose, and
 * the difference matters more than anything else in the quoting path:
 *
 *   "Token USDT is not supported on network optimism"   — structural, forever
 *   "Fiat currency GHS is not supported"                — structural, forever
 *   "no provider available for USDC to UGX conversion
 *    with amount 100 on base"                           — nobody is quoting
 *                                                          that size right now
 *
 * Reading the second as the first turns a provider stepping away for an hour
 * into "we do not serve Uganda", and bakes a snapshot of liquidity into a
 * constant. Every corridor the rail lists supports both directions; whether
 * anyone is filling them at a given size and minute is a live question, and
 * the only honest way to answer it is to ask.
 */

export type RailRefusal =
  | {
      kind: "structural";
      subject: "token" | "currency";
      what: string;
      where?: string;
      message: string;
    }
  | {
      kind: "no-liquidity";
      from: string;
      to: string;
      amount: string;
      network: string;
      message: string;
    }
  | { kind: "unknown"; message: string };

const TOKEN = /^Token (\S+) is not supported on network (\S+)/i;
const CURRENCY = /^Fiat currency (\S+) is not supported/i;
const LIQUIDITY =
  /^no provider available for (\S+) to (\S+) conversion with amount (\S+) on (\S+)/i;

export function classifyRefusal(message: string): RailRefusal {
  const token = TOKEN.exec(message);
  if (token !== null) {
    return {
      kind: "structural",
      subject: "token",
      what: token[1] ?? "",
      where: token[2] ?? "",
      message,
    };
  }

  const currency = CURRENCY.exec(message);
  if (currency !== null) {
    return {
      kind: "structural",
      subject: "currency",
      what: currency[1] ?? "",
      message,
    };
  }

  const liquidity = LIQUIDITY.exec(message);
  if (liquidity !== null) {
    return {
      kind: "no-liquidity",
      from: liquidity[1] ?? "",
      to: liquidity[2] ?? "",
      amount: liquidity[3] ?? "",
      network: liquidity[4] ?? "",
      message,
    };
  }

  // Never guess "structural". Saying a corridor is closed forever on the
  // strength of a message we do not understand is the worse error.
  return { kind: "unknown", message };
}
