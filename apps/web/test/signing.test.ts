import { expect, test } from "vitest";

import { signTypedData, signWithEvm, signWithNimiq } from "../src/signing.js";

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

test("typed-data signing reports its own availability", async () => {
  const provider = { request: async () => "0xtypedsig" };
  await expect(signTypedData(provider, ADDRESS, { a: 1 })).resolves.toEqual({
    ok: true,
    via: "eth_signTypedData_v4",
    signature: "0xtypedsig",
  });
});

test("a wallet without typed-data signing says so rather than throwing", async () => {
  // This gates every gasless route: permit, EIP-3009 and Polygon's native
  // meta-transaction all need an EIP-712 signature. If Nimiq Pay cannot
  // produce one, sponsoring the fee is off the table and the answer is POL.
  const provider = {
    request: async () => {
      throw new Error("method eth_signTypedData_v4 not supported");
    },
  };
  const result = await signTypedData(provider, ADDRESS, { a: 1 });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reason).toMatch(/not supported/);
});
