/**
 * What the host has actually injected.
 *
 * Everything in `@ramp/wallet` is verified against fakes, which proves the
 * logic and nothing about the real WebView. This reports what is genuinely
 * present so "does it work inside Nimiq Pay" becomes something you can read
 * off a phone screen instead of infer.
 */
export type HostProbe = {
  ethereum: boolean;
  nimiq: boolean;
  nimiqPay: boolean;
  language: string | null;
};

export function probeHost(
  win: {
    ethereum?: unknown;
    nimiq?: unknown;
    nimiqPay?: { language?: string };
  } = globalThis as never,
): HostProbe {
  return {
    ethereum: win.ethereum !== undefined && win.ethereum !== null,
    nimiq: win.nimiq !== undefined && win.nimiq !== null,
    nimiqPay: win.nimiqPay !== undefined && win.nimiqPay !== null,
    language: win.nimiqPay?.language ?? null,
  };
}
