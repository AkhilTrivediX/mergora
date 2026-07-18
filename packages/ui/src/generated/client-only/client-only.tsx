// Generated from registry/source/components/client-only/client-only.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import { useEffect, useState, type ReactElement, type ReactNode } from "react";

import "./client-only.css";

export interface ClientOnlyProps {
  readonly children: ReactNode;
  /** Accessible, layout-stable content rendered during SSR and the first hydration pass. */
  readonly fallback: ReactNode;
}

export function ClientOnly({ children, fallback }: ClientOnlyProps): ReactElement {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return <>{mounted ? children : fallback}</>;
}
