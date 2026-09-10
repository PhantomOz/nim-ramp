import { createHmac } from "node:crypto";

import { expect, test } from "vitest";

import { verifySignature } from "../src/index.js";

const SECRET = "test-api-secret";
const BODY = JSON.stringify({
  event: "payment_order.settled",
  webhookVersion: "2",
  data: { id: "550e8400", status: "settled", amount: "100" },
});

const sign = (body: string, secret = SECRET): string =>
  createHmac("sha256", secret).update(body, "utf8").digest("hex");

test("a webhook signed with our secret is accepted", () => {
  expect(verifySignature(BODY, sign(BODY), SECRET)).toBe(true);
});

test("a webhook signed with someone else's secret is rejected", () => {
  expect(verifySignature(BODY, sign(BODY, "not-our-secret"), SECRET)).toBe(
    false,
  );
});

test("a tampered body is rejected even though its signature is well-formed", () => {
  const tampered = BODY.replace('"amount":"100"', '"amount":"100000"');
  expect(verifySignature(tampered, sign(BODY), SECRET)).toBe(false);
});

test("header whitespace and casing do not change the verdict", () => {
  const signature = sign(BODY);
  expect(verifySignature(BODY, `  ${signature.toUpperCase()}  `, SECRET)).toBe(
    true,
  );
});

test("a malformed signature is rejected rather than throwing", () => {
  expect(verifySignature(BODY, "", SECRET)).toBe(false);
  expect(verifySignature(BODY, "not-hex", SECRET)).toBe(false);
  expect(verifySignature(BODY, "ab", SECRET)).toBe(false);
});

test("verification reads the raw body, so re-serialising cannot be substituted", () => {
  // Same data, different key order — a caller that verified against
  // JSON.stringify(parsedBody) would accept this. We must not.
  const reserialised = JSON.stringify(JSON.parse(BODY), ["data", "event"]);
  expect(reserialised).not.toBe(BODY);
  expect(verifySignature(reserialised, sign(BODY), SECRET)).toBe(false);
});
