"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";

import type { StateLabModel } from "./state-lab-model";

const StateLab = lazy(async () =>
  import("./state-lab").then(({ StateLab: Component }) => ({ default: Component })),
);

export function DeferredStateLab({ model }: { readonly model: StateLabModel }) {
  const boundaryRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const boundary = boundaryRef.current;
    if (boundary === null) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting !== true) return;
      setShouldLoad(true);
      observer.disconnect();
    });
    observer.observe(boundary);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={boundaryRef}>
      {shouldLoad ? (
        <Suspense fallback={<p aria-live="polite">Loading the precompiled State Lab…</p>}>
          <StateLab model={model} />
        </Suspense>
      ) : (
        <p aria-live="polite">State Lab loads when this workbench enters view.</p>
      )}
    </div>
  );
}
