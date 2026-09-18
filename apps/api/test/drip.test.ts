import { expect, test } from "vitest";

import { decideDrip, type DripInputs } from "../src/drip.js";
import type { OrderRecord } from "../src/store.js";

const USER = "0xAbC0000000000000000000000000000000000001";

const order = (over: Partial<OrderRecord> = {}): OrderRecord => ({
  ref: "NR-TESTTEST",
  orderId: "ord-1",
  direction: "cash_out",
  corridor: "NGN",
  chain: "polygon",
  symbol: "USDT",
  amount: "10",
  address: USER,
  createdAt: new Date().toISOString(),
  ...over,
});

const inputs = (over: Partial<DripInputs> = {}): DripInputs => ({
  record: order(),
  address: USER,
  balance: 0n,
  // 100 gwei — a normal-ish Polygon price.
  gasPrice: 100_000_000_000n,
  alreadyDripped: false,
  spentToday: 0n,
  ...over,
});

test("refuses a reference it has never seen", () => {
  // Without this the endpoint is an open faucet: any address, any amount.
  const d = decideDrip(inputs({ record: undefined }));
  expect(d.ok).toBe(false);
  expect(d.ok === false && d.status).toBe(404);
});

test("refuses an address that does not own the order", () => {
  const d = decideDrip(
    inputs({ address: "0x000000000000000000000000000000000000dEaD" }),
  );
  expect(d.ok).toBe(false);
  expect(d.ok === false && d.status).toBe(403);
});

test("matches the owning address regardless of checksum case", () => {
  // Wallets disagree on casing; a case-sensitive compare would refuse the
  // real owner and look like the drain guard working.
  expect(decideDrip(inputs({ address: USER.toLowerCase() })).ok).toBe(true);
  expect(decideDrip(inputs({ address: USER.toUpperCase() })).ok).toBe(true);
});

test("refuses a cash-in, which never asks the user to send anything", () => {
  const d = decideDrip(inputs({ record: order({ direction: "cash_in" }) }));
  expect(d.ok).toBe(false);
  expect(d.ok === false && d.status).toBe(409);
});

test("refuses an order recorded before we kept addresses", () => {
  // Fail closed. An older log line cannot prove who owns it, and "we cannot
  // tell" must not spend money.
  const withoutAddress = order();
  delete (withoutAddress as { address?: string }).address;

  const d = decideDrip(inputs({ record: withoutAddress }));
  expect(d.ok).toBe(false);
  expect(d.ok === false && d.status).toBe(409);
});

test("refuses a second drip on the same reference", () => {
  // One order, one top-up. Otherwise a single order drains the hot wallet by
  // being asked repeatedly.
  const d = decideDrip(inputs({ alreadyDripped: true }));
  expect(d.ok).toBe(false);
  expect(d.ok === false && d.status).toBe(409);
});

test("refuses when the wallet can already pay for itself", () => {
  const d = decideDrip(inputs({ balance: 10n ** 18n }));
  expect(d.ok).toBe(false);
  expect(d.ok === false && d.status).toBe(409);
});

test("sends the shortfall, not a round number", () => {
  // needed = 100 gwei * 90_000 * 2 margin = 1.8e16
  const full = decideDrip(inputs({ balance: 0n }));
  expect(full.ok === true && full.amountWei).toBe(18_000_000_000_000_000n);

  // Half-funded wallets get topped up by the difference only.
  const partial = decideDrip(inputs({ balance: 8_000_000_000_000_000n }));
  expect(partial.ok === true && partial.amountWei).toBe(10_000_000_000_000_000n);
});

test("refuses rather than underfunding when gas costs more than the ceiling", () => {
  // Clamping to the ceiling would spend money on a transfer that still fails.
  const d = decideDrip(inputs({ gasPrice: 10_000_000_000_000n }));
  expect(d.ok).toBe(false);
  expect(d.ok === false && d.status).toBe(503);
});

test("stops when the day's budget for that chain is spent", () => {
  const d = decideDrip(inputs({ spentToday: 10n ** 18n * 5n }));
  expect(d.ok).toBe(false);
  expect(d.ok === false && d.status).toBe(429);
});

test("prices the ceiling per chain, because 0.018 POL is not 0.018 ETH", () => {
  // One wei ceiling for every chain would either brick Polygon or hand out
  // real money on the chains whose native token is ETH. At 100 gwei the same
  // transfer is pocket change in POL and a refusal in ETH.
  const price = { gasPrice: 100_000_000_000n };
  expect(decideDrip(inputs({ record: order({ chain: "polygon" }), ...price })).ok).toBe(true);

  const onBase = decideDrip(inputs({ record: order({ chain: "base" }), ...price }));
  expect(onBase.ok).toBe(false);
  expect(onBase.ok === false && onBase.status).toBe(503);
});

test("refuses to fund Ethereum — mainnet gas is the user's own", () => {
  // A Polygon top-up is twenty cents; the same transfer on mainnet is dollars,
  // and a faucet that pays those is a faucet someone empties. Ethereum users
  // hold ETH already — that is what being on Ethereum costs.
  const d = decideDrip(
    inputs({
      record: order({ chain: "ethereum" }),
      // Real mainnet-ish price, and a wallet with nothing.
      gasPrice: 30_000_000_000n,
    }),
  );
  expect(d.ok).toBe(false);
  expect(d.ok === false && d.status).toBe(409);
  expect(d.ok === false && d.reason).toMatch(/Ethereum/);
});

test("still funds the cheap chains", () => {
  for (const chain of ["polygon", "base", "arbitrum-one", "bnb-smart-chain"] as const) {
    expect(decideDrip(inputs({ record: order({ chain }), gasPrice: 1_000_000_000n })).ok).toBe(true);
  }
});
