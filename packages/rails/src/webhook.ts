import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Paycrest webhook against the `X-Paycrest-Signature` header.
 *
 * `rawBody` must be the exact bytes the rail sent. Verifying against a
 * re-serialised object is the classic way to make a signature check
 * decorative — key order and whitespace differ, so either every webhook
 * fails or, worse, somebody "fixes" it by loosening the comparison.
 *
 * The comparison is timing-safe: a byte-at-a-time compare leaks how much of a
 * forged signature was correct, which is enough to construct one.
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string,
  apiSecret: string,
): boolean {
  const received = signatureHeader.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(received)) return false;

  const expected = createHmac("sha256", apiSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
