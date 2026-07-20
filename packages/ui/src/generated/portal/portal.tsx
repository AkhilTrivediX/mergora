// Generated from registry/source/components/portal/portal.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  forwardRef,
  useEffect,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { useMergoraContext } from "../provider/index.js";
import "./portal.css";

export interface PortalProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Content rendered inside the locale, direction, and density context boundary. */
  readonly children: ReactNode;
  /** Explicit target. Null or undefined falls back to the provider target, then document.body. */
  readonly container?: HTMLElement | null;
  /** Keeps content inline, including during SSR, while retaining the portal context wrapper. */
  readonly disabled?: boolean;
  /** Deterministic server and first-hydration content. */
  readonly fallback?: ReactNode;
}

function joinClassNames(className: string | undefined): string {
  return className === undefined || className.trim().length === 0
    ? "mrg-portal-context"
    : `mrg-portal-context ${className}`;
}

export const Portal = forwardRef<HTMLDivElement, PortalProps>(function Portal(
  { children, className, container, disabled = false, fallback = null, ...nativeProps },
  ref,
): ReactElement | null {
  const context = useMergoraContext();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const wrapper = (
    <div
      {...nativeProps}
      ref={ref}
      dir={context.direction}
      lang={context.locale}
      data-density={context.density}
      data-direction={context.direction}
      data-slot="portal-context"
      className={joinClassNames(className)}
    >
      {children}
    </div>
  );

  if (disabled) return wrapper;
  if (!mounted) return fallback === null ? null : <>{fallback}</>;

  const target = container ?? context.portalContainer ?? document.body;
  return createPortal(wrapper, target);
});

Portal.displayName = "Portal";
