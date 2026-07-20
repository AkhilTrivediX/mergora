// Generated from registry/source/components/date-field/date-time-utils.ts by @mergora-internal/source-transformer. Do not edit.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type Ref,
} from "react";

export type TemporalInputType = "date" | "datetime-local" | "month" | "time";

export interface NativeTemporalControlOptions {
  readonly defaultValue?: string | undefined;
  readonly onChange?: ((event: ChangeEvent<HTMLInputElement>) => void) | undefined;
  readonly onValueChange?: ((value: string) => void) | undefined;
  readonly value?: string | undefined;
}

export interface NativeTemporalControlResult {
  readonly inputRef: (node: HTMLInputElement | null) => void;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly setValue: (value: string) => void;
  readonly value: string;
}

export function mergeTemporalRefs<T>(
  ...refs: readonly (Ref<T> | undefined)[]
): (node: T | null) => void {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref !== null && ref !== undefined) {
        (ref as { current: T | null }).current = node;
      }
    }
  };
}

export function useNativeTemporalControl({
  defaultValue = "",
  onChange,
  onValueChange,
  value,
}: NativeTemporalControlOptions): NativeTemporalControlResult {
  const controlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const input = useRef<HTMLInputElement | null>(null);
  const resolvedValue = controlled ? value : uncontrolledValue;
  const latestValue = useRef(resolvedValue);
  latestValue.current = resolvedValue;

  useEffect(() => {
    const form = input.current?.form;
    if (form === null || form === undefined) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleReset = (event: Event) => {
      timer = setTimeout(() => {
        if (event.defaultPrevented || latestValue.current === defaultValue) return;
        if (!controlled) setUncontrolledValue(defaultValue);
        onValueChange?.(defaultValue);
      }, 0);
    };
    form.addEventListener("reset", handleReset);
    return () => {
      form.removeEventListener("reset", handleReset);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [controlled, defaultValue, onValueChange]);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!controlled) setUncontrolledValue(event.currentTarget.value);
      onChange?.(event);
      onValueChange?.(event.currentTarget.value);
    },
    [controlled, onChange, onValueChange],
  );

  const setValue = useCallback(
    (nextValue: string) => {
      if (latestValue.current === nextValue) return;
      if (!controlled) setUncontrolledValue(nextValue);
      onValueChange?.(nextValue);
    },
    [controlled, onValueChange],
  );

  return {
    inputRef: (node) => {
      input.current = node;
    },
    onChange: handleChange,
    setValue,
    value: resolvedValue,
  };
}

export function isCanonicalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function canonicalDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseCanonicalDate(value: string): Date | null {
  if (!isCanonicalDate(value)) return null;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addCalendarDays(value: string, amount: number): string {
  const date = parseCanonicalDate(value);
  if (date === null || !Number.isSafeInteger(amount)) return value;
  date.setUTCDate(date.getUTCDate() + amount);
  return canonicalDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addCalendarMonths(value: string, amount: number): string {
  const date = parseCanonicalDate(value);
  if (date === null || !Number.isSafeInteger(amount)) return value;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  date.setUTCDate(Math.min(day, daysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1)));
  return canonicalDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function inclusiveCalendarDays(start: string, end: string): number | null {
  const startDate = parseCanonicalDate(start);
  const endDate = parseCanonicalDate(end);
  if (startDate === null || endDate === null || endDate < startDate) return null;
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
}

export function formatCanonicalDate(
  value: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    weekday: "long",
    year: "numeric",
    timeZone: "UTC",
  },
): string | null {
  const date = parseCanonicalDate(value);
  return date === null ? null : new Intl.DateTimeFormat(locale, options).format(date);
}

export function nativeTemporalInputProps(
  type: TemporalInputType,
): Pick<InputHTMLAttributes<HTMLInputElement>, "inputMode"> {
  return type === "time" ? { inputMode: "numeric" } : {};
}
