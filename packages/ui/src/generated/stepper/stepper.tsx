// Generated from registry/source/components/stepper/stepper.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  Fragment,
  forwardRef,
  isValidElement,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

import "./stepper.css";

export type StepperMode = "linear" | "nonlinear";
export type StepperStepState = "complete" | "current" | "error" | "upcoming";

export interface StepperStep {
  /** Optional visible supporting copy rendered beneath the step label. */
  readonly description?: ReactNode;
  /** Keeps the step visible but removes its activation control and marks it disabled. */
  readonly disabled?: boolean;
  /** Non-empty unique identity used by controlled and uncontrolled current-step state. */
  readonly id: string;
  /** Visible step name used by controls and optional completion announcements. */
  readonly label: ReactNode;
  /** Explicit non-current status; the active identity always resolves to current. */
  readonly state?: Exclude<StepperStepState, "current">;
}

export interface StepperProgressContext {
  /** Zero-based position of the current step in the validated steps array. */
  readonly currentIndex: number;
  /** Complete current-step record supplied to the optional summary formatter. */
  readonly currentStep: StepperStep;
  /** Active reachability policy supplied to the optional summary formatter. */
  readonly mode: StepperMode;
  /** Total number of validated steps represented by the stepper. */
  readonly total: number;
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

export interface StepperProps extends Omit<
  React.ComponentPropsWithoutRef<"nav">,
  "children" | "onChange"
> {
  /** Adds a polite completion status after the list; false removes the live region entirely. */
  readonly announceStepChanges?: boolean;
  /** Initial current-step identity for uncontrolled use, defaulting to the first step. */
  readonly defaultValue?: string;
  /** Accessible name for the navigation landmark and optional native progress element. */
  readonly label?: string;
  /** Linear limits activation to reached or next steps; nonlinear permits any enabled step. */
  readonly mode?: StepperMode;
  /** Renders reachable steps as native buttons; false keeps the stepper read-only. */
  readonly navigable?: boolean;
  /** Receives button activation before state changes; preventDefault cancels selection. */
  readonly onStepActivate?: (event: MouseEvent<HTMLButtonElement>, step: StepperStep) => void;
  /** Reports each proposed current-step identity in controlled and uncontrolled modes. */
  readonly onValueChange?: (id: string) => void;
  /** Optional visible progress context. Omission does not call the formatter or emit output. */
  readonly renderProgressSummary?: (context: StepperProgressContext) => ReactNode;
  /** Optional native progress semantics, independently removable from announcements and summary. */
  readonly showProgressBar?: boolean;
  /** Non-empty DOM-ordered model retained when the visual layout stacks on narrow screens. */
  readonly steps: readonly StepperStep[];
  /** Controlled current-step identity; pair with onValueChange to accept proposals. */
  readonly value?: string;
}

export const Stepper = forwardRef<HTMLElement, StepperProps>(function Stepper(
  {
    announceStepChanges = false,
    className,
    defaultValue,
    label = "Progress",
    mode = "linear",
    navigable = false,
    onStepActivate,
    onValueChange,
    renderProgressSummary,
    showProgressBar = false,
    steps,
    value,
    ...props
  },
  ref,
) {
  if (steps.length === 0) throw new Error("Mergora Stepper requires at least one step.");
  const ids = new Set<string>();
  for (const step of steps) {
    if (step.id.trim().length === 0 || ids.has(step.id)) {
      throw new Error("Mergora Stepper step ids must be non-empty and unique.");
    }
    ids.add(step.id);
  }
  const initialValue = defaultValue ?? steps[0]?.id;
  const [uncontrolledValue, setUncontrolledValue] = useState(initialValue);
  const resolvedValue = value ?? uncontrolledValue;
  const currentIndex = steps.findIndex((step) => step.id === resolvedValue);
  if (currentIndex < 0) throw new Error("Mergora Stepper value must identify a step.");
  const currentStep = steps[currentIndex];
  if (currentStep === undefined) throw new Error("Mergora Stepper current step is unavailable.");
  const context: StepperProgressContext = {
    currentIndex,
    currentStep,
    mode,
    total: steps.length,
  };
  const progressSummary = renderProgressSummary?.(context);
  const setValue = (next: string) => {
    if (value === undefined) setUncontrolledValue(next);
    onValueChange?.(next);
  };

  return (
    <nav
      {...props}
      aria-label={label}
      className={["mrg-stepper", className].filter(Boolean).join(" ")}
      data-mode={mode}
      data-slot="stepper"
      ref={ref}
    >
      {showProgressBar ? (
        <progress
          aria-label={`${label}: ${String(currentIndex + 1)} of ${String(steps.length)}`}
          data-slot="stepper-progress"
          max={steps.length}
          value={currentIndex + 1}
        />
      ) : null}
      {hasAccessibleContent(progressSummary) ? (
        <div className="mrg-stepper__summary" data-slot="stepper-summary">
          {progressSummary}
        </div>
      ) : null}
      <ol data-slot="stepper-list">
        {steps.map((step, index) => {
          const error = step.state === "error";
          const state: StepperStepState =
            index === currentIndex
              ? "current"
              : (step.state ?? (index < currentIndex ? "complete" : "upcoming"));
          const reachable =
            !step.disabled && navigable && (mode === "nonlinear" || index <= currentIndex + 1);
          const content = (
            <>
              <span aria-hidden="true" className="mrg-stepper__marker">
                {state === "complete" ? "✓" : String(index + 1)}
              </span>
              <span className="mrg-stepper__copy">
                <span data-slot="stepper-label">
                  {error ? <span className="mrg-stepper__visually-hidden">Error: </span> : null}
                  {step.label}
                </span>
                {step.description === undefined ? null : <small>{step.description}</small>}
              </span>
            </>
          );
          return (
            <li
              data-error={error ? "" : undefined}
              data-state={state}
              data-slot="stepper-step"
              key={step.id}
            >
              {reachable ? (
                <button
                  aria-current={state === "current" ? "step" : undefined}
                  aria-invalid={error || undefined}
                  className="mrg-stepper__control"
                  onClick={(event) => {
                    onStepActivate?.(event, step);
                    if (!event.defaultPrevented) setValue(step.id);
                  }}
                  type="button"
                >
                  {content}
                </button>
              ) : (
                <span
                  aria-current={state === "current" ? "step" : undefined}
                  aria-disabled={
                    step.disabled || (navigable && index > currentIndex + 1) || undefined
                  }
                  aria-invalid={error || undefined}
                  className="mrg-stepper__control"
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {announceStepChanges ? (
        <span
          aria-live="polite"
          className="mrg-stepper__announcement"
          data-slot="stepper-announcement"
          role="status"
        >
          Step {currentIndex + 1} of {steps.length}: {currentStep.label}
        </span>
      ) : null}
    </nav>
  );
});

Stepper.displayName = "Stepper";
