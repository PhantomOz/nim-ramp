# Four Corridors

A two-way USDT ramp that runs inside [Nimiq Pay](https://nimiq.com), moving
value between local currency and stablecoin in four African markets — Nigeria,
Kenya, Ghana and Tanzania. Built for the Nimiq Mini Apps Competition, Cycle II.

> **Status:** in active development. Ship date 14 September 2026. This README is
> a stub and will be replaced with run instructions before submission.

## What it does

| Direction | Flow |
|---|---|
| Cash in | NGN / KES / GHS / TZS → our onramp → USDT on Polygon → Nimiq Pay wallet |
| Cash out | Nimiq Pay wallet → USDT on Polygon → our offramp → NGN / KES / GHS / TZS |

Settlement is USDT on Polygon. Keys never leave the wallet — Nimiq Pay mediates
every sensitive action through a native confirmation dialog, so this app is
never in the custody path.

## Layout

| Path | Contents |
|---|---|
| `packages/core` | Shared vocabulary — corridors, money, identifiers |
| `packages/machine` | The transaction state machine. Built first, on purpose |
| `packages/rails` | Fiat rails client, written fresh for this repository |
| `packages/wallet` | Nimiq Pay integration and USDT on Polygon |
| `packages/receipt` | On-chain receipt written to the Nimiq L1 |
| `apps/api` | HTTP surface and rails webhooks |
| `apps/web` | The mini app itself |

## Why the state machine comes first

A payments app where someone's money disappears into a spinner is the worst
possible thing to put in front of a user. Every state a transaction can reach
has a screen, including the ugly ones, and the terminal failure states carry a
reference the user can quote to a human. That work lands before either
direction does, not after.

## Running it

```sh
pnpm install
cp .env.example .env   # fill it in; .env is gitignored and stays that way
pnpm test
pnpm typecheck
```

No credentials are committed to this repository. `.env.example` documents the
full configuration surface with empty values.

## Licence

MIT — see [LICENSE](./LICENSE).
