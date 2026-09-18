import { beforeEach, expect, test } from "vitest";

import { type HistoryEntry, list, remember } from "../src/history.js";

const WALLET = "0xAbC0000000000000000000000000000000000001";

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  ref: "NR-AAAAAAAA",
  direction: "cash_out",
  corridor: "NGN",
  symbol: "USDT",
  chain: "polygon",
  amount: "10",
  address: WALLET,
  createdAt: "2026-09-19T10:00:00.000Z",
  ...over,
});

beforeEach(() => {
  localStorage.clear();
});

test("remembers an order and reads it back", () => {
  remember(entry());
  expect(list(WALLET).map((e) => e.ref)).toEqual(["NR-AAAAAAAA"]);
});

test("puts the newest first, because that is the one being looked for", () => {
  remember(entry({ ref: "NR-OLD", createdAt: "2026-09-18T10:00:00.000Z" }));
  remember(entry({ ref: "NR-NEW", createdAt: "2026-09-19T10:00:00.000Z" }));
  expect(list(WALLET).map((e) => e.ref)).toEqual(["NR-NEW", "NR-OLD"]);
});

test("keeps one row per reference when the same order is remembered twice", () => {
  remember(entry({ ref: "NR-SAME", amount: "10" }));
  remember(entry({ ref: "NR-SAME", amount: "25" }));
  const rows = list(WALLET);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.amount).toBe("25");
});

test("caps the list, dropping the oldest", () => {
  for (let i = 0; i < 60; i++) {
    remember(
      entry({
        ref: `NR-${String(i).padStart(8, "0")}`,
        createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
      }),
    );
  }
  const rows = list(WALLET);
  expect(rows).toHaveLength(50);
  // The ten oldest are gone, not the ten newest.
  expect(rows[0]?.ref).toBe("NR-00000059");
  expect(rows.some((e) => e.ref === "NR-00000000")).toBe(false);
});

test("shows only the connected wallet's orders", () => {
  // Two people sharing a phone must not read each other's transfers.
  remember(entry({ ref: "NR-MINE", address: WALLET }));
  remember(entry({ ref: "NR-THEIRS", address: "0x000000000000000000000000000000000000dEaD" }));
  expect(list(WALLET).map((e) => e.ref)).toEqual(["NR-MINE"]);
});

test("matches the wallet regardless of checksum case", () => {
  remember(entry({ address: WALLET.toLowerCase() }));
  expect(list(WALLET.toUpperCase())).toHaveLength(1);
});

test("shows everything on this device when no wallet is connected", () => {
  remember(entry({ ref: "NR-ONE" }));
  remember(entry({ ref: "NR-TWO", address: "0x000000000000000000000000000000000000dEaD" }));
  expect(list(null)).toHaveLength(2);
});

test("reads nothing rather than throwing when the store holds rubbish", () => {
  localStorage.setItem("nimramp.history", "{not json");
  expect(list(WALLET)).toEqual([]);
});

test("reads nothing rather than throwing when the store holds the wrong shape", () => {
  localStorage.setItem("nimramp.history", '{"ref":"NR-X"}');
  expect(list(WALLET)).toEqual([]);
});

test("survives a browser that refuses storage entirely", () => {
  // Private browsing throws on both read and write. A history feature must
  // not be able to take down the screen that pays people.
  const broken = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
  };
  expect(() => remember(entry(), broken)).not.toThrow();
  expect(list(WALLET, broken)).toEqual([]);
});
