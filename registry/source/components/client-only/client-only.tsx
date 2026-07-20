"use client";

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";

import "./client-only.css";

export interface ClientOnlyProps {
  /** Client-rendered content that replaces the fallback after the boundary mounts. */
  readonly children: ReactNode;
  /** Accessible, layout-stable content rendered during SSR and the first hydration pass. */
  readonly fallback: ReactNode;
  /** Optional one-shot integration hook fired after the client boundary has mounted. */
  readonly onClientReady?: () => void;
}

export function ClientOnly({ children, fallback, onClientReady }: ClientOnlyProps): ReactElement {
  const [mounted, setMounted] = useState(false);
  const readyCallback = useRef(onClientReady);
  const notified = useRef(false);
  readyCallback.current = onClientReady;

  useEffect(() => {
    setMounted(true);
    if (!notified.current) {
      notified.current = true;
      readyCallback.current?.();
    }
  }, []);

  return <>{mounted ? children : fallback}</>;
}
