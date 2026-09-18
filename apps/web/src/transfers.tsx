import type { State } from "@ramp/machine";
import { useEffect, useState } from "react";

import { readOrder } from "./api.js";
import { COUNTRY } from "./flow.js";
import type { HistoryEntry } from "./history.js";

/**
 * The list of past transfers.
 *
 * The rows come off the device; the state of each comes off the rail. Nothing
 * here remembers whether an order succeeded, because an app that remembers a
 * verdict will eventually show a stale one — and "paid" is the single worst
 * thing to be wrong about.
 */

/** What the chip says, and how it reads. */
const CHIP: Record<State, { text: string; tone: "ok" | "warn" | "fail" | "live" }> = {
  quoted: { text: "Quoted", tone: "live" },
  confirmed: { text: "Confirmed", tone: "live" },
  submitted: { text: "Sent", tone: "live" },
  settling: { text: "Settling", tone: "live" },
  completed: { text: "Arrived", tone: "ok" },
  quote_expired: { text: "Expired", tone: "warn" },
  rejected: { text: "Rejected", tone: "fail" },
  refunding: { text: "Refunding", tone: "warn" },
  failed_refunded: { text: "Refunded", tone: "warn" },
  failed_manual: { text: "Needs a human", tone: "fail" },
  stalled: { text: "Taking longer", tone: "warn" },
};

/**
 * How many rows we ask the rail about on open.
 *
 * Each row is a live call. Someone scrolling their whole history should not
 * fire fifty of them at a payments API that is quite entitled to start
 * refusing us.
 */
const PROBE = 10;

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

export function Transfers({
  entries,
  onOpen,
  onBack,
}: {
  entries: HistoryEntry[];
  onOpen: (ref: string) => void;
  onBack: () => void;
}) {
  const [states, setStates] = useState<Record<string, State | null>>({});

  useEffect(() => {
    let stop = false;
    const refs = entries.slice(0, PROBE).map((e) => e.ref);
    // Nothing to ask about. Worth the early return rather than an empty
    // round trip that still lands a state update after the screen is gone.
    if (refs.length === 0) return;

    void Promise.all(
      refs.map(async (ref) => {
        try {
          const live = await readOrder(ref);
          return [ref, live.state] as const;
        } catch {
          // An unreachable rail leaves the row without a chip, which is the
          // honest outcome: we do not know.
          return null;
        }
      }),
    ).then((pairs) => {
      if (stop) return;
      setStates(Object.fromEntries(pairs.filter((p) => p !== null)));
    });

    return () => {
      stop = true;
    };
  }, [entries]);

  return (
    <>
      <div className="nav">
        <button className="nav__back" type="button" onClick={onBack} aria-label="Back">‹</button>
        <span className="nav__title">Your transfers</span>
      </div>

      <div className="scroll" style={{ paddingTop: 8 }}>
        {entries.length === 0 ? (
          <>
            <h1 className="h1" style={{ fontSize: 26 }}>Nothing here yet</h1>
            <p className="body body--muted" style={{ marginTop: 8 }}>
              Transfers you make on this phone show up here. The list lives on
              your device, so clearing your browser data clears it — the
              reference on each receipt is the part worth keeping.
            </p>
          </>
        ) : (
          <div className="trows">
            {entries.map((e) => {
              const country = COUNTRY[e.corridor];
              const state = states[e.ref];
              const chip = state === undefined || state === null ? null : CHIP[state];
              const out = e.direction === "cash_out";

              return (
                <button
                  key={e.ref}
                  type="button"
                  className="trow"
                  onClick={() => onOpen(e.ref)}
                >
                  <span className={`trow__dir trow__dir--${out ? "out" : "in"}`} aria-hidden="true">
                    {out ? "→" : "←"}
                  </span>
                  <span className="trow__body">
                    <span className="trow__top">
                      <span className="trow__what">
                        {out
                          ? `${e.amount} ${e.symbol} → ${country.money}`
                          : `${country.money} → ${e.amount} ${e.symbol}`}
                      </span>
                      {chip === null ? null : (
                        <span className={`chip chip--${chip.tone}`}>{chip.text}</span>
                      )}
                    </span>
                    <span className="trow__sub">
                      {country.name} · {when(e.createdAt)} · {e.ref}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
