"use client";

import { lazy, Suspense, useState } from "react";

import type { StorybookPointer } from "./specimen-frame-model";

const SpecimenFrame = lazy(async () =>
  import("./specimen-frame").then(({ SpecimenFrame: Component }) => ({ default: Component })),
);

export function DeferredSpecimenFrame({
  basic,
  itemName,
  recommended,
}: {
  readonly basic: StorybookPointer;
  readonly itemName: string;
  readonly recommended: StorybookPointer;
}) {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <Suspense fallback={<p aria-live="polite">Loading the live specimen controls…</p>}>
        <SpecimenFrame basic={basic} itemName={itemName} recommended={recommended} />
      </Suspense>
    );
  }
  return (
    <div className="specimen-frame__deferred">
      <p>
        The interactive specimen stays optional so documentation routes remain fast on constrained
        devices.
      </p>
      <button onClick={() => setOpen(true)} type="button">
        Load live specimen controls
      </button>
    </div>
  );
}
