import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // `--host` plus this lets a tunnel (cloudflared / ngrok) reach the dev
    // server, which is how the app gets opened on a phone inside Nimiq Pay
    // before there is anything deployed.
    port: 3000,
    allowedHosts: true,
    // The phone reaches the app through a tunnel, so it cannot see a
    // localhost API. Proxying /api through Vite keeps the app same-origin and
    // means one tunnel rather than two — and no CORS in development.
    proxy: {
      "/api": {
        target: process.env["API_ORIGIN"] ?? "http://localhost:8788",
        changeOrigin: true,
      },
    },
  },
});
