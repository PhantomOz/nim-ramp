import { type ChainSlug, type Corridor, toMinor, type TokenSymbol } from "@ramp/core";

/**
 * The slice of `fetch` we use. Narrow on purpose: it keeps the tests honest
 * (a fake is three lines) and keeps DOM typings out of a Node package.
 */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export class PaycrestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly field?: string,
  ) {
    super(message);
    this.name = "PaycrestError";
  }
}

export type InstitutionType = "bank" | "mobile_money";

/**
 * A payout destination the corridor actually offers.
 *
 * The two shapes are not interchangeable and the corridors are lopsided:
 * Nigeria is 171 banks and no mobile money, Uganda is two mobile-money
 * providers and no banks. Anything that collects a recipient has to branch on
 * `type` rather than assume an account number.
 */
export type Institution = {
  name: string;
  code: string;
  type: InstitutionType;
};

/**
 * Resolve an institution code against the corridor's own list.
 *
 * Catching this here means a mis-addressed payout fails while the user is
 * still filling in a form, rather than after they have committed and the rail
 * rejects it.
 */
export function findInstitution(
  code: string,
  institutions: readonly Institution[],
): Institution {
  const found = institutions.find((institution) => institution.code === code);
  if (found === undefined) {
    throw new PaycrestError(
      `institution ${code} is not offered in this corridor`,
      0,
    );
  }
  return found;
}

/**
 * Paycrest's network slugs are the chain registry's slugs — deliberately the
 * same strings, so a chain we can ramp on cannot be spelled one way for the
 * wallet and another for the rail. Their docs say "arbitrum" and "optimism";
 * the live API wants "arbitrum-one" and rejects optimism outright.
 */
export type RateQuery = {
  network: ChainSlug;
  from: TokenSymbol;
  amount: string;
  to: Corridor;
  /** `sell` prices a cash-out, `buy` prices a cash-in. */
  side: "buy" | "sell";
};

export type Rate = { rate: string; providerIds: string[] };

export type Order = {
  id: string;
  status: string;
  amount: string;
  [key: string]: unknown;
};

export type ClientConfig = {
  baseUrl: string;
  apiKey: string;
  fetch: FetchLike;
  /** Per-transaction ceiling in whole USDT. Brief §7 — non-negotiable. */
  maxTxUsdt: string;
  /** When true, every order-creating call is refused. */
  killSwitch: boolean;
  /** Corridors switched on. A corridor not listed cannot be transacted. */
  enabledCorridors: readonly Corridor[];
};

type Envelope = { status?: string; message?: string; data?: unknown };

export function createClient(config: ClientConfig) {
  /**
   * The origin, with any trailing slash and any trailing version segment
   * removed. The client owns the version, so an operator who sets
   * RAILS_API_BASE to either "https://api.paycrest.io" or
   * ".../v2" gets the same working request instead of a doubled path and a
   * "Route Not Found" they have to guess at.
   */
  const origin = config.baseUrl.replace(/\/+$/, "").replace(/\/v2$/, "");

  async function call(
    path: string,
    init?: { method?: string; body?: unknown; authenticated?: boolean },
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (init?.authenticated !== false) headers["API-Key"] = config.apiKey;

    const response = await config.fetch(`${origin}${path}`, {
      method: init?.method ?? "GET",
      headers,
      ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });

    const raw = await response.text();

    let envelope: Envelope;
    try {
      envelope = JSON.parse(raw) as Envelope;
    } catch {
      // A gateway HTML page or a truncated body. Never let this look like a
      // successful call with empty data.
      throw new PaycrestError(
        `rail returned a non-JSON body (${response.status}): ${raw.slice(0, 120)}`,
        response.status,
      );
    }

    if (!response.ok || envelope.status === "error") {
      const detail = envelope.data as { field?: string; message?: string } | null;
      // "Failed to validate payload" on its own says nothing. The field and
      // its reason live in `data`, so they belong in the message rather than
      // only on a property nobody reads.
      const because =
        detail?.field !== undefined || detail?.message !== undefined
          ? ` — ${detail?.field ?? "?"}: ${detail?.message ?? "invalid"}`
          : "";
      throw new PaycrestError(
        `${envelope.message ?? `rail returned ${response.status}`}${because}`,
        response.status,
        detail?.field,
      );
    }

    return envelope.data;
  }

  /** USDT carries six decimals on every chain Paycrest settles on. */
  const USDT_DECIMALS = 6;

  /**
   * The brief §7 safety rails. Paycrest is mainnet-only — there is no test
   * key and no fake corridor — so every one of these protects real money, and
   * each refuses before the rail is reached rather than after.
   */
  function guardOrder(corridor: Corridor, stablecoinAmount: string): void {
    if (config.killSwitch) {
      throw new PaycrestError(
        "kill switch is on; refusing to create an order",
        0,
      );
    }

    if (!config.enabledCorridors.includes(corridor)) {
      throw new PaycrestError(`corridor ${corridor} is not enabled`, 0);
    }

    // Exact minor units, never a float: `toMinor` also refuses an amount that
    // carries more precision than USDT does, rather than truncating it into
    // something the user never agreed to.
    const amount = toMinor(stablecoinAmount, USDT_DECIMALS);
    const cap = toMinor(config.maxTxUsdt, USDT_DECIMALS);
    if (amount > cap) {
      throw new PaycrestError(
        `amount ${stablecoinAmount} USDT exceeds the ${config.maxTxUsdt} USDT cap`,
        0,
      );
    }
  }

  return {
    /** Public endpoint — deliberately unauthenticated. */
    async rates(query: RateQuery): Promise<Rate> {
      const data = (await call(
        `/v2/rates/${query.network}/${query.from}/${query.amount}/${query.to}?side=${query.side}`,
        { authenticated: false },
      )) as Record<string, Rate>;
      const side = data[query.side];
      if (side === undefined) {
        throw new PaycrestError(`rail returned no ${query.side} rate`, 200);
      }
      return side;
    },

    /** The payout destinations this corridor offers, banks and wallets alike. */
    async institutions(corridor: Corridor): Promise<Institution[]> {
      return (await call(`/v2/institutions/${corridor}`)) as Institution[];
    },

    async getOrder(id: string): Promise<Order> {
      return (await call(`/v2/sender/orders/${id}`)) as Order;
    },

    async verifyAccount(params: {
      institution: string;
      accountIdentifier: string;
      metadata?: Record<string, string>;
    }): Promise<string> {
      return (await call("/v2/verify-account", {
        method: "POST",
        body: params,
      })) as string;
    },

    /**
     * Creates a real payment order. Paycrest is mainnet-only — there is no
     * sandbox — so the safety rails from brief §7 are enforced here rather
     * than trusted to call sites.
     */
    async createOrder(params: {
      corridor: Corridor;
      /**
       * The value in stablecoin units — never the amount the user typed.
       * On a cash-in they type fiat, and comparing naira against a cap
       * denominated in dollars refuses transfers worth a dollar. The caller
       * converts; this only enforces.
       */
      stablecoinAmount: string;
      body: Record<string, unknown>;
    }): Promise<Order> {
      guardOrder(params.corridor, params.stablecoinAmount);
      return (await call("/v2/sender/orders", {
        method: "POST",
        body: params.body,
      })) as Order;
    },
  };
}

export type PaycrestClient = ReturnType<typeof createClient>;
