import { CORRIDORS, type Corridor } from "@ramp/core";

/**
 * Configuration, validated at boot.
 *
 * Everything here fails closed. Paycrest is mainnet-only, so a
 * misconfiguration is not a broken page — it is real money moving under
 * settings nobody chose. An unset cap means a small cap, an unparseable kill
 * switch means the kill switch is on, and a corridor is dark until someone
 * explicitly lights it.
 */
export type Config = {
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
  maxTxUsdt: string;
  killSwitch: boolean;
  enabledCorridors: Corridor[];
  port: number;
  /**
   * Private key of the wallet that seeds gas for cash-outs. Optional: without
   * it the faucet refuses and everything else works unchanged.
   */
  gasFunderKey?: string;
};

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is not set`);
  }
  return value.trim();
}

/** Fails closed: only an explicit, well-formed "false" turns the switch off. */
function killSwitch(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const v = raw.trim().toLowerCase();
  if (v === "false") return false;
  if (v === "true") return true;
  // Unparseable. Refusing to trade is recoverable; trading by accident is not.
  return true;
}

function flag(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === "true";
}

export function loadConfig(env: Env): Config {
  const maxRaw = env["MAX_TX_USDT"]?.trim();
  if (maxRaw !== undefined && maxRaw !== "" && !/^\d+(\.\d+)?$/.test(maxRaw)) {
    throw new Error(`MAX_TX_USDT is not a number: ${maxRaw}`);
  }

  const portRaw = env["PORT"]?.trim();

  // Checked here so a typo in a hot key is a boot failure, not a discovery
  // made while someone is stuck mid-cash-out with no gas.
  const funderKey = env["GAS_FUNDER_KEY"]?.trim();
  if (funderKey !== undefined && funderKey !== "" && !/^0x[0-9a-fA-F]{64}$/.test(funderKey)) {
    throw new Error("GAS_FUNDER_KEY is not a 32-byte hex private key");
  }

  return {
    baseUrl: required(env, "RAILS_API_BASE"),
    apiKey: required(env, "RAILS_API_KEY"),
    webhookSecret: required(env, "RAILS_WEBHOOK_SECRET"),
    // A default of 50 rather than "no limit". See the note above.
    maxTxUsdt: maxRaw === undefined || maxRaw === "" ? "50" : maxRaw,
    killSwitch: killSwitch(env["KILL_SWITCH"]),
    enabledCorridors: CORRIDORS.filter((c) =>
      flag(env[`CORRIDOR_${c}_ENABLED`]),
    ),
    // 8788 matches the Vite proxy's default target. With the two defaults
    // disagreeing, running both with no PORT set points the proxy at nothing.
    port: portRaw === undefined || portRaw === "" ? 8788 : Number(portRaw),
    ...(funderKey === undefined || funderKey === "" ? {} : { gasFunderKey: funderKey }),
  };
}
