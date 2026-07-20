"use client";

import { Button } from "mergora-ui/button";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import { parseCssColor } from "../quality-lens-model";
import { SITE_THEME_EVENT } from "../site-controls";
import {
  canonicalStudioState,
  changedStudioTokens,
  clearStudioLocalData,
  DEFAULT_STUDIO_STATE,
  MAX_STUDIO_IMPORT_BYTES,
  migrateStudioState,
  parseStudioShareFragment,
  parseStudioImport,
  STUDIO_KEY,
  STUDIO_STORAGE_KEYS,
  studioExportValue,
  studioGuardrails,
  studioShareFragment,
  type StudioDensity,
  type StudioExportKind,
  type StudioLocale,
  type StudioMotion,
  type StudioPreviewState,
  type StudioState,
  type StudioTheme,
  type StudioViewport,
} from "./studio-model";

type ControlCategory = "color" | "context" | "shape" | "type";

interface StudioHistory {
  readonly future: readonly StudioState[];
  readonly past: readonly StudioState[];
  readonly present: StudioState;
}

const DEFAULT_HISTORY: StudioHistory = {
  future: [],
  past: [],
  present: DEFAULT_STUDIO_STATE,
};

const themePresets: Record<StudioTheme, Partial<StudioState>> = {
  dark: {
    actionBackground: "#a7f3d0",
    actionForeground: "#102018",
    focusColor: "#c4b5fd",
    surface: "#111815",
    text: "#f5f7f5",
    theme: "dark",
  },
  enhanced: {
    actionBackground: "#000000",
    actionForeground: "#ffffff",
    borderWidth: 2,
    controlHeight: 44,
    focusColor: "#4c1d95",
    surface: "#ffffff",
    text: "#000000",
    theme: "enhanced",
  },
  light: {
    actionBackground: DEFAULT_STUDIO_STATE.actionBackground,
    actionForeground: DEFAULT_STUDIO_STATE.actionForeground,
    borderWidth: DEFAULT_STUDIO_STATE.borderWidth,
    focusColor: DEFAULT_STUDIO_STATE.focusColor,
    surface: DEFAULT_STUDIO_STATE.surface,
    text: DEFAULT_STUDIO_STATE.text,
    theme: "light",
  },
};

function ColorControl({
  id,
  label,
  onCommit,
  resetValue,
  value,
}: {
  readonly id: string;
  readonly label: string;
  readonly onCommit: (value: string) => void;
  readonly resetValue: string;
  readonly value: string;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const parsed = parseCssColor(draft);
    if (parsed === null || parsed.alpha !== 1) {
      setError("Use an opaque hex, rgb, or oklch color.");
      return;
    }
    setError("");
    onCommit(draft.trim().toLocaleLowerCase());
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      setDraft(value);
      setError("");
      event.currentTarget.blur();
    }
  };
  return (
    <div className="studio-token-control">
      <label htmlFor={id}>{label}</label>
      <div>
        <span aria-hidden="true" style={{ background: value }} />
        <input
          aria-describedby={error === "" ? undefined : `${id}-error`}
          id={id}
          onBlur={commit}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          value={draft}
        />
        <Button
          aria-label={`Reset ${label}`}
          onClick={() => {
            setDraft(resetValue);
            setError("");
            onCommit(resetValue);
          }}
          size="small"
          type="button"
          variant="quiet"
        >
          Reset
        </Button>
      </div>
      {error === "" ? null : (
        <span id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function valuesEqual(left: StudioState, right: StudioState): boolean {
  return canonicalStudioState(left) === canonicalStudioState(right);
}

export function StudioWorkbench() {
  const [history, setHistory] = useState<StudioHistory>(DEFAULT_HISTORY);
  const [category, setCategory] = useState<ControlCategory>("color");
  const [exportKind, setExportKind] = useState<StudioExportKind>("css");
  const [importDraft, setImportDraft] = useState("");
  const [importError, setImportError] = useState("");
  const [message, setMessage] = useState("");
  const [recovery, setRecovery] = useState("");
  const state = history.present;
  const siteThemePreference = useRef<"dark" | "light" | "system">("system");
  const externalThemeUpdate = useRef<"dark" | "light" | null>(null);
  const previousStudioTheme = useRef<StudioTheme>(state.theme);
  const skipPersistenceForState = useRef<string | null>(null);

  const replaceState = (next: StudioState) => {
    setHistory({ future: [], past: [], present: next });
  };
  const commit = (patch: Partial<StudioState>) => {
    setHistory((current) => {
      const changedGuardrailInput = Object.keys(patch).some(
        (key) => key !== "acknowledgedWarnings",
      );
      const next = {
        ...current.present,
        ...patch,
        acknowledgedWarnings: changedGuardrailInput
          ? false
          : (patch.acknowledgedWarnings ?? current.present.acknowledgedWarnings),
      };
      if (valuesEqual(current.present, next)) return current;
      return {
        future: [],
        past: [...current.past.slice(-49), current.present],
        present: next,
      };
    });
  };

  useEffect(() => {
    const loadLocationState = () => {
      const hash = window.location.hash;
      const shared = parseStudioShareFragment(hash);
      if (hash !== "" && shared === null) {
        replaceState(DEFAULT_STUDIO_STATE);
        setRecovery(
          "The shared Studio state was invalid, oversized, or unsupported. Safe defaults were restored.",
        );
        return;
      }
      if (shared !== null) {
        replaceState(shared);
        setRecovery(
          hash.startsWith("#v1.")
            ? "A legacy Studio link was migrated locally to schema v2."
            : "The checked Studio state from this link was restored locally.",
        );
        return;
      }
      try {
        let restored: StudioState | null = null;
        let restoredKey: (typeof STUDIO_STORAGE_KEYS)[number] | null = null;
        for (const key of STUDIO_STORAGE_KEYS) {
          const stored = window.localStorage.getItem(key);
          if (stored === null) continue;
          try {
            restored = migrateStudioState(JSON.parse(stored) as unknown);
          } catch {
            restored = null;
          }
          if (restored !== null) {
            restoredKey = key;
            break;
          }
        }
        if (restored !== null) {
          replaceState(restored);
          setRecovery(
            restoredKey === STUDIO_KEY
              ? "A schema-validated local Studio draft was recovered."
              : "A legacy local Studio draft was validated and migrated in memory.",
          );
        }
      } catch {
        setRecovery("Local recovery was unavailable; Studio remains usable for this page session.");
      }
    };
    loadLocationState();
    window.addEventListener("hashchange", loadLocationState);
    return () => window.removeEventListener("hashchange", loadLocationState);
  }, []);

  useEffect(() => {
    const storedPreference = window.localStorage.getItem("mergora.site.theme.v1");
    if (
      storedPreference === "dark" ||
      storedPreference === "light" ||
      storedPreference === "system"
    ) {
      siteThemePreference.current = storedPreference;
    }
    const updateTheme = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          readonly preference?: unknown;
          readonly source?: unknown;
          readonly theme?: unknown;
        }>
      ).detail;
      if (detail?.source === "studio") return;
      const next = detail?.theme;
      if (next === "light" || next === "dark") {
        const preference = detail?.preference;
        siteThemePreference.current =
          preference === "light" || preference === "dark" || preference === "system"
            ? preference
            : next;
        externalThemeUpdate.current = next;
        commit(themePresets[next]);
      }
    };
    window.addEventListener(SITE_THEME_EVENT, updateTheme);
    return () => window.removeEventListener(SITE_THEME_EVENT, updateTheme);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const baseTheme = state.theme === "dark" ? "dark" : "light";
    const themeChanged = previousStudioTheme.current !== state.theme;
    const external = themeChanged && externalThemeUpdate.current === state.theme;
    if (themeChanged && !external) siteThemePreference.current = baseTheme;
    previousStudioTheme.current = state.theme;
    externalThemeUpdate.current = null;
    const preference = siteThemePreference.current;
    if (preference === "system") {
      delete root.dataset.theme;
      root.style.colorScheme = "light dark";
    } else {
      root.dataset.theme = preference;
      root.style.colorScheme = preference;
    }
    root.dataset.themePreference = preference;
    root.dataset.density = state.density;
    if (state.theme === "enhanced") root.dataset.contrast = "enhanced";
    else delete root.dataset.contrast;
    window.dispatchEvent(
      new CustomEvent(SITE_THEME_EVENT, {
        detail: { preference, source: "studio", theme: baseTheme },
      }),
    );
    try {
      const canonical = canonicalStudioState(state);
      if (skipPersistenceForState.current === canonical) {
        skipPersistenceForState.current = null;
      } else {
        skipPersistenceForState.current = null;
        window.localStorage.setItem(STUDIO_KEY, JSON.stringify(state));
      }
      window.localStorage.setItem("mergora.site.theme.v1", preference);
    } catch {
      // Persistence is optional; editing and export remain local to the mounted page.
    }
  }, [state]);

  const changed = useMemo(() => changedStudioTokens(state), [state]);
  const guardrails = useMemo(() => studioGuardrails(state), [state]);
  const errors = guardrails.filter(({ severity }) => severity === "error");
  const warnings = guardrails.filter(({ severity }) => severity === "warning");
  const exportBlocked = errors.length > 0 || (warnings.length > 0 && !state.acknowledgedWarnings);
  const exported = useMemo(() => studioExportValue(exportKind, state), [exportKind, state]);
  const previewStyle = {
    "--mrg-component-button-primary-background": state.actionBackground,
    "--mrg-component-button-primary-border": state.actionBackground,
    "--mrg-component-button-primary-foreground": state.actionForeground,
    "--mrg-component-button-primary-height": `${String(state.controlHeight)}px`,
    "--mrg-component-button-primary-radius": `${String(state.radius)}px`,
    "--mrg-semantic-color-action-background": state.actionBackground,
    "--mrg-semantic-color-action-border": state.actionBackground,
    "--mrg-semantic-color-action-foreground": state.actionForeground,
    "--studio-action": state.actionBackground,
    "--studio-action-foreground": state.actionForeground,
    "--studio-border": `${String(state.borderWidth)}px`,
    "--studio-control-height": `${String(state.controlHeight)}px`,
    "--studio-focus": state.focusColor,
    "--studio-font-scale": `${String(state.fontScale)}%`,
    "--studio-motion": `${String(state.motionDuration)}ms`,
    "--studio-radius": `${String(state.radius)}px`,
    "--studio-space-scale": String(state.spacingScale / 100),
    "--studio-surface": state.surface,
    "--studio-text": state.text,
  } as CSSProperties;

  const share = async () => {
    const fragment = studioShareFragment(state);
    if (fragment === null) {
      setMessage("This preset is too large to share safely.");
      return;
    }
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${fragment}`,
    );
    try {
      await window.navigator.clipboard.writeText(window.location.href);
      setMessage("Checksummed Studio v2 URL copied; the fragment is not sent in HTTP requests.");
    } catch {
      setMessage("Checksummed Studio v2 URL is ready in the address bar.");
    }
  };

  const copyExport = async () => {
    if (exportBlocked) return;
    try {
      await navigator.clipboard.writeText(exported);
      setMessage(`${exportKind} export copied with schema, compatibility, and checksum metadata.`);
    } catch {
      setMessage("Clipboard access is unavailable. The read-only export remains selectable.");
    }
  };

  const downloadExport = () => {
    if (exportBlocked) return;
    const extension =
      exportKind === "css" || exportKind === "tailwind"
        ? "css"
        : exportKind === "typescript"
          ? "ts"
          : "json";
    const type =
      extension === "css"
        ? "text/css"
        : extension === "ts"
          ? "text/typescript"
          : "application/json";
    const url = URL.createObjectURL(new Blob([exported], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mergora-studio-preset.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("A local export file was prepared. No preset data was uploaded.");
  };

  const applyImport = () => {
    const result = parseStudioImport(importDraft);
    if (!result.ok) {
      setImportError(result.message);
      setMessage("Import rejected. The current Studio state and history were not changed.");
      return;
    }
    replaceState(result.state);
    setImportError("");
    setRecovery("");
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    setMessage(
      `${result.format} export imported locally after schema, checksum, context, and token validation.`,
    );
  };

  const chooseImportFile = async (file: File | undefined) => {
    if (file === undefined) return;
    if (file.size > MAX_STUDIO_IMPORT_BYTES) {
      setImportError(
        `The selected file exceeds the ${String(MAX_STUDIO_IMPORT_BYTES / 1_024)} KiB local import limit.`,
      );
      return;
    }
    try {
      const value = await file.text();
      if (new TextEncoder().encode(value).byteLength > MAX_STUDIO_IMPORT_BYTES) {
        setImportError(
          `The selected file exceeds the ${String(MAX_STUDIO_IMPORT_BYTES / 1_024)} KiB local import limit.`,
        );
        return;
      }
      setImportDraft(value);
      setImportError("");
      setMessage("The local file is staged for review. Apply it to run strict validation.");
    } catch {
      setImportError("The selected local file could not be read. No Studio state was changed.");
    }
  };

  const clearLocalData = () => {
    try {
      clearStudioLocalData(window.localStorage);
    } catch {
      setMessage("Local Studio data could not be cleared. The current state remains unchanged.");
      return;
    }
    skipPersistenceForState.current = canonicalStudioState(DEFAULT_STUDIO_STATE);
    externalThemeUpdate.current = "light";
    replaceState(DEFAULT_STUDIO_STATE);
    setImportDraft("");
    setImportError("");
    setRecovery("");
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    setMessage(
      "Local Studio v1/v2 drafts were cleared and this session was reset. Site theme and unrelated local data were preserved.",
    );
  };

  const resetCategory = () => {
    if (category === "color") {
      commit({
        actionBackground: DEFAULT_STUDIO_STATE.actionBackground,
        actionForeground: DEFAULT_STUDIO_STATE.actionForeground,
        focusColor: DEFAULT_STUDIO_STATE.focusColor,
        surface: DEFAULT_STUDIO_STATE.surface,
        text: DEFAULT_STUDIO_STATE.text,
      });
    } else if (category === "shape") {
      commit({
        borderWidth: DEFAULT_STUDIO_STATE.borderWidth,
        controlHeight: DEFAULT_STUDIO_STATE.controlHeight,
        motion: DEFAULT_STUDIO_STATE.motion,
        motionDuration: DEFAULT_STUDIO_STATE.motionDuration,
        radius: DEFAULT_STUDIO_STATE.radius,
      });
    } else if (category === "type") {
      commit({
        fontScale: DEFAULT_STUDIO_STATE.fontScale,
        spacingScale: DEFAULT_STUDIO_STATE.spacingScale,
      });
    } else {
      commit({
        density: DEFAULT_STUDIO_STATE.density,
        direction: DEFAULT_STUDIO_STATE.direction,
        forcedColorsSimulation: DEFAULT_STUDIO_STATE.forcedColorsSimulation,
        locale: DEFAULT_STUDIO_STATE.locale,
        previewState: DEFAULT_STUDIO_STATE.previewState,
        theme: DEFAULT_STUDIO_STATE.theme,
        viewport: DEFAULT_STUDIO_STATE.viewport,
      });
    }
  };

  return (
    <div className="studio-workbench">
      {recovery === "" ? null : (
        <p className="studio-workbench__recovery" role="status">
          {recovery}
        </p>
      )}
      <div className="studio-workbench__layout">
        <form className="studio-workbench__controls" onSubmit={(event) => event.preventDefault()}>
          <div className="studio-workbench__history">
            <Button
              disabled={history.past.length === 0}
              onClick={() =>
                setHistory((current) => {
                  const previous = current.past.at(-1);
                  return previous === undefined
                    ? current
                    : {
                        future: [current.present, ...current.future],
                        past: current.past.slice(0, -1),
                        present: previous,
                      };
                })
              }
              size="small"
              type="button"
              variant="quiet"
            >
              Undo
            </Button>
            <Button
              disabled={history.future.length === 0}
              onClick={() =>
                setHistory((current) => {
                  const next = current.future[0];
                  return next === undefined
                    ? current
                    : {
                        future: current.future.slice(1),
                        past: [...current.past, current.present],
                        present: next,
                      };
                })
              }
              size="small"
              type="button"
              variant="quiet"
            >
              Redo
            </Button>
            <span>{changed.length} changed tokens</span>
          </div>
          <label>
            <span>Theme</span>
            <select
              onChange={(event) => commit(themePresets[event.currentTarget.value as StudioTheme])}
              value={state.theme}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="enhanced">Enhanced contrast</option>
            </select>
          </label>
          <label>
            <span>Token category</span>
            <select
              onChange={(event) => setCategory(event.currentTarget.value as ControlCategory)}
              value={category}
            >
              <option value="color">Color and focus</option>
              <option value="type">Typography and spacing</option>
              <option value="shape">Shape, density, and motion</option>
              <option value="context">Preview context</option>
            </select>
          </label>

          {category === "color" ? (
            <fieldset>
              <legend>Semantic color roles</legend>
              <ColorControl
                id="studio-surface"
                label="Surface"
                onCommit={(surface) => commit({ surface })}
                resetValue={DEFAULT_STUDIO_STATE.surface}
                value={state.surface}
              />
              <ColorControl
                id="studio-text"
                label="Primary text"
                onCommit={(text) => commit({ text })}
                resetValue={DEFAULT_STUDIO_STATE.text}
                value={state.text}
              />
              <ColorControl
                id="studio-action"
                label="Action background"
                onCommit={(actionBackground) => commit({ actionBackground })}
                resetValue={DEFAULT_STUDIO_STATE.actionBackground}
                value={state.actionBackground}
              />
              <ColorControl
                id="studio-action-text"
                label="Action foreground"
                onCommit={(actionForeground) => commit({ actionForeground })}
                resetValue={DEFAULT_STUDIO_STATE.actionForeground}
                value={state.actionForeground}
              />
              <ColorControl
                id="studio-focus"
                label="Focus indicator"
                onCommit={(focusColor) => commit({ focusColor })}
                resetValue={DEFAULT_STUDIO_STATE.focusColor}
                value={state.focusColor}
              />
            </fieldset>
          ) : null}

          {category === "type" ? (
            <fieldset>
              <legend>Typography and spacing</legend>
              <label>
                <span>Font scale: {state.fontScale}%</span>
                <input
                  max={150}
                  min={80}
                  onChange={(event) => commit({ fontScale: Number(event.currentTarget.value) })}
                  type="number"
                  value={state.fontScale}
                />
              </label>
              <label>
                <span>Spacing scale: {state.spacingScale}%</span>
                <input
                  max={150}
                  min={75}
                  onChange={(event) => commit({ spacingScale: Number(event.currentTarget.value) })}
                  type="number"
                  value={state.spacingScale}
                />
              </label>
              <p>Schibsted Grotesk and Commit Mono remain the canonical measured font families.</p>
            </fieldset>
          ) : null}

          {category === "shape" ? (
            <fieldset>
              <legend>Shape, density, and motion</legend>
              <label>
                <span>Surface radius: {state.radius}px</span>
                <input
                  max={16}
                  min={0}
                  onChange={(event) => commit({ radius: Number(event.currentTarget.value) })}
                  step={1}
                  type="range"
                  value={state.radius}
                />
              </label>
              <label>
                <span>Border width: {state.borderWidth}px</span>
                <input
                  max={3}
                  min={1}
                  onChange={(event) => commit({ borderWidth: Number(event.currentTarget.value) })}
                  type="number"
                  value={state.borderWidth}
                />
              </label>
              <label>
                <span>Control height: {state.controlHeight}px</span>
                <input
                  max={64}
                  min={24}
                  onChange={(event) => commit({ controlHeight: Number(event.currentTarget.value) })}
                  type="number"
                  value={state.controlHeight}
                />
              </label>
              <label>
                <span>Motion preference</span>
                <select
                  onChange={(event) =>
                    commit({ motion: event.currentTarget.value as StudioMotion })
                  }
                  value={state.motion}
                >
                  <option value="standard">Standard</option>
                  <option value="reduced">Reduced</option>
                </select>
              </label>
              <label>
                <span>Motion duration: {state.motionDuration}ms</span>
                <input
                  max={1000}
                  min={0}
                  onChange={(event) =>
                    commit({ motionDuration: Number(event.currentTarget.value) })
                  }
                  type="number"
                  value={state.motionDuration}
                />
              </label>
            </fieldset>
          ) : null}

          {category === "context" ? (
            <fieldset>
              <legend>Preview context</legend>
              <label>
                <span>Density</span>
                <select
                  onChange={(event) => {
                    const density = event.currentTarget.value as StudioDensity;
                    commit({
                      controlHeight: density === "touch" ? 44 : density === "compact" ? 32 : 40,
                      density,
                    });
                  }}
                  value={state.density}
                >
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                  <option value="touch">Touch</option>
                </select>
              </label>
              <label>
                <span>Viewport</span>
                <select
                  onChange={(event) =>
                    commit({ viewport: event.currentTarget.value as StudioViewport })
                  }
                  value={state.viewport}
                >
                  <option value="wide">Wide</option>
                  <option value="tablet">Tablet</option>
                  <option value="narrow">Narrow</option>
                </select>
              </label>
              <label>
                <span>Direction</span>
                <select
                  onChange={(event) =>
                    commit({ direction: event.currentTarget.value as "ltr" | "rtl" })
                  }
                  value={state.direction}
                >
                  <option value="ltr">Left to right</option>
                  <option value="rtl">Right to left</option>
                </select>
              </label>
              <label>
                <span>Locale</span>
                <select
                  onChange={(event) =>
                    commit({ locale: event.currentTarget.value as StudioLocale })
                  }
                  value={state.locale}
                >
                  {(["en-US", "de-DE", "ar-EG", "he-IL", "ja-JP", "hi-IN"] as const).map(
                    (locale) => (
                      <option key={locale} value={locale}>
                        {locale}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                <span>Prepared state</span>
                <select
                  onChange={(event) =>
                    commit({ previewState: event.currentTarget.value as StudioPreviewState })
                  }
                  value={state.previewState}
                >
                  <option value="default">Default</option>
                  <option value="focus">Focus visible</option>
                  <option value="loading">Loading</option>
                  <option value="error">Error</option>
                </select>
              </label>
              <label className="studio-checkbox-control">
                <input
                  checked={state.forcedColorsSimulation}
                  onChange={(event) =>
                    commit({ forcedColorsSimulation: event.currentTarget.checked })
                  }
                  type="checkbox"
                />
                <span>Forced-colors simulation (not platform evidence)</span>
              </label>
            </fieldset>
          ) : null}

          <div className="studio-workbench__control-actions">
            <Button onClick={resetCategory} type="button" variant="secondary">
              Reset this category
            </Button>
            <Button
              onClick={() => {
                replaceState(DEFAULT_STUDIO_STATE);
                setRecovery("");
                setMessage("Studio defaults restored.");
                window.history.replaceState(null, "", window.location.pathname);
              }}
              type="button"
              variant="quiet"
            >
              Reset all
            </Button>
            <Button onClick={() => void share()} type="button">
              Share checked state
            </Button>
          </div>
          <output aria-live="polite">{message}</output>
        </form>

        <section className="studio-workbench__validation" aria-labelledby="studio-validation-title">
          <header>
            <p className="site-eyebrow">Continuous guardrails</p>
            <h2 id="studio-validation-title">
              {guardrails.length === 0 ? "Prepared checks pass." : "Review before export."}
            </h2>
            <p>
              {errors.length} blocking errors · {warnings.length} warnings · {changed.length}{" "}
              changed tokens
            </p>
          </header>
          {guardrails.length === 0 ? (
            <p className="studio-validation-pass">
              Contrast, focus, target, and prepared matrix rules pass.
            </p>
          ) : (
            <ol>
              {guardrails.map((finding) => (
                <li data-severity={finding.severity} key={finding.id}>
                  <div>
                    <strong>{finding.severity}</strong>
                    <code>{finding.tokenPair ?? finding.id}</code>
                  </div>
                  <p>{finding.message}</p>
                  <small>Affects: {finding.affected.join(", ")}</small>
                </li>
              ))}
            </ol>
          )}
          {warnings.length === 0 ? null : (
            <label className="studio-checkbox-control">
              <input
                checked={state.acknowledgedWarnings}
                disabled={errors.length > 0}
                onChange={(event) => commit({ acknowledgedWarnings: event.currentTarget.checked })}
                type="checkbox"
              />
              <span>Acknowledge the listed custom-preset warnings in export metadata</span>
            </label>
          )}
        </section>

        <section
          className="studio-workbench__preview"
          data-forced-colors={state.forcedColorsSimulation || undefined}
          data-motion={state.motion}
          data-preview-state={state.previewState}
          data-viewport={state.viewport}
          dir={state.direction}
          lang={state.locale}
          style={previewStyle}
        >
          <header>
            <div>
              <span>Public component state rail</span>
              <strong>
                {state.theme} · {state.density} · {state.locale} · {state.direction}
              </strong>
            </div>
            <span>{state.forcedColorsSimulation ? "Simulation only" : "Platform colors"}</span>
          </header>
          <div className="studio-preview-grid">
            <section>
              <h2>Actions and links</h2>
              <Button
                pending={state.previewState === "loading"}
                pendingLabel="Verifying"
                type="button"
              >
                Run verification
              </Button>
              <a href="#studio-export">Inspect export</a>
            </section>
            <section>
              <h2>Field and select</h2>
              <label>
                <span>Registry label</span>
                <input
                  aria-describedby={
                    state.previewState === "error" ? "studio-field-error" : undefined
                  }
                  aria-invalid={state.previewState === "error" || undefined}
                  defaultValue="Core registry"
                />
              </label>
              <label>
                <span>Release channel</span>
                <select defaultValue="core">
                  <option value="core">Core</option>
                  <option value="labs">Labs</option>
                </select>
              </label>
              {state.previewState === "error" ? (
                <p id="studio-field-error">Choose a locally enrolled channel and try again.</p>
              ) : null}
            </section>
            <section>
              <h2>Dialog and tabs</h2>
              <div aria-labelledby="studio-dialog-title" role="dialog">
                <strong id="studio-dialog-title">Prepared confirmation</strong>
                <p>No filesystem change occurs in Studio.</p>
              </div>
              <div aria-label="Evidence view" role="tablist">
                <button aria-selected="true" role="tab" type="button">
                  Contract
                </button>
                <button aria-selected="false" role="tab" type="button">
                  Browser
                </button>
              </div>
            </section>
            <section>
              <h2>Status and toast</h2>
              <p className="studio-preview-status" role="status">
                <strong>
                  {state.previewState === "error" ? "Recovery needed" : "Review required"}
                </strong>
                <span>Manual assistive-technology evidence remains explicit.</span>
              </p>
              <output aria-live="polite">Prepared state changes are announced once.</output>
            </section>
            <section className="studio-preview-data">
              <h2>Data Grid and chart roles</h2>
              <table>
                <caption>Prepared evidence selection</caption>
                <thead>
                  <tr>
                    <th scope="col">Lane</th>
                    <th scope="col">State</th>
                  </tr>
                </thead>
                <tbody>
                  <tr aria-selected="true">
                    <th scope="row">Keyboard</th>
                    <td>Selected</td>
                  </tr>
                  <tr>
                    <th scope="row">Touch</th>
                    <td>Review due</td>
                  </tr>
                </tbody>
              </table>
              <svg aria-labelledby="studio-chart-title" role="img" viewBox="0 0 240 80">
                <title id="studio-chart-title">Evidence counts: automated four, manual two</title>
                <rect height="24" width="180" x="0" y="8" />
                <rect height="24" width="90" x="0" y="48" />
              </svg>
            </section>
          </div>
        </section>
      </div>

      <section className="studio-workbench__export" id="studio-export">
        <header>
          <div>
            <p className="site-eyebrow">Deterministic export</p>
            <h2>Standards-based and locally reproducible.</h2>
            <p>
              State schema v2 · export schema v1 · Mergora &gt;=0.0.0 &lt;1.0.0 · {changed.length}{" "}
              changed tokens
            </p>
          </div>
          <label>
            <span>Format</span>
            <select
              onChange={(event) => setExportKind(event.currentTarget.value as StudioExportKind)}
              value={exportKind}
            >
              <option value="css">Resolved CSS</option>
              <option value="dtcg">Resolved DTCG JSON</option>
              <option value="tailwind">Tailwind v4 integration</option>
              <option value="typescript">TypeScript token names</option>
              <option value="design-tool">Mergora DTCG design-tool interchange</option>
            </select>
          </label>
        </header>
        {exportBlocked ? (
          <p className="studio-workbench__export-blocked" role="alert">
            Export is blocked until errors are fixed and custom-preset warnings are explicitly
            acknowledged.
          </p>
        ) : null}
        <textarea aria-label={`${exportKind} export`} readOnly rows={16} value={exported} />
        <div className="studio-workbench__export-actions">
          <Button disabled={exportBlocked} onClick={() => void copyExport()} type="button">
            Copy export
          </Button>
          <Button
            disabled={exportBlocked}
            onClick={downloadExport}
            type="button"
            variant="secondary"
          >
            Download export
          </Button>
        </div>
        <section aria-labelledby="studio-import-title" className="studio-workbench__import">
          <h3 id="studio-import-title">Restore a checked Studio export</h3>
          <p>
            Paste an unmodified Mergora export or choose one local file. Validation happens in this
            browser; no code runs, no request is made, and a failure cannot partially apply state.
          </p>
          <label>
            <span>Import text</span>
            <textarea
              aria-describedby={
                importError === "" ? "studio-import-help" : "studio-import-help studio-import-error"
              }
              onChange={(event) => {
                setImportDraft(event.currentTarget.value);
                setImportError("");
              }}
              placeholder="Paste a Mergora Studio CSS, Tailwind, TypeScript, DTCG, or design-tool export"
              rows={8}
              spellCheck={false}
              value={importDraft}
            />
          </label>
          <p id="studio-import-help">
            Maximum 128 KiB. Unknown fields, versions, aliases, checksum mismatches, and token/state
            disagreement are rejected.
          </p>
          {importError === "" ? null : (
            <p id="studio-import-error" role="alert">
              {importError}
            </p>
          )}
          <label>
            <span>Choose a local export</span>
            <input
              accept=".css,.json,.ts,text/css,application/json,text/plain,text/typescript"
              onChange={(event) => void chooseImportFile(event.currentTarget.files?.[0])}
              type="file"
            />
          </label>
          <div className="studio-workbench__export-actions">
            <Button onClick={applyImport} type="button" variant="secondary">
              Validate and apply
            </Button>
            <Button
              onClick={() => {
                setImportDraft("");
                setImportError("");
                setMessage("Staged import text cleared. The Studio state was not changed.");
              }}
              type="button"
              variant="quiet"
            >
              Clear staged text
            </Button>
            <Button onClick={clearLocalData} type="button" variant="quiet">
              Clear local Studio data
            </Button>
          </div>
          <p>
            Clear local Studio data removes only <code>{STUDIO_STORAGE_KEYS.join(" and ")}</code>.
          </p>
        </section>
        <div className="studio-workbench__theme-command">
          <span>Review-only theme transaction</span>
          <code>mergora theme apply ./mergora-studio-preset.json --dry-run</code>
        </div>
      </section>
    </div>
  );
}
