import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { HistoryEntry } from "../src/history.js";
import { Transfers } from "../src/transfers.js";

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  ref: "NR-DJBRBNEJ",
  direction: "cash_out",
  corridor: "NGN",
  symbol: "USDT",
  chain: "polygon",
  amount: "1.45",
  address: "0xAbC0000000000000000000000000000000000001",
  createdAt: "2026-09-19T10:00:00.000Z",
  ...over,
});

/**
 * The screen asks the rail for the live state of each row. These tests are
 * about the rows, so the rail is unreachable throughout — which is also the
 * case worth pinning: a list that cannot reach the rail still has to render
 * every transfer, just without its status chip.
 */
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const show = async (
  entries: HistoryEntry[],
  opts: { onOpen?: () => void; connected?: boolean } = {},
) => {
  await act(async () => {
    render(
      <Transfers
        entries={entries}
        connected={opts.connected ?? true}
        onOpen={opts.onOpen ?? (() => undefined)}
        onBack={() => undefined}
      />,
    );
  });
};

test("shows no transfers at all without a connected wallet", async () => {
  // Handed the rows anyway — the screen must still refuse to render them,
  // because the gate is the point and a caller can get this wrong.
  await show([entry()], { connected: false });
  expect(screen.queryByText(/NR-DJBRBNEJ/)).toBeNull();
  expect(screen.getByRole("heading", { name: /connect your wallet/i })).toBeDefined();
});

test("an empty list says what the list is, not just that it is empty", async () => {
  await show([]);
  // The reference is the part that survives a cleared browser, so the empty
  // state has to be the place that says so.
  expect(screen.getByText(/reference/i)).toBeDefined();
});

test("a row carries the reference, because that is what support asks for", async () => {
  await show([entry()]);
  expect(screen.getByText(/NR-DJBRBNEJ/)).toBeDefined();
});

test("opening a row hands back its reference", async () => {
  const onOpen = vi.fn();
  await show([entry()], { onOpen });
  screen.getByRole("button", { name: /NR-DJBRBNEJ/ }).click();
  expect(onOpen).toHaveBeenCalledWith("NR-DJBRBNEJ");
});

test("renders both directions", async () => {
  await show([entry(), entry({ ref: "NR-9YMLZL99", direction: "cash_in" })]);
  expect(screen.getByText(/1\.45 USDT → Naira/)).toBeDefined();
  expect(screen.getByText(/Naira → 1\.45 USDT/)).toBeDefined();
});

test("an unreachable rail costs the chip, never the row", async () => {
  await show([entry()]);
  expect(screen.getByText(/NR-DJBRBNEJ/)).toBeDefined();
  expect(screen.queryByText("Arrived")).toBeNull();
});
