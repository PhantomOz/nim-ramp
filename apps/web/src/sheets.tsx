import {
  CHAINS,
  type Chain,
  CORRIDORS,
  type Corridor,
  type TokenSymbol,
} from "@ramp/core";

import { COUNTRY, PARTNER } from "./flow.js";
import { CHAIN_ABBR, ChainMark, FLAG } from "./marks.js";

/**
 * Bottom sheets, as the board draws them: a dimmed backdrop, a paper panel
 * rising from the bottom edge, rows that are white cards with a badge, a name
 * and a tick on the current choice.
 */

function Sheet({
  title,
  detail,
  onClose,
  children,
}: {
  title: string;
  detail: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="sheet__scrim"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <p className="sheet__title">{title}</p>
        <p className="sheet__detail">{detail}</p>
        <div className="sheet__list">{children}</div>
      </div>
    </div>
  );
}

const Tick = () => <span className="sheet__tick">✓</span>;

export function CountrySheet({
  current,
  onPick,
  onClose,
}: {
  current: Corridor;
  onPick: (c: Corridor) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      title="Which country?"
      detail="Sets the currency and where money can land."
      onClose={onClose}
    >
      {CORRIDORS.map((code) => {
        const c = COUNTRY[code];
        return (
          <button
            key={code}
            type="button"
            className="sheet__row"
            onClick={() => {
              onPick(code);
              onClose();
            }}
          >
            {/* The board puts the currency code in a plum disc. The flag sits
                in the same disc, with the code beneath as the label. */}
            <span className="badge badge--country" aria-hidden="true">
              {FLAG[code]}
            </span>
            <span className="sheet__body">
              <span className="sheet__name">{c.name}</span>
              <span className="sheet__sub">
                {code} · {c.money} to your {c.method}
              </span>
            </span>
            {code === current ? <Tick /> : null}
          </button>
        );
      })}
    </Sheet>
  );
}

/**
 * Which dollars, and on which rails.
 *
 * Both live in one sheet because they are one decision: a person holds a
 * particular token on a particular network, and asking those separately means
 * two taps to describe one balance. The token sits above the list because
 * every row below carries the same pair of contracts — picking USDC changes
 * what the whole list means, not what one row means.
 */
export function ChainSheet({
  current,
  symbol,
  onPick,
  onPickToken,
  onClose,
}: {
  current: Chain;
  symbol: TokenSymbol;
  onPick: (c: Chain) => void;
  onPickToken: (t: TokenSymbol) => void;
  onClose: () => void;
}) {
  const tokens: TokenSymbol[] = ["USDT", "USDC"];

  return (
    <Sheet
      title="Which dollars, and where?"
      detail={`Same dollars, different rails. ${PARTNER} pays the same price on every network and both tokens it accepts. Switching is approved in Nimiq Pay and moves nothing.`}
      onClose={onClose}
    >
      <div className="seg" role="group" aria-label="Token">
        {tokens.map((t) => (
          <button
            key={t}
            type="button"
            className={`seg__btn${t === symbol ? " seg__btn--on" : ""}`}
            aria-pressed={t === symbol}
            onClick={() => onPickToken(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {CHAINS.map((chain) => (
        <button
          key={chain.slug}
          type="button"
          className="sheet__row"
          onClick={() => {
            onPick(chain);
            onClose();
          }}
        >
          <span className="badge badge--chain">
            <ChainMark slug={chain.slug} size={20} />
          </span>
          <span className="sheet__body">
            <span className="sheet__name">{chain.name}</span>
            <span className="sheet__sub">
              {CHAIN_ABBR[chain.slug]} · {symbol}
              {/* Said here, where the choice is made, rather than discovered
                  at the point of signing. Mainnet gas is dollars, so we do
                  not cover it — and the honest place to mention that is
                  before someone picks the network, not after. */}
              {chain.slug === "ethereum" ? " · you cover the network fee" : ""}
            </span>
          </span>
          {chain.slug === current.slug ? <Tick /> : null}
        </button>
      ))}
    </Sheet>
  );
}
