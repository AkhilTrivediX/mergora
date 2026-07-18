// Generated from registry/source/components/spinner/spinner.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import { forwardRef, useEffect, useId, useRef, type HTMLAttributes, type ReactNode } from "react";

import { useMergoraMessage } from "../provider/index.js";
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
  readonly "aria-atomic"?: never;
  readonly "aria-describedby"?: never;
  readonly "aria-hidden"?: never;
  readonly "aria-label"?: never;
  readonly "aria-labelledby"?: never;
  readonly "aria-live"?: never;
  readonly children?: never;
  readonly role?: never;
  readonly size?: SpinnerSize;
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
  | { readonly label: string; readonly labelledBy?: never }
  | { readonly label?: never; readonly labelledBy: string };

export type BusyRegionProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "aria-atomic" | "aria-busy" | "aria-label" | "aria-labelledby" | "aria-live" | "children" | "role"
> &
  BusyRegionName & {
    readonly "aria-atomic"?: never;
    readonly "aria-busy"?: never;
    readonly "aria-label"?: never;
    readonly "aria-labelledby"?: never;
    readonly "aria-live"?: never;
    readonly announce?: boolean;
    readonly busy?: boolean;
    readonly busyMessage?: string;
    readonly children: ReactNode;
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

    const defaultBusyMessage = useMergoraMessage("spinner.busy", "Loading");
    const busyMessage = (busyMessageProp ?? defaultBusyMessage).trim();
    if (announce && busyMessage.length === 0) {
      throw new Error("Mergora BusyRegion requires a non-empty localized busy message.");
    }
    const reactId = useId();
    const dedupeKey = `busy-region:${reactId}:${busyMessage}`;

    return (
      <>
        <BusyRegionAnnouncement
          active={announce && busy}
          dedupeKey={dedupeKey}
          message={busyMessage}
        />
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
