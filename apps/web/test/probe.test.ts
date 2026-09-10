import { expect, test } from "vitest";

import { probeHost } from "../src/probe.js";

test("a plain browser reports nothing injected, which is the honest answer", () => {
  expect(probeHost({})).toEqual({
    ethereum: false,
    nimiq: false,
    nimiqPay: false,
    language: null,
  });
});

test("inside Nimiq Pay both providers and the host context show up", () => {
  expect(
    probeHost({
      ethereum: { request: async () => null },
      nimiq: {},
      nimiqPay: { language: "pt" },
    }),
  ).toEqual({
    ethereum: true,
    nimiq: true,
    nimiqPay: true,
    language: "pt",
  });
});

test("a host context with no language is still reported as present", () => {
  const probe = probeHost({ nimiqPay: {} });
  expect(probe.nimiqPay).toBe(true);
  expect(probe.language).toBeNull();
});
