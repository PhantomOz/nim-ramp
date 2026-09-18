import { expect, test } from "vitest";

import { serialise } from "../src/funder.js";

test("runs queued sends one at a time, in order", async () => {
  // Two transactions from one EOA built concurrently pick the same nonce, and
  // the second is rejected as a replacement. Serialising is the whole fix.
  const order: string[] = [];
  const run = serialise();

  const task = (name: string, ms: number) => async () => {
    order.push(`${name}:start`);
    await new Promise((r) => setTimeout(r, ms));
    order.push(`${name}:end`);
    return name;
  };

  // The slow one is queued first; a parallel implementation would interleave.
  const results = await Promise.all([run(task("a", 20)), run(task("b", 1))]);

  expect(results).toEqual(["a", "b"]);
  expect(order).toEqual(["a:start", "a:end", "b:start", "b:end"]);
});

test("one failure does not wedge the queue", async () => {
  // A dropped RPC call must not stop every later top-up forever.
  const run = serialise();

  await expect(run(async () => Promise.reject(new Error("rpc down")))).rejects.toThrow(
    "rpc down",
  );
  await expect(run(async () => "fine")).resolves.toBe("fine");
});
