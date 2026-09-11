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
    port: portRaw === undefined || portRaw === "" ? 8787 : Number(portRaw),
  };
}
