import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { Hono } from "hono";
import { expect, test } from "vitest";

import { serveWeb } from "../src/web.js";

/** A stand-in for a Vite build output. */
function built() {
  const root = mkdtempSync(join(tmpdir(), "web-"));
  const write = (rel: string, body: string) => {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body, "utf8");
  };
  write("index.html", "<title>nimRamp</title>");
  write("assets/index-abc.js", "console.log(1)");
  write("assets/index-abc.css", ".btn{}");
  return root;
}

/** An app shaped like the real one: API routes, then the web app behind them. */
function app(root: string) {
  const a = new Hono();
  a.get("/api/health", (c) => c.json({ ok: true }));
  a.notFound((c) => c.json({ error: "not found" }, 404));
  serveWeb(a, root);
  return a;
}

test("serves the built index at the root", async () => {
  const res = await app(built()).request("/");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/text\/html/);
  expect(await res.text()).toContain("nimRamp");
});

test("serves hashed assets with the right content type", async () => {
  const a = app(built());

  const js = await a.request("/assets/index-abc.js");
  expect(js.status).toBe(200);
  expect(js.headers.get("content-type")).toMatch(/javascript/);

  const css = await a.request("/assets/index-abc.css");
  expect(css.headers.get("content-type")).toMatch(/text\/css/);
});

test("falls back to the index for an app route with no file behind it", async () => {
  // The app routes client-side, so a refresh on /receipt must not 404.
  const res = await app(built()).request("/receipt/NR-ABCD1234");
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("nimRamp");
});

test("never answers an unknown API route with the web app", async () => {
  // The dangerous one. A catch-all that swallows /api turns every API typo
  // into an HTML page, and the browser's `.json()` then fails with a parse
  // error that says nothing about the real mistake.
  const res = await app(built()).request("/api/nope");
  expect(res.status).toBe(404);
  expect(res.headers.get("content-type")).toMatch(/application\/json/);
  expect(await res.json()).toMatchObject({ error: expect.any(String) });
});

test("real API routes still win", async () => {
  const res = await app(built()).request("/api/health");
  expect(await res.json()).toMatchObject({ ok: true });
});

test("refuses to walk out of the web root", async () => {
  const root = built();
  // A path that resolves above the root must not serve the file it points at.
  const res = await app(root).request("/../../../../etc/passwd");
  expect(await res.text()).not.toContain("root:");
});

test("does nothing when there is no build to serve", async () => {
  // API-only mode: running the server without having built the web app must
  // not crash it, and must not pretend a page exists.
  const a = new Hono();
  a.get("/api/health", (c) => c.json({ ok: true }));
  a.notFound((c) => c.json({ error: "not found" }, 404));
  serveWeb(a, join(tmpdir(), "definitely-not-built-12345"));

  expect((await a.request("/")).status).toBe(404);
  expect((await a.request("/api/health")).status).toBe(200);
});
