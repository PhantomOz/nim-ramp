import { useEffect, useState } from "react";

import { probeHost, type HostProbe } from "./probe.js";

/**
 * A development-only readout of what the host injected. Gated on
 * `import.meta.env.DEV`, so it never reaches the shipped build.
 */
export function HostPanel() {
  const [probe, setProbe] = useState<HostProbe | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);

  useEffect(() => {
    const result = probeHost();
    setProbe(result);

    if (!result.ethereum) return;
    const provider = (globalThis as { ethereum?: { request: (a: { method: string }) => Promise<unknown> } })
      .ethereum;

    provider
      ?.request({ method: "eth_chainId" })
      .then((id) => setChainId(String(id)))
      .catch((error: unknown) =>
        setChainId(error instanceof Error ? `error: ${error.message}` : "error"),
      );
  }, []);

  if (probe === null) return null;

  const rows: [string, string][] = [
    ["window.ethereum", probe.ethereum ? "injected" : "absent"],
    ["window.nimiq", probe.nimiq ? "injected" : "absent"],
    ["window.nimiqPay", probe.nimiqPay ? "injected" : "absent"],
    ["language", probe.language ?? "not set"],
    ["chainId", chainId ?? (probe.ethereum ? "asking…" : "n/a")],
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
    </details>
  );
}
