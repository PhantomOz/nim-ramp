import { expect, test, vi } from "vitest";

import { createOrder, readOrder, requestGas } from "../src/api.js";

const okResponse = (body: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }) as Response;

test("creating an order posts what the API expects", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    okResponse({ ref: "NR-ABCD", account: null, state: "submitted" }, 201),
  );

  await createOrder(
    {
      direction: "cash_in",
      corridor: "NGN",
      chain: "polygon",
      symbol: "USDT",
      amount: "10",
      address: "0xABC0000000000000000000000000000000000001",
    },
    fetchMock,
  );

  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("/api/orders");
  expect(init.method).toBe("POST");
  expect(JSON.parse(String(init.body))).toMatchObject({
    direction: "cash_in",
    amount: "10",
  });
});

test("an API error surfaces its message rather than a blank failure", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(okResponse({ error: "corridor NGN is not enabled" }, 409));

  await expect(
    createOrder(
      {
        direction: "cash_in",
        corridor: "NGN",
        chain: "polygon",
        symbol: "USDT",
        amount: "10",
        address: "0xABC0000000000000000000000000000000000001",
      },
      fetchMock,
    ),
  ).rejects.toThrow(/corridor NGN is not enabled/);
});

test("reading an order returns the state the API resolved", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(okResponse({ ref: "NR-ABCD", state: "settling" }));

  await expect(readOrder("NR-ABCD", fetchMock)).resolves.toMatchObject({
    state: "settling",
  });
  expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/orders/NR-ABCD");
});

test("an empty response says the API is unreachable, not 'Unexpected end of JSON input'", async () => {
  // Exactly what Vite's proxy returns when the API is not running: 500,
  // text/plain, zero bytes. Calling .json() on that throws a parse error that
  // tells the user nothing and sends the developer looking in the wrong place.
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    text: async () => "",
    json: async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    },
  } as unknown as Response);

  await expect(readOrder("NR-ABCD", fetchMock)).rejects.toThrow(
    /could not reach the nimRamp API/i,
  );
});

test("an HTML error page is reported as such rather than parsed", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 502,
    text: async () => "<html><body>Bad Gateway</body></html>",
    json: async () => {
      throw new SyntaxError("Unexpected token <");
    },
  } as unknown as Response);

  await expect(readOrder("NR-ABCD", fetchMock)).rejects.toThrow(/502/);
});

test("a network failure is not mistaken for a rejected order", async () => {
  const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  await expect(readOrder("NR-ABCD", fetchMock)).rejects.toThrow(
    /could not reach the nimRamp API/i,
  );
});

test("a gas top-up reports success without the caller having to catch", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ txHash: "0xfeed", amountWei: "1800" }), {
      status: 200,
    })) as unknown as typeof fetch;

  await expect(requestGas("NR-A", "0xabc", fetchImpl)).resolves.toMatchObject({
    funded: true,
  });
});

test("a refused top-up comes back as a result, not an exception", async () => {
  // Best-effort by design. Throwing here would replace the wallet's real
  // problem with the faucet's, on a screen about sending money.
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ error: "today's gas budget for that chain is spent" }), {
      status: 429,
    })) as unknown as typeof fetch;

  await expect(requestGas("NR-A", "0xabc", fetchImpl)).resolves.toMatchObject({
    funded: false,
    reason: "today's gas budget for that chain is spent",
  });
});

test("an unreachable API does not stop a wallet that can already pay", async () => {
  const fetchImpl = (async () => Promise.reject(new Error("offline"))) as unknown as typeof fetch;

  await expect(requestGas("NR-A", "0xabc", fetchImpl)).resolves.toMatchObject({
    funded: false,
  });
});
