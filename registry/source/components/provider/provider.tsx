"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useMemo,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";

import { DirectionProvider, useDirection, type DirectionValue } from "../direction/index.js";
import { isSlottableChild, Slot } from "../slot/index.js";
import "./provider.css";

export type MergoraDensity = "compact" | "comfortable" | "touch";
export type MergoraReducedMotion = "system" | "reduce" | "no-preference";
export type MergoraMessageScalar = string | number;
export type MergoraMessageValue = MergoraMessageScalar | readonly MergoraMessageScalar[];

export interface MergoraMessageFormatContext {
  /** Supplies the resolved provider locale to message formatters. */
  readonly locale: string;
  /** Supplies named scalar or list values for localized formatting. */
  readonly values: Readonly<Record<string, MergoraMessageValue>>;
}

/**
 * String messages may use named placeholders such as `{count}`. Formatter messages are useful
 * when a translation needs Intl plural/select behavior or grammatical reordering.
 */
export type MergoraMessage = string | ((context: MergoraMessageFormatContext) => string);
/** Maps semantic message keys to localized strings or formatter callbacks. */
export type MergoraMessages = Readonly<Record<string, MergoraMessage>>;

export interface MergoraContextValue {
  /** Exposes the resolved locale inherited by Mergora descendants. */
  readonly locale: string;
  /** Exposes the resolved logical text direction. */
  readonly direction: DirectionValue;
  /** Exposes the merged message catalog by semantic key. */
  readonly messages: MergoraMessages;
  /** Exposes the resolved IANA time-zone identifier. */
  readonly timeZone: string;
  /** Exposes the resolved portal target or null for document body after mount. */
  readonly portalContainer: HTMLElement | null;
  /** Exposes the resolved reduced-motion policy. */
  readonly reducedMotion: MergoraReducedMotion;
  /** Exposes the resolved shared density policy. */
  readonly density: MergoraDensity;
  /** Resolves a catalog key or fallback with localized named values. */
  readonly getMessage: (
    key: string,
    fallback: MergoraMessage,
    values?: Readonly<Record<string, MergoraMessageValue>>,
  ) => string;
}

const defaultContext: MergoraContextValue = {
  locale: "en-US",
  direction: "ltr",
  messages: {},
  timeZone: "UTC",
  portalContainer: null,
  reducedMotion: "system",
  density: "comfortable",
  getMessage: (_key, fallback, values = {}) => resolveMergoraMessage(fallback, "en-US", values),
};

const MergoraContext = createContext<MergoraContextValue>(defaultContext);

export interface MergoraProviderProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "dir" | "lang"
> {
  /** Subtree that receives the resolved Mergora context and boundary attributes. */
  readonly children: ReactNode;
  /** Locale applied to the native lang attribute and message formatting; omitted values inherit. */
  readonly locale?: string;
  /** Text direction applied to native dir and direction context; omitted values inherit. */
  readonly direction?: DirectionValue;
  /** Message overrides merged by key with the nearest provider. */
  readonly messages?: MergoraMessages;
  /** Time-zone identifier exposed through context; omitted values inherit. */
  readonly timeZone?: string;
  /** A null value intentionally selects document.body once mounted; undefined inherits. */
  readonly portalContainer?: HTMLElement | null;
  /** Motion policy exposed to Mergora descendants; omitted values inherit. */
  readonly reducedMotion?: MergoraReducedMotion;
  /** Density policy applied to the subtree's shared tokens; omitted values inherit. */
  readonly density?: MergoraDensity;
  /** Merges provider attributes into one concrete child instead of adding a div. */
  readonly asChild?: boolean;
}

function joinClassNames(className: string | undefined): string {
  return className === undefined || className.trim().length === 0
    ? "mrg-provider"
    : `mrg-provider ${className}`;
}

const MESSAGE_PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/gu;

export function resolveMergoraMessage(
  message: MergoraMessage,
  locale: string,
  values: Readonly<Record<string, MergoraMessageValue>> = {},
): string {
  if (typeof message === "function") return message({ locale, values });
  return message.replace(MESSAGE_PLACEHOLDER, (placeholder, key: string) => {
    const value = values[key];
    return value === undefined
      ? placeholder
      : Array.isArray(value)
        ? value.join(", ")
        : String(value);
  });
}

export const MergoraProvider = forwardRef<HTMLElement, MergoraProviderProps>(
  function MergoraProvider(
    {
      asChild = false,
      children,
      className,
      density,
      direction,
      locale,
      messages,
      portalContainer,
      reducedMotion,
      timeZone,
      ...nativeProps
    },
    ref,
  ): ReactElement {
    const parent = useContext(MergoraContext);
    const ambientDirection = useDirection();
    const resolvedLocale = locale ?? parent.locale;
    const resolvedDirection =
      direction ?? (parent === defaultContext ? ambientDirection : parent.direction);
    const resolvedMessages = useMemo(
      () => ({ ...parent.messages, ...(messages ?? {}) }),
      [messages, parent.messages],
    );
    const resolvedTimeZone = timeZone ?? parent.timeZone;
    const resolvedPortalContainer =
      portalContainer === undefined ? parent.portalContainer : portalContainer;
    const resolvedReducedMotion = reducedMotion ?? parent.reducedMotion;
    const resolvedDensity = density ?? parent.density;

    const value = useMemo<MergoraContextValue>(
      () => ({
        locale: resolvedLocale,
        direction: resolvedDirection,
        messages: resolvedMessages,
        timeZone: resolvedTimeZone,
        portalContainer: resolvedPortalContainer,
        reducedMotion: resolvedReducedMotion,
        density: resolvedDensity,
        getMessage: (key, fallback, values = {}) =>
          resolveMergoraMessage(resolvedMessages[key] ?? fallback, resolvedLocale, values),
      }),
      [
        resolvedDensity,
        resolvedDirection,
        resolvedLocale,
        resolvedMessages,
        resolvedPortalContainer,
        resolvedReducedMotion,
        resolvedTimeZone,
      ],
    );

    const boundaryProps = {
      ...nativeProps,
      className: joinClassNames(className),
      dir: resolvedDirection,
      lang: resolvedLocale,
      "data-density": resolvedDensity,
      "data-direction": resolvedDirection,
      "data-reduced-motion": resolvedReducedMotion,
      "data-slot": "provider",
    } as const;

    let boundary: ReactElement;
    if (asChild) {
      if (!isSlottableChild(children)) {
        throw new Error(
          "MergoraProvider with asChild requires exactly one concrete React element.",
        );
      }
      boundary = (
        <Slot {...boundaryProps} ref={ref}>
          {children}
        </Slot>
      );
    } else {
      boundary = (
        <div {...boundaryProps} ref={ref as Ref<HTMLDivElement>}>
          {children}
        </div>
      );
    }

    return (
      <MergoraContext.Provider value={value}>
        <DirectionProvider direction={resolvedDirection}>{boundary}</DirectionProvider>
      </MergoraContext.Provider>
    );
  },
);

MergoraProvider.displayName = "MergoraProvider";

export function useMergoraContext(): MergoraContextValue {
  return useContext(MergoraContext);
}

export function useMergoraMessage(
  key: string,
  fallback: MergoraMessage,
  values?: Readonly<Record<string, MergoraMessageValue>>,
): string {
  return useMergoraContext().getMessage(key, fallback, values);
}
