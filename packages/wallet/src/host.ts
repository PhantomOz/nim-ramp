import { WalletError } from "./connect.js";

/**
 * The read-only context Nimiq Pay seeds into every mini app before the page
 * script runs. Separate from the wallet providers: this is about the person
 * holding the phone, not their money.
 */
type HostWindow = {
  nimiqPay?: {
    language?: string;
    requestDeviceIdentifier?: (options: { reason: string }) => Promise<string>;
  };
  navigator?: { language?: string };
};

/**
 * The ISO 639-1 language to render in.
 *
 * Nimiq Pay's choice wins, because someone who set their wallet to Portuguese
 * should not hit an English-only ramp. Outside Nimiq Pay — standalone browser
 * during development — the browser's own preference is the next best guess.
 */
export function hostLanguage(
  win: HostWindow = globalThis as never,
): string {
  const fromHost = win.nimiqPay?.language;
  if (fromHost !== undefined && fromHost !== "") return fromHost;

  const fromBrowser = win.navigator?.language?.split("-")[0];
  if (fromBrowser !== undefined && fromBrowser !== "") return fromBrowser;

  return "en";
}

/**
 * A pseudonymous, per-origin device identifier — 64 hex characters, stable
 * across reinstalls and across accounts on the same device.
 *
 * This is what §2's rate limiting keys on. Note what it is not: it identifies
 * a *device*, not a person, and Nimiq's own documentation says not to use it
 * as an authentication identity. Rate limiting is exactly the device-scoped
 * use it is meant for; anything about who owns funds is not.
 *
 * The first call per origin prompts the user with `reason`, shown to them
 * verbatim — which is why an empty one is refused here rather than at the
 * host, where the failure would be harder to read.
 */
export async function deviceIdentifier(
  options: { reason: string },
  win: HostWindow = globalThis as never,
): Promise<string> {
  if (options.reason.trim() === "") {
    throw new WalletError(
      "a device identifier needs a reason; the user is shown it verbatim",
    );
  }

  const request = win.nimiqPay?.requestDeviceIdentifier;
  if (request === undefined) {
    throw new WalletError(
      "device identifiers are only available inside Nimiq Pay",
    );
  }

  return request(options);
}
