<p align="center">
  <img src="apps/web/public/brand/wordmark.svg" alt="nimRamp" height="46" />
</p>

<p align="center">
  <b>Digital dollars to naira or shillings, and back. Inside Nimiq Pay.</b>
</p>

---

## The story this was built for

Amara sells design work to clients abroad. She gets paid in USDT, and it lands
in her Nimiq Pay wallet in about a minute — which is the easy half.

The hard half is rent. Rent is in naira, and her landlord does not take USDT.
So every month she does the same thing: opens a peer-to-peer marketplace,
picks a stranger with good reviews, sends them dollars, and waits, holding
nothing but a chat window and a promise. Sometimes it takes ten minutes.
Sometimes the trade is disputed and it takes a day. The rate she gets is
whatever the stranger felt like offering that morning.

Next month she opens nimRamp instead — a tab inside the wallet she already
has. She taps **Cash out**, types 60, and sees the number that will land in
her account before she agrees to anything: **₦81,920**. She picks her bank
from a list she can search, and the app reads her name back to her from the
bank's own records. She confirms in Nimiq Pay — the same confirmation dialog
she uses for everything else. The naira arrives in about ninety seconds.

Later, she needs dollars back: her supplier invoices in USDT. She taps
**Cash in**, transfers naira to the account the app shows her, and the
stablecoin appears in her wallet.

No stranger. No chat window. No waiting to find out what it cost.

**That is the whole app.** Everything below is how it works.

## The same story, for the four countries we serve

| | Amara pays rent in | Money moves via |
|---|---|---|
| 🇳🇬 Nigeria | Naira (NGN) | Bank transfer |
| 🇰🇪 Kenya | Shillings (KES) | Mobile money |
| 🇹🇿 Tanzania | Shillings (TZS) | Mobile money |
| 🇺🇬 Uganda | Shillings (UGX) | Mobile money |

Ghana is not here because the rail does not serve it — its API answers
*"Fiat currency GHS is not supported"*. That is a fact about the world, not a
scope decision.

## What Amara never has to think about

**Which dollars she holds.** USDT or USDC, on Polygon, Base, Arbitrum One,
Ethereum or BNB Smart Chain. She picks both in one sheet, because a balance is
a token *and* a network — that is one decision, not two. Every contract
address and decimal was read from the chain rather than from documentation;
USDT and USDC on BNB Smart Chain carry **18 decimals** where every other chain
uses 6, and treating that as 6 sends a trillion times the intended amount.

**The network fee.** Money arriving from a cash-in leaves her holding
stablecoin and no native token at all — so the very next thing she tries,
sending it back out, is unaffordable. On Polygon, Base, Arbitrum and BNB the
server covers exactly that shortfall, once per order, only to the address that
owns it. She never sees it happen. Ethereum is the exception: mainnet gas is
dollars rather than cents, so there she pays her own, and the app says so
instead of failing.

**Whether we have her money.** We never do. Her keys stay in Nimiq Pay, which
raises its own native confirmation for every transfer — we cannot bypass it,
which is precisely the property that keeps this app out of the custody path.
A licensed payments company moves the fiat.

**What it cost.** 0.5%, charged by the rail on its own `senderFeePercent`
rather than being arithmetic we do — so the receipt cannot disagree with the
ledger.

**What happens when it breaks.** Eleven states, every one with a screen,
including the ugly ones. Terminal failures carry a reference she can quote to
a human.

## Proof it works

Live on mainnet, both directions. There is no sandbox on this rail, so every
state below was exercised with real money.

| | Reference | Result |
|---|---|---|
| Cash in | `NR-9YMLZL99` | ₦2,000 → 1.454175 USDT at 1375.35, settled in 1m 48s |
| Cash out | `NR-DJBRBNEJ` | 1.45 USDT → 1.4428 paid out at 1365.32 |

Built for the Nimiq Mini Apps Competition, Cycle II. Seventy-three mini apps
have been submitted across both cycles. Not one of the others touches fiat.

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
pnpm test           # 207 tests
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
| `apps/assests` | Brand and network artwork (source) |
| `docs/engineering-brief.html` | Why it is built this way |

## Two things worth reading the code for

**The state machine came first.** A payments app where someone's money
disappears into a spinner is the worst possible thing to put in front of a
user. Building the eleven states before building a single screen is what made
the full scope affordable — one machine serves both directions.

**The gas faucet is a policy module with no keys in it.**
[`apps/api/src/drip.ts`](apps/api/src/drip.ts) decides *whether* a wei should
leave our wallet and knows nothing about signing, so every refusal is a pure
function you can test without a chain. A faucet with a bug hands its balance
to whoever asks first. Gasless via EIP-2612 or EIP-3009 is the better answer
and the next build; it needs a typed-data signature from the injected provider
that nothing documents. See the brief for the three approaches rejected and
why.

## Safety

Everything fails closed. An unset transaction cap means $50, not unlimited. An
unparseable kill switch means *on*. A corridor is dark until explicitly
enabled. The faucet pays once per order, only the shortfall, never above a
per-chain ceiling, never past a daily budget, and never on a chain it has no
budget for.

## Not done

The **on-chain NIM receipt** — writing each settled transfer's reference to
Nimiq's L1 as a public, independently checkable record — is designed and
scoped but not built. `packages/receipt` is a stub. An unverifiable receipt is
decoration, so it ships with its verification view or not at all.

## Licence

MIT. See [`LICENSE`](LICENSE).
