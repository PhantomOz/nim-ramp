import {
  CHAINS,
  CORRIDORS,
  type ChainSlug,
  type Corridor,
  type Direction,
  type TokenSymbol,
} from "@ramp/core";
import type { State } from "@ramp/machine";
import { mapStatus, PaycrestError, type PaycrestClient } from "@ramp/rails";
import { verifySignature } from "@ramp/rails/webhook";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { newReference, type Store } from "./store.js";

/** Our cut, as shown on the amount screen and charged by the rail. */
const SENDER_FEE_PERCENT = "0.5";

export type AppDeps = {
  client: PaycrestClient;
  store: Store;
  webhookSecret: string;
  /** Called when a webhook moves an order. Somewhere to hang notifications. */
  onStatus: (update: { ref: string; orderId: string; state: State | null }) => void;
  /** Origin allowed to call us cross-site. Same-origin in production. */
  corsOrigin?: string;
};

type CreateBody = {
  direction?: string;
  corridor?: string;
  chain?: string;
  symbol?: string;
  amount?: string;
  /** cash_in: where the stablecoin lands. */
  address?: string;
  /** cash_out: where the money lands. */
  recipient?: Account;
  /** cash_in: where the money goes back to if the on-ramp fails. */
  refundAccount?: Account;
};

type Account = {
  institution?: string;
  accountIdentifier?: string;
  accountName?: string;
};

const isAccount = (a: Account | undefined): a is Required<Account> =>
  typeof a?.institution === "string" &&
  typeof a.accountIdentifier === "string" &&
  typeof a.accountName === "string";

const isDirection = (v: unknown): v is Direction =>
  v === "cash_in" || v === "cash_out";
const isCorridor = (v: unknown): v is Corridor =>
  typeof v === "string" && (CORRIDORS as readonly string[]).includes(v);
const isChain = (v: unknown): v is ChainSlug =>
  typeof v === "string" && CHAINS.some((c) => c.slug === v);
const isSymbol = (v: unknown): v is TokenSymbol => v === "USDT" || v === "USDC";

export function createApp(deps: AppDeps) {
  const app = new Hono();

  // Before the routes. Hono runs middleware in registration order, so
  // registering this afterwards silently does nothing at all.
  if (deps.corsOrigin !== undefined) {
    app.use("/api/*", cors({ origin: deps.corsOrigin }));
  }

  /**
   * Create a real order on the rail.
   *
   * The API key never leaves this process — that is the entire reason this
   * route exists rather than the browser calling Paycrest directly.
   */
  app.post("/api/orders", async (c) => {
    let body: CreateBody;
    try {
      body = (await c.req.json()) as CreateBody;
    } catch {
      return c.json({ error: "body must be JSON" }, 400);
    }

    const { direction, corridor, chain, symbol, amount } = body;

    // Validate before touching the rail. A malformed request should never
    // become a half-created order on a mainnet-only system.
    if (!isDirection(direction)) return c.json({ error: "bad direction" }, 400);
    if (!isCorridor(corridor)) return c.json({ error: "bad corridor" }, 400);
    if (!isChain(chain)) return c.json({ error: "bad chain" }, 400);
    if (!isSymbol(symbol)) return c.json({ error: "bad symbol" }, 400);
    if (typeof amount !== "string" || !/^\d+(\.\d+)?$/.test(amount)) {
      return c.json({ error: "bad amount" }, 400);
    }

    const cashIn = direction === "cash_in";
    if (cashIn && typeof body.address !== "string") {
      return c.json({ error: "cash_in needs a destination address" }, 400);
    }
    // The rail requires a refund account on a fiat source — it is where the
    // money returns if the on-ramp fails. Omitting it earns a bare "Failed to
    // validate payload" from the rail, which tells the user nothing.
    if (cashIn && !isAccount(body.refundAccount)) {
      return c.json(
        { error: "cash_in needs a refund account: where the money goes back if it fails" },
        400,
      );
    }
    if (!cashIn && !isAccount(body.recipient)) {
      return c.json({ error: "cash_out needs a recipient account" }, 400);
    }

    const railBody = cashIn
      ? {
          amount,
          amountIn: "fiat",
          senderFeePercent: SENDER_FEE_PERCENT,
          source: {
            type: "fiat",
            currency: corridor,
            refundAccount: body.refundAccount,
          },
          destination: {
            type: "crypto",
            currency: symbol,
            recipient: { address: body.address, network: chain },
          },
        }
      : {
          amount,
          amountIn: "crypto",
          senderFeePercent: SENDER_FEE_PERCENT,
          source: { type: "crypto", currency: symbol, network: chain },
          destination: {
            type: "fiat",
            currency: corridor,
            recipient: body.recipient,
          },
        };

    try {
      // The cap, kill switch and corridor toggles are enforced inside the
      // client, before the request leaves the process.
      const order = await deps.client.createOrder({
        corridor,
        usdtAmount: amount,
        body: railBody,
      });

      const ref = newReference();
      deps.store.put({
        ref,
        orderId: order.id,
        direction,
        corridor,
        chain,
        symbol,
        amount,
        createdAt: new Date().toISOString(),
      });

      const mapped = mapStatus(order.status);
      return c.json(
        {
          ref,
          orderId: order.id,
          state: mapped.kind === "state" ? mapped.state : null,
          account: order["providerAccount"] ?? null,
        },
        201,
      );
    } catch (error) {
      // The rail's own words, never our guess at them — and our own refusals
      // are ours. The client's cap, kill switch and corridor guards throw
      // before the rail is contacted (status 0); calling that a bad gateway
      // blames Paycrest for our configuration and sends whoever is on call to
      // the wrong place entirely.
      const ours = error instanceof PaycrestError && error.status === 0;
      return c.json(
        { error: error instanceof Error ? error.message : "the rail declined" },
        ours ? 409 : 502,
      );
    }
  });

  /** Status, read back from the rail. We never serve a cached verdict. */
  app.get("/api/orders/:ref", async (c) => {
    const record = deps.store.byRef(c.req.param("ref"));
    if (record === undefined) return c.json({ error: "unknown reference" }, 404);

    try {
      const order = await deps.client.getOrder(record.orderId);
      const mapped = mapStatus(order.status);

      return c.json({
        ref: record.ref,
        direction: record.direction,
        corridor: record.corridor,
        railStatus: order.status,
        // `null` when the rail reported something we do not recognise. The
        // client shows a real screen for that rather than an empty one.
        state: mapped.kind === "state" ? mapped.state : null,
        unrecognised: mapped.kind === "unknown",
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "the rail declined" },
        502,
      );
    }
  });

  /**
   * Paycrest webhooks.
   *
   * The signature covers the exact bytes Paycrest sent, so the raw text is
   * read before anything parses it. Verifying against a re-serialised object
   * fails on key order, and the tempting fix is to loosen the check until it
   * passes — at which point the signature is decoration.
   */
  app.post("/api/webhooks/paycrest", async (c) => {
    const raw = await c.req.text();
    const signature = c.req.header("X-Paycrest-Signature") ?? "";

    if (!verifySignature(raw, signature, deps.webhookSecret)) {
      return c.json({ error: "bad signature" }, 401);
    }

    let event: { event?: string; data?: { id?: string; status?: string } };
    try {
      event = JSON.parse(raw) as typeof event;
    } catch {
      return c.json({ error: "body must be JSON" }, 400);
    }

    const orderId = event.data?.id;
    const record = orderId === undefined ? undefined : deps.store.byOrderId(orderId);
    if (record !== undefined && event.data?.status !== undefined) {
      const mapped = mapStatus(event.data.status);
      deps.onStatus({
        ref: record.ref,
        orderId: record.orderId,
        state: mapped.kind === "state" ? mapped.state : null,
      });
    }

    // Acknowledge regardless: the signature was valid, so retrying gains the
    // rail nothing. An unknown order id is our problem to investigate, not
    // theirs to redeliver.
    return c.json({ ok: true });
  });

  /**
   * The corridor's payout destinations. Proxied rather than called from the
   * browser because the endpoint needs the API key — and because the list
   * differs sharply by corridor: Nigeria is 171 banks and no mobile money,
   * Uganda is two mobile-money providers and no banks.
   */
  app.get("/api/institutions/:corridor", async (c) => {
    const corridor = c.req.param("corridor");
    if (!isCorridor(corridor)) return c.json({ error: "bad corridor" }, 400);

    try {
      return c.json(await deps.client.institutions(corridor));
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "the rail declined" },
        502,
      );
    }
  });

  /**
   * Check an account resolves to a real name before anyone commits to it.
   *
   * The rail verifies this itself at order time, but finding out then means
   * finding out after the user has agreed to an amount.
   */
  app.post("/api/verify-account", async (c) => {
    let body: { institution?: string; accountIdentifier?: string };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: "body must be JSON" }, 400);
    }

    if (
      typeof body.institution !== "string" ||
      typeof body.accountIdentifier !== "string"
    ) {
      return c.json({ error: "institution and accountIdentifier are required" }, 400);
    }

    try {
      const accountName = await deps.client.verifyAccount({
        institution: body.institution,
        accountIdentifier: body.accountIdentifier,
      });
      return c.json({ accountName });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "could not check that account";

      // "We cannot check right now" is not "that account is wrong". Paycrest's
      // verifier answers 504 during an outage, and treating that as a rejected
      // account would block every transfer until it came back. Conversely,
      // treating a real rejection as an outage waves a mistyped number
      // through. The rail re-checks at order time either way.
      const unavailable =
        error instanceof PaycrestError && (error.status >= 500 || error.status === 0);

      return c.json(
        { error: message, kind: unavailable ? "unavailable" : "rejected" },
        unavailable ? 503 : 422,
      );
    }
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  return app;
}
