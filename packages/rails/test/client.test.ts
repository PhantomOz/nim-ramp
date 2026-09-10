import { expect, test } from "vitest";

import { createClient, PaycrestError, type FetchLike } from "../src/index.js";

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function fakeFetch(
  body: string,
  status = 200,
): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      ...(init?.body === undefined ? {} : { body: init.body }),
    });
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  return { fetch, calls };
}

const OK = JSON.stringify({
  status: "success",
  message: "Rate fetched successfully",
  data: { sell: { rate: "1363.05", providerIds: ["WYjUQLBk"] } },
});

const config = (fetch: FetchLike) => ({
  baseUrl: "https://api.paycrest.io",
  apiKey: "test-key",
  fetch,
  maxTxUsdt: "50",
  killSwitch: false,
  enabledCorridors: ["NGN"] as const,
});

test("an authenticated request carries the API key and asks for JSON", async () => {
  const { fetch, calls } = fakeFetch(OK);
  await createClient(config(fetch)).getOrder("550e8400");

  expect(calls).toHaveLength(1);
  expect(calls[0]?.url).toBe("https://api.paycrest.io/v2/sender/orders/550e8400");
  expect(calls[0]?.headers["API-Key"]).toBe("test-key");
  expect(calls[0]?.headers["Content-Type"]).toBe("application/json");
});

test("a success envelope is unwrapped to its data", async () => {
  const { fetch } = fakeFetch(OK);
  const rate = await createClient(config(fetch)).rates({
    network: "polygon",
    from: "USDT",
    amount: "100",
    to: "NGN",
    side: "sell",
  });
  expect(rate.rate).toBe("1363.05");
  expect(rate.providerIds).toEqual(["WYjUQLBk"]);
});

test("the rates call needs no key, because the endpoint is public", async () => {
  const { fetch, calls } = fakeFetch(OK);
  await createClient(config(fetch)).rates({
    network: "polygon",
    from: "USDT",
    amount: "100",
    to: "NGN",
    side: "sell",
  });
  expect(calls[0]?.url).toBe(
    "https://api.paycrest.io/v2/rates/polygon/USDT/100/NGN?side=sell",
  );
});

test("an error envelope becomes a typed error carrying the rail's own words", async () => {
  const { fetch } = fakeFetch(
    JSON.stringify({
      status: "error",
      message: "Fiat currency GHS is not supported",
      data: null,
    }),
  );
  await expect(
    createClient(config(fetch)).rates({
      network: "polygon",
      from: "USDT",
      amount: "100",
      to: "GHS",
      side: "sell",
    }),
  ).rejects.toThrow(PaycrestError);
});

test("a non-2xx response is an error even when the body parses", async () => {
  const { fetch } = fakeFetch(
    JSON.stringify({ message: "Failed to validate payload" }),
    422,
  );
  await expect(createClient(config(fetch)).getOrder("x")).rejects.toThrow(
    /Failed to validate payload/,
  );
});

test("a body that is not JSON at all fails loudly rather than silently", async () => {
  const { fetch } = fakeFetch("<html>502 Bad Gateway</html>", 502);
  await expect(createClient(config(fetch)).getOrder("x")).rejects.toThrow(
    PaycrestError,
  );
});

test("a base URL that already carries the version segment does not double it", async () => {
  const { fetch, calls } = fakeFetch(OK);
  await createClient({
    ...config(fetch),
    baseUrl: "https://api.paycrest.io/v2",
  }).getOrder("abc");
  expect(calls[0]?.url).toBe("https://api.paycrest.io/v2/sender/orders/abc");
});

test("a trailing slash on the base URL does not double up", async () => {
  const { fetch, calls } = fakeFetch(OK);
  await createClient({
    ...config(fetch),
    baseUrl: "https://api.paycrest.io/",
  }).getOrder("abc");
  expect(calls[0]?.url).toBe("https://api.paycrest.io/v2/sender/orders/abc");
});
