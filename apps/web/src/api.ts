import type { ChainSlug, Corridor, Direction, TokenSymbol } from "@ramp/core";
import type { State } from "@ramp/machine";

import type { PayAccount } from "./buy.js";

/**
 * Our own API, never Paycrest directly.
 *
 * Anything needing the API key goes through the server. Rates are the one
 * exception — that endpoint is public and needs no key, so the browser asks
 * for itself.
 */

export type CreateInput = {
  direction: Direction;
  corridor: Corridor;
  chain: ChainSlug;
  symbol: TokenSymbol;
  amount: string;
  address?: string;
  recipient?: { institution: string; accountIdentifier: string; accountName: string };
};

export type CreatedOrder = {
  ref: string;
  orderId: string;
  state: State | null;
  account: PayAccount | null;
};

type Fetch = typeof globalThis.fetch;

/** Paycrest's providerAccount, in the shape the pay screen wants. */
type ProviderAccount = {
  institution?: string;
  accountIdentifier?: string;
  accountName?: string;
  amountToTransfer?: string;
};

async function unwrap<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    // The server's own words. A blank "request failed" tells nobody anything.
    throw new Error(body.error ?? `request failed (${response.status})`);
  }
  return body;
}

export async function createOrder(
  input: CreateInput,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<CreatedOrder> {
  const response = await fetchImpl("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = await unwrap<{
    ref: string;
    orderId: string;
    state: State | null;
    account: ProviderAccount | null;
  }>(response);

  return {
    ref: body.ref,
    orderId: body.orderId,
    state: body.state,
    account:
      body.account === null || body.account === undefined
        ? null
        : {
            bank: body.account.institution ?? "",
            accountNumber: body.account.accountIdentifier ?? "",
            accountName: body.account.accountName ?? "",
            amount: body.account.amountToTransfer ?? "",
          },
  };
}

export async function readOrder(
  ref: string,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<{ ref: string; state: State | null; unrecognised?: boolean }> {
  return unwrap(await fetchImpl(`/api/orders/${ref}`));
}
