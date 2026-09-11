import type { Corridor } from "@ramp/core";
import { useEffect, useState } from "react";

import {
  type Account,
  type Institution,
  listInstitutions,
  verifyAccount,
  VerifyError,
} from "./api.js";
import { COUNTRY, PARTNER } from "./flow.js";

/**
 * Collecting an account — a cash-out payout, or the refund account a cash-in
 * requires.
 *
 * The corridors disagree about what an account even is: Nigeria is 171 banks
 * and no mobile money, Uganda is two mobile-money providers and no banks. So
 * the list comes from the rail and the labels follow whatever it returns,
 * rather than assuming an account number everywhere.
 *
 * The name is checked before anyone commits. The rail verifies it again at
 * order time, but discovering a wrong digit then means discovering it after
 * the user has agreed to an amount.
 */
export function AccountForm({
  corridor,
  purpose,
  onBack,
  onUse,
}: {
  corridor: Corridor;
  purpose: "payout" | "refund";
  onBack: () => void;
  onUse: (account: Account) => void;
}) {
  const country = COUNTRY[corridor];
  const [institutions, setInstitutions] = useState<Institution[] | null>(null);
  const [institution, setInstitution] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [resolved, setResolved] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unchecked, setUnchecked] = useState(false);

  useEffect(() => {
    let stop = false;
    listInstitutions(corridor)
      .then((list) => {
        if (stop) return;
        setInstitutions(list);
        setInstitution((current) => (current === "" ? (list[0]?.code ?? "") : current));
      })
      .catch((e: unknown) => {
        if (!stop) setError(e instanceof Error ? e.message : "could not load the list");
      });
    return () => {
      stop = true;
    };
  }, [corridor]);

  const chosen = institutions?.find((i) => i.code === institution);
  const mobile = chosen?.type === "mobile_money";
  const label = mobile ? "Phone number" : "Account number";

  // Reset a resolved name whenever the account it belonged to changes.
  useEffect(() => {
    setResolved(null);
    setUnchecked(false);
  }, [institution, identifier]);

  async function check() {
    setChecking(true);
    setError(null);
    try {
      const { accountName } = await verifyAccount({
        institution,
        accountIdentifier: identifier.trim(),
      });
      setResolved(accountName);
    } catch (e) {
      setResolved(null);
      // An unreachable checker must not block the transfer: the rail verifies
      // the account again when the order is created. A wrong number, though,
      // is a wrong number.
      if (e instanceof VerifyError && e.kind === "unavailable") {
        setUnchecked(true);
        setError(null);
      } else {
        setUnchecked(false);
        setError(e instanceof Error ? e.message : "could not check that account");
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <div className="nav">
        <button className="nav__back" type="button" onClick={onBack} aria-label="Back">‹</button>
        <span className="nav__title">
          {purpose === "payout" ? "Where it goes" : "Refund account"}
        </span>
      </div>

      <div className="scroll" style={{ paddingTop: 8 }}>
        <h1 className="h1" style={{ fontSize: 26 }}>
          {purpose === "payout"
            ? `Where should the ${country.money.toLowerCase()} go?`
            : "If this fails, where should the money go back?"}
        </h1>
        <p className="body body--muted" style={{ marginTop: 8 }}>
          {purpose === "payout"
            ? `To one of your ${country.method}s in ${country.name}. ${PARTNER} checks the name before anything is sent.`
            : `${PARTNER} requires this before a cash-in can start. Nothing is sent here unless the transfer fails.`}
        </p>

        <div className="section">
          <label className="label" htmlFor="institution">
            {mobile ? "Provider" : "Bank"}
          </label>
          <select
            id="institution"
            className="field"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            disabled={institutions === null}
          >
            {institutions === null ? (
              <option>Loading…</option>
            ) : (
              institutions.map((i) => (
                <option key={i.code} value={i.code}>{i.name}</option>
              ))
            )}
          </select>
        </div>

        <div className="section">
          <label className="label" htmlFor="identifier">{label}</label>
          <input
            id="identifier"
            className="field"
            inputMode={mobile ? "tel" : "numeric"}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={mobile ? "254712345678" : "0123456789"}
          />
        </div>

        {checking ? (
          <p className="small" style={{ marginTop: 12 }}>
            Checking the name with {chosen?.name ?? PARTNER}…
          </p>
        ) : null}

        {resolved !== null ? (
          <div className="panel panel--edge" style={{ color: "var(--ok)" }}>
            <p className="label">Account name</p>
            <p className="panel__lead" style={{ marginTop: 4 }}>{resolved}</p>
            <p className="panel__detail">
              Check this is right. {PARTNER} pays the name, not the number.
            </p>
          </div>
        ) : null}

        {unchecked ? (
          <div className="panel panel--edge" style={{ color: "var(--warn-2)" }}>
            <p className="panel__lead">We couldn&rsquo;t check the name just now</p>
            <p className="panel__detail">
              {PARTNER}&rsquo;s name checker isn&rsquo;t answering. You can carry
              on — they check the account again when the transfer starts — but
              read the number back to yourself first, because nothing has
              confirmed it yet.
            </p>
          </div>
        ) : null}

        {error !== null ? (
          <p className="body" style={{ marginTop: 12, color: "var(--fail)" }}>{error}</p>
        ) : null}
      </div>

      <div className="foot">
        {resolved === null && unchecked ? (
          <button
            className="btn"
            type="button"
            onClick={() =>
              onUse({
                institution,
                accountIdentifier: identifier.trim(),
                // Empty rather than invented: nothing confirmed a name, and
                // the rail will resolve it when the order is created.
                accountName: "",
              })
            }
          >
            Use it anyway
          </button>
        ) : resolved === null ? (
          <button
            className="btn"
            type="button"
            disabled={institution === "" || identifier.trim() === "" || checking}
            onClick={() => void check()}
          >
            {checking ? "Checking…" : "Check the name"}
          </button>
        ) : (
          <button
            className="btn"
            type="button"
            onClick={() =>
              onUse({
                institution,
                accountIdentifier: identifier.trim(),
                accountName: resolved,
              })
            }
          >
            Save and use
          </button>
        )}
      </div>
    </>
  );
}
