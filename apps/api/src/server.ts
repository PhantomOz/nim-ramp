import { serve } from "@hono/node-server";
import { createClient } from "@ramp/rails";

import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
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

const store = openStore(process.env["ORDERS_PATH"] ?? ".nimramp/orders.jsonl");

const webOrigin = process.env["WEB_ORIGIN"];

const app = createApp({
  client,
  store,
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
