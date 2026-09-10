import { expect, test } from "vitest";

import { deviceIdentifier, hostLanguage, WalletError } from "../src/index.js";

test("the language Nimiq Pay chose wins", () => {
  expect(hostLanguage({ nimiqPay: { language: "pt" } })).toBe("pt");
});

test("outside Nimiq Pay we fall back to the browser, then to English", () => {
  expect(hostLanguage({ navigator: { language: "de-AT" } })).toBe("de");
  expect(hostLanguage({})).toBe("en");
});

test("the device identifier comes back from the host", async () => {
  const hex = "a".repeat(64);
  const id = await deviceIdentifier(
    { reason: "Rate limiting" },
    { nimiqPay: { requestDeviceIdentifier: async () => hex } },
  );
  expect(id).toBe(hex);
});

test("asking for a device identifier outside Nimiq Pay explains itself", async () => {
  await expect(
    deviceIdentifier({ reason: "Rate limiting" }, {}),
  ).rejects.toThrow(/nimiq pay/i);
});

test("an empty reason is refused here, because the user is shown it verbatim", async () => {
  await expect(
    deviceIdentifier(
      { reason: "   " },
      { nimiqPay: { requestDeviceIdentifier: async () => "x".repeat(64) } },
    ),
  ).rejects.toThrow(WalletError);
});
