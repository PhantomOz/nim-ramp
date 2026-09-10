import { expect, test } from "vitest";

import { signWithEvm, signWithNimiq } from "../src/signing.js";

const ADDRESS = "0xABC0000000000000000000000000000000000001";

test("an EVM wallet that signs reports the signature", async () => {
  const provider = { request: async () => "0xsigned" };
  await expect(signWithEvm(provider, ADDRESS, "hello")).resolves.toEqual({
    ok: true,
    via: "personal_sign",
    signature: "0xsigned",
  });
});

test("an EVM wallet that refuses reports why, rather than throwing", async () => {
  const provider = {
    request: async () => {
      throw new Error("method personal_sign not supported");
    },
  };
  const result = await signWithEvm(provider, ADDRESS, "hello");
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reason).toMatch(/not supported/);
});

test("the Nimiq provider's error union is treated as a failure", async () => {
  // sign() RETURNS an ErrorResponse rather than rejecting. Destructuring the
  // result without checking hands you undefined and carries on as if it
  // worked — which is exactly how a signature check becomes decorative.
  const nimiq = {
    sign: async () => ({ error: { type: "denied", message: "user cancelled" } }),
  };
  const result = await signWithNimiq(nimiq, "hello");
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reason).toMatch(/user cancelled/);
});

test("a successful Nimiq signature comes back with its public key", async () => {
  const nimiq = {
    sign: async () => ({ publicKey: "0xpub", signature: "0xsig" }),
  };
  await expect(signWithNimiq(nimiq, "hello")).resolves.toEqual({
    ok: true,
    via: "nimiq",
    signature: "0xsig",
    publicKey: "0xpub",
  });
});
