import type { ChainSlug, Corridor } from "@ramp/core";

/**
 * Flags and chain marks.
 *
 * The board itself uses typographic badges — a plum circle with the currency
 * code, a paper circle with a chain abbreviation — and no imagery at all.
 * These are an addition to it, so they keep the board's badge geometry and
 * only change what sits inside.
 *
 * Chain marks are simplified geometry in each brand's colour, drawn inline
 * rather than fetched: the CSP blocks external images, and a logo that fails
 * to load leaves a hole where the network name should be. They are
 * recognisable rather than official — swap in the real assets if we get them.
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

export function ChainMark({ slug, size = 22 }: { slug: ChainSlug; size?: number }) {
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
