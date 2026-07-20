"use client";

import "./settings-workspace.css";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type FormHTMLAttributes,
  type ReactNode,
} from "react";

import { Button } from "../../components/button/button.js";
import { Field } from "../../components/field/field.js";
import { Input } from "../../components/input/input.js";

export type SettingsWorkspaceSectionId = "profile" | "preferences" | "notifications" | "security";

export interface SettingsWorkspaceSection {
  /** Optional supporting copy shown in navigation and the active section heading. */
  readonly description?: ReactNode;
  /** Required canonical section identifier used for navigation and save requests. */
  readonly id: SettingsWorkspaceSectionId;
  /** Visible section name used by navigation and active content context. */
  readonly label: ReactNode;
}

export interface SettingsWorkspaceRenderContext {
  /** Whether the current controlled or uncontrolled section contains unsaved changes. */
  readonly dirty: boolean;
  /** Whether rendered section controls must prevent all interaction. */
  readonly disabled: boolean;
  /** Whether rendered section controls must expose values without permitting mutation. */
  readonly readOnly: boolean;
  /** Complete descriptor for the currently active settings section. */
  readonly section: SettingsWorkspaceSection;
  /** Reports dirty-state changes and controls unsaved-navigation protection. */
  readonly setDirty: (dirty: boolean) => void;
}

export interface SettingsDestructiveAction {
  /** Exact text the user must enter before the destructive request is enabled. */
  readonly confirmationText: string;
  /** Ordered user-visible effects that must be reviewed before confirmation. */
  readonly consequences: readonly string[];
  /** Consumer-owned context explaining the destructive action. */
  readonly description: ReactNode;
  /** Concise action name inserted into review and confirmation controls. */
  readonly label: ReactNode;
  /** Performs the consumer-owned destructive request with lifecycle cancellation. */
  readonly onConfirm: (signal: AbortSignal) => void | Promise<void>;
}

export interface SettingsSaveRequest {
  /** String-valued native FormData entries collected after browser constraint validation. */
  readonly fields: Readonly<Record<string, string>>;
  /** Active section identifier that owned the submitted settings controls. */
  readonly sectionId: SettingsWorkspaceSectionId;
}

export interface SettingsWorkspaceProps extends Omit<
  FormHTMLAttributes<HTMLFormElement>,
  "children" | "onSubmit"
> {
  /** Controlled active section identifier; use with `onActiveSectionChange`. */
  readonly activeSectionId?: SettingsWorkspaceSectionId;
  /** Initial active section identifier for uncontrolled navigation. */
  readonly defaultActiveSectionId?: SettingsWorkspaceSectionId;
  /** Initial dirty state for uncontrolled use and reset restoration. */
  readonly defaultDirty?: boolean;
  /** Adds guarded destructive-action review; false removes its UI, state, and request effects. */
  readonly destructiveAction?: false | SettingsDestructiveAction;
  /** Controlled dirty state; use with `onDirtyChange`. */
  readonly dirty?: boolean;
  /** Disables navigation, form controls, save, reset, and destructive interactions. */
  readonly disabled?: boolean;
  /** Consumer error content rendered as an alert in the active section. */
  readonly error?: ReactNode;
  /** Externally controlled busy state reflected by form semantics and save progress. */
  readonly loading?: boolean;
  /** Reports controlled or uncontrolled section navigation changes. */
  readonly onActiveSectionChange?: (sectionId: SettingsWorkspaceSectionId) => void;
  /** Reports controlled or uncontrolled dirty-state changes and reset cleanup. */
  readonly onDirtyChange?: (dirty: boolean) => void;
  /** Handles browser-validated native form data with an abort signal; omission disables save. */
  readonly onSave?: (request: SettingsSaveRequest, signal: AbortSignal) => void | Promise<void>;
  /** Adds before-unload and section-change protection; false removes listeners, prompt UI, and focus handling. */
  readonly protectUnsavedChanges?: boolean;
  /** Prevents form mutation, save, reset, and destructive actions while retaining review. */
  readonly readOnly?: boolean;
  /** Renders consumer-owned controls for the active section with bounded dirty-state context. */
  readonly renderSection: (context: SettingsWorkspaceRenderContext) => ReactNode;
  /** Unique required profile, preferences, notifications, and security section descriptors. */
  readonly sections: readonly SettingsWorkspaceSection[];
}

const REQUIRED_SECTION_IDS: readonly SettingsWorkspaceSectionId[] = [
  "profile",
  "preferences",
  "notifications",
  "security",
];

function assertSections(
  sections: readonly SettingsWorkspaceSection[],
  selected: SettingsWorkspaceSectionId,
): void {
  const ids = sections.map((section) => section.id);
  if (
    new Set(ids).size !== ids.length ||
    REQUIRED_SECTION_IDS.some((required) => !ids.includes(required))
  ) {
    throw new RangeError(
      "Mergora SettingsWorkspace requires unique profile, preferences, notifications, and security sections.",
    );
  }
  if (!ids.includes(selected)) {
    throw new RangeError("Mergora SettingsWorkspace selected section must be available.");
  }
}

function serializedFields(form: HTMLFormElement): Readonly<Record<string, string>> {
  const fields: Record<string, string> = {};
  for (const [name, value] of new FormData(form)) {
    if (typeof value === "string") fields[name] = value;
  }
  return fields;
}

export const SettingsWorkspace = forwardRef<HTMLFormElement, SettingsWorkspaceProps>(
  function SettingsWorkspace(
    {
      activeSectionId,
      className,
      defaultActiveSectionId = "profile",
      defaultDirty = false,
      destructiveAction = false,
      dirty,
      disabled = false,
      error,
      loading = false,
      onActiveSectionChange,
      onChange,
      onDirtyChange,
      onReset,
      onSave,
      protectUnsavedChanges = false,
      readOnly = false,
      renderSection,
      sections,
      ...props
    },
    ref,
  ) {
    const controlledSection = activeSectionId !== undefined;
    const controlledDirty = dirty !== undefined;
    const [uncontrolledSectionId, setUncontrolledSectionId] = useState(defaultActiveSectionId);
    const [uncontrolledDirty, setUncontrolledDirty] = useState(defaultDirty);
    const resolvedSectionId = activeSectionId ?? uncontrolledSectionId;
    const resolvedDirty = dirty ?? uncontrolledDirty;
    assertSections(sections, resolvedSectionId);
    const currentSection = sections.find((section) => section.id === resolvedSectionId)!;
    const generatedId = useId().replaceAll(":", "");
    const unsavedTitleId = `mrg-settings-${generatedId}-unsaved-title`;
    const destructiveTitleId = `mrg-settings-${generatedId}-destructive-title`;
    const instanceLabel =
      typeof props["aria-label"] === "string" && props["aria-label"].trim().length > 0
        ? props["aria-label"].trim()
        : null;
    const [pendingSectionId, setPendingSectionId] = useState<SettingsWorkspaceSectionId | null>(
      null,
    );
    const [savePending, setSavePending] = useState(false);
    const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
    const [saveError, setSaveError] = useState<string | null>(null);
    const [destructiveReview, setDestructiveReview] = useState(false);
    const [confirmationValue, setConfirmationValue] = useState("");
    const [destructivePending, setDestructivePending] = useState(false);
    const [destructiveError, setDestructiveError] = useState<string | null>(null);
    const saveController = useRef<AbortController | null>(null);
    const destructiveController = useRef<AbortController | null>(null);
    const unsavedPromptRef = useRef<HTMLDivElement | null>(null);
    const navigationRestoreRef = useRef<HTMLButtonElement | null>(null);

    useEffect(
      () => () => {
        saveController.current?.abort();
        destructiveController.current?.abort();
      },
      [],
    );

    useEffect(() => {
      if (!protectUnsavedChanges || !resolvedDirty) return;
      const warn = (event: BeforeUnloadEvent): void => {
        event.preventDefault();
        event.returnValue = "";
      };
      globalThis.addEventListener("beforeunload", warn);
      return () => globalThis.removeEventListener("beforeunload", warn);
    }, [protectUnsavedChanges, resolvedDirty]);

    useEffect(() => {
      if (pendingSectionId !== null) {
        unsavedPromptRef.current?.focus({ preventScroll: true });
        return;
      }
      const trigger = navigationRestoreRef.current;
      if (trigger !== null) {
        navigationRestoreRef.current = null;
        trigger.focus({ preventScroll: true });
      }
    }, [pendingSectionId]);

    useEffect(() => {
      if (protectUnsavedChanges || pendingSectionId === null) return;
      setPendingSectionId(null);
    }, [pendingSectionId, protectUnsavedChanges]);

    useEffect(() => {
      if (destructiveAction !== false) return;
      destructiveController.current?.abort();
      destructiveController.current = null;
      setDestructiveReview(false);
      setConfirmationValue("");
      setDestructivePending(false);
      setDestructiveError(null);
    }, [destructiveAction]);

    const setDirty = (next: boolean): void => {
      if (!controlledDirty) setUncontrolledDirty(next);
      onDirtyChange?.(next);
      if (next) setSaveState("idle");
    };

    const activateSection = (
      sectionId: SettingsWorkspaceSectionId,
      trigger: HTMLButtonElement,
    ): void => {
      if (sectionId === resolvedSectionId || disabled || savePending) return;
      if (protectUnsavedChanges && resolvedDirty) {
        navigationRestoreRef.current = trigger;
        setPendingSectionId(sectionId);
        return;
      }
      if (!controlledSection) setUncontrolledSectionId(sectionId);
      setSaveState("idle");
      setSaveError(null);
      onActiveSectionChange?.(sectionId);
    };

    const discardAndNavigate = (): void => {
      const next = pendingSectionId;
      if (next === null) return;
      setDirty(false);
      setPendingSectionId(null);
      if (!controlledSection) setUncontrolledSectionId(next);
      onActiveSectionChange?.(next);
    };

    const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      if (disabled || readOnly || savePending || onSave === undefined) return;
      if (!event.currentTarget.reportValidity()) return;
      saveController.current?.abort();
      const controller = new AbortController();
      saveController.current = controller;
      setSavePending(true);
      setSaveState("idle");
      setSaveError(null);
      try {
        await onSave(
          { fields: serializedFields(event.currentTarget), sectionId: resolvedSectionId },
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setDirty(false);
          setSaveState("saved");
        }
      } catch (nextError) {
        if (!controller.signal.aborted) {
          setSaveState("error");
          setSaveError(
            nextError instanceof Error ? nextError.message : "Settings could not be saved.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setSavePending(false);
      }
    };

    const confirmDestructiveAction = async (): Promise<void> => {
      if (
        destructiveAction === false ||
        confirmationValue !== destructiveAction.confirmationText ||
        disabled ||
        readOnly ||
        destructivePending
      ) {
        return;
      }
      destructiveController.current?.abort();
      const controller = new AbortController();
      destructiveController.current = controller;
      setDestructivePending(true);
      setDestructiveError(null);
      try {
        await destructiveAction.onConfirm(controller.signal);
        if (!controller.signal.aborted) {
          setDestructiveReview(false);
          setConfirmationValue("");
        }
      } catch (nextError) {
        if (!controller.signal.aborted) {
          setDestructiveError(
            nextError instanceof Error
              ? nextError.message
              : "The destructive action could not continue.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setDestructivePending(false);
      }
    };

    return (
      <form
        {...props}
        aria-busy={loading || savePending || destructivePending || undefined}
        className={
          className === undefined ? "mrg-settings-workspace" : `mrg-settings-workspace ${className}`
        }
        data-dirty={resolvedDirty || undefined}
        data-slot="settings-workspace"
        onChange={(event) => {
          onChange?.(event);
          if (!event.defaultPrevented && !readOnly) setDirty(true);
        }}
        onReset={(event) => {
          if (readOnly) {
            event.preventDefault();
            return;
          }
          onReset?.(event);
          if (event.defaultPrevented) return;
          destructiveController.current?.abort();
          destructiveController.current = null;
          setDirty(false);
          setSaveState("idle");
          setSaveError(null);
          setPendingSectionId(null);
          setConfirmationValue("");
          setDestructiveReview(false);
          setDestructivePending(false);
          setDestructiveError(null);
        }}
        onSubmit={(event) => void save(event)}
        ref={ref}
      >
        <header data-slot="settings-header">
          <h1>Settings workspace</h1>
          <p>Manage account-facing preferences through explicit, consumer-owned sections.</p>
        </header>
        <nav
          aria-label={
            instanceLabel === null ? "Settings sections" : `${instanceLabel}: settings sections`
          }
          data-slot="settings-navigation"
        >
          <ul>
            {sections.map((section) => (
              <li key={section.id}>
                <button
                  aria-current={section.id === resolvedSectionId ? "page" : undefined}
                  disabled={disabled || savePending}
                  onClick={(event) => activateSection(section.id, event.currentTarget)}
                  type="button"
                >
                  <strong>{section.label}</strong>
                  {section.description === undefined ? null : <small>{section.description}</small>}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div data-slot="settings-main">
          <div data-slot="settings-section-heading">
            <h2>{currentSection.label}</h2>
            {currentSection.description === undefined ? null : <p>{currentSection.description}</p>}
          </div>
          {pendingSectionId === null ? null : (
            <div
              aria-label={
                instanceLabel === null ? undefined : `${instanceLabel}: keep unsaved changes`
              }
              aria-labelledby={instanceLabel === null ? unsavedTitleId : undefined}
              data-slot="settings-unsaved-prompt"
              ref={unsavedPromptRef}
              role="alertdialog"
              tabIndex={-1}
            >
              <h3 id={unsavedTitleId}>Keep unsaved changes?</h3>
              <p>Save or discard this section before moving elsewhere.</p>
              <div data-slot="settings-actions">
                <Button onClick={() => setPendingSectionId(null)} type="button" variant="secondary">
                  Stay here
                </Button>
                <Button onClick={discardAndNavigate} type="button" variant="destructive">
                  Discard and continue
                </Button>
              </div>
            </div>
          )}
          <div data-slot="settings-section-content">
            {renderSection({
              dirty: resolvedDirty,
              disabled,
              readOnly,
              section: currentSection,
              setDirty,
            })}
          </div>
          {saveState === "saved" ? (
            <div data-slot="settings-save-status" role="status">
              Settings saved.
            </div>
          ) : null}
          {saveState === "error" ? (
            <div data-slot="settings-save-error" role="alert">
              {saveError}
            </div>
          ) : null}
          {error === undefined ? null : (
            <div data-slot="settings-error" role="alert">
              {error}
            </div>
          )}
          <div data-slot="settings-actions">
            <Button
              disabled={disabled || readOnly || onSave === undefined}
              pending={loading || savePending}
              pendingLabel="Saving settings"
              type="submit"
            >
              Save settings
            </Button>
            <Button disabled={disabled || readOnly || savePending} type="reset" variant="quiet">
              Reset section
            </Button>
          </div>
          {destructiveAction === false ? null : (
            <section
              aria-label={instanceLabel === null ? undefined : `${instanceLabel}: account action`}
              aria-labelledby={instanceLabel === null ? destructiveTitleId : undefined}
              data-slot="settings-destructive"
            >
              <h2 id={destructiveTitleId}>Account action</h2>
              <p>{destructiveAction.description}</p>
              {!destructiveReview ? (
                <Button
                  disabled={disabled || readOnly}
                  onClick={() => setDestructiveReview(true)}
                  type="button"
                  variant="secondary"
                >
                  Review {destructiveAction.label}
                </Button>
              ) : (
                <div data-slot="settings-destructive-review">
                  <h3>Review before continuing</h3>
                  <ul>
                    {destructiveAction.consequences.map((consequence) => (
                      <li key={consequence}>{consequence}</li>
                    ))}
                  </ul>
                  <Field
                    description={`Enter ${destructiveAction.confirmationText} exactly.`}
                    label="Confirmation text"
                    required
                  >
                    <Input
                      autoComplete="off"
                      disabled={disabled || destructivePending}
                      onChange={(event) => setConfirmationValue(event.currentTarget.value)}
                      readOnly={readOnly}
                      required
                      value={confirmationValue}
                    />
                  </Field>
                  {destructiveError === null ? null : <div role="alert">{destructiveError}</div>}
                  <div data-slot="settings-actions">
                    <Button
                      disabled={
                        confirmationValue !== destructiveAction.confirmationText ||
                        disabled ||
                        readOnly
                      }
                      onClick={() => void confirmDestructiveAction()}
                      pending={destructivePending}
                      pendingLabel="Requesting account action"
                      type="button"
                      variant="destructive"
                    >
                      Confirm {destructiveAction.label}
                    </Button>
                    <Button
                      disabled={destructivePending}
                      onClick={() => {
                        setDestructiveReview(false);
                        setConfirmationValue("");
                        setDestructiveError(null);
                      }}
                      type="button"
                      variant="quiet"
                    >
                      Cancel review
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </form>
    );
  },
);

SettingsWorkspace.displayName = "SettingsWorkspace";

export const SettingsWorkspacePage = SettingsWorkspace;
