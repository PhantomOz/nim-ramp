import type { ChainSlug, Corridor, Direction, TokenSymbol } from "@ramp/core";

/**
 * What this device remembers about past transfers.
 *
 * Deliberately local. The obvious alternative — an endpoint that lists a
 * wallet's orders — needs no key to call and an Ethereum address is public,
 * so it would let anyone paste a stranger's address and read their bank, the
 * name on it and every amount they have moved. Proving ownership of the
 * address means asking the wallet to sign something every time someone wants
 * to see a list, which is a confirmation dialog in exchange for a screen that
 * shows nothing sensitive to its owner.
 *
 * So the index lives on the phone and the server stays reference-only. The
 * cost is honest and small: clear your browser data and the list is gone —
 * the orders themselves are not, because each reference still resolves on the
 * server, which is why the reference is the thing worth writing down.
 *
 * Only the identifying shell is stored. Amounts and rates are read live from
 * the rail when a row is opened, so nothing here can drift out of step with
 * the ledger, and nothing here is worth stealing off a shared phone beyond
 * the fact that a transfer happened.
 */

export type HistoryEntry = {
  ref: string;
  direction: Direction;
  corridor: Corridor;
  symbol: TokenSymbol;
  chain: ChainSlug;
  /** The stablecoin amount as typed. A hint for the row, not the receipt. */
  amount: string;
  /** The wallet the order belongs to. */
  address: string;
  createdAt: string;
};

const KEY = "nimramp.history";

/**
 * Enough that nobody reaches the end of their own history, small enough that
 * the list cannot grow until it breaks the storage quota and takes the app's
 * other uses of localStorage down with it.
 */
const CAP = 50;

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

/**
 * A storage that cannot throw.
 *
 * Safari in private mode throws on `setItem`, and some embedded webviews
 * throw on merely touching `localStorage`. This is a convenience feature; it
 * does not get to break the screen that moves money.
 */
function device(): StorageLike {
  try {
    return globalThis.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined };
  }
}

const isEntry = (v: unknown): v is HistoryEntry => {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return typeof e["ref"] === "string" && typeof e["createdAt"] === "string";
};

/** Everything on this device, newest first, whatever shape the store is in. */
function read(store: StorageLike): HistoryEntry[] {
  let raw: string | null;
  try {
    raw = store.getItem(KEY);
  } catch {
    return [];
  }
  if (raw === null) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    // An object where an array belongs is a store written by something else,
    // or by a version of us that no longer exists. Start again rather than
    // half-read it.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry);
  } catch {
    return [];
  }
}

const newestFirst = (a: HistoryEntry, b: HistoryEntry) =>
  b.createdAt.localeCompare(a.createdAt);

/**
 * Record an order the moment it is created, not when it settles.
 *
 * An order that fails, expires or is abandoned mid-signature is exactly the
 * one someone comes looking for afterwards — a history of successes only is a
 * history that is missing every entry anyone needs to ask about.
 */
export function remember(entry: HistoryEntry, store: StorageLike = device()): void {
  const kept = read(store).filter((e) => e.ref !== entry.ref);
  const next = [entry, ...kept].sort(newestFirst).slice(0, CAP);
  try {
    store.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota, or a browser that refuses. Nothing downstream depends on it.
  }
}

/**
 * This wallet's orders, newest first.
 *
 * Filtered by address, and empty without one. History belongs to a wallet
 * rather than to a browser: a phone gets handed around, Nimiq Pay can switch
 * accounts under us, and a list that fell back to "everything on this device"
 * would hand the last person's transfers — their bank, their name, their
 * amounts — to whoever picks the phone up next. Not knowing whose list it is
 * means showing no list.
 */
export function list(address: string | null, store: StorageLike = device()): HistoryEntry[] {
  if (address === null || address === "") return [];
  const want = address.toLowerCase();
  return read(store)
    .filter((e) => e.address.toLowerCase() === want)
    .sort(newestFirst);
}
