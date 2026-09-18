# nimRamp

A two-way stablecoin ramp that runs inside [Nimiq Pay](https://nimiq.com),
moving value between local currency and USDT or USDC in four African markets.
Built for the Nimiq Mini Apps Competition, Cycle II.

Seventy-three mini apps have been submitted across both cycles. Not one of the
others touches fiat.

## Status

Live on mainnet, both directions. There is no sandbox on this rail, so every
state below was exercised with real money.

| | Reference | Result |
|---|---|---|
| Cash in | `NR-9YMLZL99` | ₦2,000 → 1.454175 USDT at 1375.35, settled in 1m 48s |
| Cash out | `NR-DJBRBNEJ` | 1.45 USDT → 1.4428 paid out at 1365.32 |

## What it does

| Direction | Flow |
|---|---|
| Cash in | NGN / KES / TZS / UGX → our onramp → stablecoin → Nimiq Pay wallet |
| Cash out | Nimiq Pay wallet → stablecoin → our offramp → NGN / KES / TZS / UGX |

**Corridors:** Nigeria, Kenya, Tanzania, Uganda. Ghana is not served by the
rail — its API answers *"Fiat currency GHS is not supported"* — so it is out on
a fact rather than a scope decision.

**Chains:** Polygon, Base, Arbitrum One, Ethereum and BNB Smart Chain, in both
USDT and USDC. That list is the intersection of what Nimiq Pay carries and what
the rail serves, and it matches neither side's documentation: Optimism is
carried by the wallet and listed in the rail's docs, but its API rejects it.
Every contract address and decimal was read from the chain rather than from
documentation — USDT and USDC on BNB Smart Chain carry **18 decimals** where
every other chain uses 6.

Keys never leave the wallet. Nimiq Pay mediates every sensitive action through
a native confirmation dialog, so this app is never in the custody path.

Our fee is **0.5%**, charged by the rail on its own `senderFeePercent` rather
than being arithmetic we do, so the receipt cannot disagree with the ledger.

## Running it

Requires Node 22 and pnpm.

```bash
pnpm install
cp .env.example .env    # then fill in the rails keys
pnpm run dev:api        # API on :8788
pnpm run dev:web        # mini app on :3000, proxying /api
```

The mini app expects to be opened inside Nimiq Pay. In development, expose the
web port through a tunnel and open that URL via
`https://nimpay.app/miniapps/open/<url>` — Vite proxies `/api` so one tunnel
serves both halves.

```bash
pnpm test           # 205 tests
pnpm run typecheck
pnpm run build      # builds the mini app
pnpm start          # one process serving the API and the built app
```

## Layout

| Path | Contents |
|---|---|
| `packages/core` | Shared vocabulary — corridors, chains, money |
| `packages/machine` | The transaction state machine. Built first, on purpose |
| `packages/rails` | Fiat rails client, written fresh for this repository |
| `packages/wallet` | Nimiq Pay integration, transfers, fee pricing |
| `apps/api` | HTTP surface, rails webhooks, gas seeding |
| `apps/web` | The mini app itself |
| `docs/engineering-brief.html` | Why it is built this way |

## Two things worth reading the code for

**The state machine comes first.** A payments app where someone's money
disappears into a spinner is the worst possible thing to put in front of a
user. Eleven states, every one with a screen including the ugly ones, and the
terminal failure states carry a reference the user can quote to a human. One
machine serves both directions, which is what made full scope affordable.

**Cash-out seeds its own gas.** A wallet paid by a cash-in holds stablecoin and
no native token at all, so the very next thing anyone tries is unaffordable.
The server sends the shortfall — about two cents on Polygon — once per order
and only to the address that owns it. Gasless via EIP-2612 or EIP-3009 is the
better answer and the next build; it needs a typed-data signature from the
injected provider that nothing documents. See the brief for the three
approaches rejected and why.

## Safety

Everything fails closed. An unset transaction cap means $50, not unlimited. An
unparseable kill switch means *on*. A corridor is dark until explicitly
enabled. The gas faucet pays once per order, only the shortfall, never above a
per-chain ceiling and never past a daily budget.

## Licence

MIT. See [`LICENSE`](LICENSE).
