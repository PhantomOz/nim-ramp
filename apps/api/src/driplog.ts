import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import type { ChainSlug } from "@ramp/core";

/**
 * What the faucet has paid out.
 *
 * Append-only for the same reason the order log is: a read-modify-write file
 * races under concurrent requests, and the race here spends money twice.
 * Amounts are stored as decimal strings because JSON has no bigint and wei
 * does not survive a double.
 */
export type DripRecord = {
  ref: string;
  chain: ChainSlug;
  /** Wei, as a decimal string. */
  amountWei: string;
  txHash: string;
  at: string;
};

export type DripLog = {
  put: (record: DripRecord) => void;
  /** Has this reference been funded already? */
  dripped: (ref: string) => boolean;
  /** Everything sent on this chain on `now`'s UTC day, in wei. */
  spentToday: (chain: ChainSlug, now: Date) => bigint;
};

const day = (iso: string) => iso.slice(0, 10);

export function openDripLog(path: string): DripLog {
  const refs = new Set<string>();
  const records: DripRecord[] = [];

  const index = (record: DripRecord) => {
    refs.add(record.ref);
    records.push(record);
  };

  mkdirSync(dirname(path), { recursive: true });

  let existing = "";
  try {
    existing = readFileSync(path, "utf8");
  } catch {
    // Nothing paid out yet.
  }

  for (const line of existing.split("\n")) {
    if (line.trim() === "") continue;
    try {
      index(JSON.parse(line) as DripRecord);
    } catch {
      // A torn final line from a hard kill. Skipping it loses one record;
      // refusing to open would lose every record, and re-arm the faucet.
    }
  }

  return {
    put(record) {
      appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
      index(record);
    },
    dripped: (ref) => refs.has(ref),
    spentToday(chain, now) {
      const today = day(now.toISOString());
      return records
        .filter((r) => r.chain === chain && day(r.at) === today)
        .reduce((total, r) => total + BigInt(r.amountWei), 0n);
    },
  };
}
