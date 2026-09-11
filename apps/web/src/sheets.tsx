import { CHAINS, type Chain, CORRIDORS, type Corridor } from "@ramp/core";

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

export function ChainSheet({
  current,
  onPick,
  onClose,
}: {
  current: Chain;
  onPick: (c: Chain) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      title="Which network is your stablecoin on?"
      detail={`Same dollars, different rails. ${PARTNER} pays the same price on every network it accepts. Switching is approved in Nimiq Pay and moves nothing.`}
      onClose={onClose}
    >
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
              {CHAIN_ABBR[chain.slug]} · USDT and USDC
            </span>
          </span>
          {chain.slug === current.slug ? <Tick /> : null}
        </button>
      ))}
    </Sheet>
  );
}
