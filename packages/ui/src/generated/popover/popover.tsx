// Generated from registry/source/components/popover/popover.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./popover.css";

import { Button as ReactAriaButton } from "react-aria-components/Button";
import type { ButtonProps as ReactAriaButtonProps } from "react-aria-components/Button";
import {
  Dialog as ReactAriaDialog,
  DialogTrigger as ReactAriaDialogTrigger,
  Heading as ReactAriaHeading,
} from "react-aria-components/Dialog";
import { I18nProvider as ReactAriaI18nProvider } from "react-aria-components/I18nProvider";
import {
  OverlayArrow as ReactAriaOverlayArrow,
  Popover as ReactAriaPopover,
} from "react-aria-components/Popover";
import type {
  Placement as ReactAriaPlacement,
  PopoverProps as ReactAriaPopoverProps,
} from "react-aria-components/Popover";
import {
  Children,
  createContext,
  Fragment,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ButtonHTMLAttributes,
  ComponentPropsWithoutRef,
  HTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  ReactElement,
  ReactNode,
  RefObject,
} from "react";

import { LayerManager } from "../layer-manager/index.js";
import { useMergoraContext, useMergoraMessage } from "../provider/index.js";

export type PopoverPlacement = "top" | "bottom" | "start" | "end";
export type PopoverAlign = "start" | "center" | "end";
export type PopoverInitialFocus = "first-interactive" | "content" | "none";
export type PopoverOpenChangeReason =
  "trigger" | "close-button" | "escape-key" | "outside-interaction" | "dismiss";

export interface PopoverOpenChangeDetails {
  /** Trigger, close, Escape, outside, or fallback dismissal interaction. */
  readonly reason: PopoverOpenChangeReason;
}

type PopoverPart = "title" | "description" | "close" | "root";
interface PopoverTreeInspection extends Record<Exclude<PopoverPart, "root">, number> {
  readonly descriptionIds: readonly string[];
}
const POPOVER_PART = Symbol.for("mergora.popover.part");
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");
type MarkedElementType = ReactElement["type"] & { [POPOVER_PART]?: PopoverPart };

function markPopoverPart<Component>(component: Component, part: PopoverPart): Component {
  Object.defineProperty(component, POPOVER_PART, { configurable: true, value: part });
  return component;
}

function inspectPopoverTree(children: ReactNode): PopoverTreeInspection {
  const result = { close: 0, description: 0, descriptionIds: [] as string[], title: 0 };
  const visit = (node: ReactNode): void => {
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) return;
      const element = child as ReactElement<{ children?: ReactNode; id?: unknown }>;
      const part = (element.type as MarkedElementType)[POPOVER_PART];
      if (part === "root") return;
      if (part !== undefined) {
        result[part] += 1;
        if (
          part === "description" &&
          typeof element.props.id === "string" &&
          element.props.id.trim().length > 0
        ) {
          result.descriptionIds.push(element.props.id);
        }
      }
      visit(element.props.children);
    });
  };
  visit(children);
  return result;
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

/** @internal Shared optional-content predicate; not exported from the public item entrypoint. */
export function hasAccessibleContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasAccessibleContent);
  if (isValidElement<{ readonly children?: ReactNode }>(value)) {
    if (value.type === Fragment) return hasAccessibleContent(value.props.children);
    return typeof value.type === "string" ? hasAccessibleContent(value.props.children) : true;
  }
  return true;
}

function joinClassName(base: string, className: string | undefined): string {
  return className === undefined || className.trim().length === 0 ? base : `${base} ${className}`;
}

export function resolvePopoverPlacement(
  placement: PopoverPlacement,
  align: PopoverAlign,
  direction: "ltr" | "rtl",
): ReactAriaPlacement {
  if (placement === "start" || placement === "end") {
    const physicalSide =
      placement === "start"
        ? direction === "rtl"
          ? "right"
          : "left"
        : direction === "rtl"
          ? "left"
          : "right";
    if (align === "center") return physicalSide;
    return `${physicalSide} ${align === "start" ? "top" : "bottom"}`;
  }
  if (align === "center") return placement;
  const physicalAlign =
    align === "start"
      ? direction === "rtl"
        ? "right"
        : "left"
      : direction === "rtl"
        ? "left"
        : "right";
  return `${placement} ${physicalAlign}`;
}

interface PopoverContextValue {
  readonly isOpen: boolean;
  readonly markReason: (reason: PopoverOpenChangeReason) => void;
  readonly registerTrigger: (node: HTMLButtonElement | null) => void;
}

const PopoverContext = createContext<PopoverContextValue | null>(null);

function usePopoverContext(part: string): PopoverContextValue {
  const context = useContext(PopoverContext);
  if (context === null) throw new Error(`Mergora Popover.${part} must be inside Popover.Root.`);
  return context;
}

const PopoverDescriptionContext = createContext<string | undefined>(undefined);

export interface PopoverRootProps {
  /** Declarative Popover parts owned by this root. */
  readonly children?: ReactNode;
  /** Initial open state for uncontrolled use. */
  readonly defaultOpen?: boolean;
  /** Fallback focus target used when the invoking trigger is unavailable after close. */
  readonly finalFocusRef?: RefObject<HTMLElement | null>;
  /** Reports open-state changes with the trigger, close, Escape, outside, or dismissal reason. */
  readonly onOpenChange?: (open: boolean, details: PopoverOpenChangeDetails) => void;
  /** Controlled open state; pair with onOpenChange. */
  readonly open?: boolean;
}

export function PopoverRoot({
  children,
  defaultOpen = false,
  finalFocusRef,
  onOpenChange,
  open,
}: PopoverRootProps) {
  const provider = useMergoraContext();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const pendingReason = useRef<PopoverOpenChangeReason | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const isOpen = open ?? uncontrolledOpen;
  const wasOpen = useRef(isOpen);

  useEffect(() => {
    if (!isDevelopmentRuntime()) return;
    if (open !== undefined && defaultOpen) {
      console.warn(
        "Mergora Popover.Root received both open and defaultOpen. Remove defaultOpen when controlling open.",
      );
    }
  }, [defaultOpen, open]);

  useEffect(() => {
    const previouslyOpen = wasOpen.current;
    wasOpen.current = isOpen;
    if (!previouslyOpen || isOpen || typeof requestAnimationFrame === "undefined") return;
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body && active.isConnected) return;
      const trigger = triggerRef.current;
      const fallback = finalFocusRef?.current ?? null;
      const target =
        trigger?.isConnected === true ? trigger : fallback?.isConnected === true ? fallback : null;
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [finalFocusRef, isOpen]);

  const markReason = useCallback((reason: PopoverOpenChangeReason) => {
    pendingReason.current = reason;
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) setUncontrolledOpen(nextOpen);
      const reason = pendingReason.current ?? (nextOpen ? "trigger" : "dismiss");
      pendingReason.current = null;
      onOpenChange?.(nextOpen, { reason });
    },
    [onOpenChange, open],
  );

  const context = useMemo<PopoverContextValue>(
    () => ({
      isOpen,
      markReason,
      registerTrigger: (node) => {
        triggerRef.current = node;
      },
    }),
    [isOpen, markReason],
  );

  return (
    <ReactAriaI18nProvider locale={provider.locale}>
      <LayerManager.Provider>
        <PopoverContext.Provider value={context}>
          <ReactAriaDialogTrigger isOpen={isOpen} onOpenChange={handleOpenChange}>
            {children}
          </ReactAriaDialogTrigger>
        </PopoverContext.Provider>
      </LayerManager.Provider>
    </ReactAriaI18nProvider>
  );
}

PopoverRoot.displayName = "Popover.Root";
markPopoverPart(PopoverRoot, "root");

export interface PopoverTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Trigger button content; native button semantics remain authoritative. */
  readonly children?: ReactNode;
}

export const PopoverTrigger = forwardRef<HTMLButtonElement, PopoverTriggerProps>(
  function PopoverTrigger(
    { children, className, disabled, type = "button", ...nativeProps },
    forwardedRef,
  ) {
    const context = usePopoverContext("Trigger");
    const ref = useCallback(
      (node: HTMLButtonElement | null) => {
        context.registerTrigger(node);
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef !== null) forwardedRef.current = node;
      },
      [context, forwardedRef],
    );
    return (
      <ReactAriaButton
        {...(nativeProps as ReactAriaButtonProps)}
        {...(disabled === undefined ? {} : { isDisabled: disabled })}
        ref={ref}
        aria-haspopup="dialog"
        className={joinClassName("mrg-popover__trigger", className)}
        data-slot="popover-trigger"
        data-state={context.isOpen ? "open" : "closed"}
        onPress={() => context.markReason("trigger")}
        type={type}
      >
        {children}
      </ReactAriaButton>
    );
  },
);

PopoverTrigger.displayName = "Popover.Trigger";

export interface PopoverContentProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Cross-axis alignment relative to the selected placement edge. */
  readonly align?: PopoverAlign;
  /** Optional persistent context for the anchor when the trigger is outside the visible viewport. */
  readonly anchorContext?: ReactNode;
  /** Popover body and named parts rendered inside the non-modal dialog. */
  readonly children?: ReactNode;
  /** Minimum collision padding, in CSS pixels, from the viewport edge. */
  readonly containerPadding?: number;
  /** Cross-axis displacement in CSS pixels from the aligned position. */
  readonly crossOffset?: number;
  /** Non-modal entry policy. The default keeps focus on the trigger. */
  readonly initialFocus?: PopoverInitialFocus;
  /** Preferred contained entry-focus target when initial focus is requested. */
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  /** Distance in CSS pixels between the trigger and popover. */
  readonly offset?: number;
  /** Requested logical edge used before collision adjustment. */
  readonly placement?: PopoverPlacement;
  /** Allows collision handling to flip the requested placement. */
  readonly shouldFlip?: boolean;
}

export const PopoverContent = forwardRef<HTMLElement, PopoverContentProps>(function PopoverContent(
  {
    align = "center",
    anchorContext,
    "aria-describedby": ariaDescribedBy,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    children,
    className,
    containerPadding = 12,
    crossOffset = 0,
    initialFocus = "none",
    initialFocusRef,
    offset = 8,
    placement = "bottom",
    shouldFlip = true,
    ...nativeProps
  },
  ref,
) {
  const provider = useMergoraContext();
  const context = usePopoverContext("Content");
  const contentRef = useRef<HTMLElement | null>(null);
  const anchorContextId = useId();
  const descriptionId = useId();
  const inspection = useMemo(() => inspectPopoverTree(children), [children]);
  const resolvedDescriptionId =
    inspection.description === 1 && ariaDescribedBy === undefined
      ? (inspection.descriptionIds[0] ?? descriptionId)
      : undefined;
  const hasAnchorContext = hasAccessibleContent(anchorContext);
  const resolvedAriaDescribedBy =
    [ariaDescribedBy ?? resolvedDescriptionId, hasAnchorContext ? anchorContextId : undefined]
      .filter((value): value is string => value !== undefined && value.length > 0)
      .join(" ") || undefined;
  const mergedPopoverRef = useCallback(
    (node: HTMLElement | null) => {
      // React Aria derives the portal-root dir from locale. Mergora intentionally allows an
      // explicit direction independent from locale, so commit that contract after DOM props.
      if (node !== null) {
        node.dir = provider.direction;
        node.lang = provider.locale;
      }
      if (typeof ref === "function") ref(node);
      else if (ref !== null) ref.current = node;
    },
    [provider.direction, provider.locale, ref],
  );

  useEffect(() => {
    if (!isDevelopmentRuntime()) return;
    if (
      inspection.title === 0 &&
      (typeof ariaLabel !== "string" || ariaLabel.trim().length === 0) &&
      (typeof ariaLabelledBy !== "string" || ariaLabelledBy.trim().length === 0)
    ) {
      console.warn(
        "Mergora Popover.Content requires Popover.Title, aria-label, or aria-labelledby.",
      );
    }
    if (inspection.close === 0) {
      console.warn("Mergora Popover.Content requires a visible Popover.Close action.");
    }
    if (inspection.description > 1 && ariaDescribedBy === undefined) {
      console.warn(
        "Mergora Popover.Content found multiple descriptions. Provide one explicit aria-describedby value.",
      );
    }
  }, [ariaDescribedBy, ariaLabel, ariaLabelledBy, inspection]);

  useEffect(() => {
    if (!context.isOpen || initialFocus === "none") return;
    const content = contentRef.current;
    if (content === null) return;
    const requested = initialFocusRef?.current ?? null;
    const target =
      requested ??
      (initialFocus === "content"
        ? content
        : content.querySelector<HTMLElement>(FOCUSABLE_SELECTOR));
    if (
      target === null ||
      !target.isConnected ||
      !content.contains(target) ||
      target.matches(":disabled") ||
      target.closest("[inert], [hidden], [aria-hidden='true']") !== null
    ) {
      if (isDevelopmentRuntime()) {
        console.warn(
          "Mergora Popover.Content initial focus must resolve to a connected, enabled descendant. The named content surface is used as the fallback.",
        );
      }
      content.focus({ preventScroll: true });
      return;
    }
    target.focus({ preventScroll: true });
  }, [context.isOpen, initialFocus, initialFocusRef]);

  const popoverProps = {
    ...nativeProps,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    className: joinClassName("mrg-popover", className),
    containerPadding,
    crossOffset,
    "data-align": align,
    "data-density": provider.density,
    "data-direction": provider.direction,
    "data-requested-placement": placement,
    "data-slot": "popover",
    dir: provider.direction,
    isDismissable: true,
    isNonModal: true,
    lang: provider.locale,
    offset,
    placement: resolvePopoverPlacement(placement, align, provider.direction),
    shouldCloseOnInteractOutside: () => {
      context.markReason("outside-interaction");
      return true;
    },
    shouldFlip,
    UNSTABLE_portalContainer: provider.portalContainer ?? undefined,
  } as unknown as ReactAriaPopoverProps;

  return (
    <LayerManager.Layer
      active={context.isOpen}
      asChild
      data-slot="popover"
      dismissible={false}
      modal={false}
    >
      <ReactAriaPopover {...popoverProps} ref={mergedPopoverRef}>
        <PopoverDescriptionContext.Provider value={resolvedDescriptionId}>
          <ReactAriaDialog
            {...(resolvedAriaDescribedBy === undefined
              ? {}
              : { "aria-describedby": resolvedAriaDescribedBy })}
            {...(ariaLabel === undefined ? {} : { "aria-label": ariaLabel })}
            {...(ariaLabelledBy === undefined ? {} : { "aria-labelledby": ariaLabelledBy })}
            ref={contentRef}
            className="mrg-popover__content"
            data-slot="popover-content"
            data-state={context.isOpen ? "open" : "closed"}
          >
            <div
              className="mrg-popover__keyboard-boundary"
              data-slot="popover-keyboard-boundary"
              onKeyDownCapture={(event: ReactKeyboardEvent<HTMLDivElement>) => {
                if (event.key !== "Escape") return;
                if (event.nativeEvent.isComposing) {
                  event.stopPropagation();
                  return;
                }
                const layer = event.currentTarget.closest<HTMLElement>("[data-layer-id]");
                if (layer?.dataset.layerTop === "true") context.markReason("escape-key");
              }}
            >
              {hasAnchorContext ? (
                <div
                  className="mrg-popover__anchor-context"
                  data-slot="popover-anchor-context"
                  id={anchorContextId}
                >
                  {anchorContext}
                </div>
              ) : null}
              {children}
            </div>
          </ReactAriaDialog>
        </PopoverDescriptionContext.Provider>
      </ReactAriaPopover>
    </LayerManager.Layer>
  );
});

PopoverContent.displayName = "Popover.Content";

export interface PopoverArrowProps extends ComponentPropsWithoutRef<"svg"> {
  /** Arrow width and height in CSS pixels. */
  readonly size?: number;
}

export const PopoverArrow = forwardRef<SVGSVGElement, PopoverArrowProps>(function PopoverArrow(
  { className, size = 10, ...nativeProps },
  ref,
) {
  return (
    <ReactAriaOverlayArrow className="mrg-popover__arrow" data-slot="popover-arrow">
      <svg
        {...nativeProps}
        ref={ref}
        aria-hidden="true"
        className={className}
        height={size}
        viewBox="0 0 10 10"
        width={size}
      >
        <path d="M0 0L5 5L10 0" fill="currentColor" />
      </svg>
    </ReactAriaOverlayArrow>
  );
});

PopoverArrow.displayName = "Popover.Arrow";

export type PopoverTitleProps = ComponentPropsWithoutRef<"h2"> & {
  /** Semantic heading level used for the rendered popover title. */
  readonly level?: 1 | 2 | 3 | 4 | 5 | 6;
};

export const PopoverTitle = forwardRef<HTMLHeadingElement, PopoverTitleProps>(function PopoverTitle(
  { className, level = 2, ...props },
  ref,
) {
  return (
    <ReactAriaHeading
      {...props}
      ref={ref}
      className={joinClassName("mrg-popover__title", className)}
      data-slot="popover-title"
      level={level}
      slot="title"
    />
  );
});

PopoverTitle.displayName = "Popover.Title";

export type PopoverDescriptionProps = ComponentPropsWithoutRef<"p">;

export const PopoverDescription = forwardRef<HTMLParagraphElement, PopoverDescriptionProps>(
  function PopoverDescription({ className, id, ...props }, ref) {
    const generatedId = useContext(PopoverDescriptionContext);
    return (
      <p
        {...props}
        ref={ref}
        className={joinClassName("mrg-popover__description", className)}
        data-slot="popover-description"
        id={typeof id === "string" && id.trim().length > 0 ? id : generatedId}
      />
    );
  },
);

PopoverDescription.displayName = "Popover.Description";

export interface PopoverCloseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Close-button content; localized default text is used when omitted. */
  readonly children?: ReactNode;
}

export const PopoverClose = forwardRef<HTMLButtonElement, PopoverCloseProps>(function PopoverClose(
  { children, className, disabled, type = "button", ...nativeProps },
  ref,
) {
  const context = usePopoverContext("Close");
  const closeLabel = useMergoraMessage("popover.close", "Close popover");
  return (
    <ReactAriaButton
      {...(nativeProps as ReactAriaButtonProps)}
      {...(disabled === undefined ? {} : { isDisabled: disabled })}
      ref={ref}
      className={joinClassName("mrg-popover__close", className)}
      data-slot="popover-close"
      onPress={() => context.markReason("close-button")}
      slot="close"
      type={type}
    >
      {children ?? closeLabel}
    </ReactAriaButton>
  );
});

PopoverClose.displayName = "Popover.Close";

markPopoverPart(PopoverTitle, "title");
markPopoverPart(PopoverDescription, "description");
markPopoverPart(PopoverClose, "close");

export const Popover = Object.freeze({
  Arrow: PopoverArrow,
  Close: PopoverClose,
  Content: PopoverContent,
  Description: PopoverDescription,
  Root: PopoverRoot,
  Title: PopoverTitle,
  Trigger: PopoverTrigger,
});
