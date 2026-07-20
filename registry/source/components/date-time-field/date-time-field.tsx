"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

import {
  mergeTemporalRefs,
  nativeTemporalInputProps,
  useNativeTemporalControl,
} from "../date-field/date-time-utils.js";
import "./date-time-field.css";

/** Selects an occurrence for repeated local wall times, or rejects the ambiguity. */
export type DateTimeAmbiguityPolicy = "earlier" | "later" | "reject";

/** Adapter result describing a valid, repeated, or nonexistent local wall time. */
export type DateTimeWallTimeResolution =
  | {
      /** Resolved absolute instant submitted when the local wall time is valid. */
      readonly instant: string;
      /** Discriminant for a local wall time with one valid instant. */
      readonly kind: "valid";
      /** Optional user-facing adapter explanation for the resolution. */
      readonly message?: string | undefined;
    }
  | {
      /** Absolute instant for the first occurrence of a repeated local wall time. */
      readonly earlierInstant: string;
      /** Discriminant for a local wall time that occurs twice. */
      readonly kind: "ambiguous";
      /** Absolute instant for the second occurrence of a repeated local wall time. */
      readonly laterInstant: string;
      /** Optional user-facing adapter explanation for the ambiguity. */
      readonly message?: string | undefined;
    }
  | {
      /** Discriminant for a local wall time skipped by a time-zone transition. */
      readonly kind: "nonexistent";
      /** Optional user-facing adapter explanation for the unavailable wall time. */
      readonly message?: string | undefined;
    };

export interface DateTimeWallTimeAdapter {
  /** Resolves a native local date-time value within the explicitly supplied IANA time zone. */
  readonly resolveLocalWallTime: (input: {
    /** Native `datetime-local` value without an implicit browser time zone. */
    readonly localValue: string;
    /** Explicit time-zone identifier supplied by the DateTimeField consumer. */
    readonly timeZone: string;
  }) => DateTimeWallTimeResolution;
}

export interface DateTimeWallTimeStatus {
  /** Optional adapter explanation retained for custom status and validation copy. */
  readonly adapterMessage?: string | undefined;
  /** Ambiguity policy used to determine whether a repeated time is valid. */
  readonly ambiguityPolicy: DateTimeAmbiguityPolicy;
  /** First candidate instant when `kind` is `ambiguous`. */
  readonly earlierInstant?: string | undefined;
  /** Selected absolute instant, or `null` when wall-time validation rejects the value. */
  readonly instant: string | null;
  /** Normalized outcome, including recoverable adapter failures. */
  readonly kind: "adapter-error" | "ambiguous" | "nonexistent" | "valid";
  /** Second candidate instant when `kind` is `ambiguous`. */
  readonly laterInstant?: string | undefined;
  /** Native local date-time value passed to the wall-time adapter. */
  readonly localValue: string;
  /** Explicit time-zone identifier used for the resolution. */
  readonly timeZone: string;
  /** Whether native validation and resolved-instant submission may proceed. */
  readonly valid: boolean;
}

export interface DateTimeFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "onChange" | "type" | "value"
> {
  /** Chooses the earlier or later occurrence of repeated wall time, or rejects it. */
  readonly ambiguityPolicy?: DateTimeAmbiguityPolicy;
  /** Initial native local date-time value for uncontrolled use and form reset. */
  readonly defaultValue?: string;
  /** Produces the linked live status and native custom-validity message for a resolution. */
  readonly getWallTimeMessage?: ((status: DateTimeWallTimeStatus) => string) | undefined;
  /** Receives the original native datetime-local change event after state is updated. */
  readonly onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"];
  /** Reports local date-time edits and native form-reset restoration. */
  readonly onValueChange?: (value: string) => void;
  /** Reports normalized wall-time status, including `null` for an empty enabled field. */
  readonly onWallTimeResolutionChange?:
    ((status: DateTimeWallTimeStatus | null) => void) | undefined;
  /** Native form field name for the hidden resolved instant, rendered only while resolution is valid. */
  readonly resolvedName?: string | undefined;
  /** Adds linked time-zone context; `false` removes its UI and accessibility output. */
  readonly showTimeZoneContext?: boolean;
  /** Explicit time zone for display and required wall-time adapter resolution. */
  readonly timeZone?: string | undefined;
  /** Custom time-zone context content or renderer used when context is enabled. */
  readonly timeZoneContext?: ReactNode | ((timeZone: string) => ReactNode);
  /** Controlled native local date-time value; pair with `onValueChange`. */
  readonly value?: string;
  /** Optional wall-time resolver; `false` removes validation, status, callbacks, and resolved output. */
  readonly wallTimeAdapter?: false | DateTimeWallTimeAdapter;
}

function isUsableInstant(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function resolveWallTime(
  adapter: DateTimeWallTimeAdapter,
  localValue: string,
  timeZone: string,
  ambiguityPolicy: DateTimeAmbiguityPolicy,
): DateTimeWallTimeStatus {
  const base = { ambiguityPolicy, localValue, timeZone } as const;
  try {
    const resolution = adapter.resolveLocalWallTime({ localValue, timeZone });
    if (resolution.kind === "valid" && isUsableInstant(resolution.instant)) {
      return {
        ...base,
        adapterMessage: resolution.message,
        instant: resolution.instant,
        kind: "valid",
        valid: true,
      };
    }
    if (
      resolution.kind === "ambiguous" &&
      isUsableInstant(resolution.earlierInstant) &&
      isUsableInstant(resolution.laterInstant)
    ) {
      const instant =
        ambiguityPolicy === "earlier"
          ? resolution.earlierInstant
          : ambiguityPolicy === "later"
            ? resolution.laterInstant
            : null;
      return {
        ...base,
        adapterMessage: resolution.message,
        earlierInstant: resolution.earlierInstant,
        instant,
        kind: "ambiguous",
        laterInstant: resolution.laterInstant,
        valid: instant !== null,
      };
    }
    if (resolution.kind === "nonexistent") {
      return {
        ...base,
        adapterMessage: resolution.message,
        instant: null,
        kind: "nonexistent",
        valid: false,
      };
    }
  } catch {
    // Adapter failures are converted into recoverable native validation rather than escaping input.
  }
  return { ...base, instant: null, kind: "adapter-error", valid: false };
}

function defaultWallTimeMessage(status: DateTimeWallTimeStatus): string {
  if (status.adapterMessage !== undefined && status.adapterMessage.trim() !== "") {
    return status.adapterMessage;
  }
  if (status.kind === "valid") return `Resolved instant: ${status.instant}.`;
  if (status.kind === "ambiguous" && status.valid) {
    return `Repeated local time resolved with the ${status.ambiguityPolicy} occurrence.`;
  }
  if (status.kind === "ambiguous") {
    return `This local time occurs twice in ${status.timeZone}. Choose an earlier or later occurrence policy.`;
  }
  if (status.kind === "nonexistent") {
    return `This local time does not exist in ${status.timeZone}. Choose another local time.`;
  }
  return "This local time could not be verified. Choose another time or try again.";
}

export const DateTimeField = forwardRef<HTMLInputElement, DateTimeFieldProps>(
  function DateTimeField(
    {
      "aria-describedby": ariaDescribedBy,
      "aria-invalid": ariaInvalid,
      ambiguityPolicy = "reject",
      className,
      defaultValue = "",
      disabled = false,
      form,
      getWallTimeMessage = defaultWallTimeMessage,
      onChange,
      onValueChange,
      onWallTimeResolutionChange,
      resolvedName,
      showTimeZoneContext = false,
      timeZone,
      timeZoneContext,
      value,
      wallTimeAdapter = false,
      ...nativeProps
    },
    forwardedRef,
  ) {
    if (!(["earlier", "later", "reject"] as const).includes(ambiguityPolicy)) {
      throw new RangeError(
        "Mergora DateTimeField ambiguityPolicy must be earlier, later, or reject.",
      );
    }
    if (wallTimeAdapter !== false && (timeZone === undefined || timeZone.trim() === "")) {
      throw new RangeError(
        "Mergora DateTimeField requires an explicit timeZone when wallTimeAdapter is enabled.",
      );
    }
    const generatedId = useId().replaceAll(":", "");
    const control = useNativeTemporalControl({ defaultValue, onChange, onValueChange, value });
    const input = useRef<HTMLInputElement | null>(null);
    const context = useMemo(() => {
      if (!showTimeZoneContext) return null;
      const resolvedZone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      return typeof timeZoneContext === "function"
        ? timeZoneContext(resolvedZone)
        : (timeZoneContext ?? `Interpreted in ${resolvedZone}`);
    }, [showTimeZoneContext, timeZone, timeZoneContext]);
    const contextId = context === null ? undefined : `mrg-date-time-field-${generatedId}-zone`;
    const wallTimeStatus = useMemo(
      () =>
        wallTimeAdapter === false || control.value === "" || timeZone === undefined
          ? null
          : resolveWallTime(wallTimeAdapter, control.value, timeZone, ambiguityPolicy),
      [ambiguityPolicy, control.value, timeZone, wallTimeAdapter],
    );
    const wallTimeMessage =
      wallTimeStatus === null
        ? null
        : getWallTimeMessage(wallTimeStatus).trim() || defaultWallTimeMessage(wallTimeStatus);
    const wallTimeValidityMessage =
      wallTimeMessage === null || wallTimeMessage.trim() === ""
        ? "This local time is invalid. Choose another time."
        : wallTimeMessage;
    const wallTimeId =
      wallTimeMessage === null ? undefined : `mrg-date-time-field-${generatedId}-wall-time`;
    const wallTimeInvalid = wallTimeStatus !== null && !wallTimeStatus.valid;

    useEffect(() => {
      input.current?.setCustomValidity(wallTimeInvalid ? wallTimeValidityMessage : "");
      if (wallTimeAdapter !== false) onWallTimeResolutionChange?.(wallTimeStatus);
    }, [
      onWallTimeResolutionChange,
      wallTimeAdapter,
      wallTimeInvalid,
      wallTimeMessage,
      wallTimeStatus,
      wallTimeValidityMessage,
    ]);

    return (
      <span
        className="mrg-date-time-field"
        data-time-zone={contextId === undefined ? undefined : true}
        data-wall-time={wallTimeStatus?.kind}
      >
        <input
          {...nativeTemporalInputProps("datetime-local")}
          {...nativeProps}
          aria-describedby={
            [ariaDescribedBy, contextId, wallTimeId].filter(Boolean).join(" ") || undefined
          }
          aria-invalid={wallTimeInvalid ? true : ariaInvalid}
          className={
            className === undefined
              ? "mrg-date-time-field-control"
              : `mrg-date-time-field-control ${className}`
          }
          data-slot="date-time-field"
          disabled={disabled}
          form={form}
          onChange={control.onChange}
          ref={mergeTemporalRefs(control.inputRef, input, forwardedRef)}
          type="datetime-local"
          value={control.value}
        />
        {contextId === undefined ? null : (
          <span data-slot="date-time-field-zone" id={contextId}>
            {context}
          </span>
        )}
        {wallTimeStatus === null || wallTimeMessage === null ? null : (
          <output
            aria-live="polite"
            data-slot="date-time-field-wall-time"
            data-valid={wallTimeStatus.valid}
            id={wallTimeId}
          >
            {wallTimeMessage}
          </output>
        )}
        {wallTimeAdapter !== false &&
        resolvedName !== undefined &&
        resolvedName !== "" &&
        wallTimeStatus?.valid === true &&
        wallTimeStatus.instant !== null ? (
          <input
            data-slot="date-time-field-resolved-value"
            disabled={disabled}
            form={form}
            name={resolvedName}
            type="hidden"
            value={wallTimeStatus.instant}
          />
        ) : null}
      </span>
    );
  },
);

DateTimeField.displayName = "DateTimeField";
