import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vitest";

import { newReference, openStore } from "../src/store.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nimramp-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const record = (ref: string, orderId: string) => ({
  ref,
  orderId,
  direction: "cash_in" as const,
  corridor: "NGN" as const,
  chain: "polygon" as const,
  symbol: "USDT" as const,
  amount: "10",
  createdAt: "2026-09-11T00:00:00.000Z",
});

test("an order can be found by our reference or by the rail's id", () => {
  const store = openStore(join(dir, "orders.jsonl"));
  store.put(record("NR-ABCD", "ord-1"));

  expect(store.byRef("NR-ABCD")?.orderId).toBe("ord-1");
  expect(store.byOrderId("ord-1")?.ref).toBe("NR-ABCD");
  expect(store.byRef("NR-NOPE")).toBeUndefined();
});

test("orders survive a restart, because a payment outlives a process", () => {
  const path = join(dir, "orders.jsonl");
  openStore(path).put(record("NR-ABCD", "ord-1"));

  // A fresh store, as if the server had been redeployed mid-transfer.
  expect(openStore(path).byRef("NR-ABCD")?.orderId).toBe("ord-1");
});

test("references are not guessable", () => {
  // A sequential reference lets anyone enumerate other people's transfers and
  // read the amount, the bank and the recipient name.
  const refs = new Set(Array.from({ length: 500 }, () => newReference()));
  expect(refs.size).toBe(500);

  for (const ref of refs) {
    expect(ref).toMatch(/^NR-[0-9A-HJ-NP-Z]{8}$/);
  }
});

test("references avoid characters people misread aloud", () => {
  // They get read down a phone line to support. I, O, 0 and 1 do not survive.
  const joined = Array.from({ length: 300 }, () => newReference()).join("");
  for (const bad of ["I", "O", "0", "1"]) {
    expect(joined.slice(3)).not.toContain(bad);
  }
});
