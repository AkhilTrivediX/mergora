"use client";

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { useMergoraContext } from "../provider/index.js";
import "./resizable.css";

export type ResizableOrientation = "horizontal" | "vertical";
export type ResizableChangeReason =
  "keyboard" | "pointer" | "step-control" | "collapse" | "restore";

export interface ResizableChangeDetails {
  /** Reports the logical axis used for this value change. */
  readonly orientation: ResizableOrientation;
  /** Identifies whether keyboard, pointer, controls, collapse, or restore caused the change. */
  readonly reason: ResizableChangeReason;
}

export interface ResizableMessages {
  /** Labels the optional action that reduces the primary panel to its collapsed value. */
  readonly collapse: string;
  /** Names the optional group of explicit resize controls. */
  readonly controls: string;
  /** Labels the optional action that decreases the primary panel size. */
  readonly decrease: string;
  /** Labels the optional action that increases the primary panel size. */
  readonly increase: string;
  /** Labels the optional action that restores a collapsed primary panel. */
  readonly restore: string;
}

const DEFAULT_MESSAGES: ResizableMessages = {
  collapse: "Collapse panel",
  controls: "Resize controls",
  decrease: "Decrease panel size",
  increase: "Increase panel size",
  restore: "Restore panel",
};

export function clampResizableValue(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function formatResizableValue(value: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(value / 100);
}

function validateResizableRange(
  minimum: number,
  maximum: number,
  collapsedValue: number,
  collapsible: boolean,
): void {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum < 0 || maximum > 100) {
    throw new RangeError("Mergora Resizable min and max must be finite percentages from 0 to 100.");
  }
  if (minimum >= maximum) {
    throw new RangeError("Mergora Resizable min must be lower than max.");
  }
  if (
    collapsible &&
    (!Number.isFinite(collapsedValue) || collapsedValue < 0 || collapsedValue >= minimum)
  ) {
    throw new RangeError(
      "Mergora Resizable collapsedValue must be finite, non-negative, and lower than min.",
    );
  }
}

function joinClassName(base: string, className: string | undefined): string {
  return className === undefined || className.trim().length === 0 ? base : `${base} ${className}`;
}

interface ProcessLike {
  readonly env?: { readonly NODE_ENV?: string };
}

function isDevelopmentRuntime(): boolean {
  const viteProduction = (
    import.meta as ImportMeta & { readonly env?: { readonly PROD?: boolean } }
  ).env?.PROD;
  const runtime = globalThis as typeof globalThis & { readonly process?: ProcessLike };
  return viteProduction !== true && runtime.process?.env?.NODE_ENV !== "production";
}

interface ResizableContextValue {
  readonly collapsed: boolean;
  readonly collapsible: boolean;
  readonly disabled: boolean;
  readonly formatValue: (value: number) => string;
  readonly maximum: number;
  readonly messages: ResizableMessages;
  readonly minimum: number;
  readonly orientation: ResizableOrientation;
  readonly primaryId: string;
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly showStepControls: boolean;
  readonly valueMinimum: number;
  readonly step: number;
  readonly value: number;
  readonly changeValue: (value: number, reason: ResizableChangeReason, commit: boolean) => void;
  readonly commitCurrentValue: (reason: ResizableChangeReason) => void;
  readonly toggleCollapsed: () => void;
}

const ResizableContext = createContext<ResizableContextValue | null>(null);

function useResizableContext(part: string): ResizableContextValue {
  const context = useContext(ResizableContext);
  if (context === null) {
    throw new Error(`Mergora Resizable.${part} must be rendered inside Resizable.Root.`);
  }
  return context;
}

export interface ResizableRootProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange"
> {
  /** Supplies the primary, separator handle, and secondary panel parts. */
  readonly children?: ReactNode;
  /** Controls the primary panel percentage when supplied. */
  readonly value?: number;
  /** Sets the initial primary panel percentage for uncontrolled use. */
  readonly defaultValue?: number;
  /** Reports every controlled or uncontrolled value update with its interaction reason. */
  readonly onValueChange?: (value: number, details: ResizableChangeDetails) => void;
  /** Reports the final value after an interaction commits. */
  readonly onValueCommit?: (value: number, details: ResizableChangeDetails) => void;
  /** Sets the smallest expanded primary-panel percentage. */
  readonly min?: number;
  /** Sets the largest primary-panel percentage. */
  readonly max?: number;
  /** Sets the keyboard and explicit-control increment in percentage points. */
  readonly step?: number;
  /** Chooses whether resizing changes inline width or block height. */
  readonly orientation?: ResizableOrientation;
  /** Prevents pointer, keyboard, collapse, restore, and explicit-control changes. */
  readonly disabled?: boolean;
  /** Allows the primary panel to toggle below its expanded minimum. */
  readonly collapsible?: boolean;
  /** Sets the primary panel percentage used while collapsed. */
  readonly collapsedValue?: number;
  /** Overrides provider locale for the default percentage formatter. */
  readonly locale?: string;
  /** Overrides individual localized labels while preserving defaults for omitted entries. */
  readonly messages?: Partial<ResizableMessages>;
  /** Formats the current percentage for the separator value text. */
  readonly formatValue?: (value: number) => string;
  /** Renders explicit decrement, collapse, and increment buttons beside the separator. */
  readonly showStepControls?: boolean;
}

export const ResizableRoot = forwardRef<HTMLDivElement, ResizableRootProps>(function ResizableRoot(
  {
    children,
    className,
    collapsible = false,
    collapsedValue = 0,
    defaultValue,
    disabled = false,
    formatValue: formatValueProp,
    locale,
    max = 90,
    messages: messagesProp,
    min = 10,
    onValueChange,
    onValueCommit,
    orientation = "horizontal",
    showStepControls = true,
    step = 5,
    style,
    value: controlledValue,
    ...nativeProps
  },
  forwardedRef,
) {
  const mergora = useMergoraContext();
  const resolvedLocale = locale ?? mergora.locale;
  validateResizableRange(min, max, collapsedValue, collapsible);
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError("Mergora Resizable step must be a positive finite number.");
  }

  const normalizeValue = useCallback(
    (candidate: number) =>
      collapsible && candidate === collapsedValue
        ? collapsedValue
        : clampResizableValue(candidate, min, max),
    [collapsedValue, collapsible, max, min],
  );
  const [uncontrolledValue, setUncontrolledValue] = useState(() =>
    normalizeValue(defaultValue ?? 50),
  );
  const value = normalizeValue(controlledValue ?? uncontrolledValue);
  const valueRef = useRef(value);
  const lastExpandedValueRef = useRef(value === collapsedValue ? Math.max(min, 50) : value);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const primaryId = useId();

  useEffect(() => {
    valueRef.current = value;
    if (value !== collapsedValue) lastExpandedValueRef.current = value;
  }, [collapsedValue, value]);

  useEffect(() => {
    if (!isDevelopmentRuntime()) return;
    if (controlledValue !== undefined && defaultValue !== undefined) {
      console.warn(
        "Mergora Resizable.Root received both value and defaultValue. Remove defaultValue when controlling value.",
      );
    }
  }, [controlledValue, defaultValue]);

  const messages = useMemo(
    () => ({
      collapse: mergora.getMessage("resizable.collapse", DEFAULT_MESSAGES.collapse),
      controls: mergora.getMessage("resizable.controls", DEFAULT_MESSAGES.controls),
      decrease: mergora.getMessage("resizable.decrease", DEFAULT_MESSAGES.decrease),
      increase: mergora.getMessage("resizable.increase", DEFAULT_MESSAGES.increase),
      restore: mergora.getMessage("resizable.restore", DEFAULT_MESSAGES.restore),
      ...messagesProp,
    }),
    [mergora, messagesProp],
  );
  const formatValue = useCallback(
    (nextValue: number) =>
      formatValueProp?.(nextValue) ?? formatResizableValue(nextValue, resolvedLocale),
    [formatValueProp, resolvedLocale],
  );

  const emitValue = useCallback(
    (nextValue: number, reason: ResizableChangeReason, commit: boolean) => {
      const normalized = normalizeValue(nextValue);
      valueRef.current = normalized;
      if (normalized !== collapsedValue) lastExpandedValueRef.current = normalized;
      if (controlledValue === undefined) setUncontrolledValue(normalized);
      const details = { orientation, reason } satisfies ResizableChangeDetails;
      onValueChange?.(normalized, details);
      if (commit) onValueCommit?.(normalized, details);
    },
    [collapsedValue, controlledValue, normalizeValue, onValueChange, onValueCommit, orientation],
  );

  const commitCurrentValue = useCallback(
    (reason: ResizableChangeReason) => {
      onValueCommit?.(valueRef.current, { orientation, reason });
    },
    [onValueCommit, orientation],
  );

  const toggleCollapsed = useCallback(() => {
    if (!collapsible || disabled) return;
    if (valueRef.current === collapsedValue) {
      emitValue(lastExpandedValueRef.current, "restore", true);
    } else {
      lastExpandedValueRef.current = valueRef.current;
      emitValue(collapsedValue, "collapse", true);
    }
  }, [collapsedValue, collapsible, disabled, emitValue]);

  const setRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef !== null) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  const context = useMemo<ResizableContextValue>(
    () => ({
      changeValue: emitValue,
      collapsed: value === collapsedValue,
      collapsible,
      commitCurrentValue,
      disabled,
      formatValue,
      maximum: max,
      messages,
      minimum: min,
      orientation,
      primaryId,
      rootRef,
      showStepControls,
      step,
      toggleCollapsed,
      value,
      valueMinimum: collapsible ? collapsedValue : min,
    }),
    [
      collapsedValue,
      collapsible,
      commitCurrentValue,
      disabled,
      emitValue,
      formatValue,
      max,
      messages,
      min,
      orientation,
      primaryId,
      showStepControls,
      step,
      toggleCollapsed,
      value,
    ],
  );
  const rootStyle = {
    ...style,
    "--mrg-resizable-value": `${value}%`,
  } as CSSProperties;

  return (
    <ResizableContext.Provider value={context}>
      <div
        {...nativeProps}
        ref={setRootRef}
        className={joinClassName("mrg-resizable", className)}
        data-collapsible={collapsible ? "true" : "false"}
        data-disabled={disabled ? "true" : "false"}
        data-orientation={orientation}
        data-slot="resizable-root"
        data-state={value === collapsedValue ? "collapsed" : "expanded"}
        data-step-controls={showStepControls ? "true" : undefined}
        style={rootStyle}
      >
        {children}
      </div>
    </ResizableContext.Provider>
  );
});

ResizableRoot.displayName = "Resizable.Root";

export type ResizablePrimaryProps = HTMLAttributes<HTMLDivElement>;

export const ResizablePrimary = forwardRef<HTMLDivElement, ResizablePrimaryProps>(
  function ResizablePrimary({ className, id, ...nativeProps }, forwardedRef) {
    const context = useResizableContext("Primary");
    return (
      <div
        {...nativeProps}
        ref={forwardedRef}
        className={joinClassName("mrg-resizable__primary", className)}
        data-slot="resizable-primary"
        data-state={context.collapsed ? "collapsed" : "expanded"}
        hidden={context.collapsed || undefined}
        id={id ?? context.primaryId}
      />
    );
  },
);

ResizablePrimary.displayName = "Resizable.Primary";

export type ResizableSecondaryProps = HTMLAttributes<HTMLDivElement>;

export const ResizableSecondary = forwardRef<HTMLDivElement, ResizableSecondaryProps>(
  function ResizableSecondary({ className, ...nativeProps }, forwardedRef) {
    useResizableContext("Secondary");
    return (
      <div
        {...nativeProps}
        ref={forwardedRef}
        className={joinClassName("mrg-resizable__secondary", className)}
        data-slot="resizable-secondary"
      />
    );
  },
);

ResizableSecondary.displayName = "Resizable.Secondary";

type ResizableHandleName =
  | {
      /** Supplies a direct accessible name and is mutually exclusive with aria-labelledby. */
      readonly "aria-label": string;
      /** References an accessible name and is mutually exclusive with aria-label. */
      readonly "aria-labelledby"?: string;
    }
  | {
      /** Supplies a direct accessible name and is mutually exclusive with aria-labelledby. */
      readonly "aria-label"?: string;
      /** References an accessible name and is mutually exclusive with aria-label. */
      readonly "aria-labelledby": string;
    };

type ResizableHandleBaseProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "aria-label" | "aria-labelledby" | "children" | "role" | "tabIndex"
>;

export type ResizableHandleProps = ResizableHandleBaseProps & ResizableHandleName;

function spatialDirection(event: KeyboardEvent<HTMLDivElement>, orientation: ResizableOrientation) {
  if (orientation === "vertical") {
    if (event.key === "ArrowUp") return -1;
    if (event.key === "ArrowDown") return 1;
    return 0;
  }
  const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
  if (event.key === "ArrowLeft") return rtl ? 1 : -1;
  if (event.key === "ArrowRight") return rtl ? -1 : 1;
  return 0;
}

export const ResizableHandle = forwardRef<HTMLDivElement, ResizableHandleProps>(
  function ResizableHandle(
    {
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      className,
      onKeyDown,
      onPointerCancel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      ...nativeProps
    },
    forwardedRef,
  ) {
    const context = useResizableContext("Handle");

    const valueFromPointer = (event: PointerEvent<HTMLDivElement>): number => {
      const root = context.rootRef.current;
      if (root === null) return context.value;
      const bounds = root.getBoundingClientRect();
      if (context.orientation === "vertical") {
        if (bounds.height <= 0) return context.value;
        return ((event.clientY - bounds.top) / bounds.height) * 100;
      }
      if (bounds.width <= 0) return context.value;
      const rtl = getComputedStyle(root).direction === "rtl";
      return rtl
        ? ((bounds.right - event.clientX) / bounds.width) * 100
        : ((event.clientX - bounds.left) / bounds.width) * 100;
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
      onKeyDown?.(event);
      if (event.defaultPrevented || context.disabled) return;
      const spatialDelta = spatialDirection(event, context.orientation);
      if (spatialDelta !== 0) {
        event.preventDefault();
        context.changeValue(context.value + spatialDelta * context.step, "keyboard", true);
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        context.changeValue(
          event.key === "Home" ? context.minimum : context.maximum,
          "keyboard",
          true,
        );
        return;
      }
      if (event.key === "PageUp" || event.key === "PageDown") {
        event.preventDefault();
        const direction = event.key === "PageUp" ? 1 : -1;
        context.changeValue(context.value + direction * context.step * 2, "keyboard", true);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        context.toggleCollapsed();
      }
    };

    return (
      <div
        className="mrg-resizable__handle"
        data-orientation={context.orientation}
        data-slot="resizable-handle"
      >
        <div
          {...nativeProps}
          ref={forwardedRef}
          aria-controls={context.primaryId}
          aria-disabled={context.disabled || undefined}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-orientation={context.orientation === "horizontal" ? "vertical" : "horizontal"}
          aria-valuemax={context.maximum}
          aria-valuemin={context.valueMinimum}
          aria-valuenow={context.value}
          aria-valuetext={context.formatValue(context.value)}
          className={joinClassName("mrg-resizable__separator", className)}
          data-orientation={context.orientation}
          data-slot="resizable-separator"
          data-state={context.collapsed ? "collapsed" : "expanded"}
          onKeyDown={handleKeyDown}
          onPointerCancel={(event) => {
            onPointerCancel?.(event);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            context.commitCurrentValue("pointer");
          }}
          onPointerDown={(event) => {
            onPointerDown?.(event);
            if (event.defaultPrevented || context.disabled || event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            context.changeValue(valueFromPointer(event), "pointer", false);
          }}
          onPointerMove={(event) => {
            onPointerMove?.(event);
            if (
              event.defaultPrevented ||
              context.disabled ||
              !event.currentTarget.hasPointerCapture(event.pointerId)
            ) {
              return;
            }
            context.changeValue(valueFromPointer(event), "pointer", false);
          }}
          onPointerUp={(event) => {
            onPointerUp?.(event);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            context.commitCurrentValue("pointer");
          }}
          role="separator"
          tabIndex={context.disabled ? -1 : 0}
        >
          <span aria-hidden="true" className="mrg-resizable__grip" />
        </div>
        {context.showStepControls ? (
          <div
            aria-label={context.messages.controls}
            className="mrg-resizable__controls"
            role="group"
          >
            <button
              aria-label={context.messages.decrease}
              disabled={context.disabled || context.value <= context.minimum}
              onClick={() =>
                context.changeValue(context.value - context.step, "step-control", true)
              }
              type="button"
            >
              <span aria-hidden="true">−</span>
            </button>
            {context.collapsible && (
              <button
                aria-label={
                  context.collapsed ? context.messages.restore : context.messages.collapse
                }
                disabled={context.disabled}
                onClick={context.toggleCollapsed}
                type="button"
              >
                <span aria-hidden="true">{context.collapsed ? "↥" : "↧"}</span>
              </button>
            )}
            <button
              aria-label={context.messages.increase}
              disabled={context.disabled || context.value >= context.maximum}
              onClick={() =>
                context.changeValue(context.value + context.step, "step-control", true)
              }
              type="button"
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
        ) : null}
      </div>
    );
  },
);

ResizableHandle.displayName = "Resizable.Handle";

export const Resizable = Object.freeze({
  Handle: ResizableHandle,
  Primary: ResizablePrimary,
  Root: ResizableRoot,
  Secondary: ResizableSecondary,
});
