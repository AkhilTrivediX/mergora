// Generated from registry/source/components/banner/banner.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  Fragment,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { useMergoraMessage } from "../provider/index.js";
import "./banner.css";

export type BannerScope = "page" | "site";
export type BannerVariant = "info" | "success" | "warning" | "error";
export type BannerHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface BannerPersistenceAdapter {
  readonly read: (id: string) => boolean | undefined;
  readonly write: (id: string, dismissed: boolean) => void;
}

export interface BannerStorageLike {
  readonly getItem: (key: string) => string | null;
  readonly removeItem: (key: string) => void;
  readonly setItem: (key: string, value: string) => void;
}

export function createBannerStoragePersistence(
  storage: BannerStorageLike,
  prefix = "mergora.banner.",
): BannerPersistenceAdapter {
  if (prefix.trim().length === 0) {
    throw new Error("Mergora Banner persistence prefix must be non-empty.");
  }
  return {
    read: (id) => {
      const stored = storage.getItem(`${prefix}${id}`);
      return stored === null ? undefined : stored === "dismissed";
    },
    write: (id, dismissed) => {
      if (dismissed) storage.setItem(`${prefix}${id}`, "dismissed");
      else storage.removeItem(`${prefix}${id}`);
    },
  };
}

interface BannerBaseProps extends Omit<
  HTMLAttributes<HTMLElement>,
  | "aria-atomic"
  | "aria-hidden"
  | "aria-label"
  | "aria-labelledby"
  | "aria-live"
  | "aria-relevant"
  | "aria-roledescription"
  | "children"
  | "hidden"
  | "role"
  | "title"
> {
  readonly "aria-atomic"?: never;
  readonly "aria-hidden"?: never;
  readonly "aria-label"?: never;
  readonly "aria-labelledby"?: never;
  readonly "aria-live"?: never;
  readonly "aria-relevant"?: never;
  readonly "aria-roledescription"?: never;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly dismissible?: boolean;
  readonly dismissLabel?: string;
  readonly headingLevel?: BannerHeadingLevel;
  readonly hidden?: never;
  readonly id: string;
  readonly onDismissedChange?: (dismissed: boolean) => void;
  readonly onPersistenceError?: (error: unknown) => void;
  readonly role?: never;
  readonly scope?: BannerScope;
  readonly title: ReactNode;
  readonly variant?: BannerVariant;
  readonly variantLabel?: string;
}

interface BannerControlledDismissalProps {
  readonly defaultDismissed?: never;
  readonly dismissed: boolean;
  readonly persistence?: never;
}

interface BannerUncontrolledDismissalProps {
  readonly defaultDismissed?: boolean;
  readonly dismissed?: never;
  readonly persistence?: BannerPersistenceAdapter;
}

export type BannerProps = BannerBaseProps &
  (BannerControlledDismissalProps | BannerUncontrolledDismissalProps);

function hasBannerContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => hasBannerContent(item));
  if (isValidElement(value) && value.type === Fragment) {
    return hasBannerContent((value.props as { readonly children?: ReactNode }).children);
  }
  return true;
}

const ownedSemanticProps = [
  "aria-atomic",
  "aria-hidden",
  "aria-label",
  "aria-labelledby",
  "aria-live",
  "aria-relevant",
  "aria-roledescription",
  "hidden",
  "role",
] as const;

function assertNoBannerSemanticOverrides(props: Readonly<Record<string, unknown>>): void {
  for (const key of ownedSemanticProps) {
    if (props[key] !== undefined) {
      throw new Error(`Mergora Banner owns ${key} and does not accept a semantic override.`);
    }
  }
}

const useBannerLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

export const Banner = forwardRef<HTMLElement, BannerProps>(function Banner(props, ref) {
  assertNoBannerSemanticOverrides(props as unknown as Readonly<Record<string, unknown>>);

  const {
    actions,
    children,
    className,
    defaultDismissed = false,
    dismissible = true,
    dismissed,
    dismissLabel: dismissLabelProp,
    headingLevel = 2,
    id,
    onDismissedChange,
    onPersistenceError,
    persistence,
    scope = "page",
    title,
    variant = "info",
    variantLabel: variantLabelProp,
    ...nativeProps
  } = props;

  const controlled = dismissed !== undefined;
  if (
    controlled &&
    (Object.hasOwn(props, "defaultDismissed") || Object.hasOwn(props, "persistence"))
  ) {
    throw new Error(
      "Mergora Banner controlled dismissal cannot be combined with defaultDismissed or persistence.",
    );
  }
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new Error("Mergora Banner id must be non-empty.");
  }
  if (!hasBannerContent(title) || !hasBannerContent(children)) {
    throw new Error("Mergora Banner requires non-empty title and content.");
  }
  if (actions !== undefined && actions !== null && !hasBannerContent(actions)) {
    throw new Error("Mergora Banner actions must be non-empty when provided.");
  }
  if (dismissLabelProp !== undefined && dismissLabelProp.trim().length === 0) {
    throw new Error("Mergora Banner dismissLabel must be non-empty when provided.");
  }
  if (variantLabelProp !== undefined && variantLabelProp.trim().length === 0) {
    throw new Error("Mergora Banner variantLabel must be non-empty when provided.");
  }

  const initialDefaultDismissed = useRef(defaultDismissed);
  const pendingPersistenceWrite = useRef<boolean | null>(null);
  const persistenceErrorObserver = useRef(onPersistenceError);
  const [internalDismissed, setInternalDismissed] = useState(initialDefaultDismissed.current);
  const [resolvedPersistence, setResolvedPersistence] = useState<{
    readonly adapter: BannerPersistenceAdapter;
    readonly id: string;
  } | null>(null);
  const usesPersistence = !controlled && dismissible && persistence !== undefined;
  const persistencePending =
    usesPersistence &&
    (resolvedPersistence?.adapter !== persistence || resolvedPersistence.id !== id);
  const resolvedDismissed = dismissed ?? internalDismissed;
  const defaultDismissLabel = useMergoraMessage("banner.dismiss", "Dismiss message");
  const defaultVariantLabel = useMergoraMessage(
    `banner.${variant}`,
    {
      error: "Error",
      info: "Information",
      success: "Success",
      warning: "Warning",
    }[variant],
  );
  const reactId = useId();
  const titleId = `mrg-banner-${reactId.replaceAll(":", "")}-title`;
  const Heading = `h${headingLevel}` as const;

  useBannerLayoutEffect(() => {
    persistenceErrorObserver.current = onPersistenceError;
  }, [onPersistenceError]);

  const reportPersistenceError = useCallback((error: unknown) => {
    const observer = persistenceErrorObserver.current;
    if (observer === undefined) return;
    try {
      observer(error);
    } catch {
      // A failing observer must not turn a contained persistence failure into an app error.
    }
  }, []);

  useBannerLayoutEffect(() => {
    pendingPersistenceWrite.current = null;
    if (!usesPersistence) {
      setResolvedPersistence(null);
      return;
    }

    let nextDismissed = initialDefaultDismissed.current;
    try {
      const persisted = persistence.read(id);
      if (persisted !== undefined && typeof persisted !== "boolean") {
        throw new TypeError("Mergora Banner persistence read must return boolean or undefined.");
      }
      nextDismissed = persisted ?? initialDefaultDismissed.current;
    } catch (error) {
      reportPersistenceError(error);
    }

    setInternalDismissed(nextDismissed);
    setResolvedPersistence({ adapter: persistence, id });
  }, [id, persistence, reportPersistenceError, usesPersistence]);

  useBannerLayoutEffect(() => {
    const nextDismissed = pendingPersistenceWrite.current;
    if (
      nextDismissed === null ||
      controlled ||
      persistence === undefined ||
      internalDismissed !== nextDismissed
    ) {
      return;
    }

    pendingPersistenceWrite.current = null;
    try {
      persistence.write(id, nextDismissed);
    } catch (error) {
      reportPersistenceError(error);
    }
  }, [controlled, id, internalDismissed, persistence, reportPersistenceError]);

  const updateDismissed = (nextDismissed: boolean) => {
    if (!controlled) {
      pendingPersistenceWrite.current = persistence === undefined ? null : nextDismissed;
      setInternalDismissed(nextDismissed);
    }
    onDismissedChange?.(nextDismissed);
  };

  return (
    <aside
      {...nativeProps}
      aria-labelledby={titleId}
      className={className === undefined ? "mrg-banner" : `mrg-banner ${className}`}
      data-banner-id={id}
      data-dismissed={resolvedDismissed || undefined}
      data-persistence-pending={persistencePending || undefined}
      data-scope={scope}
      data-slot="banner"
      data-variant={variant}
      hidden={resolvedDismissed}
      ref={ref}
    >
      <div data-slot="banner-layout">
        <div data-slot="banner-content">
          <span data-slot="banner-variant-label">{variantLabelProp ?? defaultVariantLabel}</span>
          <Heading data-slot="banner-title" id={titleId}>
            {title}
          </Heading>
          <div data-slot="banner-description">{children}</div>
        </div>
        {hasBannerContent(actions) ? <div data-slot="banner-actions">{actions}</div> : null}
        {dismissible ? (
          <button
            aria-label={dismissLabelProp ?? defaultDismissLabel}
            data-slot="banner-dismiss"
            onClick={() => updateDismissed(true)}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>
    </aside>
  );
});

Banner.displayName = "Banner";
