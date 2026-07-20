// Generated from registry/source/components/spinner/spinner.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import { forwardRef, useEffect, useId, useRef, type HTMLAttributes, type ReactNode } from "react";

import { useMergoraContext } from "../provider/index.js";
import { useAnnouncer } from "../sr-announcer/index.js";
import "./spinner.css";

export type SpinnerSize = "small" | "medium" | "large";

export interface SpinnerProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  | "aria-atomic"
  | "aria-describedby"
  | "aria-hidden"
  | "aria-label"
  | "aria-labelledby"
  | "aria-live"
  | "children"
  | "role"
  | "tabIndex"
> {
  /** Reserved: Spinner is decorative and never owns announcement atomicity. */
  readonly "aria-atomic"?: never;
  /** Reserved: Spinner cannot describe another element or expose loading semantics. */
  readonly "aria-describedby"?: never;
  /** Reserved: Spinner always renders with `aria-hidden="true"`. */
  readonly "aria-hidden"?: never;
  /** Reserved: pair Spinner with a named BusyRegion instead of naming the glyph. */
  readonly "aria-label"?: never;
  /** Reserved: decorative spinners cannot reference an accessible name. */
  readonly "aria-labelledby"?: never;
  /** Reserved: Spinner never creates a live region. */
  readonly "aria-live"?: never;
  /** Reserved: Spinner is a decorative glyph and cannot contain content. */
  readonly children?: never;
  /** Reserved: Spinner is always accessibility-hidden and has no semantic role. */
  readonly role?: never;
  /** Visual glyph size; defaults to `medium`. */
  readonly size?: SpinnerSize;
  /** Reserved: Spinner is never focusable. */
  readonly tabIndex?: never;
}

function assertNoSpinnerSemanticOverrides(props: Readonly<Record<string, unknown>>): void {
  for (const key of [
    "aria-atomic",
    "aria-describedby",
    "aria-hidden",
    "aria-label",
    "aria-labelledby",
    "aria-live",
    "children",
    "role",
    "tabIndex",
  ] as const) {
    if (props[key] !== undefined) {
      throw new Error(`Mergora Spinner owns ${key} and does not accept a semantic override.`);
    }
  }
}

export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(props, ref) {
  assertNoSpinnerSemanticOverrides(props as unknown as Readonly<Record<string, unknown>>);
  const { className, size = "medium", ...nativeProps } = props;
  if (!(["small", "medium", "large"] as const).includes(size)) {
    throw new Error("Mergora Spinner size must be small, medium, or large.");
  }
  return (
    <span
      {...nativeProps}
      aria-hidden="true"
      className={className === undefined ? "mrg-spinner" : `mrg-spinner ${className}`}
      data-size={size}
      data-slot="spinner"
      ref={ref}
    />
  );
});

Spinner.displayName = "Spinner";

type BusyRegionName =
  | {
      /** Non-empty accessible name applied directly to the busy region. */
      readonly label: string;
      /** Unavailable when `label` directly names the region. */
      readonly labelledBy?: never;
    }
  | {
      /** Unavailable when `labelledBy` references the visible region name. */
      readonly label?: never;
      /** Non-empty element id that supplies the busy region's accessible name. */
      readonly labelledBy: string;
    };

export type BusyRegionProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "aria-atomic" | "aria-busy" | "aria-label" | "aria-labelledby" | "aria-live" | "children" | "role"
> &
  BusyRegionName & {
    /** Reserved: BusyRegion's optional announcement uses the shared announcer. */
    readonly "aria-atomic"?: never;
    /** Reserved: BusyRegion maps `busy` to its native busy state. */
    readonly "aria-busy"?: never;
    /** Reserved: use the mutually exclusive `label` naming option. */
    readonly "aria-label"?: never;
    /** Reserved: use the mutually exclusive `labelledBy` naming option. */
    readonly "aria-labelledby"?: never;
    /** Reserved: opt into external polite transitions with `announce`. */
    readonly "aria-live"?: never;
    /** Announces each inactive-to-active transition through the shared announcer. */
    readonly announce?: boolean;
    /** Native `aria-busy` state for the named region; defaults to true. */
    readonly busy?: boolean;
    /** Non-empty localized transition summary; defaults to the provider loading message. */
    readonly busyMessage?: string;
    /** Region content that remains outside every generated live region. */
    readonly children: ReactNode;
    /** Reserved: BusyRegion always owns native `region` semantics. */
    readonly role?: never;
  };

function assertNoBusyRegionSemanticOverrides(props: Readonly<Record<string, unknown>>): void {
  for (const key of [
    "aria-atomic",
    "aria-busy",
    "aria-label",
    "aria-labelledby",
    "aria-live",
    "role",
  ] as const) {
    if (props[key] !== undefined) {
      throw new Error(`Mergora BusyRegion owns ${key} and does not accept a semantic override.`);
    }
  }
}

function BusyRegionAnnouncement({
  active,
  dedupeKey,
  message,
}: {
  readonly active: boolean;
  readonly dedupeKey: string;
  readonly message: string;
}) {
  const { announce } = useAnnouncer();
  const wasActive = useRef(false);

  useEffect(() => {
    const started = active && !wasActive.current;
    wasActive.current = active;
    if (started) {
      announce(message, {
        dedupeKey,
        priority: "polite",
      });
    }
  }, [active, announce, dedupeKey, message]);

  return null;
}

export const BusyRegion = forwardRef<HTMLDivElement, BusyRegionProps>(
  function BusyRegion(props, ref) {
    assertNoBusyRegionSemanticOverrides(props as unknown as Readonly<Record<string, unknown>>);
    const {
      announce = false,
      busy = true,
      busyMessage: busyMessageProp,
      children,
      className,
      label,
      labelledBy,
      ...nativeProps
    } = props;

    if (label !== undefined && (typeof label !== "string" || label.trim().length === 0)) {
      throw new Error("Mergora BusyRegion label must be non-empty.");
    }
    if (
      labelledBy !== undefined &&
      (typeof labelledBy !== "string" || labelledBy.trim().length === 0)
    ) {
      throw new Error("Mergora BusyRegion labelledBy must be non-empty.");
    }
    if ((label === undefined) === (labelledBy === undefined)) {
      throw new Error("Mergora BusyRegion requires exactly one of label or labelledBy.");
    }
    if (typeof busy !== "boolean") {
      throw new Error("Mergora BusyRegion busy must be a boolean when provided.");
    }
    if (typeof announce !== "boolean") {
      throw new Error("Mergora BusyRegion announce must be a boolean when provided.");
    }
    if (
      busyMessageProp !== undefined &&
      (typeof busyMessageProp !== "string" || busyMessageProp.trim().length === 0)
    ) {
      throw new Error("Mergora BusyRegion busyMessage must be non-empty when provided.");
    }

    const { getMessage } = useMergoraContext();
    const busyMessage = announce
      ? (busyMessageProp ?? getMessage("spinner.busy", "Loading")).trim()
      : "";
    if (announce && busyMessage.length === 0) {
      throw new Error("Mergora BusyRegion requires a non-empty localized busy message.");
    }
    const reactId = useId();
    const dedupeKey = `busy-region:${reactId}:${busyMessage}`;

    return (
      <>
        {announce ? (
          <BusyRegionAnnouncement active={busy} dedupeKey={dedupeKey} message={busyMessage} />
        ) : null}
        <div
          {...nativeProps}
          {...(label === undefined ? { "aria-labelledby": labelledBy } : { "aria-label": label })}
          aria-busy={busy}
          className={className === undefined ? "mrg-busy-region" : `mrg-busy-region ${className}`}
          data-announcement={announce ? "polite" : "off"}
          data-slot="busy-region"
          ref={ref}
          role="region"
        >
          {children}
        </div>
      </>
    );
  },
);

BusyRegion.displayName = "BusyRegion";

export const SpinnerParts = { BusyRegion, Visual: Spinner } as const;
