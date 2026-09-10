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
  },
});
