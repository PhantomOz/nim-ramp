import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize, resolve, sep } from "node:path";

import type { Hono } from "hono";

/**
 * Serve the built mini app from the same process as the API.
 *
 * One origin for both halves. That is not only a deployment convenience: the
 * app calls `/api/...` relatively, so same-origin means no CORS headers, no
 * second URL to keep in step, and nothing to misconfigure between them. It
 * also keeps the order log on a real disk — the reference a user is holding
 * has to still resolve tomorrow, which rules out an ephemeral filesystem.
 */

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

const typeOf = (path: string): string => {
  const dot = path.lastIndexOf(".");
  return (dot === -1 ? undefined : TYPES[path.slice(dot).toLowerCase()]) ?? "application/octet-stream";
};

/**
 * Resolve a URL path inside the root, or null if it escapes.
 *
 * Serving files from disk by URL is the one place a path like `../../etc` has
 * to be answered with nothing at all rather than with a file.
 */
function within(root: string, urlPath: string): string | null {
  const decoded = (() => {
    try {
      return decodeURIComponent(urlPath);
    } catch {
      return null;
    }
  })();
  if (decoded === null || decoded.includes("\0")) return null;

  const full = resolve(join(root, normalize(decoded)));
  return full === root || full.startsWith(root + sep) ? full : null;
}

export function serveWeb(app: Hono, webRoot: string): void {
  const root = resolve(webRoot);
  const index = join(root, "index.html");

  // Nothing built. The API still runs; it simply has no pages.
  if (!existsSync(index)) return;

  app.get("*", async (c, next) => {
    // The API owns its own namespace. A catch-all that swallows it turns
    // every unknown API route into an HTML page, and the browser's `.json()`
    // then fails with a parse error that says nothing about the real mistake.
    if (c.req.path.startsWith("/api/")) return next();

    const candidate = within(root, c.req.path);
    const file =
      candidate !== null && existsSync(candidate) && statSync(candidate).isFile()
        ? candidate
        : // Anything else is a client-side route. Hand back the app and let
          // it do the routing, so a refresh deep in a flow is not a 404.
          index;

    // Hashed asset names make the content immutable; index.html must not be,
    // or a deploy never reaches anyone still holding the old one.
    const immutable = file !== index && c.req.path.startsWith("/assets/");

    return c.body(new Uint8Array(readFileSync(file)), 200, {
      "Content-Type": typeOf(file),
      "Cache-Control": immutable
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
  });
}
