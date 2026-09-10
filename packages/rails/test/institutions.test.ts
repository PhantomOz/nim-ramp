import { expect, test } from "vitest";

import { createClient, findInstitution, type FetchLike, PaycrestError } from "../src/index.js";

const UGX_BODY = JSON.stringify({
  status: "success",
  message: "OK",
  data: [
    { name: "MTN Mobile Money", code: "MOMOUGPC", type: "mobile_money" },
    { name: "Airtel Money", code: "AIRTUGPC", type: "mobile_money" },
  ],
});

function fake(body: string): { fetch: FetchLike; urls: string[] } {
  const urls: string[] = [];
  const fetch: FetchLike = async (url) => {
    urls.push(url);
    return { ok: true, status: 200, text: async () => body };
  };
  return { fetch, urls };
}

const client = (fetch: FetchLike) =>
  createClient({
    baseUrl: "https://api.paycrest.io/v2",
    apiKey: "k",
    fetch,
    maxTxUsdt: "50",
    killSwitch: false,
    enabledCorridors: ["NGN", "UGX"],
  });

const UGX = [
  { name: "MTN Mobile Money", code: "MOMOUGPC", type: "mobile_money" as const },
  { name: "Airtel Money", code: "AIRTUGPC", type: "mobile_money" as const },
];

test("institutions are fetched per corridor", async () => {
  const { fetch, urls } = fake(UGX_BODY);
  const found = await client(fetch).institutions("UGX");

  expect(urls[0]).toBe("https://api.paycrest.io/v2/institutions/UGX");
  expect(found).toHaveLength(2);
  expect(found[0]?.type).toBe("mobile_money");
});

test("an institution the corridor does not offer is refused before we create an order", () => {
  // GTBINGLA is a Nigerian bank. Uganda has no banks at all, so a payout
  // addressed this way would be accepted by our UI and rejected by the rail
  // after the user had already committed.
  expect(() => findInstitution("GTBINGLA", UGX)).toThrow(PaycrestError);
  expect(() => findInstitution("GTBINGLA", UGX)).toThrow(/GTBINGLA/);
});

test("a known institution resolves to its name and type", () => {
  expect(findInstitution("MOMOUGPC", UGX)).toEqual({
    name: "MTN Mobile Money",
    code: "MOMOUGPC",
    type: "mobile_money",
  });
});
