/**
 * The corridor set is the one the rail actually serves, verified against
 * Paycrest's public `/v2/currencies` endpoint on 10 Sep 2026. Ghana is absent
 * — `GET /v2/rates/polygon/USDT/100/GHS` answers "Fiat currency GHS is not
 * supported" — so Uganda takes the fourth slot. If a second rail brings GHS
 * back, it is one entry here.
 */
export const CORRIDORS = ["NGN", "KES", "TZS", "UGX"] as const;

export type Corridor = (typeof CORRIDORS)[number];

/** Every corridor currency Paycrest serves is minor-unit-2. */
export const CORRIDOR_DECIMALS = 2;

/** The corridor for a currency code, or null when we cannot serve it. */
export function corridorOf(currency: string): Corridor | null {
  const found = CORRIDORS.find((corridor) => corridor === currency);
  return found ?? null;
}
