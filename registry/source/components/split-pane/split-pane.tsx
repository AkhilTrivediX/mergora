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

import { clampResizableValue, formatResizableValue } from "../resizable/resizable.js";
import { useMergoraContext } from "../provider/index.js";
import "./split-pane.css";

export type SplitPaneOrientation = "horizontal" | "vertical";
export type SplitPaneStackAt = "never" | "narrow";
export type SplitPaneChangeReason =
  "keyboard" | "pointer" | "step-control" | "collapse" | "restore" | "persistence-restore";

export interface SplitPaneChangeDetails {
  /** Identifies the separator that changed sizes, or null for persistence restoration. */
  readonly handleIndex: number | null;
  /** Reports the logical axis used for this size change. */
  readonly orientation: SplitPaneOrientation;
  /** Identifies the interaction or persistence operation that caused the change. */
  readonly reason: SplitPaneChangeReason;
}

export interface SplitPaneMessages {
  /** Labels the optional action that collapses the panel after a separator. */
  readonly collapseAfter: string;
  /** Labels the optional action that collapses the panel before a separator. */
  readonly collapseBefore: string;
  /** Names each optional group of explicit separator controls. */
  readonly controls: string;
  /** Labels the optional action that decreases the panel before a separator. */
  readonly decreaseBefore: string;
  /** Labels the optional action that increases the panel before a separator. */
  readonly increaseBefore: string;
  /** Labels the optional action that restores the panel after a separator. */
  readonly restoreAfter: string;
  /** Labels the optional action that restores the panel before a separator. */
  readonly restoreBefore: string;
}

export interface SplitPanePersistenceAdapter {
  /** Reads previously stored percentages and returns null when no value exists. */
  readonly read: (key: string) => readonly number[] | null;
  /** Stores normalized panel percentages under the consumer-owned key. */
  readonly write: (key: string, sizes: readonly number[]) => void;
}

export interface SplitPanePersistence {
  /** Supplies consumer-controlled synchronous storage without choosing a persistence backend. */
  readonly adapter: SplitPanePersistenceAdapter;
  /** Names the consumer-owned record passed to the persistence adapter. */
  readonly key: string;
}

const DEFAULT_MESSAGES: SplitPaneMessages = {
  collapseAfter: "Collapse following panel",
  collapseBefore: "Collapse preceding panel",
  controls: "Panel size controls",
  decreaseBefore: "Decrease preceding panel size",
  increaseBefore: "Increase preceding panel size",
  restoreAfter: "Restore following panel",
  restoreBefore: "Restore preceding panel",
};

const EPSILON = 0.0001;
const EMPTY_NUMBER_LIST: readonly number[] = Object.freeze([]);

function indexedValue(values: readonly number[] | undefined, index: number, fallback: number) {
  const value = values?.[index];
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

export function normalizeSplitPaneSizes(
  sizes: readonly number[],
  minimums: readonly number[] = [],
  maximums: readonly number[] = [],
  collapsiblePanels: readonly number[] = [],
): readonly number[] {
  if (sizes.length < 2) {
    throw new RangeError("Mergora SplitPane requires at least two panel sizes.");
  }
  const collapsible = new Set(collapsiblePanels);
  const minimum = sizes.map((_, index) => indexedValue(minimums, index, 10));
  const maximum = sizes.map((_, index) => indexedValue(maximums, index, 100));
  minimum.forEach((value, index) => {
    if (value < 0 || value > 100 || value >= maximum[index]!) {
      throw new RangeError(
        `Mergora SplitPane minSizes[${index}] must be non-negative and lower than its max.`,
      );
    }
  });
  maximum.forEach((value, index) => {
    if (value <= 0 || value > 100) {
      throw new RangeError(`Mergora SplitPane maxSizes[${index}] must be from 0 to 100.`);
    }
  });
  if (minimum.reduce((total, value) => total + value, 0) > 100 + EPSILON) {
    throw new RangeError("Mergora SplitPane minSizes cannot total more than 100 percent.");
  }
  if (maximum.reduce((total, value) => total + value, 0) < 100 - EPSILON) {
    throw new RangeError("Mergora SplitPane maxSizes must allow a total of 100 percent.");
  }
  for (const index of collapsible) {
    if (!Number.isInteger(index) || index < 0 || index >= sizes.length) {
      throw new RangeError(`Mergora SplitPane collapsible panel index ${index} is out of range.`);
    }
  }

  const finite = sizes.map((value) => (Number.isFinite(value) && value >= 0 ? value : 0));
  const rawTotal = finite.reduce((total, value) => total + value, 0);
  const scaled = finite.map((value) =>
    rawTotal > 0 ? (value / rawTotal) * 100 : 100 / sizes.length,
  );
  const result = scaled.map((value, index) => {
    if (collapsible.has(index) && finite[index] === 0) return 0;
    return clampResizableValue(value, minimum[index]!, maximum[index]!);
  });

  for (let pass = 0; pass < sizes.length * 3; pass += 1) {
    const difference = 100 - result.reduce((total, value) => total + value, 0);
    if (Math.abs(difference) <= EPSILON) break;
    const growing = difference > 0;
    const candidates = result
      .map((value, index) => ({
        capacity: growing
          ? maximum[index]! - value
          : value - (collapsible.has(index) && value === 0 ? 0 : minimum[index]!),
        index,
      }))
      .filter(({ capacity }) => capacity > EPSILON);
    if (candidates.length === 0) break;
    let remaining = Math.abs(difference);
    for (const candidate of candidates) {
      const share = remaining / (candidates.length - candidates.indexOf(candidate));
      const applied = Math.min(candidate.capacity, share);
      result[candidate.index] = result[candidate.index]! + (growing ? applied : -applied);
      remaining -= applied;
    }
  }

  const finalDifference = 100 - result.reduce((total, value) => total + value, 0);
  if (Math.abs(finalDifference) > 0.01) {
    throw new RangeError("Mergora SplitPane size constraints cannot produce a 100 percent layout.");
  }
  if (Math.abs(finalDifference) > EPSILON) {
    const index = result.findIndex((value, itemIndex) => {
      const next = value + finalDifference;
      return (
        next >= (collapsible.has(itemIndex) && value === 0 ? 0 : minimum[itemIndex]!) &&
        next <= maximum[itemIndex]!
      );
    });
    if (index >= 0) result[index] = result[index]! + finalDifference;
  }
  const rounded = result.map((value) => Math.round(value * 10_000) / 10_000);
  const roundingDifference =
    Math.round((100 - rounded.reduce((total, value) => total + value, 0)) * 10_000) / 10_000;
  if (Math.abs(roundingDifference) > 0) {
    const index = rounded.findIndex((value, itemIndex) => {
      const next = value + roundingDifference;
      return (
        next >= (collapsible.has(itemIndex) && value === 0 ? 0 : minimum[itemIndex]!) &&
        next <= maximum[itemIndex]!
      );
    });
    if (index >= 0) rounded[index] = rounded[index]! + roundingDifference;
  }
  return rounded;
}

function joinClassName(base: string, className: string | undefined): string {
  return className === undefined || className.trim().length === 0 ? base : `${base} ${className}`;
}

interface SplitPaneContextValue {
  readonly collapsiblePanels: ReadonlySet<number>;
  readonly disabled: boolean;
  readonly formatValue: (value: number, panelIndex: number) => string;
  readonly maximums: readonly number[];
  readonly messages: SplitPaneMessages;
  readonly minimums: readonly number[];
  readonly orientation: SplitPaneOrientation;
  readonly panelId: (index: number) => string;
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly showStepControls: boolean;
  readonly sizes: readonly number[];
  readonly step: number;
  readonly adjustHandle: (
    handleIndex: number,
    delta: number,
    reason: SplitPaneChangeReason,
    commit: boolean,
  ) => void;
  readonly commitCurrentSizes: (handleIndex: number, reason: SplitPaneChangeReason) => void;
  readonly moveHandleTo: (
    handleIndex: number,
    logicalPosition: number,
    reason: SplitPaneChangeReason,
    commit: boolean,
  ) => void;
  readonly togglePanel: (handleIndex: number, target: "before" | "after") => void;
}

const SplitPaneContext = createContext<SplitPaneContextValue | null>(null);

function useSplitPaneContext(part: string): SplitPaneContextValue {
  const context = useContext(SplitPaneContext);
  if (context === null) {
    throw new Error(`Mergora SplitPane.${part} must be rendered inside SplitPane.Root.`);
  }
  return context;
}

export interface SplitPaneRootProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange"
> {
  /** Supplies ordered panel and separator parts within one sizing context. */
  readonly children?: ReactNode;
  /** Controls all panel percentages when supplied. */
  readonly value?: readonly number[];
  /** Sets initial panel percentages for uncontrolled use. */
  readonly defaultValue?: readonly number[];
  /** Reports every controlled or uncontrolled size update with its interaction reason. */
  readonly onValueChange?: (sizes: readonly number[], details: SplitPaneChangeDetails) => void;
  /** Reports normalized sizes after an interaction commits. */
  readonly onValueCommit?: (sizes: readonly number[], details: SplitPaneChangeDetails) => void;
  /** Sets the smallest expanded percentage for each corresponding panel. */
  readonly minSizes?: readonly number[];
  /** Sets the largest percentage for each corresponding panel. */
  readonly maxSizes?: readonly number[];
  /** Lists panel indexes that separators may collapse to zero. */
  readonly collapsiblePanels?: readonly number[];
  /** Chooses whether resizing changes inline widths or block heights. */
  readonly orientation?: SplitPaneOrientation;
  /** Enables narrow-screen stacking or keeps the resizable layout at every width. */
  readonly stackAt?: SplitPaneStackAt;
  /** Sets the keyboard and explicit-control increment in percentage points. */
  readonly step?: number;
  /** Prevents pointer, keyboard, collapse, restore, and explicit-control changes. */
  readonly disabled?: boolean;
  /** Overrides provider locale for the default percentage formatter. */
  readonly locale?: string;
  /** Overrides individual localized labels while preserving defaults for omitted entries. */
  readonly messages?: Partial<SplitPaneMessages>;
  /** Formats a panel percentage for separator value text. */
  readonly formatValue?: (value: number, panelIndex: number) => string;
  /** Opts uncontrolled sizes into consumer-owned persistence; omit it to remove all storage IO. */
  readonly persistence?: SplitPanePersistence;
  /** Receives persistence read or write failures without converting them into render failures. */
  readonly onPersistenceError?: (error: unknown, operation: "read" | "write") => void;
  /** Renders explicit decrement, collapse, and increment buttons beside every separator. */
  readonly showStepControls?: boolean;
}

export const SplitPaneRoot = forwardRef<HTMLDivElement, SplitPaneRootProps>(function SplitPaneRoot(
  {
    children,
    className,
    collapsiblePanels: collapsiblePanelsProp = EMPTY_NUMBER_LIST,
    defaultValue,
    disabled = false,
    formatValue: formatValueProp,
    locale,
    maxSizes: maximumsProp = EMPTY_NUMBER_LIST,
    messages: messagesProp,
    minSizes: minimumsProp = EMPTY_NUMBER_LIST,
    onPersistenceError,
    onValueChange,
    onValueCommit,
    orientation = "horizontal",
    persistence,
    showStepControls = true,
    stackAt = "narrow",
    step = 5,
    value: controlledValue,
    ...nativeProps
  },
  forwardedRef,
) {
  const mergora = useMergoraContext();
  const resolvedLocale = locale ?? mergora.locale;
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError("Mergora SplitPane step must be a positive finite number.");
  }
  const sourceSizes = controlledValue ?? defaultValue ?? [50, 50];
  const panelCount = sourceSizes.length;
  const minimums = useMemo(
    () => sourceSizes.map((_, index) => indexedValue(minimumsProp, index, 10)),
    [minimumsProp, panelCount],
  );
  const maximums = useMemo(
    () => sourceSizes.map((_, index) => indexedValue(maximumsProp, index, 100)),
    [maximumsProp, panelCount],
  );
  const collapsiblePanels = useMemo(() => new Set(collapsiblePanelsProp), [collapsiblePanelsProp]);
  const normalize = useCallback(
    (candidate: readonly number[]) =>
      normalizeSplitPaneSizes(candidate, minimums, maximums, collapsiblePanelsProp),
    [collapsiblePanelsProp, maximums, minimums],
  );
  const [uncontrolledSizes, setUncontrolledSizes] = useState(() => normalize(sourceSizes));
  const sizes = normalize(controlledValue ?? uncontrolledSizes);
  const sizesRef = useRef(sizes);
  const restoredSizesRef = useRef(new Map<number, number>());
  const persistenceReadRef = useRef<{
    readonly adapter: SplitPanePersistenceAdapter;
    readonly key: string;
    readonly panelCount: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const baseId = useId();
  const persistenceAdapter = persistence?.adapter;
  const persistenceKey = persistence?.key;

  useEffect(() => {
    sizesRef.current = sizes;
  }, [sizes]);

  const messages = useMemo(
    () => ({
      collapseAfter: mergora.getMessage("splitPane.collapseAfter", DEFAULT_MESSAGES.collapseAfter),
      collapseBefore: mergora.getMessage(
        "splitPane.collapseBefore",
        DEFAULT_MESSAGES.collapseBefore,
      ),
      controls: mergora.getMessage("splitPane.controls", DEFAULT_MESSAGES.controls),
      decreaseBefore: mergora.getMessage(
        "splitPane.decreaseBefore",
        DEFAULT_MESSAGES.decreaseBefore,
      ),
      increaseBefore: mergora.getMessage(
        "splitPane.increaseBefore",
        DEFAULT_MESSAGES.increaseBefore,
      ),
      restoreAfter: mergora.getMessage("splitPane.restoreAfter", DEFAULT_MESSAGES.restoreAfter),
      restoreBefore: mergora.getMessage("splitPane.restoreBefore", DEFAULT_MESSAGES.restoreBefore),
      ...messagesProp,
    }),
    [mergora, messagesProp],
  );
  const formatValue = useCallback(
    (value: number, panelIndex = 0) =>
      formatValueProp?.(value, panelIndex) ?? formatResizableValue(value, resolvedLocale),
    [formatValueProp, resolvedLocale],
  );
  const detailsFor = useCallback(
    (handleIndex: number | null, reason: SplitPaneChangeReason) =>
      ({ handleIndex, orientation, reason }) satisfies SplitPaneChangeDetails,
    [orientation],
  );

  const writePersistence = useCallback(
    (nextSizes: readonly number[]) => {
      if (persistenceAdapter === undefined || persistenceKey === undefined) return;
      try {
        persistenceAdapter.write(persistenceKey, nextSizes);
      } catch (error) {
        onPersistenceError?.(error, "write");
      }
    },
    [onPersistenceError, persistenceAdapter, persistenceKey],
  );

  const emitSizes = useCallback(
    (
      candidate: readonly number[],
      handleIndex: number | null,
      reason: SplitPaneChangeReason,
      commit: boolean,
    ) => {
      const normalized = normalize(candidate);
      sizesRef.current = normalized;
      if (controlledValue === undefined) setUncontrolledSizes(normalized);
      const details = detailsFor(handleIndex, reason);
      onValueChange?.(normalized, details);
      if (commit) {
        onValueCommit?.(normalized, details);
        writePersistence(normalized);
      }
    },
    [controlledValue, detailsFor, normalize, onValueChange, onValueCommit, writePersistence],
  );

  useEffect(() => {
    if (
      controlledValue !== undefined ||
      persistenceAdapter === undefined ||
      persistenceKey === undefined
    ) {
      return;
    }
    const previousRead = persistenceReadRef.current;
    if (
      previousRead?.adapter === persistenceAdapter &&
      previousRead.key === persistenceKey &&
      previousRead.panelCount === panelCount
    ) {
      return;
    }
    persistenceReadRef.current = {
      adapter: persistenceAdapter,
      key: persistenceKey,
      panelCount,
    };
    try {
      const stored = persistenceAdapter.read(persistenceKey);
      if (stored !== null && stored.length === panelCount) {
        emitSizes(stored, null, "persistence-restore", false);
      }
    } catch (error) {
      onPersistenceError?.(error, "read");
    }
  }, [
    controlledValue,
    emitSizes,
    onPersistenceError,
    panelCount,
    persistenceAdapter,
    persistenceKey,
  ]);

  const adjustHandle = useCallback(
    (
      handleIndex: number,
      requestedDelta: number,
      reason: SplitPaneChangeReason,
      commit: boolean,
    ) => {
      const current = [...sizesRef.current];
      if (disabled || handleIndex < 0 || handleIndex >= current.length - 1) return;
      const before = current[handleIndex]!;
      const after = current[handleIndex + 1]!;
      const beforeMinimum =
        collapsiblePanels.has(handleIndex) && before === 0 ? 0 : minimums[handleIndex]!;
      const afterMinimum =
        collapsiblePanels.has(handleIndex + 1) && after === 0 ? 0 : minimums[handleIndex + 1]!;
      const lowerDelta = Math.max(beforeMinimum - before, after - maximums[handleIndex + 1]!);
      const upperDelta = Math.min(maximums[handleIndex]! - before, after - afterMinimum);
      const delta = clampResizableValue(requestedDelta, lowerDelta, upperDelta);
      current[handleIndex] = before + delta;
      current[handleIndex + 1] = after - delta;
      emitSizes(current, handleIndex, reason, commit);
    },
    [collapsiblePanels, disabled, emitSizes, maximums, minimums],
  );

  const moveHandleTo = useCallback(
    (
      handleIndex: number,
      logicalPosition: number,
      reason: SplitPaneChangeReason,
      commit: boolean,
    ) => {
      const current = sizesRef.current;
      const prior = current.slice(0, handleIndex).reduce((total, value) => total + value, 0);
      const requestedBefore = logicalPosition - prior;
      adjustHandle(handleIndex, requestedBefore - current[handleIndex]!, reason, commit);
    },
    [adjustHandle],
  );

  const commitCurrentSizes = useCallback(
    (handleIndex: number, reason: SplitPaneChangeReason) => {
      const details = detailsFor(handleIndex, reason);
      onValueCommit?.(sizesRef.current, details);
      writePersistence(sizesRef.current);
    },
    [detailsFor, onValueCommit, writePersistence],
  );

  const togglePanel = useCallback(
    (handleIndex: number, target: "before" | "after") => {
      const targetIndex = target === "before" ? handleIndex : handleIndex + 1;
      const current = [...sizesRef.current];
      if (disabled || !collapsiblePanels.has(targetIndex)) return;
      const others = current
        .map((_, index) => index)
        .filter((index) => index !== targetIndex)
        .sort((left, right) => {
          const adjacent = target === "before" ? targetIndex + 1 : targetIndex - 1;
          if (left === adjacent) return -1;
          if (right === adjacent) return 1;
          return Math.abs(left - targetIndex) - Math.abs(right - targetIndex);
        });

      if (current[targetIndex]! > EPSILON) {
        const removed = current[targetIndex]!;
        const capacity = others.reduce(
          (total, index) => total + (maximums[index]! - current[index]!),
          0,
        );
        if (capacity + EPSILON < removed) return;
        restoredSizesRef.current.set(targetIndex, current[targetIndex]!);
        current[targetIndex] = 0;
        let remaining = removed;
        for (const index of others) {
          const applied = Math.min(remaining, maximums[index]! - current[index]!);
          current[index] = current[index]! + applied;
          remaining -= applied;
          if (remaining <= EPSILON) break;
        }
        emitSizes(current, handleIndex, "collapse", true);
        return;
      }

      const desired = clampResizableValue(
        restoredSizesRef.current.get(targetIndex) ?? Math.max(minimums[targetIndex]!, 25),
        minimums[targetIndex]!,
        maximums[targetIndex]!,
      );
      const available = others.reduce((total, index) => {
        const floor = collapsiblePanels.has(index) && current[index] === 0 ? 0 : minimums[index]!;
        return total + (current[index]! - floor);
      }, 0);
      if (available + EPSILON < desired) return;
      current[targetIndex] = desired;
      let remaining = desired;
      for (const index of others) {
        const floor = collapsiblePanels.has(index) && current[index] === 0 ? 0 : minimums[index]!;
        const applied = Math.min(remaining, current[index]! - floor);
        current[index] = current[index]! - applied;
        remaining -= applied;
        if (remaining <= EPSILON) break;
      }
      emitSizes(current, handleIndex, "restore", true);
    },
    [collapsiblePanels, disabled, emitSizes, maximums, minimums],
  );

  const setRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef !== null) forwardedRef.current = node;
    },
    [forwardedRef],
  );
  const panelId = useCallback((index: number) => `${baseId}-panel-${index}`, [baseId]);
  const context = useMemo<SplitPaneContextValue>(
    () => ({
      adjustHandle,
      collapsiblePanels,
      commitCurrentSizes,
      disabled,
      formatValue,
      maximums,
      messages,
      minimums,
      moveHandleTo,
      orientation,
      panelId,
      rootRef,
      showStepControls,
      sizes,
      step,
      togglePanel,
    }),
    [
      adjustHandle,
      collapsiblePanels,
      commitCurrentSizes,
      disabled,
      formatValue,
      maximums,
      messages,
      minimums,
      moveHandleTo,
      orientation,
      panelId,
      showStepControls,
      sizes,
      step,
      togglePanel,
    ],
  );

  return (
    <SplitPaneContext.Provider value={context}>
      <div
        {...nativeProps}
        ref={setRootRef}
        className={joinClassName("mrg-split-pane", className)}
        data-disabled={disabled ? "true" : "false"}
        data-orientation={orientation}
        data-panel-count={sizes.length}
        data-slot="split-pane-root"
        data-step-controls={showStepControls ? "true" : undefined}
      >
        <div
          className="mrg-split-pane__layout"
          data-orientation={orientation}
          data-slot="split-pane-layout"
          data-stack-at={stackAt}
        >
          {children}
        </div>
      </div>
    </SplitPaneContext.Provider>
  );
});

SplitPaneRoot.displayName = "SplitPane.Root";

export interface SplitPanePanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Associates this panel with the corresponding root size and adjacent separators. */
  readonly index: number;
  /** Adds region semantics and an accessible name only when supplied. */
  readonly regionLabel?: string;
}

export const SplitPanePanel = forwardRef<HTMLDivElement, SplitPanePanelProps>(
  function SplitPanePanel({ className, index, regionLabel, style, ...nativeProps }, forwardedRef) {
    const context = useSplitPaneContext("Panel");
    const size = context.sizes[index];
    if (size === undefined) {
      throw new RangeError(`Mergora SplitPane.Panel index ${index} has no matching root size.`);
    }
    const panelStyle = {
      ...style,
      "--mrg-split-pane-panel-size": `${size}%`,
    } as CSSProperties;
    const collapsed = context.collapsiblePanels.has(index) && size <= EPSILON;
    return (
      <div
        {...nativeProps}
        ref={forwardedRef}
        aria-label={regionLabel}
        className={joinClassName("mrg-split-pane__panel", className)}
        data-index={index}
        data-slot="split-pane-panel"
        data-state={collapsed ? "collapsed" : "expanded"}
        id={nativeProps.id ?? context.panelId(index)}
        role={regionLabel === undefined ? nativeProps.role : (nativeProps.role ?? "region")}
        style={panelStyle}
      />
    );
  },
);

SplitPanePanel.displayName = "SplitPane.Panel";

type SplitPaneHandleName =
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

type SplitPaneHandleBaseProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "aria-label" | "aria-labelledby" | "children" | "role" | "tabIndex"
> & {
  /** Chooses which adjacent collapsible panel the optional action toggles. */
  readonly collapseTarget?: "before" | "after";
  /** Associates the separator with panels at this index and the following index. */
  readonly index: number;
};

export type SplitPaneHandleProps = SplitPaneHandleBaseProps & SplitPaneHandleName;

function spatialDirection(event: KeyboardEvent<HTMLDivElement>, orientation: SplitPaneOrientation) {
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

export const SplitPaneHandle = forwardRef<HTMLDivElement, SplitPaneHandleProps>(
  function SplitPaneHandle(
    {
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      className,
      collapseTarget,
      index,
      onKeyDown,
      onPointerCancel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      ...nativeProps
    },
    forwardedRef,
  ) {
    const context = useSplitPaneContext("Handle");
    if (index < 0 || index >= context.sizes.length - 1) {
      throw new RangeError(`Mergora SplitPane.Handle index ${index} is out of range.`);
    }
    const value = context.sizes[index]!;
    const nextValue = context.sizes[index + 1]!;
    const pairTotal = value + nextValue;
    const effectiveMinimum = Math.max(
      context.collapsiblePanels.has(index) && value <= EPSILON ? 0 : context.minimums[index]!,
      pairTotal - context.maximums[index + 1]!,
    );
    const effectiveMaximum = Math.min(
      context.maximums[index]!,
      pairTotal -
        (context.collapsiblePanels.has(index + 1) && nextValue <= EPSILON
          ? 0
          : context.minimums[index + 1]!),
    );
    const targetIndex = collapseTarget === "after" ? index + 1 : index;
    const targetIsCollapsible =
      collapseTarget !== undefined && context.collapsiblePanels.has(targetIndex);
    const targetIsCollapsed = targetIsCollapsible && context.sizes[targetIndex]! <= EPSILON;

    const pointerPosition = (event: PointerEvent<HTMLDivElement>): number => {
      const root = context.rootRef.current;
      if (root === null) return 0;
      const bounds = root.getBoundingClientRect();
      if (context.orientation === "vertical") {
        return bounds.height <= 0 ? 0 : ((event.clientY - bounds.top) / bounds.height) * 100;
      }
      if (bounds.width <= 0) return 0;
      const rtl = getComputedStyle(root).direction === "rtl";
      return rtl
        ? ((bounds.right - event.clientX) / bounds.width) * 100
        : ((event.clientX - bounds.left) / bounds.width) * 100;
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
      onKeyDown?.(event);
      if (event.defaultPrevented || context.disabled) return;
      const direction = spatialDirection(event, context.orientation);
      if (direction !== 0) {
        event.preventDefault();
        context.adjustHandle(index, direction * context.step, "keyboard", true);
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const target = event.key === "Home" ? effectiveMinimum : effectiveMaximum;
        context.adjustHandle(index, target - value, "keyboard", true);
        return;
      }
      if (event.key === "PageUp" || event.key === "PageDown") {
        event.preventDefault();
        context.adjustHandle(
          index,
          (event.key === "PageUp" ? 1 : -1) * context.step * 2,
          "keyboard",
          true,
        );
        return;
      }
      if (event.key === "Enter" && targetIsCollapsible) {
        event.preventDefault();
        context.togglePanel(index, collapseTarget ?? "before");
      }
    };

    const collapseLabel =
      collapseTarget === "after"
        ? targetIsCollapsed
          ? context.messages.restoreAfter
          : context.messages.collapseAfter
        : targetIsCollapsed
          ? context.messages.restoreBefore
          : context.messages.collapseBefore;

    return (
      <div
        className="mrg-split-pane__handle"
        data-orientation={context.orientation}
        data-slot="split-pane-handle"
      >
        <div
          {...nativeProps}
          ref={forwardedRef}
          aria-controls={`${context.panelId(index)} ${context.panelId(index + 1)}`}
          aria-disabled={context.disabled || undefined}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-orientation={context.orientation === "horizontal" ? "vertical" : "horizontal"}
          aria-valuemax={effectiveMaximum}
          aria-valuemin={effectiveMinimum}
          aria-valuenow={value}
          aria-valuetext={context.formatValue(value, index)}
          className={joinClassName("mrg-split-pane__separator", className)}
          data-index={index}
          data-orientation={context.orientation}
          data-slot="split-pane-separator"
          onKeyDown={handleKeyDown}
          onPointerCancel={(event) => {
            onPointerCancel?.(event);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            context.commitCurrentSizes(index, "pointer");
          }}
          onPointerDown={(event) => {
            onPointerDown?.(event);
            if (event.defaultPrevented || context.disabled || event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            context.moveHandleTo(index, pointerPosition(event), "pointer", false);
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
            context.moveHandleTo(index, pointerPosition(event), "pointer", false);
          }}
          onPointerUp={(event) => {
            onPointerUp?.(event);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            context.commitCurrentSizes(index, "pointer");
          }}
          role="separator"
          tabIndex={context.disabled ? -1 : 0}
        >
          <span aria-hidden="true" className="mrg-split-pane__grip" />
        </div>
        {context.showStepControls ? (
          <div
            aria-label={context.messages.controls}
            className="mrg-split-pane__controls"
            role="group"
          >
            <button
              aria-label={context.messages.decreaseBefore}
              disabled={context.disabled || value <= effectiveMinimum + EPSILON}
              onClick={() => context.adjustHandle(index, -context.step, "step-control", true)}
              type="button"
            >
              <span aria-hidden="true">−</span>
            </button>
            {targetIsCollapsible && (
              <button
                aria-label={collapseLabel}
                disabled={context.disabled}
                onClick={() => context.togglePanel(index, collapseTarget ?? "before")}
                type="button"
              >
                <span aria-hidden="true">{targetIsCollapsed ? "↥" : "↧"}</span>
              </button>
            )}
            <button
              aria-label={context.messages.increaseBefore}
              disabled={context.disabled || value >= effectiveMaximum - EPSILON}
              onClick={() => context.adjustHandle(index, context.step, "step-control", true)}
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

SplitPaneHandle.displayName = "SplitPane.Handle";

export const SplitPane = Object.freeze({
  Handle: SplitPaneHandle,
  Panel: SplitPanePanel,
  Root: SplitPaneRoot,
});
