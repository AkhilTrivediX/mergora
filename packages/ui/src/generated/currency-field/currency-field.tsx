// Generated from registry/source/components/currency-field/currency-field.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import { forwardRef } from "react";

import { NumericFieldBase, type NumberFieldProps } from "../number-field/number-field.js";
import { useMergoraContext } from "../provider/index.js";
import "./currency-field.css";

export type CurrencyFieldFormatOptions = Omit<
  Intl.NumberFormatOptions,
  | "currency"
  | "currencyDisplay"
  | "currencySign"
  | "maximumFractionDigits"
  | "minimumFractionDigits"
  | "style"
>;

export interface CurrencyFieldProps extends Omit<NumberFieldProps, "formatOptions" | "precision"> {
  /** Enables values below zero. When false, the implicit minimum is zero. */
  readonly allowNegative?: boolean;
  /** Required ISO 4217-style currency code. */
  readonly currency: string;
  readonly currencyDisplay?: Intl.NumberFormatOptions["currencyDisplay"];
  readonly currencySign?: Intl.NumberFormatOptions["currencySign"];
  readonly formatOptions?: CurrencyFieldFormatOptions;
  /** Defaults to the currency's Intl minor-unit precision. */
  readonly precision?: number;
}

export function normalizeCurrencyCode(currency: string): string {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(normalized)) {
    throw new RangeError("Mergora CurrencyField currency must be a three-letter currency code.");
  }
  try {
    new Intl.NumberFormat("en-US", { currency: normalized, style: "currency" }).format(0);
  } catch {
    throw new RangeError(`Mergora CurrencyField does not support currency ${normalized}.`);
  }
  return normalized;
}

export function currencyFractionDigits(currency: string, locale = "en-US"): number {
  const code = normalizeCurrencyCode(currency);
  const digits = new Intl.NumberFormat(locale, {
    currency: code,
    style: "currency",
  }).resolvedOptions().maximumFractionDigits;
  if (digits === undefined) {
    throw new RangeError(`Mergora CurrencyField could not resolve precision for ${code}.`);
  }
  return digits;
}

export const CurrencyField = forwardRef<HTMLDivElement, CurrencyFieldProps>(function CurrencyField(
  {
    allowNegative = false,
    currency,
    currencyDisplay = "code",
    currencySign = "standard",
    formatOptions,
    minValue,
    precision: precisionProp,
    step,
    ...numberFieldProps
  },
  ref,
) {
  const { locale } = useMergoraContext();
  const code = normalizeCurrencyCode(currency);
  const precision = precisionProp ?? currencyFractionDigits(code, locale);
  const minimum = minValue ?? (allowNegative ? undefined : 0);
  if (!allowNegative && minimum !== undefined && minimum < 0) {
    throw new RangeError(
      "Mergora CurrencyField minValue cannot be negative unless allowNegative is true.",
    );
  }
  const resolvedFormatOptions: Intl.NumberFormatOptions = {
    ...formatOptions,
    currency: code,
    currencyDisplay,
    currencySign,
    maximumFractionDigits: precision,
    minimumFractionDigits: precision,
    style: "currency",
  };
  const minimumProps = minimum === undefined ? {} : { minValue: minimum };
  return (
    <NumericFieldBase
      {...numberFieldProps}
      {...minimumProps}
      currencyCode={code}
      formatOptions={resolvedFormatOptions}
      kind="currency"
      precision={precision}
      ref={ref}
      step={step ?? 10 ** -precision}
    />
  );
});

CurrencyField.displayName = "CurrencyField";
