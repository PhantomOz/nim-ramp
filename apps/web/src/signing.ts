/**
 * Can the user prove they hold an address?
 *
 * Two providers, two answers, and the Nimiq one has a trap: `sign()` and
 * `listAccounts()` return `SignatureResult | ErrorResponse` rather than
 * rejecting. Destructuring without checking hands you `undefined` and the
 * caller carries on as though the signature succeeded — which is precisely
 * how a proof-of-ownership check becomes decorative.
 */

export type SignAttempt =
  | { ok: true; via: "personal_sign"; signature: string }
  | { ok: true; via: "eth_signTypedData_v4"; signature: string }
  | { ok: true; via: "nimiq"; signature: string; publicKey: string }
  | { ok: false; reason: string };

type EvmProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type NimiqLike = {
  sign: (message: string) => Promise<unknown>;
};

const reason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export async function signWithEvm(
  provider: EvmProvider,
  address: string,
  message: string,
): Promise<SignAttempt> {
  try {
    const signature = (await provider.request({
      method: "personal_sign",
      // personal_sign takes [message, address] — this order, not the reverse.
      params: [message, address],
    })) as string;
    return { ok: true, via: "personal_sign", signature };
  } catch (error) {
    return { ok: false, reason: reason(error) };
  }
}

export async function signWithNimiq(
  nimiq: NimiqLike,
  message: string,
): Promise<SignAttempt> {
  try {
    const result = (await nimiq.sign(message)) as
      | { publicKey?: string; signature?: string }
      | { error?: { type?: string; message?: string } };

    if ("error" in result && result.error !== undefined) {
      return {
        ok: false,
        reason: result.error.message ?? result.error.type ?? "refused",
      };
    }

    const signed = result as { publicKey?: string; signature?: string };
    if (signed.signature === undefined || signed.publicKey === undefined) {
      return { ok: false, reason: "provider returned no signature" };
    }

    return {
      ok: true,
      via: "nimiq",
      signature: signed.signature,
      publicKey: signed.publicKey,
    };
  } catch (error) {
    return { ok: false, reason: reason(error) };
  }
}

/**
 * Can this wallet produce an EIP-712 signature?
 *
 * The question gates every gasless route. Sponsoring an EOA's transfer means
 * a meta-transaction — EIP-2612 permit, EIP-3009, or Polygon's native
 * executeMetaTransaction — and all three are a typed-data signature plus a
 * relayer that pays the fee. A 4337 paymaster cannot help here, because the
 * sender is an ordinary account rather than a smart one.
 *
 * If this answers no, sponsoring is off the table and the remaining options
 * are seeding the gas token or asking users to hold it.
 */
export async function signTypedData(
  provider: EvmProvider,
  address: string,
  typedData: unknown,
): Promise<SignAttempt> {
  try {
    const signature = (await provider.request({
      method: "eth_signTypedData_v4",
      params: [address, JSON.stringify(typedData)],
    })) as string;
    return { ok: true, via: "eth_signTypedData_v4", signature };
  } catch (error) {
    return { ok: false, reason: reason(error) };
  }
}
