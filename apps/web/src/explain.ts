import type { Corridor } from "@ramp/core";
import type { RailRefusal } from "@ramp/rails";

import { COUNTRY, PARTNER } from "./flow.js";

export type Explanation = {
  text: string;
  /** What the user can usefully do about it. */
  action: "switch-network" | "change-amount" | "none";
};

/**
 * Turn the rail's refusal into something a person can act on.
 *
 * The important line here is the one between "not supported" and "not right
 * now". Every corridor the rail lists works in both directions; whether a
 * provider is quoting a given size this minute is weather, not climate.
 * Saying "Uganda cannot be cashed into" because nobody was quoting UGX when
 * we asked would be a lie with a long shelf life.
 */
export function explainRefusal(
  refusal: RailRefusal,
  context: { chainName: string; corridor: Corridor },
): Explanation {
  switch (refusal.kind) {
    case "structural": {
      if (refusal.subject === "token") {
        return {
          text: `${refusal.what} isn't accepted on ${context.chainName}. Switch network in Nimiq Pay to continue — your ${context.chainName} balance stays exactly where it is.`,
          action: "switch-network",
        };
      }
      return {
        text: `${PARTNER} doesn't reach ${refusal.what} yet.`,
        action: "none",
      };
    }

    case "no-liquidity": {
      const country = COUNTRY[context.corridor]?.name ?? context.corridor;
      return {
        text: `Nobody is quoting that amount for ${country} right now. Try a different amount, or another network — this usually clears within the hour.`,
        action: "change-amount",
      };
    }

    case "unknown":
      // Pass the rail's own words through. Reinterpreting a message we do not
      // recognise is how a temporary problem becomes a permanent claim.
      return { text: refusal.message, action: "none" };
  }
}
