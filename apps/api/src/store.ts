import { randomInt } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import type { ChainSlug, Corridor, Direction, TokenSymbol } from "@ramp/core";

/**
 * What we know about an order that the rail does not.
 *
 * Deliberately small. Paycrest is the authority on an order's status, so we
 * never cache it — status is always read back from them. What lives here is
 * only the mapping between our reference and their id, plus the shape of the
 * request, so a support conversation can start from a reference.
 */
export type OrderRecord = {
  ref: string;
  orderId: string;
  direction: Direction;
  corridor: Corridor;
  chain: ChainSlug;
  symbol: TokenSymbol;
  amount: string;
  createdAt: string;
};

/**
 * Crockford-ish alphabet: no I, O, 0 or 1. References get read down a phone
 * line to a human, and those four do not survive the journey.
 */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * A reference nobody can guess.
 *
 * Sequential references would let anyone enumerate other people's transfers
 * and read the amount, the bank and the recipient's name. 32^8 is about a
 * trillion, drawn from a CSPRNG.
 */
export function newReference(): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `NR-${out}`;
}

export type Store = {
  put: (record: OrderRecord) => void;
  byRef: (ref: string) => OrderRecord | undefined;
  byOrderId: (orderId: string) => OrderRecord | undefined;
};

/**
 * An append-only log with an in-memory index.
 *
 * Append-only because a read-modify-write file would race under concurrent
 * requests, and losing the mapping for an order that is mid-flight means a
 * user holding a reference nobody can look up. Replayed at boot; last write
 * for a reference wins.
 */
export function openStore(path: string): Store {
  const byRef = new Map<string, OrderRecord>();
  const byOrderId = new Map<string, OrderRecord>();

  const index = (record: OrderRecord) => {
    byRef.set(record.ref, record);
    byOrderId.set(record.orderId, record);
  };

  mkdirSync(dirname(path), { recursive: true });

  let existing = "";
  try {
    existing = readFileSync(path, "utf8");
  } catch {
    // No log yet. First order will create it.
  }

  for (const line of existing.split("\n")) {
    if (line.trim() === "") continue;
    try {
      index(JSON.parse(line) as OrderRecord);
    } catch {
      // A torn final line from a hard kill. Skip it rather than refusing to
      // start — the remaining orders are still recoverable.
    }
  }

  return {
    put(record) {
      appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
      index(record);
    },
    byRef: (ref) => byRef.get(ref),
    byOrderId: (orderId) => byOrderId.get(orderId),
  };
}
