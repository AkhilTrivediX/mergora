"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import {
  buildStateLabSearch,
  defaultStateLabConfiguration,
  parseStateLabSearch,
  resolveStateLabStoryIds,
  STATE_LAB_GLOBAL_CONTROLS,
  stateLabGlobals,
  stateLabStoryForConfiguration,
  type StateLabConfiguration,
  type StateLabModel,
  type StateLabStory,
} from "./state-lab-model";

const BASE_PATH = process.env.NEXT_PUBLIC_MERGORA_BASE_PATH ?? "";

function qualityLabPath(pathname: string): string {
  return `${BASE_PATH}/quality-lab/${pathname}`;
}

function configurationForStory(
  current: StateLabConfiguration,
  story: StateLabStory,
): StateLabConfiguration {
  return {
    ...current,
    stateId: story.kind === "state" ? story.stateId : null,
    story: story.kind,
  };
}

function pointerText(story: StateLabStory): string {
  if (story.pointer === null) return "No validated source pointer";
  return `${story.pointer.modulePath}#${story.pointer.exportName}`;
}

function isSelected(configuration: StateLabConfiguration, story: StateLabStory): boolean {
  return (
    configuration.story === story.kind &&
    (story.kind !== "state" || configuration.stateId === story.stateId)
  );
}

export function StateLab({ model }: { readonly model: StateLabModel }) {
  const [configuration, setConfiguration] = useState(defaultStateLabConfiguration);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [issues, setIssues] = useState<readonly string[]>([]);
  const [resolvedIds, setResolvedIds] = useState<Readonly<Record<string, string | null>> | null>(
    null,
  );
  const [shouldLoadPreview, setShouldLoadPreview] = useState(false);
  const stateLabRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const syncFromUrl = () => {
      const parsed = parseStateLabSearch(window.location.search, model);
      setConfiguration(parsed.configuration);
      setIssues(parsed.issues);
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [model]);

  useEffect(() => {
    const boundary = stateLabRef.current;
    if (boundary === null) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoadPreview(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting !== true) return;
      setShouldLoadPreview(true);
      observer.disconnect();
    });
    observer.observe(boundary);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoadPreview) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(qualityLabPath("index.json"), {
          cache: "force-cache",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Quality Lab index returned ${String(response.status)}.`);
        const index: unknown = await response.json();
        setResolvedIds(resolveStateLabStoryIds(index, model));
      } catch (reason) {
        if (controller.signal.aborted) return;
        setIndexError(
          reason instanceof Error ? reason.message : "Quality Lab index could not be loaded.",
        );
      }
    };
    void load();
    return () => controller.abort();
  }, [model, shouldLoadPreview]);

  const selectedStory = stateLabStoryForConfiguration(model, configuration);
  const selectedStoryId = selectedStory === null ? null : resolvedIds?.[selectedStory.key];
  const globals = useMemo(() => stateLabGlobals(configuration), [configuration]);
  const iframeSource =
    selectedStoryId === null || selectedStoryId === undefined
      ? null
      : `${qualityLabPath("iframe.html")}?id=${encodeURIComponent(selectedStoryId)}&viewMode=story&globals=${encodeURIComponent(globals)}`;
  const qualityLabSource =
    selectedStoryId === null || selectedStoryId === undefined
      ? null
      : `${qualityLabPath("index.html")}?path=/story/${encodeURIComponent(selectedStoryId)}&globals=${encodeURIComponent(globals)}`;

  const replaceConfiguration = (next: StateLabConfiguration, mode: "push" | "replace") => {
    const url = new URL(window.location.href);
    url.search = buildStateLabSearch(model, next, url.search);
    url.hash = "state-lab";
    window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
    setConfiguration(next);
    setIssues([]);
  };

  const storyHref = (story: StateLabStory): string => {
    const next = configurationForStory(configuration, story);
    return `${buildStateLabSearch(model, next)}#state-lab`;
  };

  const activateStory = (event: MouseEvent<HTMLAnchorElement>, story: StateLabStory) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    replaceConfiguration(configurationForStory(configuration, story), "push");
  };

  const primaryStories = [model.basic, model.recommended] as const;

  return (
    <section
      className="state-lab"
      data-selected-story={selectedStory?.key ?? "none"}
      data-state-inventory-status={model.inventoryStatus}
      id="state-lab"
      ref={stateLabRef}
    >
      <header className="state-lab__header">
        <div>
          <p className="site-eyebrow">Catalog State Lab</p>
          <h2>Inspect recorded states without inventing coverage.</h2>
          <p>
            Basic, Recommended, and state rows below come from the generated documentation contract.
            A preview opens only after its exact source pointer resolves in the compiled Quality
            Lab.
          </p>
        </div>
        <dl>
          <div>
            <dt>State inventory</dt>
            <dd>{model.inventoryStatus.replaceAll("-", " ")}</dd>
          </div>
          <div>
            <dt>Recorded states</dt>
            <dd>{model.states.length}</dd>
          </div>
          <div>
            <dt>Authority</dt>
            <dd>
              <code>{model.inventorySourcePath ?? "No state-applicability source"}</code>
            </dd>
          </div>
        </dl>
      </header>

      {model.inventoryStatus === "available" ? null : (
        <div className="state-lab__inventory-unavailable" role="status">
          <strong>State inventory unavailable</strong>
          <p>{model.inventoryReason ?? "No state-applicability rationale is recorded."}</p>
        </div>
      )}

      <div className="state-lab__workbench">
        <aside aria-label={`${model.displayName} State Lab configuration`}>
          <nav aria-label={`${model.displayName} primary specimens`}>
            <h3>Reference specimens</h3>
            <ul className="state-lab__story-list">
              {primaryStories.map((story) => (
                <li data-availability={story.availability} key={story.key}>
                  <a
                    aria-current={isSelected(configuration, story) ? "true" : undefined}
                    href={storyHref(story)}
                    onClick={(event) => activateStory(event, story)}
                  >
                    <strong>{story.label}</strong>
                    <code>{pointerText(story)}</code>
                    <span>
                      {story.mode?.replaceAll("-", " ") ??
                        story.evidenceStatus.replaceAll("-", " ")}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <fieldset className="state-lab__globals">
            <legend>Verified Storybook globals</legend>
            <p>
              These environment controls match Storybook global controls. Component enhancement
              arguments stay in Storybook and are not presented as disabled-output proof here.
            </p>
            <div>
              {STATE_LAB_GLOBAL_CONTROLS.map((control) => (
                <label key={control.storybookKey}>
                  <span>{control.label}</span>
                  <select
                    onChange={(event) =>
                      replaceConfiguration(
                        {
                          ...configuration,
                          controls: {
                            ...configuration.controls,
                            [control.storybookKey]: event.currentTarget.value,
                          },
                        },
                        "replace",
                      )
                    }
                    value={configuration.controls[control.storybookKey]}
                  >
                    {control.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>

          <button
            className="state-lab__reset"
            onClick={() => replaceConfiguration(defaultStateLabConfiguration(), "replace")}
            type="button"
          >
            Reset State Lab
          </button>
          {issues.length === 0 ? null : (
            <div className="state-lab__issues" role="status">
              <strong>URL adjustments</strong>
              <ul>
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <div className="state-lab__preview">
          <header>
            <div>
              <span>Selected record</span>
              <h3>{selectedStory?.label ?? "No recorded story"}</h3>
              <code>
                {selectedStory === null ? "No source pointer" : pointerText(selectedStory)}
              </code>
            </div>
            {qualityLabSource === null ? null : (
              <a href={qualityLabSource}>Open exact story in Quality Lab</a>
            )}
          </header>
          <div className="state-lab__canvas" data-viewport={configuration.controls.viewportMode}>
            {selectedStory === null || selectedStory.availability === "unavailable" ? (
              <div className="state-lab__preview-status" role="status">
                <strong>Preview unavailable</strong>
                <p>
                  {selectedStory?.unavailableReason ??
                    "The URL does not identify a recorded State Lab story."}
                </p>
              </div>
            ) : indexError !== null ? (
              <div className="state-lab__preview-status" role="alert">
                <strong>Compiled preview unavailable</strong>
                <p>
                  {indexError} The static source pointer and applicability record remain visible.
                </p>
              </div>
            ) : resolvedIds !== null && selectedStoryId === null ? (
              <div className="state-lab__preview-status" role="alert">
                <strong>Stale story pointer</strong>
                <p>
                  The exact module and export did not resolve in the compiled Quality Lab. No
                  substitute story was selected.
                </p>
              </div>
            ) : iframeSource === null ? (
              <p aria-live="polite" className="state-lab__preview-status">
                {shouldLoadPreview
                  ? "Resolving the exact story pointer…"
                  : "Preview loads when this State Lab enters view."}
              </p>
            ) : (
              <iframe
                key={iframeSource}
                loading="lazy"
                referrerPolicy="no-referrer"
                sandbox="allow-forms allow-modals allow-same-origin allow-scripts"
                src={iframeSource}
                title={`${model.displayName} ${selectedStory.label} State Lab preview`}
              />
            )}
          </div>
          <details className="state-lab__security">
            <summary>Embedded preview security boundary</summary>
            <p>
              The iframe loads Mergora’s reviewed, same-origin static Storybook build. Scripts and
              same-origin access are required by that module runtime; forms and modal examples are
              allowed. Top navigation, downloads, popups, and pointer lock are not granted. Because
              scripts and same-origin access are both required, this sandbox is capability
              restriction, not hostile-code isolation.
            </p>
          </details>
        </div>
      </div>

      <section
        aria-labelledby={`${model.itemId}-state-inventory-title`}
        className="state-lab__inventory"
      >
        <header>
          <div>
            <h3 id={`${model.itemId}-state-inventory-title`}>State applicability inventory</h3>
            <p>Every row preserves the generated applicability value and exact rationale.</p>
          </div>
          <a href={`#${model.itemId}-state-inventory-title`}>Link to this inventory</a>
        </header>
        {model.states.length === 0 ? (
          <p className="state-lab__empty">
            No state rows are declared. Basic and Recommended pointers above remain separate from
            state-applicability evidence.
          </p>
        ) : (
          <ul>
            {model.states.map((state) => {
              const story =
                state.story ??
                ({
                  availability: "unavailable",
                  evidenceStatus: state.applicability,
                  key: `state:${state.id}`,
                  kind: "state",
                  label: state.label,
                  matrixStatus: null,
                  mode: null,
                  pointer: null,
                  stateId: state.id,
                  unavailableReason: state.rationale,
                } satisfies StateLabStory);
              return (
                <li
                  data-applicability={state.applicability}
                  data-story-status={story.evidenceStatus}
                  id={`state-lab-state-${state.id}`}
                  key={state.id}
                >
                  <div>
                    <a
                      aria-current={isSelected(configuration, story) ? "true" : undefined}
                      href={storyHref(story)}
                      onClick={(event) => activateStory(event, story)}
                    >
                      {state.label}
                    </a>
                    <span>{state.applicability.replaceAll("-", " ")}</span>
                  </div>
                  {story.pointer === null ? null : <code>{pointerText(story)}</code>}
                  {state.rationale === null ? null : <p>{state.rationale}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
