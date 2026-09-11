import type { Direction } from "@ramp/core";
import type { State } from "@ramp/machine";

import { timeline } from "./timeline.js";

/**
 * Progress as a timeline, which the board picks as the default because it
 * names who has the money at each step rather than just saying "pending".
 */
export function Progress({
  direction,
  state,
  reference,
  heading,
  onClose,
}: {
  direction: Direction;
  state: State;
  reference: string;
  heading: string;
  onClose: () => void;
}) {
  const steps = timeline(direction, state);

  return (
    <>
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px 0 24px",
        }}
      >
        <span className="nav__title">{heading}</span>
        <button className="linkbtn" type="button" onClick={onClose}>Close</button>
      </div>

      <div className="scroll" style={{ paddingTop: 16 }} aria-live="polite">
        <p className="body body--muted" style={{ font: "400 15px var(--ui)" }}>
          Reference <span className="refnum">{reference}</span>
        </p>

        <ol className="tl">
          {steps.map((step, i) => (
            <li className="tl__row" key={step.title}>
              <div className="tl__rail">
                <span className={`tl__dot tl__dot--${step.state}`}>
                  {step.state === "done" ? "✓" : null}
                  {step.state === "active" ? <span className="tl__pulse" /> : null}
                </span>
                {i < steps.length - 1 ? (
                  <span
                    className="tl__line"
                    style={{
                      background:
                        step.state === "done"
                          ? "var(--ok)"
                          : "rgba(42,27,46,.18)",
                    }}
                  />
                ) : null}
              </div>
              <div className="tl__body">
                <p
                  className="tl__title"
                  style={{
                    color:
                      step.state === "todo" ? "var(--muted)" : "var(--ink)",
                  }}
                >
                  {step.title}
                </p>
                <p className="tl__detail">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
