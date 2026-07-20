// Generated from registry/source/components/textarea/textarea.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEventHandler,
  type CompositionEventHandler,
  type CSSProperties,
  type ForwardedRef,
  type TextareaHTMLAttributes,
} from "react";

import { mergeFieldIdRefs, useFieldControlState } from "../field/index.js";
import { useMergoraContext, type MergoraMessage } from "../provider/index.js";
import "./textarea.css";

interface SharedTextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "maxLength"
> {
  /** Grows the textarea to its content up to `maxRows`; defaults to false. */
  readonly autoGrow?: boolean;
  /** Formats the optional visible character count. */
  readonly formatCount?: (current: number, maximum: number | undefined) => string;
  /** Localized native validation message used when the grapheme limit is exceeded. */
  readonly graphemeLimitMessage?: string;
  /** Boolean invalid fallback merged with explicit ARIA and enclosing Field state. */
  readonly invalid?: boolean;
  /** Positive visual row cap used by auto-grow behavior; defaults to 8. */
  readonly maxRows?: number;
  /** Additional class name applied to the outer Textarea wrapper. */
  readonly rootClassName?: string;
  /** Inline style applied to the outer Textarea wrapper. */
  readonly rootStyle?: CSSProperties;
  /** Shows a localized character count linked to the textarea; defaults to false. */
  readonly showCount?: boolean;
}

export type TextareaProps = SharedTextareaProps &
  (
    | {
        /** Omit to use native UTF-16 `maxLength` semantics instead. */
        readonly maxGraphemes?: undefined;
        /** Optional native UTF-16 length limit when grapheme limiting is disabled. */
        readonly maxLength?: number;
      }
    | {
        /** Non-negative user-perceived character limit enforced without truncation. */
        readonly maxGraphemes: number;
        /** Unavailable because grapheme and native UTF-16 limits cannot be combined. */
        readonly maxLength?: never;
      }
  );

export function formatTextareaCount(
  current: number,
  maximum: number | undefined,
  locale = "en-US",
): string {
  const number = new Intl.NumberFormat(locale);
  const noun = new Intl.PluralRules(locale).select(current) === "one" ? "character" : "characters";
  return maximum === undefined
    ? `${number.format(current)} ${noun}`
    : `${number.format(current)} of ${number.format(maximum)} ${noun}`;
}

/**
 * Counts user-perceived characters with ECMA-402 grapheme segmentation. The
 * defensive legacy fallback counts NFC-normalized Unicode code points; exact
 * maxGraphemes support therefore requires Intl.Segmenter, as it does in every
 * supported Mergora runtime.
 */
export function countTextareaGraphemes(value: string, locale = "en-US"): number {
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(value)].length;
  }
  return [...value.normalize("NFC")].length;
}

const defaultCountMessage: MergoraMessage = ({ locale, values }) =>
  formatTextareaCount(Number(values.current ?? 0), undefined, locale);

const defaultCountWithMaximumMessage: MergoraMessage = ({ locale, values }) =>
  formatTextareaCount(Number(values.current ?? 0), Number(values.maximum ?? 0), locale);

const defaultGraphemeLimitMessage: MergoraMessage = ({ locale, values }) => {
  const maximum = Number(values.maximum ?? 0);
  const number = new Intl.NumberFormat(locale).format(maximum);
  const noun = new Intl.PluralRules(locale).select(maximum) === "one" ? "character" : "characters";
  return `Enter no more than ${number} ${noun}.`;
};

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

function isSemanticallyInvalid(
  value: TextareaHTMLAttributes<HTMLTextAreaElement>["aria-invalid"],
): boolean {
  return value === true || value === "true" || value === "grammar" || value === "spelling";
}

function textValue(value: TextareaHTMLAttributes<HTMLTextAreaElement>["value"]): string {
  if (value === undefined || value === null) return "";
  return Array.isArray(value) ? value.join(",") : String(value);
}

function setForwardedRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref !== null) ref.current = value;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    "aria-describedby": ariaDescribedBy,
    "aria-errormessage": ariaErrorMessage,
    "aria-invalid": ariaInvalid,
    autoGrow = false,
    className,
    defaultValue,
    disabled = false,
    formatCount,
    form,
    graphemeLimitMessage,
    id,
    invalid,
    maxGraphemes,
    maxLength,
    maxRows = 8,
    onChange,
    onCompositionEnd,
    onCompositionStart,
    required,
    rootClassName,
    rootStyle,
    showCount = false,
    value,
    ...nativeProps
  },
  forwardedRef,
) {
  const field = useFieldControlState();
  const { getMessage, locale } = useMergoraContext();
  const generatedId = useId().replaceAll(":", "");
  const controlRef = useRef<HTMLTextAreaElement | null>(null);
  const appliedGraphemeMessageRef = useRef<string | null>(null);
  const composingRef = useRef(false);
  const controlledValueAtCompositionStartRef = useRef("");
  const pendingControlledCompositionValueRef = useRef<string | null>(null);
  const countTextValue = useCallback(
    (text: string) =>
      maxGraphemes === undefined ? text.length : countTextareaGraphemes(text, locale),
    [locale, maxGraphemes],
  );
  const [uncontrolledCount, setUncontrolledCount] = useState(() =>
    maxGraphemes === undefined
      ? textValue(defaultValue).length
      : countTextareaGraphemes(textValue(defaultValue), locale),
  );
  const controlled = value !== undefined;
  const controlledText = textValue(value);
  const [composing, setComposing] = useState(false);
  const [committedCount, setCommittedCount] = useState(() =>
    maxGraphemes === undefined
      ? controlled
        ? textValue(value).length
        : textValue(defaultValue).length
      : countTextareaGraphemes(controlled ? textValue(value) : textValue(defaultValue), locale),
  );
  if (!Number.isFinite(maxRows) || !Number.isInteger(maxRows) || maxRows <= 0) {
    throw new RangeError("Mergora Textarea maxRows must be a finite positive integer.");
  }
  if (
    maxLength !== undefined &&
    (!Number.isFinite(maxLength) || !Number.isInteger(maxLength) || maxLength < 0)
  ) {
    throw new RangeError("Mergora Textarea maxLength must be a non-negative finite integer.");
  }
  if (
    maxGraphemes !== undefined &&
    (!Number.isFinite(maxGraphemes) || !Number.isInteger(maxGraphemes) || maxGraphemes < 0)
  ) {
    throw new RangeError("Mergora Textarea maxGraphemes must be a non-negative finite integer.");
  }
  if (maxLength !== undefined && maxGraphemes !== undefined) {
    throw new RangeError("Mergora Textarea maxLength and maxGraphemes are mutually exclusive.");
  }
  if (graphemeLimitMessage !== undefined && graphemeLimitMessage.trim().length === 0) {
    throw new RangeError(
      "Mergora Textarea graphemeLimitMessage must not be empty or whitespace-only.",
    );
  }
  const waitingForControlledComposition =
    controlled &&
    pendingControlledCompositionValueRef.current !== null &&
    controlledText === controlledValueAtCompositionStartRef.current;
  const currentCount = composing
    ? committedCount
    : controlled
      ? waitingForControlledComposition
        ? committedCount
        : countTextValue(controlledText)
      : uncontrolledCount;
  const exceedsGraphemeLimit =
    maxGraphemes !== undefined && !composing && currentCount > maxGraphemes;
  const resolvedAriaInvalid =
    ariaInvalid !== undefined
      ? ariaInvalid
      : invalid !== undefined
        ? invalid || undefined
        : exceedsGraphemeLimit
          ? true
          : field?.invalid || undefined;
  const resolvedInvalid = isSemanticallyInvalid(resolvedAriaInvalid);
  const resolvedId = field?.controlId ?? id;
  const countId = `mrg-textarea-${generatedId}-count`;
  const describedBy = mergeFieldIdRefs(
    ariaDescribedBy,
    field?.descriptionId,
    resolvedInvalid ? field?.errorMessageId : undefined,
    showCount ? countId : undefined,
  );
  const errorMessage = mergeFieldIdRefs(
    ariaErrorMessage,
    resolvedInvalid ? field?.errorMessageId : undefined,
  );
  const countText = showCount
    ? (formatCount?.(currentCount, maxLength ?? maxGraphemes) ??
      (maxLength === undefined && maxGraphemes === undefined
        ? getMessage("textarea.count", defaultCountMessage, {
            current: currentCount,
            unit: maxGraphemes === undefined ? "code-unit" : "grapheme",
          })
        : getMessage("textarea.countWithMaximum", defaultCountWithMaximumMessage, {
            current: currentCount,
            maximum: maxLength ?? maxGraphemes ?? 0,
            unit: maxGraphemes === undefined ? "code-unit" : "grapheme",
          })))
    : "";
  const resolvedGraphemeLimitMessage =
    graphemeLimitMessage ??
    (maxGraphemes === undefined
      ? ""
      : getMessage("textarea.graphemeLimit", defaultGraphemeLimitMessage, {
          maximum: maxGraphemes,
        }));

  const resize = useCallback(() => {
    const node = controlRef.current;
    if (node === null) return;
    if (!autoGrow) {
      node.style.removeProperty("block-size");
      node.style.removeProperty("overflow-y");
      return;
    }
    node.style.blockSize = "auto";
    const style = window.getComputedStyle(node);
    const parsedLineHeight = Number.parseFloat(style.lineHeight);
    const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : 24;
    const chrome =
      Number.parseFloat(style.paddingBlockStart) +
      Number.parseFloat(style.paddingBlockEnd) +
      Number.parseFloat(style.borderBlockStartWidth) +
      Number.parseFloat(style.borderBlockEndWidth);
    const maximum = maxRows * lineHeight + chrome;
    const next = Math.min(node.scrollHeight, maximum);
    node.style.blockSize = `${next}px`;
    node.style.overflowY = node.scrollHeight > maximum + 0.5 ? "auto" : "hidden";
  }, [autoGrow, maxRows]);

  useLayoutEffect(() => {
    resize();
  }, [currentCount, resize, value]);

  useLayoutEffect(() => {
    const node = controlRef.current;
    if (node === null) return;
    resize();
    if (!autoGrow) return;
    let frame = 0;
    let active = true;
    const scheduleResize = () => {
      if (!active) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    };
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(scheduleResize);
    observer?.observe(node);
    if (node.parentElement !== null) observer?.observe(node.parentElement);
    const fonts = document.fonts;
    fonts?.addEventListener?.("loadingdone", scheduleResize);
    void fonts?.ready.then(scheduleResize);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      fonts?.removeEventListener?.("loadingdone", scheduleResize);
    };
  }, [autoGrow, resize]);

  useLayoutEffect(() => {
    const node = controlRef.current;
    if (node === null) return;
    const previousMessage = appliedGraphemeMessageRef.current;
    const exceedsLimit =
      maxGraphemes !== undefined && !composingRef.current && currentCount > maxGraphemes;

    if (previousMessage !== null && node.validationMessage === previousMessage) {
      node.setCustomValidity("");
    }
    if (exceedsLimit) {
      node.setCustomValidity(resolvedGraphemeLimitMessage);
      appliedGraphemeMessageRef.current = resolvedGraphemeLimitMessage;
    } else {
      appliedGraphemeMessageRef.current = null;
    }

    return () => {
      if (
        appliedGraphemeMessageRef.current !== null &&
        node.validationMessage === appliedGraphemeMessageRef.current
      ) {
        node.setCustomValidity("");
      }
    };
  }, [composing, currentCount, maxGraphemes, resolvedGraphemeLimitMessage]);

  useEffect(() => {
    const form = controlRef.current?.form;
    if (form === null || form === undefined) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleReset = () => {
      timer = setTimeout(() => {
        const node = controlRef.current;
        if (node === null) return;
        composingRef.current = false;
        pendingControlledCompositionValueRef.current = null;
        setComposing(false);
        const resetCount = countTextValue(node.value);
        if (!controlled) setUncontrolledCount(resetCount);
        setCommittedCount(resetCount);
        resize();
      }, 0);
    };
    form.addEventListener("reset", handleReset);
    return () => {
      form.removeEventListener("reset", handleReset);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [controlled, countTextValue, form, resize]);

  useEffect(() => {
    if (!controlled || pendingControlledCompositionValueRef.current === null) return;
    if (controlledText !== controlledValueAtCompositionStartRef.current) {
      pendingControlledCompositionValueRef.current = null;
      setCommittedCount(countTextValue(controlledText));
    }
  }, [controlled, controlledText, countTextValue]);

  useEffect(() => {
    const node = controlRef.current;
    if (node === null || composingRef.current) return;
    const nextCount = countTextValue(node.value);
    if (!controlled) setUncontrolledCount(nextCount);
    setCommittedCount(nextCount);
  }, [controlled, countTextValue]);

  useEffect(() => {
    if (isDevelopmentRuntime() && field !== null && id !== undefined && id !== field.controlId) {
      console.warn(
        `Mergora Textarea received id "${id}" inside Field; Field controlId "${field.controlId}" is authoritative.`,
      );
    }
  }, [field, id]);

  const assignControl = useCallback(
    (node: HTMLTextAreaElement | null) => {
      controlRef.current = node;
      setForwardedRef(forwardedRef, node);
    },
    [forwardedRef],
  );
  const handleChange: ChangeEventHandler<HTMLTextAreaElement> = (event) => {
    if (!composingRef.current) {
      const nextCount = countTextValue(event.currentTarget.value);
      if (!controlled) setUncontrolledCount(nextCount);
      setCommittedCount(nextCount);
    }
    resize();
    onChange?.(event);
  };
  const handleCompositionStart: CompositionEventHandler<HTMLTextAreaElement> = (event) => {
    composingRef.current = true;
    pendingControlledCompositionValueRef.current = null;
    controlledValueAtCompositionStartRef.current = controlledText;
    setCommittedCount(currentCount);
    setComposing(true);
    onCompositionStart?.(event);
  };
  const handleCompositionEnd: CompositionEventHandler<HTMLTextAreaElement> = (event) => {
    composingRef.current = false;
    setComposing(false);
    if (controlled) pendingControlledCompositionValueRef.current = event.currentTarget.value;
    const nextCount = countTextValue(event.currentTarget.value);
    if (!controlled) setUncontrolledCount(nextCount);
    setCommittedCount(nextCount);
    onCompositionEnd?.(event);
  };

  return (
    <span
      className={rootClassName === undefined ? "mrg-textarea" : `mrg-textarea ${rootClassName}`}
      data-autogrow={autoGrow || undefined}
      data-count-unit={maxGraphemes === undefined ? "code-unit" : "grapheme"}
      data-disabled={disabled || undefined}
      data-invalid={resolvedInvalid || undefined}
      data-slot="textarea-root"
      style={rootStyle}
    >
      <textarea
        {...nativeProps}
        aria-describedby={describedBy}
        aria-errormessage={errorMessage}
        aria-invalid={resolvedAriaInvalid}
        className={
          className === undefined ? "mrg-textarea-control" : `mrg-textarea-control ${className}`
        }
        data-composing={composing || undefined}
        data-slot="textarea"
        defaultValue={defaultValue}
        disabled={disabled}
        form={form}
        id={resolvedId}
        maxLength={maxLength}
        onChange={handleChange}
        onCompositionEnd={handleCompositionEnd}
        onCompositionStart={handleCompositionStart}
        ref={assignControl}
        required={required ?? field?.required}
        value={value}
      />
      {showCount ? (
        <output aria-live="off" data-slot="textarea-count" id={countId}>
          {countText}
        </output>
      ) : null}
    </span>
  );
});

Textarea.displayName = "Textarea";
