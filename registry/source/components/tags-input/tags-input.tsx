"use client";

import "./tags-input.css";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
} from "react";

export interface TagsInputProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange"
> {
  /** Persistent visible label and accessible name for the tag-entry input. */
  readonly label: string;
  /** Controlled ordered canonical tags; pair with onValueChange. */
  readonly value?: readonly string[];
  /** Initial ordered tags for uncontrolled use and native form reset. */
  readonly defaultValue?: readonly string[];
  /** Reports the complete tag array after add, remove, or reorder operations. */
  readonly onValueChange?: (value: readonly string[], reason: "add" | "remove" | "reorder") => void;
  /** Native form field name used by one hidden input per tag. */
  readonly name?: string;
  /** Native form owner id forwarded to every hidden tag input. */
  readonly form?: string;
  /** Optional visible guidance associated with the tag-entry input. */
  readonly description?: string;
  /** Optional visible validation message rendered as an alert. */
  readonly errorMessage?: string;
  /** Applies invalid styling and aria-invalid to the tag-entry input. */
  readonly invalid?: boolean;
  /** Requires at least one tag through native validation semantics. */
  readonly required?: boolean;
  /** Disables tag entry, removal, reordering, and hidden form controls. */
  readonly disabled?: boolean;
  /** Preserves tag display while blocking entry, removal, and reordering. */
  readonly readOnly?: boolean;
  /** Localized placeholder displayed by the empty tag-entry input. */
  readonly placeholder?: string;
  /** Maximum number of canonical tags accepted; defaults to 24. */
  readonly maximum?: number;
  /** Entry and paste separators used to split pending text into tag candidates. */
  readonly delimiters?: readonly string[];
  /** Returns localized recovery text for an invalid candidate, or null to accept it. */
  readonly validateTag?: (tag: string) => string | null;
  /** Adds per-tag move controls; false removes reorder UI, events, and behavior. */
  readonly reorderable?: boolean;
  /** Focuses and announces duplicate recovery; false removes its live output and callback. */
  readonly recoverDuplicates?: boolean;
  /** Reports duplicate candidates only while recoverDuplicates is enabled. */
  readonly onDuplicateTag?: (tag: string) => void;
}

function assertText(value: string, name: string): void {
  if (value.trim().length === 0)
    throw new TypeError(`Mergora TagsInput ${name} must not be empty.`);
}

function normalize(values: readonly string[]): readonly string[] {
  const output: string[] = [];
  const folded = new Set<string>();
  for (const raw of values) {
    const value = raw.trim();
    assertText(value, "tag");
    const key = value.toLocaleLowerCase();
    if (folded.has(key)) throw new TypeError(`Mergora TagsInput tag ${value} is duplicated.`);
    folded.add(key);
    output.push(value);
  }
  return output;
}

export const TagsInput = forwardRef<HTMLDivElement, TagsInputProps>(function TagsInput(
  {
    className,
    defaultValue = [],
    delimiters = [",", "\n"],
    description,
    disabled = false,
    errorMessage,
    form,
    id,
    invalid = false,
    label,
    maximum = 24,
    name,
    onDuplicateTag,
    onValueChange,
    placeholder = "Add a tag",
    readOnly = false,
    recoverDuplicates = false,
    reorderable = false,
    required = false,
    validateTag,
    value,
    ...props
  },
  ref,
): ReactElement {
  assertText(label, "label");
  if (name !== undefined) assertText(name, "name");
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 256)
    throw new RangeError("Mergora TagsInput maximum must be an integer from 1 to 256.");
  if (delimiters.length < 1 || delimiters.length > 8) {
    throw new RangeError("Mergora TagsInput delimiters must contain between 1 and 8 entries.");
  }
  const normalizedDelimiters = delimiters.map((delimiter) => {
    if (delimiter.length < 1 || delimiter.length > 4) {
      throw new RangeError("Mergora TagsInput delimiters must contain 1 to 4 characters.");
    }
    return delimiter;
  });
  if (new Set(normalizedDelimiters).size !== normalizedDelimiters.length) {
    throw new TypeError("Mergora TagsInput delimiters must be unique.");
  }
  const normalizedDefault = normalize(defaultValue);
  const normalizedValue = value === undefined ? undefined : normalize(value);
  if ((normalizedValue ?? normalizedDefault).length > maximum)
    throw new RangeError("Mergora TagsInput value exceeds maximum.");
  const generatedId = `mrg-tags-input-${useId().replaceAll(":", "")}`;
  const rootId = id ?? generatedId;
  const inputId = `${rootId}-input`;
  const descriptionId = description === undefined ? undefined : `${rootId}-description`;
  const errorId = errorMessage === undefined ? undefined : `${rootId}-error`;
  const recoveryId = `${rootId}-duplicate-recovery`;
  const validationId = `${rootId}-validation`;
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<readonly string[]>(normalizedDefault);
  const currentValue = controlled ? (normalizedValue ?? []) : internalValue;
  const [draft, setDraft] = useState("");
  const [recovery, setRecovery] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tagButtons = useRef(new Map<string, HTMLButtonElement>());
  const composing = useRef(false);

  useEffect(() => {
    const explicitForm = form === undefined ? null : document.getElementById(form);
    const associatedForm =
      explicitForm instanceof HTMLFormElement ? explicitForm : rootRef.current?.closest("form");
    if (associatedForm === null || associatedForm === undefined || controlled) return;
    const restore = () => {
      setInternalValue(normalizedDefault);
      setDraft("");
      setRecovery("");
      setValidationMessage("");
    };
    associatedForm.addEventListener("reset", restore);
    return () => associatedForm.removeEventListener("reset", restore);
  }, [controlled, form, normalizedDefault]);

  const setRootRef = (node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref !== null) ref.current = node;
  };
  const commit = (next: readonly string[], reason: "add" | "remove" | "reorder") => {
    if (!controlled) setInternalValue(next);
    onValueChange?.(next, reason);
  };
  const remove = (tag: string) => {
    if (disabled || readOnly) return;
    commit(
      currentValue.filter((valueItem) => valueItem !== tag),
      "remove",
    );
  };
  const recoverDuplicate = (duplicate: string) => {
    if (!recoverDuplicates) return;
    setRecovery(`${duplicate} is already included. Focus moved to its remove action.`);
    onDuplicateTag?.(duplicate);
    requestAnimationFrame(() => tagButtons.current.get(duplicate)?.focus());
  };
  const addValues = (rawValues: readonly string[]) => {
    if (disabled || readOnly) return;
    const candidates = rawValues.map((candidate) => candidate.trim()).filter(Boolean);
    if (candidates.length === 0) return;
    const accepted: string[] = [];
    for (const candidate of candidates) {
      const validation = validateTag?.(candidate) ?? null;
      if (validation !== null) {
        assertText(validation, "validation message");
        setValidationMessage(validation);
        return;
      }
      const duplicate = [...currentValue, ...accepted].find(
        (tag) => tag.toLocaleLowerCase() === candidate.toLocaleLowerCase(),
      );
      if (duplicate !== undefined) {
        setDraft("");
        recoverDuplicate(duplicate);
        return;
      }
      accepted.push(candidate);
    }
    if (currentValue.length + accepted.length > maximum) {
      setValidationMessage(`Add at most ${maximum} tags.`);
      return;
    }
    commit([...currentValue, ...accepted], "add");
    setDraft("");
    setValidationMessage("");
    if (recoverDuplicates) setRecovery("");
  };
  const add = () => addValues([draft]);
  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    if (disabled || readOnly || composing.current) return;
    const pasted = event.clipboardData.getData("text");
    if (!normalizedDelimiters.some((delimiter) => pasted.includes(delimiter))) return;
    event.preventDefault();
    const expression = new RegExp(
      normalizedDelimiters
        .map((delimiter) => delimiter.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
        .join("|"),
      "gu",
    );
    addValues(pasted.split(expression));
  };
  const reorder = (index: number, delta: -1 | 1) => {
    if (disabled || readOnly) return;
    const target = index + delta;
    if (target < 0 || target >= currentValue.length) return;
    const next = [...currentValue];
    const [tag] = next.splice(index, 1);
    if (tag === undefined) return;
    next.splice(target, 0, tag);
    commit(next, "reorder");
    requestAnimationFrame(() => tagButtons.current.get(tag)?.focus());
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (composing.current) return;
    if (event.key === "Enter" || normalizedDelimiters.includes(event.key)) {
      event.preventDefault();
      add();
    } else if (
      event.key === "Backspace" &&
      draft.length === 0 &&
      currentValue.length > 0 &&
      !readOnly &&
      !disabled
    ) {
      event.preventDefault();
      const last = currentValue[currentValue.length - 1];
      if (last !== undefined) remove(last);
    }
  };
  const describedBy = [
    descriptionId,
    errorId,
    recoverDuplicates ? recoveryId : undefined,
    validationMessage.length === 0 ? undefined : validationId,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      {...props}
      className={["mrg-tags-input", className].filter(Boolean).join(" ")}
      data-disabled={disabled || undefined}
      data-invalid={invalid || undefined}
      data-readonly={readOnly || undefined}
      data-slot="tags-input"
      id={rootId}
      ref={setRootRef}
    >
      <label htmlFor={inputId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {description === undefined ? null : (
        <span className="mrg-tags-input__description" id={descriptionId}>
          {description}
        </span>
      )}
      <div className="mrg-tags-input__control">
        {currentValue.length === 0 ? null : (
          <ul aria-label={`${label} values`}>
            {currentValue.map((tag, index) => (
              <li key={tag}>
                <span>{tag}</span>
                {readOnly || disabled ? null : (
                  <span className="mrg-tags-input__actions">
                    {reorderable ? (
                      <>
                        <button
                          aria-label={`Move ${tag} earlier`}
                          disabled={index === 0}
                          onClick={() => reorder(index, -1)}
                          type="button"
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`Move ${tag} later`}
                          disabled={index === currentValue.length - 1}
                          onClick={() => reorder(index, 1)}
                          type="button"
                        >
                          ↓
                        </button>
                      </>
                    ) : null}
                    <button
                      aria-label={`Remove ${tag}`}
                      onClick={() => remove(tag)}
                      ref={(node) => {
                        if (node === null) tagButtons.current.delete(tag);
                        else tagButtons.current.set(tag, node);
                      }}
                      type="button"
                    >
                      ×
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <input
          aria-describedby={describedBy || undefined}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          id={inputId}
          onBlur={add}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={currentValue.length === 0 ? placeholder : undefined}
          readOnly={readOnly}
          required={required && currentValue.length === 0}
          value={draft}
        />
      </div>
      {name === undefined
        ? null
        : currentValue.map((tag) => (
            <input form={form} key={tag} name={name} type="hidden" value={tag} />
          ))}
      {recoverDuplicates ? (
        <output
          aria-live="polite"
          className="mrg-tags-input__recovery"
          data-slot="tags-input-duplicate-recovery"
          id={recoveryId}
        >
          {recovery}
        </output>
      ) : null}
      {validationMessage.length === 0 ? null : (
        <span className="mrg-tags-input__validation" id={validationId} role="alert">
          {validationMessage}
        </span>
      )}
      {errorMessage === undefined ? null : (
        <span className="mrg-tags-input__error" id={errorId} role="alert">
          {errorMessage}
        </span>
      )}
    </div>
  );
});
