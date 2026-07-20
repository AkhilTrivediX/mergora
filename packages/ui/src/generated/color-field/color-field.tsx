// Generated from registry/source/components/color-field/color-field.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type AriaAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
} from "react";

import { mergeFieldIdRefs, useFieldControlState } from "../field/index.js";
import { useMergoraContext } from "../provider/index.js";
import "./color-field.css";

export type ColorAlphaPolicy = "allow" | "opaque";
export type ColorTextFormat = "hex" | "hsl" | "rgb";
export type ColorParseFailureReason = "alpha-not-allowed" | "empty" | "out-of-range" | "syntax";

export interface SrgbColorValue {
  /** Integer opacity channel from zero through 255. */
  readonly alpha: number;
  /** Integer blue channel from zero through 255. */
  readonly blue: number;
  /** Required discriminator preventing accidental cross-space channel interpretation. */
  readonly colorSpace: "srgb";
  /** Integer green channel from zero through 255. */
  readonly green: number;
  /** Integer red channel from zero through 255. */
  readonly red: number;
}

export interface HslColorValue {
  /** Integer opacity channel from zero through 255. */
  readonly alpha: number;
  /** Finite hue angle normalized into the zero-to-360-degree circle. */
  readonly hue: number;
  /** Lightness percentage from zero through 100. */
  readonly lightness: number;
  /** Saturation percentage from zero through 100. */
  readonly saturation: number;
}

export type ColorParseResult =
  | {
      /** Successful parse discriminator granting access to a validated sRGB value. */
      readonly ok: true;
      /** Validated sRGB channels produced from the exact editor text. */
      readonly value: SrgbColorValue;
    }
  | {
      /** Failed parse discriminator granting access to a recoverable reason. */
      readonly ok: false;
      /** Stable empty, syntax, range, or alpha-policy failure reason. */
      readonly reason: ColorParseFailureReason;
    };

export interface ColorFieldMessages {
  /** Recovery text shown when transparency conflicts with the opaque policy. */
  readonly alphaNotAllowed: string;
  /** Localized interpretation for ratios meeting the configured threshold. */
  readonly contrastAtOrAbove: string;
  /** Localized interpretation for ratios below the configured threshold. */
  readonly contrastBelow: string;
  /** Visible label naming the optional reference-contrast output. */
  readonly contrastLabel: string;
  /** Status text used before a valid color makes contrast computable. */
  readonly contrastUnavailable: string;
  /** Accessible preview text used when no valid color is selected. */
  readonly emptyPreview: string;
  /** Recovery text shown when exact editor syntax cannot be parsed. */
  readonly invalidSyntax: string;
  /** Recovery text shown when parsed channels exceed supported ranges. */
  readonly outOfRange: string;
  /** Accessible name for the optional selected-color preview. */
  readonly previewLabel: string;
  /** Native validation recovery text for a required empty editor. */
  readonly required: string;
  /** Visible caveat explaining the limits of reference contrast analysis. */
  readonly verificationNote: string;
}

export interface ColorFieldProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "defaultValue" | "onChange"
> {
  /** Additional IDs merged into the editable input's description relationship. */
  readonly "aria-describedby"?: string;
  /** Additional IDs merged with generated and enclosing Field error text. */
  readonly "aria-errormessage"?: string;
  /** Explicit invalid state combined with parse errors and enclosing Field state. */
  readonly "aria-invalid"?: AriaAttributes["aria-invalid"];
  /** Accessible name used when no visible Field label is available. */
  readonly "aria-label"?: string;
  /** IDs of visible content that name the editable color input. */
  readonly "aria-labelledby"?: string;
  /** Allows transparency or requires full opacity; defaults to `opaque`. */
  readonly alphaPolicy?: ColorAlphaPolicy;
  /** Opaque sRGB surface used only for optional reference contrast analysis. */
  readonly contrastBackground?: SrgbColorValue;
  /** Finite reference ratio above one; defaults to 4.5. */
  readonly contrastThreshold?: number;
  /** Initial parsed color for uncontrolled use; defaults to no selection. */
  readonly defaultValue?: SrgbColorValue | null;
  /** Disables editing and removes the hidden successful form control. */
  readonly disabled?: boolean;
  /** Associates the hidden canonical form control with an external form by ID. */
  readonly form?: string;
  /** Exact text representation used for editing; defaults to `hex`. */
  readonly format?: ColorTextFormat;
  /** Explicit editor identity, superseded by an enclosing Field control ID. */
  readonly id?: string;
  /** Additional class name applied to the exact text input. */
  readonly inputClassName?: string;
  /** Ref forwarded to the exact text input rather than the component root. */
  readonly inputRef?: Ref<HTMLInputElement>;
  /** Inline style applied to the exact text input. */
  readonly inputStyle?: CSSProperties;
  /** Localized overrides for parse, preview, contrast, and validation messages. */
  readonly messages?: Partial<ColorFieldMessages>;
  /** Native name for the hidden canonical serialized color control. */
  readonly name?: string;
  /** Receives committed valid colors or an allowed empty value. */
  readonly onChange?: (value: SrgbColorValue | null) => void;
  /** Localized hint displayed only while the exact text input is empty. */
  readonly placeholder?: string;
  /** Preserves value and form serialization while preventing edits. */
  readonly readOnly?: boolean;
  /** Requires a valid non-empty color and participates in native validation. */
  readonly required?: boolean;
  /** Shows reference contrast context; false removes its UI, status, and description relationship. */
  readonly showContrast?: boolean;
  /** Shows selected-color preview; false removes its swatch and accessible preview text. */
  readonly showPreview?: boolean;
  /** Controlled parsed color; committed edits are proposed through `onChange`. */
  readonly value?: SrgbColorValue | null;
}

const DEFAULT_MESSAGES: ColorFieldMessages = {
  alphaNotAllowed: "This field accepts opaque colors only.",
  contrastAtOrAbove: "at or above the configured reference threshold",
  contrastBelow: "below the configured reference threshold",
  contrastLabel: "Reference contrast",
  contrastUnavailable: "Contrast is unavailable until a valid color is selected.",
  emptyPreview: "No color selected",
  invalidSyntax: "Enter a hexadecimal, RGB, or HSL color.",
  outOfRange: "One or more color channels are outside the supported range.",
  previewLabel: "Selected color preview",
  required: "Enter a color.",
  verificationNote: "Confirm text size and final rendered colors separately.",
};

const WHITE = createSrgbColor({ alpha: 255, blue: 255, green: 255, red: 255 });
const NUMBER_PATTERN = "[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
const RGB_PATTERN = new RegExp(
  `^rgba?\\(\\s*(${NUMBER_PATTERN})\\s*,\\s*(${NUMBER_PATTERN})\\s*,\\s*(${NUMBER_PATTERN})(?:\\s*,\\s*(${NUMBER_PATTERN}))?\\s*\\)$`,
  "iu",
);
const HSL_PATTERN = new RegExp(
  `^hsla?\\(\\s*(${NUMBER_PATTERN})(?:deg)?\\s*,\\s*(${NUMBER_PATTERN})%\\s*,\\s*(${NUMBER_PATTERN})%(?:\\s*,\\s*(${NUMBER_PATTERN}))?\\s*\\)$`,
  "iu",
);

function isDevelopmentRuntime(): boolean {
  const viteProduction = (
    import.meta as ImportMeta & { readonly env?: { readonly PROD?: boolean } }
  ).env?.PROD;
  const runtime = globalThis as typeof globalThis & {
    readonly process?: { readonly env?: { readonly NODE_ENV?: string } };
  };
  return viteProduction !== true && runtime.process?.env?.NODE_ENV !== "production";
}

function isSemanticallyInvalid(value: AriaAttributes["aria-invalid"]): boolean {
  return value === true || value === "true" || value === "grammar" || value === "spelling";
}

function assertByte(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`Mergora color ${label} must be an integer from 0 through 255.`);
  }
}

function assertColorValue(value: SrgbColorValue, label = "value"): void {
  if (value.colorSpace !== "srgb") {
    throw new TypeError(`Mergora color ${label} must use the srgb color space.`);
  }
  assertByte(value.red, `${label}.red`);
  assertByte(value.green, `${label}.green`);
  assertByte(value.blue, `${label}.blue`);
  assertByte(value.alpha, `${label}.alpha`);
}

function assertPolicy(value: SrgbColorValue | null, policy: ColorAlphaPolicy, label: string): void {
  if (value !== null) {
    assertColorValue(value, label);
    if (policy === "opaque" && value.alpha !== 255) {
      throw new RangeError(
        `Mergora ColorField ${label} must be opaque when alphaPolicy is opaque.`,
      );
    }
  }
}

function trimFixed(value: number, fractionDigits: number): string {
  const text = value.toFixed(fractionDigits).replace(/(?:\.0+|(\.\d*?)0+)$/u, "$1");
  return text === "-0" ? "0" : text;
}

function byteHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

function alphaText(alpha: number): string {
  return trimFixed(alpha / 255, 6);
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function parseAlpha(value: string | undefined): number | null {
  if (value === undefined) return 255;
  const alpha = Number(value);
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
  return Math.round(alpha * 255);
}

function parseHex(text: string): SrgbColorValue | null {
  const match = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/iu.exec(text);
  if (match?.[1] === undefined) return null;
  const value = match[1];
  const expanded = value.length <= 4 ? [...value].map((part) => `${part}${part}`).join("") : value;
  const withAlpha = expanded.length === 6 ? `${expanded}ff` : expanded;
  return createSrgbColor({
    alpha: Number.parseInt(withAlpha.slice(6, 8), 16),
    blue: Number.parseInt(withAlpha.slice(4, 6), 16),
    green: Number.parseInt(withAlpha.slice(2, 4), 16),
    red: Number.parseInt(withAlpha.slice(0, 2), 16),
  });
}

function failed(reason: ColorParseFailureReason): ColorParseResult {
  return { ok: false, reason };
}

export function createSrgbColor({
  alpha = 255,
  blue,
  green,
  red,
}: Omit<SrgbColorValue, "colorSpace"> & {
  /** Optional opacity byte defaulting to fully opaque. */
  readonly alpha?: number;
}): SrgbColorValue {
  const value = { alpha, blue, colorSpace: "srgb" as const, green, red };
  assertColorValue(value);
  return Object.freeze(value);
}

export function hslToSrgb(value: HslColorValue): SrgbColorValue {
  if (!Number.isFinite(value.hue)) {
    throw new RangeError("Mergora color hue must be finite.");
  }
  for (const [label, channel] of [
    ["saturation", value.saturation],
    ["lightness", value.lightness],
  ] as const) {
    if (!Number.isFinite(channel) || channel < 0 || channel > 100) {
      throw new RangeError(`Mergora color ${label} must be from 0 through 100.`);
    }
  }
  assertByte(value.alpha, "alpha");
  const hue = normalizeHue(value.hue) / 360;
  const saturation = value.saturation / 100;
  const lightness = value.lightness / 100;
  if (saturation === 0) {
    const channel = Math.round(lightness * 255);
    return createSrgbColor({ alpha: value.alpha, blue: channel, green: channel, red: channel });
  }
  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const channel = (offset: number): number => {
    let position = hue + offset;
    if (position < 0) position += 1;
    if (position > 1) position -= 1;
    if (position < 1 / 6) return p + (q - p) * 6 * position;
    if (position < 1 / 2) return q;
    if (position < 2 / 3) return p + (q - p) * (2 / 3 - position) * 6;
    return p;
  };
  return createSrgbColor({
    alpha: value.alpha,
    blue: Math.round(channel(-1 / 3) * 255),
    green: Math.round(channel(0) * 255),
    red: Math.round(channel(1 / 3) * 255),
  });
}

export function srgbToHsl(value: SrgbColorValue): HslColorValue {
  assertColorValue(value);
  const red = value.red / 255;
  const green = value.green / 255;
  const blue = value.blue / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;
  if (delta !== 0) {
    if (maximum === red) hue = ((green - blue) / delta) % 6;
    else if (maximum === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = normalizeHue(hue * 60);
  }
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return Object.freeze({
    alpha: value.alpha,
    hue,
    lightness: lightness * 100,
    saturation: saturation * 100,
  });
}

export function parseColorText(
  input: string,
  alphaPolicy: ColorAlphaPolicy = "opaque",
): ColorParseResult {
  const text = input.trim();
  if (text.length === 0) return failed("empty");
  let value = parseHex(text);
  if (value === null) {
    const rgb = RGB_PATTERN.exec(text);
    if (rgb !== null) {
      const channels = rgb.slice(1, 4).map(Number);
      const alpha = parseAlpha(rgb[4]);
      if (
        alpha === null ||
        channels.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)
      ) {
        return failed("out-of-range");
      }
      value = createSrgbColor({
        alpha,
        blue: Math.round(channels[2]!),
        green: Math.round(channels[1]!),
        red: Math.round(channels[0]!),
      });
    }
  }
  if (value === null) {
    const hsl = HSL_PATTERN.exec(text);
    if (hsl !== null) {
      const hue = Number(hsl[1]);
      const saturation = Number(hsl[2]);
      const lightness = Number(hsl[3]);
      const alpha = parseAlpha(hsl[4]);
      if (
        !Number.isFinite(hue) ||
        !Number.isFinite(saturation) ||
        !Number.isFinite(lightness) ||
        alpha === null ||
        saturation < 0 ||
        saturation > 100 ||
        lightness < 0 ||
        lightness > 100
      ) {
        return failed("out-of-range");
      }
      value = hslToSrgb({ alpha, hue, lightness, saturation });
    }
  }
  if (value === null) return failed("syntax");
  if (alphaPolicy === "opaque" && value.alpha !== 255) return failed("alpha-not-allowed");
  return { ok: true, value };
}

export function formatColorValue(
  value: SrgbColorValue,
  format: ColorTextFormat = "hex",
  alphaPolicy: ColorAlphaPolicy = "opaque",
): string {
  assertPolicy(value, alphaPolicy, "value");
  if (format === "hex") return serializeColorValue(value, alphaPolicy);
  if (format === "rgb") {
    const channels = `${value.red}, ${value.green}, ${value.blue}`;
    return alphaPolicy === "allow"
      ? `rgba(${channels}, ${alphaText(value.alpha)})`
      : `rgb(${channels})`;
  }
  const hsl = srgbToHsl(value);
  const channels = `${trimFixed(hsl.hue, 6)}, ${trimFixed(hsl.saturation, 6)}%, ${trimFixed(hsl.lightness, 6)}%`;
  return alphaPolicy === "allow"
    ? `hsla(${channels}, ${alphaText(value.alpha)})`
    : `hsl(${channels})`;
}

export function serializeColorValue(
  value: SrgbColorValue,
  alphaPolicy: ColorAlphaPolicy = "opaque",
): string {
  assertPolicy(value, alphaPolicy, "value");
  const rgb = `#${byteHex(value.red)}${byteHex(value.green)}${byteHex(value.blue)}`;
  return alphaPolicy === "allow" ? `${rgb}${byteHex(value.alpha)}` : rgb;
}

export function compositeSrgbColors(
  foreground: SrgbColorValue,
  background: SrgbColorValue,
): SrgbColorValue {
  assertColorValue(foreground, "foreground");
  assertColorValue(background, "background");
  if (background.alpha !== 255) {
    throw new RangeError("Mergora contrast backgrounds must be opaque.");
  }
  const alpha = foreground.alpha / 255;
  const composite = (front: number, back: number): number =>
    Math.round(front * alpha + back * (1 - alpha));
  return createSrgbColor({
    alpha: 255,
    blue: composite(foreground.blue, background.blue),
    green: composite(foreground.green, background.green),
    red: composite(foreground.red, background.red),
  });
}

export function relativeLuminance(value: SrgbColorValue): number {
  assertColorValue(value);
  const linearize = (channel: number): number => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return (
    linearize(value.red) * 0.2126 + linearize(value.green) * 0.7152 + linearize(value.blue) * 0.0722
  );
}

export function colorContrastRatio(foreground: SrgbColorValue, background: SrgbColorValue): number {
  const flattened = compositeSrgbColors(foreground, background);
  const foregroundLuminance = relativeLuminance(flattened);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

function setForwardedRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref !== null && ref !== undefined) {
    (ref as { current: T | null }).current = value;
  }
}

function valuesEqual(left: SrgbColorValue | null, right: SrgbColorValue | null): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.red === right.red &&
      left.green === right.green &&
      left.blue === right.blue &&
      left.alpha === right.alpha)
  );
}

function errorForReason(reason: ColorParseFailureReason, messages: ColorFieldMessages): string {
  if (reason === "alpha-not-allowed") return messages.alphaNotAllowed;
  if (reason === "out-of-range") return messages.outOfRange;
  if (reason === "empty") return messages.required;
  return messages.invalidSyntax;
}

export const ColorField = forwardRef<HTMLDivElement, ColorFieldProps>(
  function ColorField(props, ref) {
    const {
      "aria-describedby": ariaDescribedBy,
      "aria-errormessage": ariaErrorMessage,
      "aria-invalid": ariaInvalid,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      alphaPolicy = "opaque",
      className,
      contrastBackground = WHITE,
      contrastThreshold = 4.5,
      defaultValue = null,
      disabled = false,
      form,
      format = "hex",
      id,
      inputClassName,
      inputRef,
      inputStyle,
      messages: messageOverrides,
      name,
      onChange,
      placeholder,
      readOnly = false,
      required,
      showContrast = true,
      showPreview = true,
      style,
      value,
      ...nativeProps
    } = props;
    assertPolicy(defaultValue, alphaPolicy, "defaultValue");
    if (value !== undefined) assertPolicy(value, alphaPolicy, "value");
    assertPolicy(contrastBackground, "allow", "contrastBackground");
    if (contrastBackground.alpha !== 255) {
      throw new RangeError("Mergora ColorField contrastBackground must be opaque.");
    }
    if (!Number.isFinite(contrastThreshold) || contrastThreshold <= 1) {
      throw new RangeError("Mergora ColorField contrastThreshold must be a finite number above 1.");
    }
    if (name !== undefined && name.trim().length === 0) {
      throw new RangeError("Mergora ColorField name must not be empty or whitespace-only.");
    }
    if (form !== undefined && form.trim().length === 0) {
      throw new RangeError("Mergora ColorField form must not be empty or whitespace-only.");
    }
    if (id !== undefined && id.trim().length === 0) {
      throw new RangeError("Mergora ColorField id must not be empty or whitespace-only.");
    }

    const field = useFieldControlState();
    const { locale } = useMergoraContext();
    const generatedId = useId().replaceAll(":", "");
    const resolvedId = field?.controlId ?? id ?? `mrg-color-field-${generatedId}`;
    const errorId = `${resolvedId}-color-error`;
    const controlled = value !== undefined;
    const initialValue = useRef(defaultValue);
    const [uncontrolledValue, setUncontrolledValue] = useState<SrgbColorValue | null>(defaultValue);
    const selectedValue = controlled ? value : uncontrolledValue;
    const [draft, setDraft] = useState(() =>
      selectedValue === null ? "" : formatColorValue(selectedValue, format, alphaPolicy),
    );
    const [pendingControlledValue, setPendingControlledValue] = useState<
      SrgbColorValue | null | undefined
    >(undefined);
    const [localError, setLocalError] = useState<string | null>(null);
    const composing = useRef(false);
    const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputElement = useRef<HTMLInputElement | null>(null);
    const previousSelection = useRef({ alphaPolicy, format, value: selectedValue });
    const messages = useMemo(
      () => ({ ...DEFAULT_MESSAGES, ...messageOverrides }),
      [messageOverrides],
    );
    const externalInvalid = isSemanticallyInvalid(ariaInvalid) || (field?.invalid ?? false);
    const invalid = externalInvalid || localError !== null;
    const resolvedRequired = required ?? field?.required ?? false;
    const describedBy = mergeFieldIdRefs(
      ariaDescribedBy,
      field?.descriptionId,
      invalid ? field?.errorMessageId : undefined,
      localError === null ? undefined : errorId,
    );
    const errorMessage = mergeFieldIdRefs(
      ariaErrorMessage,
      invalid ? field?.errorMessageId : undefined,
      localError === null ? undefined : errorId,
    );
    const labelledBy = ariaLabelledBy ?? field?.labelId;
    const ratio =
      selectedValue === null ? null : colorContrastRatio(selectedValue, contrastBackground);
    const ratioFormatter = useMemo(
      () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 }),
      [locale],
    );
    const thresholdFormatter = useMemo(
      () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
      [locale],
    );

    const publish = useCallback(
      (next: SrgbColorValue | null) => {
        if (!controlled) {
          if (valuesEqual(selectedValue, next)) {
            setDraft(next === null ? "" : formatColorValue(next, format, alphaPolicy));
            return;
          }
          setUncontrolledValue(next);
          setDraft(next === null ? "" : formatColorValue(next, format, alphaPolicy));
        } else {
          const requestedValue =
            pendingControlledValue === undefined ? selectedValue : pendingControlledValue;
          if (valuesEqual(requestedValue, next)) {
            setDraft(next === null ? "" : formatColorValue(next, format, alphaPolicy));
            return;
          }
          setPendingControlledValue(next);
          setDraft(next === null ? "" : formatColorValue(next, format, alphaPolicy));
        }
        onChange?.(next);
      },
      [alphaPolicy, controlled, format, onChange, pendingControlledValue, selectedValue],
    );

    const restore = useCallback(() => {
      setPendingControlledValue(undefined);
      setDraft(selectedValue === null ? "" : formatColorValue(selectedValue, format, alphaPolicy));
      setLocalError(null);
    }, [alphaPolicy, format, selectedValue]);

    const commitDraft = useCallback(() => {
      if (disabled || readOnly || composing.current) return;
      const parsed = parseColorText(draft, alphaPolicy);
      if (!parsed.ok) {
        if (parsed.reason === "empty" && !resolvedRequired) {
          setLocalError(null);
          publish(null);
          return;
        }
        setLocalError(errorForReason(parsed.reason, messages));
        return;
      }
      setLocalError(null);
      publish(parsed.value);
    }, [alphaPolicy, disabled, draft, messages, publish, readOnly, resolvedRequired]);

    const setInputElement = useCallback(
      (node: HTMLInputElement | null) => {
        inputElement.current = node;
        setForwardedRef(inputRef, node);
      },
      [inputRef],
    );

    useEffect(() => {
      const previous = previousSelection.current;
      const selectionChanged = !valuesEqual(previous.value, selectedValue);
      if (selectionChanged || previous.format !== format || previous.alphaPolicy !== alphaPolicy) {
        const displayValue =
          selectionChanged || pendingControlledValue === undefined
            ? selectedValue
            : pendingControlledValue;
        setDraft(displayValue === null ? "" : formatColorValue(displayValue, format, alphaPolicy));
        setLocalError(null);
        if (selectionChanged) setPendingControlledValue(undefined);
        previousSelection.current = { alphaPolicy, format, value: selectedValue };
      }
    }, [alphaPolicy, format, pendingControlledValue, selectedValue]);

    useEffect(() => {
      inputElement.current?.setCustomValidity(localError ?? "");
    }, [localError]);

    useEffect(() => {
      const formElement = inputElement.current?.form;
      if (formElement === null || formElement === undefined) return;
      const handleReset = (event: Event) => {
        if (resetTimer.current !== null) clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => {
          if (event.defaultPrevented) return;
          const resetValue = initialValue.current;
          setLocalError(null);
          setPendingControlledValue(undefined);
          if (!controlled) {
            setUncontrolledValue(resetValue);
            setDraft(resetValue === null ? "" : formatColorValue(resetValue, format, alphaPolicy));
          } else {
            publish(resetValue);
          }
        }, 0);
      };
      formElement.addEventListener("reset", handleReset);
      return () => {
        formElement.removeEventListener("reset", handleReset);
        if (resetTimer.current !== null) clearTimeout(resetTimer.current);
      };
    }, [alphaPolicy, controlled, form, format, publish]);

    useEffect(() => {
      if (!isDevelopmentRuntime()) return;
      if (field !== null && id !== undefined && id !== field.controlId) {
        console.warn(
          `Mergora ColorField received id "${id}" inside Field; Field controlId "${field.controlId}" is authoritative.`,
        );
      }
      if (field === null && ariaLabel === undefined && labelledBy === undefined) {
        console.warn(
          "Mergora ColorField requires a visible label, aria-label, or aria-labelledby.",
        );
      }
    }, [ariaLabel, field, id, labelledBy]);

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing || composing.current) return;
      if (event.key === "Enter") {
        event.preventDefault();
        commitDraft();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        restore();
      }
    };

    const rootClassName =
      className === undefined ? "mrg-color-field" : `mrg-color-field ${className}`;
    const inputClasses =
      inputClassName === undefined
        ? "mrg-color-field-input"
        : `mrg-color-field-input ${inputClassName}`;
    const previewCss =
      selectedValue === null ? undefined : formatColorValue(selectedValue, "rgb", "allow");
    const canonicalValue =
      selectedValue === null ? "" : serializeColorValue(selectedValue, alphaPolicy);

    return (
      <div
        {...nativeProps}
        className={rootClassName}
        data-alpha-policy={alphaPolicy}
        data-disabled={disabled || undefined}
        data-empty={selectedValue === null || undefined}
        data-format={format}
        data-invalid={invalid || undefined}
        data-pending={pendingControlledValue !== undefined || undefined}
        data-readonly={readOnly || undefined}
        data-required={resolvedRequired || undefined}
        data-slot="color-field"
        ref={ref}
        style={style}
      >
        <input
          aria-describedby={describedBy}
          aria-errormessage={errorMessage}
          aria-invalid={invalid || undefined}
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          autoCapitalize="none"
          autoComplete="off"
          className={inputClasses}
          data-slot="color-field-input"
          disabled={disabled}
          form={form}
          id={resolvedId}
          onBlur={commitDraft}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            if (localError !== null) setLocalError(null);
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          readOnly={readOnly}
          ref={setInputElement}
          required={resolvedRequired}
          spellCheck={false}
          style={inputStyle}
          type="text"
          value={draft}
        />
        {name === undefined ? null : (
          <input
            data-slot="color-field-form-value"
            disabled={disabled}
            form={form}
            name={name}
            type="hidden"
            value={canonicalValue}
          />
        )}
        {!showPreview ? null : (
          <div data-slot="color-field-preview-row">
            <span
              aria-hidden="true"
              data-empty={selectedValue === null || undefined}
              data-slot="color-field-swatch"
              style={previewCss === undefined ? undefined : { backgroundColor: previewCss }}
            />
            <output aria-live="off" data-slot="color-field-preview" htmlFor={resolvedId}>
              <span>{messages.previewLabel}: </span>
              <bdi>{selectedValue === null ? messages.emptyPreview : canonicalValue}</bdi>
            </output>
          </div>
        )}
        {!showContrast ? null : (
          <output
            aria-live="polite"
            data-ratio={ratio === null ? undefined : trimFixed(ratio, 6)}
            data-slot="color-field-contrast"
            htmlFor={resolvedId}
          >
            {ratio === null ? (
              messages.contrastUnavailable
            ) : (
              <>
                {messages.contrastLabel}: {ratioFormatter.format(ratio)}:1 —{" "}
                {ratio >= contrastThreshold ? messages.contrastAtOrAbove : messages.contrastBelow} (
                {thresholdFormatter.format(contrastThreshold)}:1). {messages.verificationNote}
              </>
            )}
          </output>
        )}
        {localError === null ? null : (
          <p data-slot="color-field-error" id={errorId}>
            {localError}
          </p>
        )}
      </div>
    );
  },
);

ColorField.displayName = "ColorField";
