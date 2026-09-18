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

export type Account = {
  institution: string;
  accountIdentifier: string;
  accountName: string;
};

export type CreateInput = {
  direction: Direction;
  corridor: Corridor;
  chain: ChainSlug;
  symbol: TokenSymbol;
  amount: string;
  address?: string;
  recipient?: Account;
  refundAccount?: Account;
};

export type CreatedOrder = {
  ref: string;
  orderId: string;
  state: State | null;
  /** cash_in: the bank details to pay into. */
  account: PayAccount | null;
  /** cash_out: the address to send the stablecoin to. */
  receiveAddress: string | null;
  validUntil: string | null;
};

type Fetch = typeof globalThis.fetch;

/** Paycrest's providerAccount, in the shape the pay screen wants. */
type ProviderAccount = {
  institution?: string;
  accountIdentifier?: string;
  accountName?: string;
  amountToTransfer?: string;
};

const UNREACHABLE =
  "Could not reach the nimRamp API. Is it running? `pnpm run dev:api`";

/**
 * Read a response without assuming it is JSON.
 *
 * It very often is not. Vite's proxy answers 500 with a zero-byte text/plain
 * body when the API is down, a gateway answers with HTML, and calling
 * `.json()` on either throws "Unexpected end of JSON input" — which tells a
 * user nothing and sends whoever is debugging it looking at the order payload
 * rather than at the process that is not running.
 */
async function unwrap<T>(response: Response): Promise<T> {
  const raw = await response.text();

  if (raw.trim() === "") {
    throw new Error(response.ok ? "the API returned nothing" : UNREACHABLE);
  }

  let body: T & { error?: string };
  try {
    body = JSON.parse(raw) as T & { error?: string };
  } catch {
    throw new Error(
      `the API returned something that is not JSON (${response.status}): ${raw.slice(0, 80)}`,
    );
  }

  if (!response.ok) {
    // The server's own words. A blank "request failed" tells nobody anything.
    throw new Error(body.error ?? `request failed (${response.status})`);
  }
  return body;
}

/** Network-level failure, before any response exists. */
async function send(
  fetchImpl: Fetch,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch {
    // A rejected fetch is the API being unreachable, not an order the rail
    // declined. Conflating the two sends people to the wrong problem.
    throw new Error(UNREACHABLE);
  }
}

export async function createOrder(
  input: CreateInput,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<CreatedOrder> {
  const response = await send(fetchImpl, "/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = await unwrap<{
    ref: string;
    orderId: string;
    state: State | null;
    account: ProviderAccount | null;
    receiveAddress: string | null;
    validUntil: string | null;
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
    receiveAddress: body.receiveAddress ?? null,
    validUntil: body.validUntil ?? null,
  };
}

export type OrderStatus = {
  ref: string;
  state: State | null;
  unrecognised?: boolean;
  direction: "cash_in" | "cash_out";
  corridor: Corridor;
  symbol: string;
  amount: string | null;
  rate: string | null;
  senderFee: string | null;
  txHash: string | null;
  updatedAt: string | null;
  recipient: { accountIdentifier?: string; accountName?: string } | null;
};

export async function readOrder(
  ref: string,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<OrderStatus> {
  return unwrap(await send(fetchImpl, `/api/orders/${ref}`));
}

export type Institution = {
  name: string;
  code: string;
  type: "bank" | "mobile_money";
};

export async function listInstitutions(
  corridor: Corridor,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<Institution[]> {
  return unwrap(await send(fetchImpl, `/api/institutions/${corridor}`));
}

/**
 * Resolve an account to the name the bank holds for it.
 *
 * The rail checks this again at order time, but finding out then means
 * finding out after the user has agreed to an amount — and for a refund
 * account, after the money is already in flight.
 */
/** Raised by `verifyAccount` so callers can tell an outage from a rejection. */
export class VerifyError extends Error {
  constructor(
    message: string,
    readonly kind: "unavailable" | "rejected",
  ) {
    super(message);
    this.name = "VerifyError";
  }
}

export async function verifyAccount(
  input: { institution: string; accountIdentifier: string },
  fetchImpl: Fetch = globalThis.fetch,
): Promise<{ accountName: string }> {
  const response = await send(fetchImpl, "/api/verify-account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const raw = await response.text();
  let body: { accountName?: string; error?: string; kind?: string } = {};
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    throw new VerifyError("the checker answered with something unreadable", "unavailable");
  }

  if (!response.ok || body.accountName === undefined) {
    throw new VerifyError(
      body.error ?? "could not check that account",
      body.kind === "unavailable" ? "unavailable" : "rejected",
    );
  }

  return { accountName: body.accountName };
}

export async function readLimits(
  fetchImpl: Fetch = globalThis.fetch,
): Promise<{ maxTxUsdt: string }> {
  return unwrap(await send(fetchImpl, "/api/limits"));
}

export type GasTopUp = { funded: boolean; reason?: string };

/**
 * Ask the server to cover the network fee for this cash-out.
 *
 * A wallet that has just been paid by a cash-in holds stablecoin and no
 * native token, so the transfer back out is unaffordable. The server sends
 * the shortfall — about two cents on Polygon — and waits for it to land.
 *
 * Deliberately never throws. This is best-effort help: a wallet that can
 * already pay does not need it, and turning a faucet outage into an exception
 * would replace the user's real problem with ours on a screen about sending
 * money. The caller proceeds either way and lets the wallet be the authority.
 */
export async function requestGas(
  ref: string,
  address: string,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<GasTopUp> {
  try {
    const response = await fetchImpl("/api/gas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref, address }),
    });

    const raw = await response.text();
    const body = raw.trim() === "" ? {} : (JSON.parse(raw) as { error?: string });

    if (!response.ok) {
      return { funded: false, ...(body.error === undefined ? {} : { reason: body.error }) };
    }
    return { funded: true };
  } catch {
    return { funded: false };
  }
}
