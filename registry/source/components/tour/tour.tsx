"use client";

import {
  Fragment,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import "./tour.css";

export type TourCloseReason = "complete" | "dismiss" | "skip";
export type TourFocusPolicy = "panel" | "preserve";

export interface TourStep {
  /** Required explanatory content associated with the step heading. */
  readonly description: ReactNode;
  /** Stable non-empty identifier, unique within the tour. */
  readonly id: string;
  /** Optional route requested through the consumer-owned route adapter. */
  readonly route?: string;
  /** Optional DOM id used to anchor and monitor the step target. */
  readonly targetId?: string;
  /** Visible heading and accessible name for the step region. */
  readonly title: ReactNode;
}

export interface TourRouteAdapter {
  /** Requests consumer-owned navigation for an opened routed step. */
  readonly navigate: (route: string, step: TourStep) => void;
}

export interface TourTargetRecovery {
  /** Missing-target status content or a function derived from the current step. */
  readonly message: ReactNode | ((step: TourStep) => ReactNode);
  /** Optional hook invoked before the tour measures the target again. */
  readonly onRetry?: (step: TourStep) => void;
  /** Visible label for the native target-retry button. */
  readonly retryLabel: ReactNode;
}

function hasAccessibleContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasAccessibleContent);
  if (isValidElement<{ readonly children?: ReactNode }>(value)) {
    if (value.type === Fragment) return hasAccessibleContent(value.props.children);
    return true;
  }
  return true;
}

export interface TourProps extends Omit<React.ComponentPropsWithoutRef<"div">, "children"> {
  /** Adds a polite live status containing the current step position and title. */
  readonly announceStepChanges?: boolean;
  /** Visible label for the previous-step action. */
  readonly backLabel?: ReactNode;
  /** Visible label for the final completion action. */
  readonly completeLabel?: ReactNode;
  /** Initial open state for uncontrolled use. */
  readonly defaultOpen?: boolean;
  /** Initial step identifier for uncontrolled use; defaults to the first step. */
  readonly defaultStepId?: string;
  /** Chooses whether opening preserves focus or moves it to the non-trapping panel. */
  readonly focusPolicy?: TourFocusPolicy;
  /** Visible label for the next-step action. */
  readonly nextLabel?: ReactNode;
  /** Called before the final step closes with the complete reason. */
  readonly onComplete?: () => void;
  /** Reports open-state changes and a close reason when available. */
  readonly onOpenChange?: (open: boolean, reason?: TourCloseReason) => void;
  /** Called with the current step before the tour closes as skipped. */
  readonly onSkip?: (step: TourStep) => void;
  /** Reports every committed current-step identifier change. */
  readonly onStepIdChange?: (id: string) => void;
  /** Controlled open state; pair with onOpenChange. */
  readonly open?: boolean;
  /** Preferred focus-restoration target; the internal trigger is the fallback. */
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  /** Consumer-owned navigation adapter called once per opened routed step. */
  readonly routeAdapter?: TourRouteAdapter;
  /** Adds a progressbar with the current and total step positions. */
  readonly showProgress?: boolean;
  /** Visible label for the action that skips and closes the tour. */
  readonly skipLabel?: ReactNode;
  /** Controlled current-step identifier; pair with onStepIdChange. */
  readonly stepId?: string;
  /** Non-empty ordered steps with unique identifiers. */
  readonly steps: readonly TourStep[];
  /** Missing-target recovery configuration; false removes status, retry UI, and callbacks. */
  readonly targetRecovery?: false | TourTargetRecovery;
  /** Optional internal trigger content; omission removes the trigger element. */
  readonly triggerLabel?: ReactNode;
}

export const Tour = forwardRef<HTMLDivElement, TourProps>(function Tour(
  {
    announceStepChanges = false,
    backLabel = "Back",
    className,
    completeLabel = "Finish",
    defaultOpen = false,
    defaultStepId,
    focusPolicy = "preserve",
    nextLabel = "Next",
    onKeyDown,
    onComplete,
    onOpenChange,
    onSkip,
    onStepIdChange,
    open,
    returnFocusRef,
    routeAdapter,
    showProgress = false,
    skipLabel = "Skip tour",
    stepId,
    steps,
    targetRecovery = false,
    triggerLabel,
    ...props
  },
  ref,
) {
  if (steps.length === 0) throw new Error("Mergora Tour requires at least one step.");
  const ids = new Set<string>();
  for (const step of steps) {
    if (step.id.trim().length === 0 || ids.has(step.id)) {
      throw new Error("Mergora Tour step ids must be non-empty and unique.");
    }
    ids.add(step.id);
    if (step.targetId !== undefined && step.targetId.trim().length === 0) {
      throw new Error("Mergora Tour targetId must be non-empty when supplied.");
    }
  }
  const initialStepId = defaultStepId ?? steps[0]?.id;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [uncontrolledStepId, setUncontrolledStepId] = useState(initialStepId);
  const [targetFound, setTargetFound] = useState(true);
  const [anchor, setAnchor] = useState<{ readonly x: number; readonly y: number } | null>(null);
  const resolvedOpen = open ?? uncontrolledOpen;
  const resolvedStepId = stepId ?? uncontrolledStepId;
  const currentIndex = steps.findIndex((step) => step.id === resolvedStepId);
  if (currentIndex < 0) throw new Error("Mergora Tour stepId must identify a step.");
  const currentStep = steps[currentIndex];
  if (currentStep === undefined) throw new Error("Mergora Tour current step is unavailable.");
  const titleId = `mrg-tour-title-${useId().replaceAll(":", "")}`;
  const descriptionId = `${titleId}-description`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const routeRequestRef = useRef<string | null>(null);
  const previousOpenRef = useRef(resolvedOpen);

  const restoreFocus = useCallback(() => {
    queueMicrotask(() => (returnFocusRef?.current ?? triggerRef.current)?.focus());
  }, [returnFocusRef]);
  const setOpen = useCallback(
    (next: boolean, reason?: TourCloseReason) => {
      if (open === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next, reason);
    },
    [onOpenChange, open],
  );
  const setStep = (next: string) => {
    if (stepId === undefined) setUncontrolledStepId(next);
    onStepIdChange?.(next);
  };
  const measureTarget = useCallback(() => {
    if (currentStep.targetId === undefined) {
      setAnchor(null);
      setTargetFound(true);
      return;
    }
    const target = document.getElementById(currentStep.targetId);
    if (target === null) {
      setAnchor(null);
      setTargetFound(false);
      return;
    }
    const rect = target.getBoundingClientRect();
    const inlineStart =
      globalThis.getComputedStyle(target).direction === "rtl"
        ? globalThis.innerWidth - rect.right
        : rect.left;
    setTargetFound(true);
    setAnchor({
      x: Math.max(8, Math.min(inlineStart, globalThis.innerWidth - 336)),
      y: Math.max(8, Math.min(rect.bottom + 8, globalThis.innerHeight - 240)),
    });
  }, [currentStep.targetId]);

  useEffect(() => {
    if (!resolvedOpen) return;
    measureTarget();
    if (currentStep.targetId === undefined) return;
    globalThis.addEventListener("resize", measureTarget);
    globalThis.addEventListener("scroll", measureTarget, true);
    return () => {
      globalThis.removeEventListener("resize", measureTarget);
      globalThis.removeEventListener("scroll", measureTarget, true);
    };
  }, [currentStep.targetId, measureTarget, resolvedOpen]);

  useEffect(() => {
    if (!resolvedOpen || routeAdapter === undefined || currentStep.route === undefined) {
      routeRequestRef.current = null;
      return;
    }
    const requestKey = `${currentStep.id}:${currentStep.route}`;
    if (routeRequestRef.current === requestKey) return;
    routeRequestRef.current = requestKey;
    routeAdapter.navigate(currentStep.route, currentStep);
  }, [currentStep, resolvedOpen, routeAdapter]);

  useEffect(() => {
    if (!resolvedOpen) return;
    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false, "dismiss");
    };
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown);
  }, [resolvedOpen, setOpen]);

  useEffect(() => {
    if (resolvedOpen && focusPolicy === "panel") queueMicrotask(() => panelRef.current?.focus());
  }, [currentStep.id, focusPolicy, resolvedOpen]);

  useEffect(() => {
    if (previousOpenRef.current && !resolvedOpen) restoreFocus();
    previousOpenRef.current = resolvedOpen;
  }, [resolvedOpen, restoreFocus]);

  const closeOnEscape = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    setOpen(false, "dismiss");
  };
  const positionStyle =
    anchor === null
      ? undefined
      : ({
          "--_mrg-tour-x": `${String(anchor.x)}px`,
          "--_mrg-tour-y": `${String(anchor.y)}px`,
        } as CSSProperties);
  const recoveryMessage =
    targetFound || targetRecovery === false
      ? null
      : typeof targetRecovery.message === "function"
        ? targetRecovery.message(currentStep)
        : targetRecovery.message;

  return (
    <div
      {...props}
      className={["mrg-tour", className].filter(Boolean).join(" ")}
      data-slot="tour"
      onKeyDown={closeOnEscape}
      ref={ref}
    >
      {hasAccessibleContent(triggerLabel) ? (
        <button
          aria-expanded={resolvedOpen}
          className="mrg-tour__trigger"
          data-slot="tour-trigger"
          onClick={() => setOpen(!resolvedOpen, resolvedOpen ? "dismiss" : undefined)}
          ref={triggerRef}
          type="button"
        >
          {triggerLabel}
        </button>
      ) : null}
      {resolvedOpen ? (
        <section
          aria-describedby={descriptionId}
          aria-labelledby={titleId}
          className="mrg-tour__panel"
          data-anchored={anchor === null ? undefined : ""}
          data-slot="tour-panel"
          ref={panelRef}
          role="region"
          style={positionStyle}
          tabIndex={focusPolicy === "panel" ? -1 : undefined}
        >
          <header>
            <h2 id={titleId}>{currentStep.title}</h2>
            {showProgress ? (
              <span
                aria-label="Tour progress"
                aria-valuemax={steps.length}
                aria-valuemin={1}
                aria-valuenow={currentIndex + 1}
                aria-valuetext={`Step ${String(currentIndex + 1)} of ${String(steps.length)}`}
                data-slot="tour-progress"
                role="progressbar"
              >
                {currentIndex + 1} / {steps.length}
              </span>
            ) : null}
          </header>
          <div id={descriptionId}>{currentStep.description}</div>
          {!targetFound && targetRecovery !== false && hasAccessibleContent(recoveryMessage) ? (
            <div className="mrg-tour__recovery" data-slot="tour-target-recovery" role="status">
              <span>{recoveryMessage}</span>
              <button
                onClick={() => {
                  targetRecovery.onRetry?.(currentStep);
                  measureTarget();
                }}
                type="button"
              >
                {targetRecovery.retryLabel}
              </button>
            </div>
          ) : null}
          <footer>
            <button
              disabled={currentIndex === 0}
              onClick={() => {
                const previous = steps[currentIndex - 1];
                if (previous !== undefined) setStep(previous.id);
              }}
              type="button"
            >
              {backLabel}
            </button>
            <button
              onClick={() => {
                onSkip?.(currentStep);
                setOpen(false, "skip");
              }}
              type="button"
            >
              {skipLabel}
            </button>
            <button
              onClick={() => {
                const next = steps[currentIndex + 1];
                if (next === undefined) {
                  onComplete?.();
                  setOpen(false, "complete");
                } else setStep(next.id);
              }}
              type="button"
            >
              {currentIndex === steps.length - 1 ? completeLabel : nextLabel}
            </button>
          </footer>
          {announceStepChanges ? (
            <span
              aria-live="polite"
              className="mrg-tour__announcement"
              data-slot="tour-announcement"
              role="status"
            >
              Step {currentIndex + 1} of {steps.length}: {currentStep.title}
            </span>
          ) : null}
        </section>
      ) : null}
    </div>
  );
});

Tour.displayName = "Tour";
