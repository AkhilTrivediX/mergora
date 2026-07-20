"use client";

import { useState } from "react";

import {
  clearMergoraLocalData,
  MERGORA_LOCAL_DATA,
  type LocalDataClearResult,
} from "./site-local-data";

export function SiteLocalDataReset({
  onCleared,
}: {
  readonly onCleared: (result: LocalDataClearResult) => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [result, setResult] = useState<LocalDataClearResult | null>(null);
  const [cancelled, setCancelled] = useState(false);

  const status =
    result === null
      ? cancelled
        ? "Reset cancelled. No local data was changed."
        : ""
      : result.failed.length === 0
        ? `${String(result.removed.length)} documented local keys were cleared. Open tools keep only their current in-memory state until this page is reloaded.`
        : `${String(result.failed.length)} local keys could not be cleared. No unlisted browser data was touched.`;

  return (
    <section aria-labelledby="site-local-data-title" className="site-local-data">
      <h3 id="site-local-data-title">Local data</h3>
      <p>
        Mergora does not send these preferences or drafts to a server. Review the exact browser keys
        before clearing them.
      </p>
      {reviewing ? (
        <div
          aria-label="Confirm local data reset"
          className="site-local-data__confirmation"
          role="group"
        >
          <ul>
            {MERGORA_LOCAL_DATA.map(({ key, label }) => (
              <li key={key}>
                <span>{label}</span>
                <code dir="ltr">{key}</code>
              </li>
            ))}
          </ul>
          <div className="site-local-data__actions">
            <button
              className="site-local-data__confirm"
              onClick={() => {
                const next = clearMergoraLocalData(window.localStorage);
                setCancelled(false);
                setResult(next);
                onCleared(next);
              }}
              type="button"
            >
              Clear listed local data
            </button>
            <button
              onClick={() => {
                setReviewing(false);
                setResult(null);
                setCancelled(true);
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            setCancelled(false);
            setReviewing(true);
          }}
          type="button"
        >
          Review local data reset
        </button>
      )}
      <p
        aria-atomic="true"
        aria-live={result?.failed.length ? "assertive" : "polite"}
        className="site-local-data__status"
        role={result?.failed.length ? "alert" : "status"}
      >
        {status}
      </p>
    </section>
  );
}
