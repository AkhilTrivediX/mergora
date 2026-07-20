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

import { useMergoraContext } from "../provider/index.js";
import "./banner.css";

export type BannerScope = "page" | "site";
export type BannerVariant = "info" | "success" | "warning" | "error";
export type BannerHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface BannerPersistenceAdapter {
  /** Reads consumer-owned dismissal state for the stable banner identifier. */
  readonly read: (id: string) => boolean | undefined;
  /** Writes consumer-owned dismissal state without choosing a storage backend. */
  readonly write: (id: string, dismissed: boolean) => void;
}

export interface BannerStorageLike {
  /** Reads a stored string or null using Web Storage-compatible behavior. */
  readonly getItem: (key: string) => string | null;
  /** Removes stored state using Web Storage-compatible behavior. */
  readonly removeItem: (key: string) => void;
  /** Stores string state using Web Storage-compatible behavior. */
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
  /** Reserved: Banner is intentionally non-live and owns announcement atomicity. */
  readonly "aria-atomic"?: never;
  /** Reserved: dismissal controls whether Banner renders instead of hiding its root. */
  readonly "aria-hidden"?: never;
  /** Reserved: the visible title supplies the named aside's accessible name. */
  readonly "aria-label"?: never;
  /** Reserved: Banner links its generated title to the named aside. */
  readonly "aria-labelledby"?: never;
  /** Reserved: Banner is intentionally non-live. */
  readonly "aria-live"?: never;
  /** Reserved: Banner does not expose a configurable live-region relevance policy. */
  readonly "aria-relevant"?: never;
  /** Reserved: Banner exposes native aside semantics without a role description. */
  readonly "aria-roledescription"?: never;
  /** Action controls rendered after the banner body and before the dismiss control. */
  readonly actions?: ReactNode;
  /** Non-empty visible banner body content. */
  readonly children: ReactNode;
  /** Enables the native dismiss button and dismissal state path; defaults to true. */
  readonly dismissible?: boolean;
  /** Localized accessible and visible label for the dismiss button. */
  readonly dismissLabel?: string;
  /** Native heading level used for `title`; defaults to 2. */
  readonly headingLevel?: BannerHeadingLevel;
  /** Reserved: use controlled or uncontrolled dismissal state instead. */
  readonly hidden?: never;
  /** Stable non-empty identity, also used as the optional persistence key. */
  readonly id: string;
  /** Receives each proposed controlled or committed uncontrolled dismissal change. */
  readonly onDismissedChange?: (dismissed: boolean) => void;
  /** Receives persistence read or write failures without letting them escape. */
  readonly onPersistenceError?: (error: unknown) => void;
  /** Reserved: Banner always renders a named native aside. */
  readonly role?: never;
  /** Page- or site-level scope metadata; defaults to `page`. */
  readonly scope?: BannerScope;
  /** Non-empty visible heading that names the banner. */
  readonly title: ReactNode;
  /** Visual and textual severity treatment; defaults to `info`. */
  readonly variant?: BannerVariant;
  /** Localized visible override for the selected variant label. */
  readonly variantLabel?: string;
}

interface BannerControlledDismissalProps {
  /** Unavailable in controlled mode because `dismissed` owns the initial state. */
  readonly defaultDismissed?: never;
  /** Controlled dismissal state; changes are proposed through `onDismissedChange`. */
  readonly dismissed: boolean;
  /** Unavailable in controlled mode; persistence is owned by the controlling consumer. */
  readonly persistence?: never;
}

interface BannerUncontrolledDismissalProps {
  /** Initial uncontrolled dismissal state; defaults to false. */
  readonly defaultDismissed?: boolean;
  /** Omit to let Banner own and commit its dismissal state. */
  readonly dismissed?: never;
  /** Optional synchronous adapter used only for uncontrolled dismissible banners. */
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
  const { getMessage } = useMergoraContext();
  const defaultDismissLabel = dismissible
    ? getMessage("banner.dismiss", "Dismiss message")
    : undefined;
  const defaultVariantLabel = getMessage(
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
