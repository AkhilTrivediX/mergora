"use client";

import "./onboarding-wizard.css";

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type FormHTMLAttributes,
  type ReactNode,
} from "react";

import { Button } from "../../components/button/button.js";
import { Stepper } from "../../components/stepper/stepper.js";

export type OnboardingDraftValue = boolean | number | string | null;
/** Maps bounded field identifiers to serializable draft values without imposing a domain schema. */
export type OnboardingDraft = Readonly<Record<string, OnboardingDraftValue>>;

export interface OnboardingValidationError {
  /** Draft field identifier used for deduplication and targeted recovery context. */
  readonly id: string;
  /** Human-readable recovery guidance rendered in the current step's alert summary. */
  readonly message: string;
}

export interface OnboardingStep {
  /** Optional supporting copy shown in the stepper and active-step heading. */
  readonly description?: ReactNode;
  /** Stable non-empty unique identifier used for navigation and persisted snapshots. */
  readonly id: string;
  /** Visible step name used by navigation and current-step context. */
  readonly label: ReactNode;
  /** Enables a skip action before a following step and marks progress context as optional. */
  readonly optional?: boolean;
  /** Returns immutable field-specific recovery errors before the wizard may advance. */
  readonly validate?: (draft: OnboardingDraft) => readonly OnboardingValidationError[];
}

export interface OnboardingSnapshot {
  /** Complete serializable draft captured for persistence or completion. */
  readonly draft: OnboardingDraft;
  /** Current valid step identifier captured with the draft. */
  readonly stepId: string;
}

export interface OnboardingPersistenceAdapter {
  /** Removes a consumer-owned saved draft using the supplied lifecycle abort signal. */
  readonly clear: (signal: AbortSignal) => void | Promise<void>;
  /** Loads a saved snapshot or null using the supplied lifecycle abort signal. */
  readonly load: (
    signal: AbortSignal,
  ) => OnboardingSnapshot | null | Promise<OnboardingSnapshot | null>;
  /** Saves the exact current snapshot using the supplied lifecycle abort signal. */
  readonly save: (snapshot: OnboardingSnapshot, signal: AbortSignal) => void | Promise<void>;
}

export interface OnboardingRenderContext {
  /** Whether rendered step controls must prevent all interaction. */
  readonly disabled: boolean;
  /** Current controlled or uncontrolled draft supplied to the active step renderer. */
  readonly draft: OnboardingDraft;
  /** Current validation errors returned by the active step. */
  readonly errors: readonly OnboardingValidationError[];
  /** Whether rendered step controls must expose values without permitting mutation. */
  readonly readOnly: boolean;
  /** Updates one bounded draft field unless the wizard is disabled or read-only. */
  readonly setDraftValue: (name: string, value: OnboardingDraftValue) => void;
  /** Complete active-step descriptor corresponding to the current step ID. */
  readonly step: OnboardingStep;
}

export interface OnboardingWizardProps extends Omit<
  FormHTMLAttributes<HTMLFormElement>,
  "children" | "onChange" | "onSubmit"
> {
  /** Enables step transition announcements through the shared Stepper; false removes them. */
  readonly announceStepChanges?: boolean;
  /** Initial serializable draft for uncontrolled use, reset, and persistence clearing. */
  readonly defaultDraft?: OnboardingDraft;
  /** Initial step identifier for uncontrolled use and native form reset. */
  readonly defaultStepId?: string;
  /** Disables navigation, draft edits, persistence, and completion while preserving context. */
  readonly disabled?: boolean;
  /** Controlled draft object; use with `onDraftChange`. */
  readonly draft?: OnboardingDraft;
  /** Main wizard heading rendered before progress navigation. */
  readonly heading?: ReactNode;
  /** Handles final completion with the current snapshot and a lifecycle abort signal. */
  readonly onComplete?: (snapshot: OnboardingSnapshot, signal: AbortSignal) => void | Promise<void>;
  /** Reports immutable controlled or uncontrolled draft updates and reset restoration. */
  readonly onDraftChange?: (draft: OnboardingDraft) => void;
  /** Reports controlled or uncontrolled navigation, persistence load, and reset changes. */
  readonly onStepChange?: (stepId: string) => void;
  /** Enables consumer-owned load/save/clear draft controls; false removes their UI and effects. */
  readonly persistence?: false | OnboardingPersistenceAdapter;
  /** Prevents navigation mutations, reset, persistence, and completion while retaining values. */
  readonly readOnly?: boolean;
  /** Renders consumer-owned controls for the active step with bounded mutation context. */
  readonly renderStep: (context: OnboardingRenderContext) => ReactNode;
  /** Adds a progress bar and step-count summary; false removes both outputs. */
  readonly showProgressContext?: boolean;
  /** Controlled current step identifier; use with `onStepChange`. */
  readonly stepId?: string;
  /** Ordered non-empty unique steps that define validation and navigation. */
  readonly steps: readonly OnboardingStep[];
}

function assertWizard(steps: readonly OnboardingStep[], stepId: string): void {
  const ids = steps.map((step) => step.id);
  if (steps.length === 0 || ids.some((id) => id.trim().length === 0)) {
    throw new RangeError("Mergora OnboardingWizard requires named steps.");
  }
  if (new Set(ids).size !== ids.length) {
    throw new RangeError("Mergora OnboardingWizard step IDs must be unique.");
  }
  if (!ids.includes(stepId)) {
    throw new RangeError("Mergora OnboardingWizard selected step must be available.");
  }
}

function validateDraftName(name: string): void {
  if (name.trim().length === 0 || name.length > 128) {
    throw new RangeError(
      "Mergora OnboardingWizard draft field names must contain 1 to 128 characters.",
    );
  }
}

export const OnboardingWizard = forwardRef<HTMLFormElement, OnboardingWizardProps>(
  function OnboardingWizard(
    {
      announceStepChanges = false,
      className,
      defaultDraft = {},
      steps,
      defaultStepId = steps[0]?.id ?? "",
      disabled = false,
      draft,
      heading = "Set up your workspace",
      onComplete,
      onDraftChange,
      onReset,
      onStepChange,
      persistence = false,
      readOnly = false,
      renderStep,
      showProgressContext = false,
      stepId,
      ...props
    },
    ref,
  ) {
    const controlledStep = stepId !== undefined;
    const controlledDraft = draft !== undefined;
    const [uncontrolledStepId, setUncontrolledStepId] = useState(defaultStepId);
    const [uncontrolledDraft, setUncontrolledDraft] = useState<OnboardingDraft>(defaultDraft);
    const resolvedStepId = stepId ?? uncontrolledStepId;
    const resolvedDraft = draft ?? uncontrolledDraft;
    assertWizard(steps, resolvedStepId);
    const currentIndex = steps.findIndex((step) => step.id === resolvedStepId);
    const currentStep = steps[currentIndex]!;
    const instanceLabel =
      typeof props["aria-label"] === "string" && props["aria-label"].trim().length > 0
        ? props["aria-label"].trim()
        : null;
    const [errors, setErrors] = useState<readonly OnboardingValidationError[]>([]);
    const [completionState, setCompletionState] = useState<
      "idle" | "pending" | "complete" | "error"
    >("idle");
    const [completionError, setCompletionError] = useState<string | null>(null);
    const [persistenceState, setPersistenceState] = useState<
      "idle" | "loading" | "saved" | "error"
    >(persistence === false ? "idle" : "loading");
    const [persistenceError, setPersistenceError] = useState<string | null>(null);
    const completionController = useRef<AbortController | null>(null);
    const persistenceController = useRef<AbortController | null>(null);

    useEffect(
      () => () => {
        completionController.current?.abort();
        persistenceController.current?.abort();
      },
      [],
    );

    const setStep = (nextStepId: string): void => {
      if (!controlledStep) setUncontrolledStepId(nextStepId);
      setErrors([]);
      setCompletionError(null);
      setCompletionState("idle");
      onStepChange?.(nextStepId);
    };

    const setDraft = (nextDraft: OnboardingDraft): void => {
      if (!controlledDraft) setUncontrolledDraft(nextDraft);
      onDraftChange?.(nextDraft);
    };

    useEffect(() => {
      if (persistence === false) return;
      const controller = new AbortController();
      persistenceController.current?.abort();
      persistenceController.current = controller;
      void Promise.resolve()
        .then(() => persistence.load(controller.signal))
        .then((snapshot) => {
          if (controller.signal.aborted) return;
          if (snapshot !== null) {
            assertWizard(steps, snapshot.stepId);
            setDraft(snapshot.draft);
            setStep(snapshot.stepId);
          }
          setPersistenceState("idle");
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          setPersistenceState("error");
          setPersistenceError(
            error instanceof Error ? error.message : "The saved draft could not be loaded.",
          );
        });
      return () => controller.abort();
    }, [persistence]);

    const setDraftValue = (name: string, value: OnboardingDraftValue): void => {
      validateDraftName(name);
      if (disabled || readOnly) return;
      setDraft({ ...resolvedDraft, [name]: value });
      setErrors((current) => current.filter((error) => error.id !== name));
      if (persistence !== false) setPersistenceState("idle");
    };

    const saveDraft = async (): Promise<void> => {
      if (persistence === false || disabled || readOnly) return;
      persistenceController.current?.abort();
      const controller = new AbortController();
      persistenceController.current = controller;
      setPersistenceState("loading");
      setPersistenceError(null);
      try {
        await persistence.save({ draft: resolvedDraft, stepId: resolvedStepId }, controller.signal);
        if (!controller.signal.aborted) setPersistenceState("saved");
      } catch (error) {
        if (!controller.signal.aborted) {
          setPersistenceState("error");
          setPersistenceError(
            error instanceof Error ? error.message : "The draft could not be saved.",
          );
        }
      }
    };

    const clearDraft = async (): Promise<void> => {
      if (persistence === false || disabled || readOnly) return;
      persistenceController.current?.abort();
      const controller = new AbortController();
      persistenceController.current = controller;
      setPersistenceState("loading");
      setPersistenceError(null);
      try {
        await persistence.clear(controller.signal);
        if (!controller.signal.aborted) {
          setDraft(defaultDraft);
          setStep(defaultStepId);
          setPersistenceState("idle");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setPersistenceState("error");
          setPersistenceError(
            error instanceof Error ? error.message : "The saved draft could not be removed.",
          );
        }
      }
    };

    const complete = async (): Promise<void> => {
      if (onComplete === undefined || disabled || readOnly) return;
      completionController.current?.abort();
      const controller = new AbortController();
      completionController.current = controller;
      setCompletionState("pending");
      setCompletionError(null);
      try {
        await onComplete({ draft: resolvedDraft, stepId: resolvedStepId }, controller.signal);
        if (!controller.signal.aborted) setCompletionState("complete");
      } catch (error) {
        if (!controller.signal.aborted) {
          setCompletionState("error");
          setCompletionError(
            error instanceof Error ? error.message : "Setup could not be completed.",
          );
        }
      }
    };

    const advance = (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      if (disabled || readOnly || completionState === "pending") return;
      const nextErrors = currentStep.validate?.(resolvedDraft) ?? [];
      const errorIds = nextErrors.map((error) => error.id);
      if (new Set(errorIds).size !== errorIds.length) {
        throw new RangeError("Mergora OnboardingWizard validation error IDs must be unique.");
      }
      setErrors(nextErrors);
      if (nextErrors.length > 0) return;
      const nextStep = steps[currentIndex + 1];
      if (nextStep !== undefined) setStep(nextStep.id);
      else void complete();
    };

    return (
      <form
        {...props}
        aria-busy={completionState === "pending" || persistenceState === "loading" || undefined}
        className={
          className === undefined ? "mrg-onboarding-wizard" : `mrg-onboarding-wizard ${className}`
        }
        data-slot="onboarding-wizard"
        onReset={(event) => {
          if (readOnly) {
            event.preventDefault();
            return;
          }
          onReset?.(event);
          if (event.defaultPrevented) return;
          setDraft(defaultDraft);
          setStep(defaultStepId);
          setErrors([]);
          setCompletionState("idle");
          setCompletionError(null);
        }}
        onSubmit={advance}
        ref={ref}
      >
        <header data-slot="onboarding-header">
          <h1>{heading}</h1>
          <p>Complete only the information needed for this setup.</p>
        </header>
        <Stepper
          announceStepChanges={announceStepChanges}
          label={
            instanceLabel === null ? "Onboarding progress" : `${instanceLabel}: onboarding progress`
          }
          showProgressBar={showProgressContext}
          steps={steps.map((step, index) => ({
            description: step.description,
            id: step.id,
            label: step.label,
            state:
              errors.length > 0 && index === currentIndex
                ? "error"
                : index < currentIndex
                  ? "complete"
                  : "upcoming",
          }))}
          value={resolvedStepId}
          {...(showProgressContext
            ? {
                renderProgressSummary: ({ currentIndex: index, total }) =>
                  `Step ${String(index + 1)} of ${String(total)}${currentStep.optional ? " · optional" : ""}`,
              }
            : {})}
        />
        <div data-slot="onboarding-main">
          <div data-slot="onboarding-step-heading">
            <h2>{currentStep.label}</h2>
            {currentStep.description === undefined ? null : <p>{currentStep.description}</p>}
          </div>
          {errors.length === 0 ? null : (
            <div data-slot="onboarding-errors" role="alert">
              <h3>Review this step</h3>
              <ul>
                {errors.map((error) => (
                  <li key={error.id}>{error.message}</li>
                ))}
              </ul>
            </div>
          )}
          <div data-slot="onboarding-step-content">
            {renderStep({
              disabled,
              draft: resolvedDraft,
              errors,
              readOnly,
              setDraftValue,
              step: currentStep,
            })}
          </div>
          {completionState === "complete" ? (
            <div data-slot="onboarding-complete" role="status">
              Setup is complete.
            </div>
          ) : null}
          {completionState === "error" ? (
            <div data-slot="onboarding-completion-error" role="alert">
              <span>{completionError}</span>
              <Button onClick={() => void complete()} type="button" variant="secondary">
                Retry completion
              </Button>
            </div>
          ) : null}
          {persistence === false ? null : (
            <aside data-slot="onboarding-persistence">
              <h3>Saved draft</h3>
              <p>
                {persistenceState === "loading"
                  ? "Working with the saved draft…"
                  : persistenceState === "saved"
                    ? "Draft saved."
                    : persistenceState === "error"
                      ? persistenceError
                      : "Save this draft to continue later."}
              </p>
              <div data-slot="onboarding-actions">
                <Button
                  disabled={disabled || readOnly}
                  onClick={() => void saveDraft()}
                  pending={persistenceState === "loading"}
                  pendingLabel="Saving draft"
                  type="button"
                  variant="secondary"
                >
                  Save draft
                </Button>
                <Button
                  disabled={disabled || readOnly || persistenceState === "loading"}
                  onClick={() => void clearDraft()}
                  type="button"
                  variant="quiet"
                >
                  Remove saved draft
                </Button>
              </div>
            </aside>
          )}
          <div data-slot="onboarding-actions">
            <Button
              disabled={disabled || currentIndex === 0 || completionState === "pending"}
              onClick={() => {
                const previous = steps[currentIndex - 1];
                if (previous !== undefined) setStep(previous.id);
              }}
              type="button"
              variant="secondary"
            >
              Back
            </Button>
            {currentStep.optional && steps[currentIndex + 1] !== undefined ? (
              <Button
                disabled={disabled || readOnly || completionState === "pending"}
                onClick={() => setStep(steps[currentIndex + 1]!.id)}
                type="button"
                variant="quiet"
              >
                Skip optional step
              </Button>
            ) : null}
            <Button
              disabled={
                disabled ||
                readOnly ||
                (currentIndex === steps.length - 1 && onComplete === undefined)
              }
              pending={completionState === "pending"}
              pendingLabel="Completing setup"
              type="submit"
            >
              {currentIndex === steps.length - 1 ? "Complete setup" : "Continue"}
            </Button>
            <Button
              disabled={disabled || readOnly || completionState === "pending"}
              type="reset"
              variant="quiet"
            >
              Reset setup
            </Button>
          </div>
        </div>
      </form>
    );
  },
);

OnboardingWizard.displayName = "OnboardingWizard";

export const OnboardingWizardPage = OnboardingWizard;
