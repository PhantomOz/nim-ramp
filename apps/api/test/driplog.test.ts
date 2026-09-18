import { appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { openDripLog } from "../src/driplog.js";

const path = () => join(mkdtempSync(join(tmpdir(), "drip-")), "drips.jsonl");

const NOW = new Date("2026-09-18T12:00:00Z");

test("a fresh log has funded nothing and spent nothing", () => {
  const log = openDripLog(path());
  expect(log.dripped("NR-AAAAAAAA")).toBe(false);
  expect(log.spentToday("polygon", NOW)).toBe(0n);
});

test("records a drip and refuses to forget it", () => {
  const p = path();
  const log = openDripLog(p);
  log.put({
    ref: "NR-AAAAAAAA",
    chain: "polygon",
    amountWei: "1000",
    txHash: "0xdead",
    at: NOW.toISOString(),
  });

  expect(log.dripped("NR-AAAAAAAA")).toBe(true);

  // Reopened from disk — a restart mid-day must not re-arm the faucet.
  const reopened = openDripLog(p);
  expect(reopened.dripped("NR-AAAAAAAA")).toBe(true);
  expect(reopened.spentToday("polygon", NOW)).toBe(1000n);
});

test("counts today's spending on that chain only", () => {
  const log = openDripLog(path());
  const put = (chain: string, amountWei: string, at: string) =>
    log.put({ ref: `NR-${at}`, chain: chain as "polygon", amountWei, txHash: "0x", at });

  put("polygon", "100", "2026-09-18T01:00:00Z");
  put("polygon", "200", "2026-09-18T23:59:00Z");
  // Yesterday, and a different chain: neither belongs in today's Polygon total.
  put("polygon", "400", "2026-09-17T23:59:00Z");
  put("base", "800", "2026-09-18T12:00:00Z");

  expect(log.spentToday("polygon", NOW)).toBe(300n);
  expect(log.spentToday("base", NOW)).toBe(800n);
});

test("a torn line does not stop the log from opening", () => {
  // Same reasoning as the order log: a hard kill mid-append must not brick
  // the faucet's memory of what it already paid out.
  const p = path();
  const log = openDripLog(p);
  log.put({
    ref: "NR-AAAAAAAA",
    chain: "polygon",
    amountWei: "1000",
    txHash: "0x",
    at: NOW.toISOString(),
  });
  appendFileSync(p, '{"ref":"NR-BBB', "utf8");

  const reopened = openDripLog(p);
  expect(reopened.dripped("NR-AAAAAAAA")).toBe(true);
  expect(reopened.spentToday("polygon", NOW)).toBe(1000n);
});
