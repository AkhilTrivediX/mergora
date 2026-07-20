"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  resetStorybookSpecimenOrReload,
  resolveStorybookId,
  type StorybookPointer,
} from "./specimen-frame-model";

type SpecimenMode = "basic" | "recommended";
type SpecimenViewport = "narrow" | "responsive" | "mobile";

interface ResolvedStories {
  readonly basic: string;
  readonly recommended: string;
}

const BASE_PATH = process.env.NEXT_PUBLIC_MERGORA_BASE_PATH ?? "";

function qualityLabPath(pathname: string): string {
  return `${BASE_PATH}/quality-lab/${pathname}`;
}

export function SpecimenFrame({
  basic,
  itemName,
  recommended,
}: {
  readonly basic: StorybookPointer;
  readonly itemName: string;
  readonly recommended: StorybookPointer;
}) {
  const [contrast, setContrast] = useState("standard");
  const [density, setDensity] = useState("comfortable");
  const [direction, setDirection] = useState("ltr");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<SpecimenMode>("basic");
  const [motion, setMotion] = useState("full");
  const [resetNonce, setResetNonce] = useState(0);
  const [resetPending, setResetPending] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [stories, setStories] = useState<ResolvedStories | null>(null);
  const [theme, setTheme] = useState("light");
  const [viewport, setViewport] = useState<SpecimenViewport>("responsive");
  const canvasRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const resetPendingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting !== true) return;
      setShouldLoad(true);
      observer.disconnect();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoad) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(qualityLabPath("index.json"), {
          cache: "force-cache",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Quality Lab index returned ${response.status}.`);
        const index: unknown = await response.json();
        const basicId = resolveStorybookId(index, basic);
        const recommendedId = resolveStorybookId(index, recommended);
        if (basicId === null || recommendedId === null) {
          throw new Error(
            "The recorded Basic or Recommended specimen is missing from Quality Lab.",
          );
        }
        setStories({ basic: basicId, recommended: recommendedId });
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Quality Lab could not be loaded.");
      }
    };
    void load();
    return () => controller.abort();
  }, [basic, recommended, shouldLoad]);

  const storyId = stories?.[mode];
  const globals = useMemo(
    () =>
      [
        `contrast:${contrast}`,
        `density:${density}`,
        `direction:${direction}`,
        `motion:${motion}`,
        `theme:${theme}`,
        `viewportMode:${viewport}`,
      ].join(";"),
    [contrast, density, direction, motion, theme, viewport],
  );
  const iframeBaseSource =
    storyId === undefined
      ? null
      : `${qualityLabPath("iframe.html")}?id=${encodeURIComponent(storyId)}&viewMode=story&globals=${encodeURIComponent(globals)}`;
  const iframeSource =
    iframeBaseSource === null
      ? null
      : `${iframeBaseSource}${resetNonce === 0 ? "" : `&resetNonce=${resetNonce}`}`;
  const qualityLabSource =
    storyId === undefined
      ? qualityLabPath("index.html")
      : `${qualityLabPath("index.html")}?path=/story/${encodeURIComponent(storyId)}&globals=${encodeURIComponent(globals)}`;

  function finishReset(): void {
    if (!resetPendingRef.current) return;
    resetPendingRef.current = false;
    setResetPending(false);
  }

  async function resetExample(): Promise<void> {
    if (resetPendingRef.current) return;
    resetPendingRef.current = true;
    setResetPending(true);

    // Give assistive technology and the rendered control a frame to expose the pending state.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const result = await resetStorybookSpecimenOrReload(
      iframeRef.current?.contentWindow,
      storyId,
      () => setResetNonce((value) => value + 1),
    );
    if (result === "remounted") finishReset();
  }

  return (
    <div className="specimen-frame">
      <div className="specimen-frame__toolbar">
        <fieldset>
          <legend>Specimen mode</legend>
          <label>
            <input
              checked={mode === "basic"}
              name={`${itemName}-specimen-mode`}
              onChange={() => setMode("basic")}
              type="radio"
            />
            Basic
          </label>
          <label>
            <input
              checked={mode === "recommended"}
              name={`${itemName}-specimen-mode`}
              onChange={() => setMode("recommended")}
              type="radio"
            />
            Recommended Mergora
          </label>
        </fieldset>
        <label>
          Canvas width
          <select
            onChange={(event) => setViewport(event.currentTarget.value as SpecimenViewport)}
            value={viewport}
          >
            <option value="responsive">Responsive</option>
            <option value="mobile">Mobile · 390px</option>
            <option value="narrow">Narrow · 320px</option>
          </select>
        </label>
        <label>
          Theme
          <select onChange={(event) => setTheme(event.currentTarget.value)} value={theme}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
        </label>
        <label>
          Density
          <select onChange={(event) => setDensity(event.currentTarget.value)} value={density}>
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
            <option value="touch">Touch</option>
          </select>
        </label>
        <label>
          Direction
          <select onChange={(event) => setDirection(event.currentTarget.value)} value={direction}>
            <option value="ltr">Left to right</option>
            <option value="rtl">Right to left</option>
          </select>
        </label>
        <label>
          Motion
          <select onChange={(event) => setMotion(event.currentTarget.value)} value={motion}>
            <option value="full">Full</option>
            <option value="reduced">Reduced</option>
          </select>
        </label>
        <label>
          Contrast
          <select onChange={(event) => setContrast(event.currentTarget.value)} value={contrast}>
            <option value="standard">Standard</option>
            <option value="enhanced">Enhanced</option>
            <option value="forced-colors">Forced-color tokens</option>
          </select>
        </label>
        <button
          aria-busy={resetPending || undefined}
          aria-live="polite"
          disabled={resetPending || iframeSource === null}
          onClick={() => void resetExample()}
          type="button"
        >
          {resetPending ? "Resetting example" : "Reset example"}
        </button>
        <a href={qualityLabSource}>Open controls in Quality Lab</a>
      </div>
      <div className="specimen-frame__canvas" data-viewport={viewport} ref={canvasRef}>
        {error === null ? null : (
          <p className="specimen-frame__status" role="alert">
            {error} The evidence labels below remain available.
          </p>
        )}
        {iframeSource === null && error === null ? (
          <p aria-live="polite" className="specimen-frame__status">
            {shouldLoad
              ? "Loading the precompiled specimen…"
              : "The live specimen loads when its canvas enters the viewport."}
          </p>
        ) : null}
        {iframeSource === null ? null : (
          <iframe
            loading="lazy"
            onLoad={finishReset}
            ref={iframeRef}
            src={iframeSource}
            title={`${itemName} ${mode === "basic" ? "Basic" : "Recommended Mergora"} live specimen`}
          />
        )}
      </div>
    </div>
  );
}
