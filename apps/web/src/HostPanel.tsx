import { useEffect, useState } from "react";

import { probeHost, type HostProbe } from "./probe.js";
import { signWithEvm, signWithNimiq, type SignAttempt } from "./signing.js";

const MESSAGE = "Four Corridors — proving this wallet is yours";

type Win = {
  ethereum?: {
    request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  };
  nimiq?: { sign: (m: string) => Promise<unknown> };
};

/**
 * A development-only readout of what the host injected, plus two buttons that
 * settle whether either provider will actually sign. Gated on
 * `import.meta.env.DEV`, so it never reaches the shipped build.
 */
export function HostPanel() {
  const [probe, setProbe] = useState<HostProbe | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [evmSign, setEvmSign] = useState<SignAttempt | null>(null);
  const [nimiqSign, setNimiqSign] = useState<SignAttempt | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const result = probeHost();
    setProbe(result);
    if (!result.ethereum) return;

    (globalThis as Win).ethereum
      ?.request({ method: "eth_chainId" })
      .then((id) => setChainId(String(id)))
      .catch((e: unknown) =>
        setChainId(e instanceof Error ? `error: ${e.message}` : "error"),
      );
  }, []);

  if (probe === null) return null;

  async function tryEvmSign() {
    const provider = (globalThis as Win).ethereum;
    if (provider === undefined) return;
    setBusy("evm");
    try {
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      const address = accounts[0];
      setEvmSign(
        address === undefined
          ? { ok: false, reason: "no account" }
          : await signWithEvm(provider, address, MESSAGE),
      );
    } finally {
      setBusy(null);
    }
  }

  async function tryNimiqSign() {
    const nimiq = (globalThis as Win).nimiq;
    if (nimiq === undefined) return;
    setBusy("nimiq");
    try {
      setNimiqSign(await signWithNimiq(nimiq, MESSAGE));
    } finally {
      setBusy(null);
    }
  }

  const show = (a: SignAttempt | null): string =>
    a === null
      ? "not tried"
      : a.ok
        ? `signed ${a.signature.slice(0, 14)}…`
        : `no — ${a.reason}`;

  const rows: [string, string][] = [
    ["window.ethereum", probe.ethereum ? "injected" : "absent"],
    ["window.nimiq", probe.nimiq ? "injected" : "absent"],
    ["window.nimiqPay", probe.nimiqPay ? "injected" : "absent"],
    ["language", probe.language ?? "not set"],
    ["chainId", chainId ?? (probe.ethereum ? "asking…" : "n/a")],
    ["personal_sign", show(evmSign)],
    ["nimiq.sign", show(nimiqSign)],
  ];

  return (
    <details className="probe" open={!probe.ethereum}>
      <summary className="probe__summary">
        Host {probe.ethereum ? "· wallet ready" : "· no wallet"}
      </summary>
      <dl className="probe__list">
        {rows.map(([label, value]) => (
          <div className="probe__row" key={label}>
            <dt>{label}</dt>
            <dd className={value === "absent" ? "probe__absent" : undefined}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="probe__actions">
        <button
          type="button"
          onClick={tryEvmSign}
          disabled={!probe.ethereum || busy !== null}
        >
          {busy === "evm" ? "signing…" : "Test personal_sign"}
        </button>
        <button
          type="button"
          onClick={tryNimiqSign}
          disabled={!probe.nimiq || busy !== null}
        >
          {busy === "nimiq" ? "signing…" : "Test nimiq.sign"}
        </button>
      </div>
    </details>
  );
}
