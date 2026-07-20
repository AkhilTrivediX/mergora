"use client";

import { useState } from "react";

interface ApiProp {
  readonly controlledPair: string | null;
  readonly defaultStatus: string;
  readonly defaultValue: string | null;
  readonly description: string | null;
  readonly localizationBehavior: string;
  readonly name: string;
  readonly owner: string;
  readonly required: boolean;
  readonly runtimeBoundary: string;
  readonly semanticContract: string;
  readonly sourcePath: string;
  readonly type: string;
}

interface ApiPropGroup {
  readonly declarationKind: string;
  readonly heritage: readonly string[];
  readonly name: string;
  readonly sourcePath: string;
  readonly typeParameters: readonly string[];
}

interface ApiEntry {
  readonly exports: readonly string[];
  readonly groups: readonly ApiPropGroup[];
  readonly id: string;
  readonly message: string;
  readonly props: readonly ApiProp[];
  readonly summary: {
    readonly describedProps: number;
    readonly propGroups: number;
    readonly props: number;
    readonly runtimeDefaults: number;
  };
}

interface ItemDocument {
  readonly api?: ApiEntry | null;
}

const BASE_PATH = process.env.NEXT_PUBLIC_MERGORA_BASE_PATH ?? "";

function statusLabel(value: string): string {
  return value.replaceAll("-", " ");
}

function isApiEntry(value: unknown, id: string): value is ApiEntry {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<ApiEntry>;
  return (
    candidate.id === id &&
    Array.isArray(candidate.exports) &&
    Array.isArray(candidate.groups) &&
    Array.isArray(candidate.props) &&
    candidate.summary !== null &&
    typeof candidate.summary === "object"
  );
}

export function DeferredApiReference({ id }: { readonly id: string }) {
  const [api, setApi] = useState<ApiEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadReference(): Promise<void> {
    if (loading || api !== null) return;
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`${BASE_PATH}/m/v1/items/${encodeURIComponent(id)}.json`, {
        cache: "force-cache",
      });
      if (!response.ok) throw new Error(`The generated item document returned ${response.status}.`);
      const document: unknown = await response.json();
      const entry = (document as ItemDocument | null)?.api;
      if (!isApiEntry(entry, id)) {
        throw new Error("The generated item document did not contain a matching API reference.");
      }
      setApi(entry);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The API reference could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  if (api === null) {
    return (
      <div className="deferred-api-reference">
        <p>
          Load the complete generated prop reference when you need source ownership, defaults, and
          semantic contract details. It is kept out of the initial documentation payload so dense
          component pages stay responsive on constrained devices.
        </p>
        <button aria-busy={loading || undefined} onClick={() => void loadReference()} type="button">
          {loading ? "Loading API reference" : "Load complete API reference"}
        </button>
        {error === null ? null : (
          <p role="alert">
            {error} Try loading the reference again, or use the machine-readable item document.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="deferred-api-reference" data-loaded="true">
      <section aria-labelledby="source-anatomy-title" className="item-api-source-anatomy">
        <h3 id="source-anatomy-title">Generated source anatomy</h3>
        <dl className="item-artifacts">
          {api.groups.map((group) => (
            <div key={group.name}>
              <dt>{group.name}</dt>
              <dd>
                <code>{group.sourcePath}</code>
                {group.heritage.length === 0
                  ? " · locally declared surface"
                  : ` · inherits ${group.heritage.join(" & ")}`}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <p>{api.message}</p>
      <p>
        Exports: <code>{api.exports.join(", ") || "None recorded"}</code>
      </p>
      <p>
        {api.summary.propGroups} public prop {api.summary.propGroups === 1 ? "surface" : "surfaces"}
        , {api.summary.props} declared props, {api.summary.describedProps} with source descriptions,
        and {api.summary.runtimeDefaults} runtime defaults were extracted deterministically.
      </p>
      {api.groups.map((group) => {
        const props = api.props.filter((prop) => prop.owner === group.name);
        return (
          <section className="item-api-group" key={group.name}>
            <header>
              <div>
                <h3>{group.name}</h3>
                <code>
                  {group.declarationKind}
                  {group.typeParameters.length > 0 ? `<${group.typeParameters.join(", ")}>` : ""}
                </code>
              </div>
              <small>{group.sourcePath}</small>
            </header>
            {group.heritage.length > 0 ? (
              <p>
                Inherits: <code>{group.heritage.join(" & ")}</code>
              </p>
            ) : null}
            {props.length === 0 ? (
              <p>
                This part adds no locally declared props; its inherited public surface is shown
                above.
              </p>
            ) : (
              <div
                aria-label={`${group.name} API table, scrollable when needed`}
                className="item-api-table-scroll"
                role="region"
                tabIndex={0}
              >
                <table className="item-api-table">
                  <caption>{group.name} declared prop reference</caption>
                  <thead>
                    <tr>
                      <th scope="col">Prop</th>
                      <th scope="col">Type</th>
                      <th scope="col">Default</th>
                      <th scope="col">Contract signals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.map((prop) => (
                      <tr key={prop.name}>
                        <th data-label="Prop" scope="row">
                          <code>{prop.name}</code>
                          <span>{prop.description ?? "Curated description requires review."}</span>
                        </th>
                        <td data-label="Type">
                          <code>{prop.type}</code>
                        </td>
                        <td data-label="Default">
                          <code>
                            {prop.defaultValue ?? (prop.required ? "required" : prop.defaultStatus)}
                          </code>
                        </td>
                        <td data-label="Contract signals">
                          <span>{statusLabel(prop.runtimeBoundary)}</span>
                          <span>{statusLabel(prop.semanticContract)}</span>
                          <span>{statusLabel(prop.localizationBehavior)}</span>
                          {prop.controlledPair === null ? null : (
                            <span>
                              paired with <code>{prop.controlledPair}</code>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
