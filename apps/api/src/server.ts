import { fileURLToPath } from "node:url";

import { serve } from "@hono/node-server";
import { createClient } from "@ramp/rails";

import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDripLog } from "./driplog.js";
import { createFunder, funderAddress } from "./funder.js";
import { openStore } from "./store.js";

// Fails here, at boot, rather than in front of a user mid-order.
const config = loadConfig(process.env);

const client = createClient({
  baseUrl: config.baseUrl,
  apiKey: config.apiKey,
  fetch: (url, init) => globalThis.fetch(url, init),
  maxTxUsdt: config.maxTxUsdt,
  killSwitch: config.killSwitch,
  enabledCorridors: config.enabledCorridors,
});

/*
 * Resolved against this file, not the working directory.
 *
 * A relative path meant the order log landed wherever the server happened to
 * be started from — `apps/api/.nimramp/` when run from the package, the repo
 * root when run from there. Two different audit trails, and a reference that
 * resolves or does not depending on how someone launched the process.
 */
const ordersPath =
  process.env["ORDERS_PATH"] ??
  fileURLToPath(new URL("../../../.nimramp/orders.jsonl", import.meta.url));

const store = openStore(ordersPath);

const dripsPath =
  process.env["DRIPS_PATH"] ??
  fileURLToPath(new URL("../../../.nimramp/drips.jsonl", import.meta.url));

const dripLog = openDripLog(dripsPath);

// Absent without a key. The faucet then refuses politely and the rest of the
// app is unaffected — a cash-out still works for anyone holding gas already.
const funder =
  config.gasFunderKey === undefined
    ? undefined
    : createFunder({ privateKey: config.gasFunderKey, env: process.env });

const webOrigin = process.env["WEB_ORIGIN"];

const app = createApp({
  client,
  store,
  dripLog,
  ...(funder === undefined ? {} : { funder }),
  webhookSecret: config.webhookSecret,
  maxTxUsdt: config.maxTxUsdt,
  // The mini app is same-origin in production and proxied through Vite in
  // development, so this is normally unset and no CORS headers are sent.
  ...(webOrigin === undefined ? {} : { corsOrigin: webOrigin }),
  onStatus: (update) => {
    // Somewhere to hang a push notification later. Logged for now so a
    // support conversation can start from a reference.
    console.log(`[order] ${update.ref} → ${update.state ?? "unrecognised"}`);
  },
});

console.log(
  [
    `NimRamp API on :${config.port}`,
    `  corridors : ${config.enabledCorridors.join(", ") || "none enabled"}`,
    `  cap       : ${config.maxTxUsdt} USDT per transfer`,
    `  kill      : ${config.killSwitch ? "ON — refusing every order" : "off"}`,
    `  orders    : ${ordersPath}`,
    `  gas       : ${
      config.gasFunderKey === undefined
        ? "no funder key — cash-out needs the user to hold gas"
        : `funding from ${funderAddress(config.gasFunderKey)}`
    }`,
  ].join("\n"),
);

const server = serve({ fetch: app.fetch, port: config.port });

// A payments API that dies with an unhandled 'error' event tells whoever is
// deploying it nothing useful. Say what happened and what to do.
server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${config.port} is already in use. Set PORT to something else, or stop what is holding it.`,
    );
    process.exit(1);
  }
  throw error;
});
