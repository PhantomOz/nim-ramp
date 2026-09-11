import { expect, test, vi } from "vitest";

import { createOrder, readOrder } from "../src/api.js";

const okResponse = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

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
