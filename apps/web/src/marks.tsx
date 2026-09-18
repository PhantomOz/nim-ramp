import type { ChainSlug, Corridor } from "@ramp/core";
import { useState } from "react";

/**
 * Flags and chain marks.
 *
 * The board itself uses typographic badges — a plum circle with the currency
 * code, a paper circle with a chain abbreviation — and no imagery at all.
 * These are an addition to it, so they keep the board's badge geometry and
 * only change what sits inside.
 *
 * Chain marks are each network's own logo, served from our own origin rather
 * than a CDN — the CSP blocks external images, and a network's mark going
 * missing leaves a hole where the name should be. The simplified geometry
 * below is still here as the fallback for exactly that: an asset that fails
 * to load falls back to a drawn mark in the brand colour rather than to
 * nothing.
 */

export const FLAG: Record<Corridor, string> = {
  NGN: "🇳🇬",
  KES: "🇰🇪",
  TZS: "🇹🇿",
  UGX: "🇺🇬",
};

/** Fallback for platforms that do not render regional-indicator pairs. */
export const CODE: Record<Corridor, string> = {
  NGN: "NG",
  KES: "KE",
  TZS: "TZ",
  UGX: "UG",
};

export const CHAIN_ABBR: Record<ChainSlug, string> = {
  polygon: "POL",
  base: "BASE",
  "arbitrum-one": "ARB",
  ethereum: "ETH",
  "bnb-smart-chain": "BNB",
};

const BRAND: Record<ChainSlug, string> = {
  polygon: "#8247E5",
  base: "#0052FF",
  "arbitrum-one": "#12AAFF",
  ethereum: "#627EEA",
  "bnb-smart-chain": "#F0B90B",
};

/**
 * The real logo, with the drawn mark underneath it.
 *
 * `onError` is the whole point: a 404 on one network's asset must not leave a
 * blank disc next to its name, because that reads as a broken network rather
 * than a missing file.
 */
export function ChainMark({ slug, size = 22 }: { slug: ChainSlug; size?: number }) {
  const [missing, setMissing] = useState(false);

  if (!missing) {
    return (
      <img
        src={`/chains/${slug}.svg`}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        style={{ display: "block", borderRadius: "50%" }}
        onError={() => setMissing(true)}
      />
    );
  }

  return <DrawnMark slug={slug} size={size} />;
}

function DrawnMark({ slug, size }: { slug: ChainSlug; size: number }) {
  const fill = BRAND[slug];
  const common = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true };

  switch (slug) {
    case "ethereum":
      return (
        <svg {...common}>
          <polygon points="12,2 6,12.2 12,15.5 18,12.2" fill={fill} />
          <polygon points="12,16.8 6,13.4 12,22 18,13.4" fill={fill} opacity="0.7" />
        </svg>
      );

    case "polygon":
      return (
        <svg {...common}>
          <polygon points="12,2.5 20.5,7.25 20.5,16.75 12,21.5 3.5,16.75 3.5,7.25" fill={fill} />
        </svg>
      );

    case "base":
      // A disc with a vertical chord taken out of its left side.
      return (
        <svg {...common}>
          <path
            d="M12 2a10 10 0 1 1 0 20A10 10 0 0 1 2.6 13.4h9.9v-2.8H2.6A10 10 0 0 1 12 2z"
            fill={fill}
          />
        </svg>
      );

    case "arbitrum-one":
      return (
        <svg {...common}>
          <polygon points="12,2.5 20.5,7.25 20.5,16.75 12,21.5 3.5,16.75 3.5,7.25" fill={fill} />
          <polygon points="12,7 15.5,16 13.4,16 12,12.2 10.6,16 8.5,16" fill="#fff" />
        </svg>
      );

    case "bnb-smart-chain":
      // A diamond of diamonds.
      return (
        <svg {...common}>
          <polygon points="12,2.5 15,5.5 12,8.5 9,5.5" fill={fill} />
          <polygon points="6.5,8 9.5,11 6.5,14 3.5,11" fill={fill} />
          <polygon points="17.5,8 20.5,11 17.5,14 14.5,11" fill={fill} />
          <polygon points="12,13.5 15,16.5 12,19.5 9,16.5" fill={fill} />
          <polygon points="12,8.6 14.4,11 12,13.4 9.6,11" fill={fill} opacity="0.75" />
        </svg>
      );
  }
}
