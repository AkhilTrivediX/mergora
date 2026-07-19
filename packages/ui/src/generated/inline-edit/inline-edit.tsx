// Generated from registry/source/components/inline-edit/inline-edit.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type CompositionEvent,
  type FocusEvent,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from "react";

import { Button } from "../button/button.js";
import { mergeFieldIdRefs } from "../field/index.js";
import { useMergoraMessage } from "../provider/index.js";
import "./inline-edit.css";

export type InlineEditBlurBehavior = "keep-editing" | "save";
export type InlineEditControl = "input" | "textarea";

export interface InlineEditSaveContext {
  readonly previousValue: string;
  readonly signal: AbortSignal;
}

type ManagedInputKeys =
  | "aria-describedby"
  | "aria-errormessage"
  | "aria-invalid"
  | "aria-labelledby"
  | "defaultValue"
  | "disabled"
  | "form"
  | "id"
  | "name"
  | "readOnly"
  | "required"
  | "value";

export type InlineEditInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  ManagedInputKeys | "children"
>;
export type InlineEditTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  ManagedInputKeys | "children"
>;

export interface InlineEditProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "defaultValue" | "onChange"
> {
  readonly blurBehavior?: InlineEditBlurBehavior;
  readonly cancelLabel?: string;
  readonly canceledMessage?: string;
  readonly control?: InlineEditControl;
  readonly defaultValue?: string;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
  readonly editAccessibleLabel?: string;
  readonly editLabel?: string;
  readonly emptyValueLabel?: string;
  readonly error?: ReactNode;
  readonly externalChangeMessage?: string;
  readonly form?: string;
  readonly inputProps?: InlineEditInputProps;
  readonly invalid?: boolean;
  readonly label: ReactNode;
  readonly name?: string;
  readonly noChangesMessage?: string;
  readonly onCancel?: () => void;
  readonly onEdit?: () => void;
  readonly onSave?: (value: string, context: InlineEditSaveContext) => Promise<void> | void;
  readonly onValueChange?: (value: string) => void;
  readonly pendingLabel?: string;
  readonly readOnly?: boolean;
  readonly readOnlyLabel?: string;
  readonly required?: boolean;
  readonly requiredMessage?: string;
  readonly resetMessage?: string;
  readonly resolveSaveError?: (error: unknown) => ReactNode;
  readonly saveErrorMessage?: string;
  readonly saveLabel?: string;
  readonly successMessage?: string;
  readonly textareaProps?: InlineEditTextareaProps;
  readonly validate?: (value: string) => ReactNode | undefined;
  readonly value?: string;
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

function hasAccessibleContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasAccessibleContent);
  if (isValidElement<{ readonly children?: ReactNode }>(value)) {
    return typeof value.type === "string" ? hasAccessibleContent(value.props.children) : true;
  }
  return true;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref !== null && ref !== undefined) ref.current = value;
}

function joinClassNames(componentClass: string, consumerClass: string | undefined): string {
  return consumerClass === undefined || consumerClass.trim().length === 0
    ? componentClass
    : `${componentClass} ${consumerClass}`;
}

export function validateInlineEditValue(input: {
  readonly required: boolean;
  readonly requiredMessage: ReactNode;
  readonly validate?: (value: string) => ReactNode | undefined;
  readonly value: string;
}): ReactNode | undefined {
  if (input.required && input.value.length === 0) return input.requiredMessage;
  return input.validate?.(input.value);
}

export const InlineEdit = forwardRef<HTMLDivElement, InlineEditProps>(function InlineEdit(
  {
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    blurBehavior = "keep-editing",
    cancelLabel: cancelLabelProp,
    canceledMessage: canceledMessageProp,
    className,
    control = "input",
    defaultValue: defaultValueProp,
    description,
    disabled = false,
    editAccessibleLabel: editAccessibleLabelProp,
    editLabel: editLabelProp,
    emptyValueLabel: emptyValueLabelProp,
    error,
    externalChangeMessage: externalChangeMessageProp,
    form,
    inputProps,
    invalid = false,
    label,
    name,
    noChangesMessage: noChangesMessageProp,
    onBlur,
    onCancel,
    onEdit,
    onSave,
    onValueChange,
    pendingLabel: pendingLabelProp,
    readOnly = false,
    readOnlyLabel: readOnlyLabelProp,
    required = false,
    requiredMessage: requiredMessageProp,
    resetMessage: resetMessageProp,
    resolveSaveError,
    saveErrorMessage: saveErrorMessageProp,
    saveLabel: saveLabelProp,
    successMessage: successMessageProp,
    textareaProps,
    validate,
    value,
    ...nativeProps
  },
  forwardedRef,
) {
  if (value !== undefined && defaultValueProp !== undefined) {
    throw new RangeError("Mergora InlineEdit cannot receive both value and defaultValue.");
  }
  if (name !== undefined && name.trim().length === 0) {
    throw new RangeError("Mergora InlineEdit name must not be empty or whitespace-only.");
  }
  const defaultValue = defaultValueProp ?? "";
  const controlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const committedValue = controlled ? value : uncontrolledValue;
  const [draft, setDraft] = useState(committedValue);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [internalError, setInternalError] = useState<ReactNode>();
  const [statusMessage, setStatusMessage] = useState<string>();
  const generatedId = useId().replaceAll(":", "");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const editButtonRef = useRef<HTMLButtonElement | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);
  const composingRef = useRef(false);
  const pendingRef = useRef(false);
  const operationRef = useRef(0);
  const operationControllerRef = useRef<AbortController | null>(null);
  const editBaseRef = useRef(committedValue);
  const committedValueRef = useRef(committedValue);
  const restoreFocusRef = useRef(false);
  const focusEditorRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  committedValueRef.current = committedValue;
  const labelId = `mrg-inline-edit-${generatedId}-label`;
  const controlId = `mrg-inline-edit-${generatedId}-control`;
  const descriptionId = hasAccessibleContent(description)
    ? `mrg-inline-edit-${generatedId}-description`
    : undefined;
  const resolvedError = internalError ?? error;
  const errorId = hasAccessibleContent(resolvedError)
    ? `mrg-inline-edit-${generatedId}-error`
    : undefined;
  const resolvedInvalid =
    invalid || ariaInvalid === true || ariaInvalid === "true" || errorId !== undefined;
  const describedBy = mergeFieldIdRefs(
    ariaDescribedBy,
    descriptionId,
    resolvedInvalid ? errorId : undefined,
  );
  const editLabel = useMergoraMessage("inlineEdit.edit", editLabelProp ?? "Edit");
  const visibleLabelText =
    typeof label === "string" || typeof label === "number" ? String(label).trim() : undefined;
  const editAccessibleLabel =
    editAccessibleLabelProp ??
    (editLabelProp === undefined && visibleLabelText !== undefined && visibleLabelText.length > 0
      ? `${editLabel} ${visibleLabelText}`
      : editLabel);
  const saveLabel = useMergoraMessage("inlineEdit.save", saveLabelProp ?? "Save");
  const cancelLabel = useMergoraMessage("inlineEdit.cancel", cancelLabelProp ?? "Cancel");
  const pendingLabel = useMergoraMessage(
    "inlineEdit.pending",
    pendingLabelProp ?? "Saving changes",
  );
  const successMessage = useMergoraMessage(
    "inlineEdit.success",
    successMessageProp ?? "Changes saved.",
  );
  const canceledMessage = useMergoraMessage(
    "inlineEdit.canceled",
    canceledMessageProp ?? "Changes canceled.",
  );
  const noChangesMessage = useMergoraMessage(
    "inlineEdit.noChanges",
    noChangesMessageProp ?? "No changes to save.",
  );
  const emptyValueLabel = useMergoraMessage(
    "inlineEdit.emptyValue",
    emptyValueLabelProp ?? "Not set",
  );
  const readOnlyLabel = useMergoraMessage("inlineEdit.readOnly", readOnlyLabelProp ?? "Read only");
  const requiredMessage = useMergoraMessage(
    "inlineEdit.required",
    requiredMessageProp ?? "Enter a value before saving.",
  );
  const saveErrorMessage = useMergoraMessage(
    "inlineEdit.saveError",
    saveErrorMessageProp ?? "Changes could not be saved. Review the value and try again.",
  );
  const externalChangeMessage = useMergoraMessage(
    "inlineEdit.externalChange",
    externalChangeMessageProp ??
      "The saved value changed while you were editing. Review your draft before trying again.",
  );
  const resetMessage = useMergoraMessage(
    "inlineEdit.reset",
    resetMessageProp ?? "The saved value was reset.",
  );

  useEffect(() => {
    if (!isDevelopmentRuntime()) return;
    if (!hasAccessibleContent(label)) {
      console.warn("Mergora InlineEdit requires a non-empty visible label.");
    }
    if (form !== undefined && name === undefined) {
      console.warn(
        "Mergora InlineEdit requires name when form is supplied so the external form can serialize and reset the value.",
      );
    }
  }, [form, label, name]);

  useEffect(() => {
    if (!editing) setDraft(committedValue);
  }, [committedValue, editing]);

  useEffect(() => {
    if (!editing) return;
    editorRef.current?.focus({ preventScroll: true });
  }, [editing]);

  useEffect(() => {
    if (focusEditorRef.current && !pending) {
      focusEditorRef.current = false;
      editorRef.current?.focus({ preventScroll: true });
    }
  }, [pending, internalError]);

  useEffect(() => {
    if (!editing && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      if (!readOnly) editButtonRef.current?.focus({ preventScroll: true });
      else rootRef.current?.focus({ preventScroll: true });
    }
  }, [editing, readOnly]);

  useEffect(() => {
    const formElement = hiddenInputRef.current?.form ?? rootRef.current?.closest("form");
    if (formElement === null || formElement === undefined) return;
    const handleReset = (event: Event) => {
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => {
        if (event.defaultPrevented) return;
        operationRef.current += 1;
        operationControllerRef.current?.abort();
        pendingRef.current = false;
        setPending(false);
        const resetValue = controlled ? committedValueRef.current : defaultValue;
        if (!controlled) setUncontrolledValue(defaultValue);
        setDraft(resetValue);
        setEditing(false);
        setInternalError(undefined);
        setStatusMessage(resetMessage);
      }, 0);
    };
    formElement.addEventListener("reset", handleReset);
    return () => {
      formElement.removeEventListener("reset", handleReset);
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    };
  }, [controlled, defaultValue, form, name, resetMessage]);

  useEffect(
    () => () => {
      operationRef.current += 1;
      operationControllerRef.current?.abort();
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  const setRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      assignRef(forwardedRef, node);
    },
    [forwardedRef],
  );
  const beginEditing = (): void => {
    if (disabled || readOnly || pendingRef.current) return;
    editBaseRef.current = committedValueRef.current;
    setDraft(committedValueRef.current);
    setInternalError(undefined);
    setStatusMessage(undefined);
    setEditing(true);
    onEdit?.();
  };
  const cancelEditing = (): void => {
    if (pendingRef.current) return;
    composingRef.current = false;
    setDraft(committedValueRef.current);
    setInternalError(undefined);
    setStatusMessage(canceledMessage);
    restoreFocusRef.current = true;
    setEditing(false);
    onCancel?.();
  };
  const submitDraft = async (): Promise<void> => {
    if (pendingRef.current || composingRef.current || disabled || readOnly) return;
    const candidate = draft;
    const validationError = validateInlineEditValue({
      required,
      requiredMessage,
      ...(validate === undefined ? {} : { validate }),
      value: candidate,
    });
    if (hasAccessibleContent(validationError)) {
      setInternalError(validationError);
      setStatusMessage(undefined);
      focusEditorRef.current = true;
      return;
    }
    if (
      controlled &&
      committedValueRef.current !== editBaseRef.current &&
      committedValueRef.current !== candidate
    ) {
      setInternalError(externalChangeMessage);
      setStatusMessage(undefined);
      focusEditorRef.current = true;
      return;
    }
    if (candidate === committedValueRef.current) {
      setInternalError(undefined);
      setStatusMessage(noChangesMessage);
      restoreFocusRef.current = true;
      setEditing(false);
      return;
    }
    const requestId = operationRef.current + 1;
    operationRef.current = requestId;
    operationControllerRef.current?.abort();
    const controller = new AbortController();
    operationControllerRef.current = controller;
    pendingRef.current = true;
    setPending(true);
    setInternalError(undefined);
    setStatusMessage(pendingLabel);
    try {
      await onSave?.(candidate, {
        previousValue: editBaseRef.current,
        signal: controller.signal,
      });
      if (controller.signal.aborted || operationRef.current !== requestId) return;
      if (
        controlled &&
        committedValueRef.current !== editBaseRef.current &&
        committedValueRef.current !== candidate
      ) {
        pendingRef.current = false;
        setPending(false);
        setInternalError(externalChangeMessage);
        setStatusMessage(undefined);
        focusEditorRef.current = true;
        return;
      }
      onValueChange?.(candidate);
      if (!controlled) setUncontrolledValue(candidate);
      setDraft(candidate);
      pendingRef.current = false;
      setPending(false);
      setStatusMessage(successMessage);
      restoreFocusRef.current = true;
      setEditing(false);
    } catch (saveError) {
      if (controller.signal.aborted || operationRef.current !== requestId) return;
      pendingRef.current = false;
      setPending(false);
      setInternalError(resolveSaveError?.(saveError) ?? saveErrorMessage);
      setStatusMessage(undefined);
      focusEditorRef.current = true;
    }
  };
  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    setDraft(event.currentTarget.value);
    setInternalError(undefined);
    if (control === "textarea") {
      textareaProps?.onChange?.(event as ChangeEvent<HTMLTextAreaElement>);
    } else {
      inputProps?.onChange?.(event as ChangeEvent<HTMLInputElement>);
    }
  };
  const handleCompositionStart = (
    event: CompositionEvent<HTMLInputElement | HTMLTextAreaElement>,
  ): void => {
    composingRef.current = true;
    if (control === "textarea") {
      textareaProps?.onCompositionStart?.(event as CompositionEvent<HTMLTextAreaElement>);
    } else {
      inputProps?.onCompositionStart?.(event as CompositionEvent<HTMLInputElement>);
    }
  };
  const handleCompositionEnd = (
    event: CompositionEvent<HTMLInputElement | HTMLTextAreaElement>,
  ): void => {
    composingRef.current = false;
    if (control === "textarea") {
      textareaProps?.onCompositionEnd?.(event as CompositionEvent<HTMLTextAreaElement>);
    } else {
      inputProps?.onCompositionEnd?.(event as CompositionEvent<HTMLInputElement>);
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    if (control === "textarea") {
      textareaProps?.onKeyDown?.(event as KeyboardEvent<HTMLTextAreaElement>);
    } else {
      inputProps?.onKeyDown?.(event as KeyboardEvent<HTMLInputElement>);
    }
    if (event.defaultPrevented || composingRef.current || event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
      return;
    }
    const saveKey =
      event.key === "Enter" &&
      (control === "input" || (control === "textarea" && (event.ctrlKey || event.metaKey)));
    if (saveKey) {
      event.preventDefault();
      void submitDraft();
    }
  };
  const handleRootBlur = (event: FocusEvent<HTMLDivElement>): void => {
    onBlur?.(event);
    if (blurBehavior !== "save" || !editing || event.defaultPrevented) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && rootRef.current?.contains(nextTarget)) return;
    setTimeout(() => {
      const activeElement = document.activeElement;
      if (activeElement === null || !rootRef.current?.contains(activeElement)) void submitDraft();
    }, 0);
  };

  const sharedEditorProps = {
    "aria-describedby": describedBy,
    "aria-errormessage": resolvedInvalid ? errorId : undefined,
    "aria-invalid": ariaInvalid ?? (resolvedInvalid || undefined),
    "aria-labelledby": labelId,
    disabled,
    id: controlId,
    onChange: handleChange,
    onCompositionEnd: handleCompositionEnd,
    onCompositionStart: handleCompositionStart,
    onKeyDown: handleKeyDown,
    readOnly: readOnly || pending,
    required,
    value: draft,
  } as const;

  return (
    <div
      {...nativeProps}
      aria-busy={pending || undefined}
      className={joinClassNames("mrg-inline-edit", className)}
      data-control={control}
      data-disabled={disabled || undefined}
      data-editing={editing || undefined}
      data-invalid={resolvedInvalid || undefined}
      data-pending={pending || undefined}
      data-readonly={readOnly || undefined}
      data-slot="inline-edit"
      onBlur={handleRootBlur}
      ref={setRootRef}
      tabIndex={-1}
    >
      {editing ? (
        <div data-slot="inline-edit-editor">
          <label data-slot="inline-edit-label" htmlFor={controlId} id={labelId}>
            {label}
          </label>
          {descriptionId === undefined ? null : (
            <p data-slot="inline-edit-description" id={descriptionId}>
              {description}
            </p>
          )}
          {control === "textarea" ? (
            <textarea
              {...textareaProps}
              {...sharedEditorProps}
              className={joinClassNames("mrg-inline-edit-control", textareaProps?.className)}
              ref={(node) => {
                editorRef.current = node;
              }}
            />
          ) : (
            <input
              {...inputProps}
              {...sharedEditorProps}
              className={joinClassNames("mrg-inline-edit-control", inputProps?.className)}
              ref={(node) => {
                editorRef.current = node;
              }}
              type={inputProps?.type ?? "text"}
            />
          )}
          {errorId === undefined ? null : (
            <p
              data-slot="inline-edit-error"
              id={errorId}
              role={internalError ? "alert" : undefined}
            >
              {resolvedError}
            </p>
          )}
          <div data-slot="inline-edit-actions">
            <Button
              disabled={disabled || readOnly}
              onClick={() => void submitDraft()}
              pending={pending}
              pendingLabel={pendingLabel}
              size="medium"
              type="button"
            >
              {saveLabel}
            </Button>
            <Button
              disabled={disabled || pending}
              onClick={cancelEditing}
              size="medium"
              type="button"
              variant="secondary"
            >
              {cancelLabel}
            </Button>
          </div>
        </div>
      ) : (
        <div data-slot="inline-edit-view">
          <span data-slot="inline-edit-label" id={labelId}>
            {label}
          </span>
          <span data-empty={committedValue.length === 0 || undefined} data-slot="inline-edit-value">
            {committedValue.length === 0 ? emptyValueLabel : committedValue}
          </span>
          {readOnly ? (
            <span data-slot="inline-edit-readonly">{readOnlyLabel}</span>
          ) : (
            <Button
              aria-label={editAccessibleLabel}
              aria-describedby={describedBy}
              disabled={disabled}
              onClick={beginEditing}
              ref={editButtonRef}
              size="medium"
              type="button"
              variant="secondary"
            >
              {editLabel}
            </Button>
          )}
          {descriptionId === undefined ? null : (
            <p data-slot="inline-edit-description" id={descriptionId}>
              {description}
            </p>
          )}
          {errorId === undefined ? null : (
            <p data-slot="inline-edit-error" id={errorId}>
              {resolvedError}
            </p>
          )}
        </div>
      )}
      {name === undefined ? null : (
        <input
          data-slot="inline-edit-hidden-input"
          disabled={disabled}
          form={form}
          name={name}
          readOnly
          ref={hiddenInputRef}
          type="hidden"
          value={committedValue}
        />
      )}
      <span aria-atomic="true" aria-live="polite" data-slot="inline-edit-status" role="status">
        {statusMessage}
      </span>
    </div>
  );
});

InlineEdit.displayName = "InlineEdit";
