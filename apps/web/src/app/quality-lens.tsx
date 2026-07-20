"use client";

import { Button } from "mergora-ui/button";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import {
  compositeColor,
  contrastRatio,
  parseCssColor,
  parseQualityLensModes,
  QUALITY_LENS_MODES,
  type QualityLensFinding,
  type QualityLensMode,
} from "./quality-lens-model";
import { SiteLink as Link } from "./site-link";

const MODE_LABELS: Record<QualityLensMode, string> = {
  "accessible-names": "Accessible names",
  contrast: "Contrast",
  "dynamic-state": "Dynamic state",
  "focus-order": "Focus order",
  motion: "Motion",
  "reflow-bounds": "Reflow bounds",
  semantics: "Semantics",
  "target-size": "Target size",
};
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "summary",
  "[tabindex]",
].join(",");

interface FindingRect {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

interface RenderedFinding extends QualityLensFinding {
  readonly rect?: FindingRect;
}

function visible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    rect.width > 0 &&
    rect.height > 0 &&
    element.closest("[hidden], [inert]") === null
  );
}

function disabled(element: HTMLElement): boolean {
  return (
    (element instanceof HTMLButtonElement && element.disabled) ||
    (element instanceof HTMLInputElement && element.disabled) ||
    (element instanceof HTMLSelectElement && element.disabled) ||
    (element instanceof HTMLTextAreaElement && element.disabled) ||
    element.getAttribute("aria-disabled") === "true"
  );
}

function targetId(element: HTMLElement, root: HTMLElement): string {
  if (element.dataset.lensId !== undefined) return element.dataset.lensId;
  if (element.id !== "") return element.id;
  const peers = [...root.querySelectorAll(element.tagName.toLocaleLowerCase())];
  return `${element.tagName.toLocaleLowerCase()}-${String(peers.indexOf(element) + 1)}`;
}

function textFromReferences(ids: string): string {
  return ids
    .split(/\s+/u)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

function accessibleName(element: HTMLElement): { readonly name: string; readonly source: string } {
  const ariaLabel = element.getAttribute("aria-label")?.trim();
  if (ariaLabel) return { name: ariaLabel, source: "aria-label" };
  const labelledBy = element.getAttribute("aria-labelledby")?.trim();
  if (labelledBy) {
    const value = textFromReferences(labelledBy);
    if (value) return { name: value, source: "aria-labelledby" };
  }
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const labels = [...(element.labels ?? [])]
      .map((label) => label.textContent?.trim() ?? "")
      .filter(Boolean);
    if (labels.length > 0) return { name: labels.join(" "), source: "label" };
  }
  const title = element.getAttribute("title")?.trim();
  const text = element.textContent?.replace(/\s+/gu, " ").trim();
  if (text) return { name: text, source: "content" };
  if (title) return { name: title, source: "title" };
  return { name: "", source: "none" };
}

function computedRole(element: HTMLElement): string {
  const explicit = element.getAttribute("role")?.trim();
  if (explicit) return explicit;
  if (element instanceof HTMLButtonElement) return "button";
  if (element instanceof HTMLAnchorElement && element.hasAttribute("href")) return "link";
  if (element instanceof HTMLSelectElement) return "combobox";
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox") return "checkbox";
    if (element.type === "radio") return "radio";
    return "textbox";
  }
  return (
    (
      {
        ASIDE: "complementary",
        FOOTER: "contentinfo",
        FORM: "form",
        H1: "heading",
        H2: "heading",
        H3: "heading",
        HEADER: "banner",
        LI: "listitem",
        MAIN: "main",
        NAV: "navigation",
        OL: "list",
        SECTION: "region",
        SUMMARY: "button",
        TABLE: "table",
        UL: "list",
      } as Record<string, string>
    )[element.tagName] ?? element.tagName.toLocaleLowerCase()
  );
}

function findingRect(element: HTMLElement, frame: HTMLElement): FindingRect {
  const frameRect = frame.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    height: rect.height,
    left: rect.left - frameRect.left + frame.scrollLeft,
    top: rect.top - frameRect.top + frame.scrollTop,
    width: rect.width,
  };
}

function opaqueBackground(element: HTMLElement) {
  const layers: ReturnType<typeof parseCssColor>[] = [];
  let current: HTMLElement | null = element;
  while (current !== null) {
    layers.push(parseCssColor(window.getComputedStyle(current).backgroundColor));
    current = current.parentElement;
  }
  let result = parseCssColor("rgb(255 255 255)")!;
  for (const layer of layers.reverse()) {
    if (layer !== null) result = compositeColor(layer, result);
  }
  return result;
}

function maximumDuration(value: string): number {
  return Math.max(
    0,
    ...value.split(",").map((duration) => {
      const trimmed = duration.trim();
      const parsed = Number.parseFloat(trimmed);
      if (!Number.isFinite(parsed)) return 0;
      return trimmed.endsWith("ms") ? parsed : parsed * 1_000;
    }),
  );
}

function inspectSpecimen(
  root: HTMLElement,
  frame: HTMLElement,
  modes: readonly QualityLensMode[],
  traceRan: boolean,
): readonly RenderedFinding[] {
  const findings: RenderedFinding[] = [];
  const append = (
    mode: QualityLensMode,
    element: HTMLElement,
    finding: Omit<QualityLensFinding, "id" | "mode" | "target">,
  ) => {
    const target = targetId(element, root);
    findings.push({
      ...finding,
      id: `${mode}-${target}-${String(findings.filter((item) => item.mode === mode).length + 1)}`,
      mode,
      rect: findingRect(element, frame),
      target,
    });
  };
  const focusables = [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => visible(element) && !disabled(element) && element.tabIndex >= 0,
  );

  if (modes.includes("focus-order")) {
    focusables.forEach((element, index) => {
      const name = accessibleName(element).name || "Unnamed target";
      const positiveTabIndex = element.tabIndex > 0;
      append("focus-order", element, {
        detail: positiveTabIndex
          ? `Tab stop ${String(index + 1)} uses positive tabindex ${String(element.tabIndex)}; DOM order is safer.`
          : `Tab stop ${String(index + 1)} follows DOM order. Disabled and inert targets are excluded.`,
        label: name,
        status: positiveTabIndex ? "Warning" : "Pass",
      });
    });
  }

  if (modes.includes("accessible-names")) {
    const nameTargets = [
      ...root.querySelectorAll<HTMLElement>(`${FOCUSABLE_SELECTOR}, nav, form, [role]`),
    ].filter(visible);
    const occurrences = new Map<string, number>();
    for (const element of nameTargets) {
      const { name, source } = accessibleName(element);
      if (name !== "") occurrences.set(name, (occurrences.get(name) ?? 0) + 1);
      const duplicate = name !== "" && (occurrences.get(name) ?? 0) > 1;
      append("accessible-names", element, {
        detail:
          name === ""
            ? `Computed role ${computedRole(element)} has no detectable accessible name.`
            : `Computed role ${computedRole(element)}; name source ${source}.${duplicate ? " This name is duplicated in the specimen." : ""}`,
        label: name || "Unnamed target",
        status: name === "" ? "Fail" : duplicate ? "Warning" : "Pass",
      });
    }
  }

  if (modes.includes("semantics")) {
    const semanticTargets = [
      ...root.querySelectorAll<HTMLElement>(
        "h1, h2, h3, h4, nav, form, ul, ol, li, table, input, select, button, a[href], details, summary, [role], [aria-live]",
      ),
    ].filter(visible);
    for (const element of semanticTargets) {
      const role = computedRole(element);
      const live = element.getAttribute("aria-live");
      append("semantics", element, {
        detail: `${role}${live === null ? "" : ` with ${live} live updates`}; exact platform accessibility-tree confirmation remains a manual check.`,
        label: accessibleName(element).name || role,
        status: live === "off" ? "Warning" : "Manual check",
      });
    }
  }

  if (modes.includes("target-size")) {
    for (const element of focusables) {
      const rect = element.getBoundingClientRect();
      const aa = rect.width >= 24 && rect.height >= 24;
      const comfort = rect.width >= 44 && rect.height >= 44;
      append("target-size", element, {
        detail: `${rect.width.toFixed(0)}×${rect.height.toFixed(0)} CSS px; 24×24 AA ${aa ? "met" : "not met"}; 44×44 Mergora comfort goal ${comfort ? "met" : "not met"}.`,
        label: accessibleName(element).name || computedRole(element),
        status: comfort ? "Pass" : aa ? "Warning" : "Fail",
      });
    }
  }

  if (modes.includes("contrast")) {
    const textTargets = [
      ...root.querySelectorAll<HTMLElement>("button, a[href], label, p, strong, summary, option"),
    ].filter((element) => visible(element) && (element.textContent?.trim().length ?? 0) > 0);
    for (const element of textTargets) {
      const style = window.getComputedStyle(element);
      const foreground = parseCssColor(style.color);
      if (foreground === null) {
        append("contrast", element, {
          detail: `Computed color ${style.color} could not be reduced deterministically. Images, gradients, and transparency require manual review.`,
          label: accessibleName(element).name || element.textContent?.trim() || "Text",
          status: "Not measurable",
        });
        continue;
      }
      const ratio = contrastRatio(foreground, opaqueBackground(element));
      const fontSize = Number.parseFloat(style.fontSize);
      const weight = Number.parseInt(style.fontWeight, 10);
      const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
      const minimum = large ? 3 : 4.5;
      append("contrast", element, {
        detail: `Heuristic computed text ratio ${ratio.toFixed(2)}:1; threshold ${minimum.toFixed(1)}:1. Indicator and blended-layer sampling still needs browser evidence.`,
        label: accessibleName(element).name || element.textContent?.trim() || "Text",
        status: ratio >= minimum ? "Pass" : "Fail",
      });
    }
  }

  if (modes.includes("reflow-bounds")) {
    const overflow = root.scrollWidth - root.clientWidth;
    append("reflow-bounds", root, {
      detail: `${String(root.clientWidth)}×${String(root.clientHeight)} CSS px container; horizontal overflow ${String(Math.max(0, overflow))} px. Clipped-focus and sticky-obscuration checks remain heuristic.`,
      label: "Prepared specimen boundary",
      status: overflow > 1 ? "Fail" : "Pass",
    });
    const rootRect = root.getBoundingClientRect();
    for (const element of focusables) {
      const rect = element.getBoundingClientRect();
      const clipped = rect.left < rootRect.left - 1 || rect.right > rootRect.right + 1;
      if (clipped) {
        append("reflow-bounds", element, {
          detail: "Focusable target extends beyond the prepared specimen boundary.",
          label: accessibleName(element).name || computedRole(element),
          status: "Fail",
        });
      }
    }
  }

  if (modes.includes("motion")) {
    const motionTargets = [root, ...root.querySelectorAll<HTMLElement>("*")].filter(visible);
    const measured = motionTargets.filter((element) => {
      const style = window.getComputedStyle(element);
      return (
        maximumDuration(style.transitionDuration) > 0 ||
        maximumDuration(style.animationDuration) > 0
      );
    });
    if (measured.length === 0) {
      append("motion", root, {
        detail:
          "No active CSS transition or animation duration was detected in this prepared state.",
        label: "Prepared specimen motion",
        status: "Pass",
      });
    }
    for (const element of measured) {
      const style = window.getComputedStyle(element);
      const perpetual = style.animationIterationCount.split(",").includes("infinite");
      append("motion", element, {
        detail: `Transition ${style.transitionProperty} / ${style.transitionDuration}; animation ${style.animationName} / ${style.animationDuration}. Reduced-motion substitution requires the dedicated browser lane.`,
        label: accessibleName(element).name || targetId(element, root),
        status: perpetual ? "Warning" : "Manual check",
      });
    }
  }

  if (modes.includes("dynamic-state")) {
    const dynamicTargets = [
      ...root.querySelectorAll<HTMLElement>(
        "[aria-busy], [aria-expanded], [aria-pressed], [aria-selected], [aria-invalid], [aria-live], [role='status'], details",
      ),
    ].filter(visible);
    for (const element of dynamicTargets) {
      const attributes = [
        "aria-busy",
        "aria-expanded",
        "aria-pressed",
        "aria-selected",
        "aria-invalid",
        "aria-live",
      ]
        .map((name) => [name, element.getAttribute(name)] as const)
        .filter(([, value]) => value !== null)
        .map(([name, value]) => `${name}=${value}`);
      if (element instanceof HTMLDetailsElement) attributes.push(`open=${String(element.open)}`);
      append("dynamic-state", element, {
        detail: `${traceRan ? "After prepared trace" : "Initial state"}: ${attributes.join(", ") || "live status content"}. Announcement delivery requires screen-reader evidence.`,
        label: accessibleName(element).name || computedRole(element),
        status: traceRan ? "Pass" : "Manual check",
      });
    }
  }

  return findings;
}

export function QualityLens() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const specimenRef = useRef<HTMLDivElement>(null);
  const evidenceRows = useRef(new Map<string, HTMLLIElement>());
  const [open, setOpen] = useState(false);
  const [modes, setModes] = useState<readonly QualityLensMode[]>(["focus-order"]);
  const [findings, setFindings] = useState<readonly RenderedFinding[]>([]);
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null);
  const [traceRan, setTraceRan] = useState(false);
  const [message, setMessage] = useState("");
  const [recovery, setRecovery] = useState("");
  const [urlReady, setUrlReady] = useState(false);

  const runInspection = useCallback(() => {
    if (!open || specimenRef.current === null || frameRef.current === null) return;
    const next = inspectSpecimen(specimenRef.current, frameRef.current, modes, traceRan);
    setFindings(next);
    setMessage(
      `${String(next.length)} prepared findings. Heuristics are labeled and remain local.`,
    );
  }, [modes, open, traceRan]);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const requested = parameters.get("lens");
    const parsed = parseQualityLensModes(requested);
    if (requested !== null) {
      setOpen(true);
      setModes(parsed.modes);
      setSelectedFinding(parameters.get("lensTarget"));
    }
    if (parsed.invalid.length > 0) {
      setRecovery(`Unknown Lens modes were ignored: ${parsed.invalid.join(", ")}.`);
    }
    setUrlReady(true);
  }, []);

  useEffect(() => {
    if (!urlReady) return;
    const parameters = new URLSearchParams(window.location.search);
    if (open) {
      const canonicalModes = QUALITY_LENS_MODES.filter((mode) => modes.includes(mode));
      parameters.set("lens", canonicalModes.join(","));
      if (selectedFinding === null) parameters.delete("lensTarget");
      else parameters.set("lensTarget", selectedFinding);
    } else {
      parameters.delete("lens");
      parameters.delete("lensTarget");
    }
    parameters.sort();
    const next = `${window.location.pathname}${parameters.size === 0 ? "" : `?${parameters.toString()}`}${window.location.hash}`;
    window.history.replaceState(null, "", next);
  }, [modes, open, selectedFinding, urlReady]);

  useEffect(() => {
    if (!open) return;
    const frame = frameRef.current;
    if (frame === null) return;
    const animation = window.requestAnimationFrame(runInspection);
    const observer = new ResizeObserver(() => runInspection());
    observer.observe(frame);
    window.addEventListener("resize", runInspection);
    return () => {
      window.cancelAnimationFrame(animation);
      observer.disconnect();
      window.removeEventListener("resize", runInspection);
    };
  }, [open, runInspection]);

  const statuses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const finding of findings)
      counts.set(finding.status, (counts.get(finding.status) ?? 0) + 1);
    return [...counts.entries()];
  }, [findings]);

  const selectFinding = (id: string) => {
    setSelectedFinding(id);
    window.requestAnimationFrame(() => evidenceRows.current.get(id)?.focus());
  };

  const reset = () => {
    setOpen(false);
    setModes(["focus-order"]);
    setFindings([]);
    setSelectedFinding(null);
    setTraceRan(false);
    setMessage("Lens reset. Prepared specimen state was restored.");
    setRecovery("");
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const copyEvidence = async () => {
    const payload = JSON.stringify(
      {
        evidenceDigest: "unreleased-local-preview",
        findings: findings.map(({ rect: _rect, ...finding }) => finding),
        modes,
        preparedState: traceRan ? "trace-complete" : "default",
        schemaVersion: 1,
        specimen: "homepage-production-controls",
        uiVersion: "0.0.0-unreleased",
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(payload);
      setMessage("Privacy-safe Lens JSON copied without DOM HTML or user-entered text.");
    } catch {
      setMessage("Clipboard access is unavailable. Lens evidence remains visible below.");
    }
  };

  return (
    <section className="quality-lens" aria-labelledby="quality-lens-title">
      <header className="quality-lens__introduction">
        <div>
          <p className="site-eyebrow">Quality Lens · local inspection</p>
          <h2 id="quality-lens-title">Make behavior inspectable.</h2>
          <p>
            Inspect a prepared Mergora specimen without uploading its state. Browser heuristics are
            evidence aids, not a replacement for accessibility-tree tools or manual assistive-
            technology testing.
          </p>
        </div>
        <Button
          aria-expanded={open}
          aria-controls="quality-lens-workbench"
          onClick={() => setOpen((current) => !current)}
          ref={triggerRef}
          variant="secondary"
        >
          {open ? "Close Quality Lens" : "Open Quality Lens"}
        </Button>
      </header>

      <div
        className="quality-lens__layout"
        data-open={open || undefined}
        id="quality-lens-workbench"
      >
        <div className="quality-lens__workbench">
          {open ? (
            <form className="quality-lens__toolbar" onSubmit={(event) => event.preventDefault()}>
              <fieldset>
                <legend>Inspection layers</legend>
                {QUALITY_LENS_MODES.map((mode) => (
                  <label key={mode}>
                    <input
                      checked={modes.includes(mode)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setModes((current) => {
                          const next = checked
                            ? [...current, mode]
                            : current.filter((candidate) => candidate !== mode);
                          return next.length === 0 ? ["focus-order"] : next;
                        });
                      }}
                      type="checkbox"
                    />
                    <span>{MODE_LABELS[mode]}</span>
                  </label>
                ))}
              </fieldset>
              <div className="quality-lens__toolbar-actions">
                <Button onClick={runInspection} size="small" type="button" variant="secondary">
                  Inspect current state
                </Button>
                <Button
                  onClick={() => {
                    setTraceRan(true);
                    setMessage("Prepared trace changed busy, expanded, and live status state.");
                  }}
                  size="small"
                  type="button"
                  variant="secondary"
                >
                  Run action trace
                </Button>
                <Button
                  onClick={() => void copyEvidence()}
                  size="small"
                  type="button"
                  variant="quiet"
                >
                  Copy evidence JSON
                </Button>
                <Button onClick={reset} size="small" type="button" variant="quiet">
                  Reset Lens
                </Button>
              </div>
              <output aria-live="polite">{message}</output>
              {recovery === "" ? null : <p role="status">{recovery}</p>}
            </form>
          ) : null}

          <div className="quality-lens__specimen-frame" ref={frameRef}>
            <div
              className="quality-lens__specimen"
              data-lens-id="specimen"
              data-trace={traceRan ? "complete" : "default"}
              ref={specimenRef}
            >
              <header>
                <p className="site-eyebrow">Prepared production state</p>
                <h3>Registry verification</h3>
                <p>Review a canonical source operation before applying any filesystem change.</p>
              </header>
              <div className="quality-lens__specimen-controls">
                <Button
                  data-lens-id="verify-action"
                  pending={traceRan}
                  pendingLabel="Verification recorded"
                  type="button"
                >
                  Run verification
                </Button>
                <a data-lens-id="provenance-link" href="#quality-lens-evidence">
                  Inspect provenance
                </a>
                <label>
                  <span>Registry channel</span>
                  <select data-lens-id="registry-channel" defaultValue="core">
                    <option value="core">Core · local snapshot</option>
                    <option value="labs">Labs · review required</option>
                  </select>
                </label>
              </div>
              <details data-lens-id="operation-details" open={traceRan}>
                <summary>Operation boundaries</summary>
                <p>Two source files and one provenance record are included in the prepared plan.</p>
              </details>
              <p aria-live="polite" data-lens-id="operation-status" role="status">
                {traceRan
                  ? "Prepared trace complete. No project files were changed."
                  : "Ready to inspect. No operation has run."}
              </p>
            </div>
            {open ? (
              <div aria-label="Quality Lens markers" className="quality-lens__markers">
                {findings.slice(0, 48).map((finding, index) =>
                  finding.rect === undefined ? null : (
                    <div
                      className="quality-lens__marker"
                      data-mode={finding.mode}
                      data-selected={finding.id === selectedFinding || undefined}
                      key={finding.id}
                      style={
                        {
                          "--lens-height": `${finding.rect.height}px`,
                          "--lens-left": `${finding.rect.left}px`,
                          "--lens-top": `${finding.rect.top}px`,
                          "--lens-width": `${finding.rect.width}px`,
                        } as CSSProperties
                      }
                    >
                      <span aria-hidden="true" />
                      <button
                        aria-label={`Finding ${String(index + 1)}: ${finding.label}, ${finding.status}`}
                        onClick={() => selectFinding(finding.id)}
                        type="button"
                      >
                        {index + 1}
                      </button>
                    </div>
                  ),
                )}
              </div>
            ) : null}
          </div>
        </div>

        {open ? (
          <aside className="quality-lens__evidence" id="quality-lens-evidence">
            <header>
              <h3>Prepared findings</h3>
              <p>
                {statuses.length === 0
                  ? "Run an inspection to populate evidence."
                  : statuses.map(([status, count]) => `${status} ${String(count)}`).join(" · ")}
              </p>
            </header>
            {findings.length === 0 ? (
              <p>No prepared findings yet.</p>
            ) : (
              <ol aria-label="Quality Lens findings" tabIndex={0}>
                {findings.map((finding) => (
                  <li
                    data-selected={finding.id === selectedFinding || undefined}
                    key={finding.id}
                    ref={(element) => {
                      if (element === null) evidenceRows.current.delete(finding.id);
                      else evidenceRows.current.set(finding.id, element);
                    }}
                    tabIndex={-1}
                  >
                    <div>
                      <span>{MODE_LABELS[finding.mode]}</span>
                      <strong>{finding.status}</strong>
                    </div>
                    <h4>{finding.label}</h4>
                    <p>{finding.detail}</p>
                    <code>{finding.target}</code>
                  </li>
                ))}
              </ol>
            )}
            <p>
              Automated findings remain local and do not alter a Quality Passport. Read the{" "}
              <Link href="/docs/accessibility">manual evidence policy</Link>.
            </p>
          </aside>
        ) : null}
      </div>
      <noscript>
        Quality Lens requires JavaScript for live inspection. Static accessibility and quality
        evidence remains available from the Quality pages.
      </noscript>
    </section>
  );
}
