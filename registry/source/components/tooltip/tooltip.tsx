"use client";

import "./tooltip.css";

import { Button as ReactAriaButton } from "react-aria-components/Button";
import type { ButtonProps as ReactAriaButtonProps } from "react-aria-components/Button";
import { I18nProvider as ReactAriaI18nProvider } from "react-aria-components/I18nProvider";
import {
  OverlayArrow as ReactAriaOverlayArrow,
  Tooltip as ReactAriaTooltip,
  TooltipTrigger as ReactAriaTooltipTrigger,
} from "react-aria-components/Tooltip";
import type { TooltipProps as ReactAriaTooltipProps } from "react-aria-components/Tooltip";
import {
  createContext,
  Fragment,
  forwardRef,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import { LayerManager } from "../layer-manager/index.js";
import { useMergoraContext } from "../provider/index.js";

export type TooltipPlacement = "top" | "bottom" | "start" | "end";
export type TooltipTouchPolicy = "no-long-press";

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

export function resolveTooltipPlacement(
  placement: TooltipPlacement,
  direction: "ltr" | "rtl",
): NonNullable<ReactAriaTooltipProps["placement"]> {
  if (placement === "start") return direction === "rtl" ? "right" : "left";
  if (placement === "end") return direction === "rtl" ? "left" : "right";
  return placement;
}

interface TooltipContextValue {
  readonly isOpen: boolean;
  readonly touchPolicy: TooltipTouchPolicy;
}

const TooltipContext = createContext<TooltipContextValue | null>(null);

function useTooltipContext(part: string): TooltipContextValue {
  const context = useContext(TooltipContext);
  if (context === null) throw new Error(`Mergora Tooltip.${part} must be inside Tooltip.Root.`);
  return context;
}

export interface TooltipRootProps {
  /** Tooltip trigger and content parts owned by this root. */
  readonly children: ReactNode;
  /** Delay in milliseconds before a departed tooltip closes. */
  readonly closeDelay?: number;
  /** Initial open state for uncontrolled use. */
  readonly defaultOpen?: boolean;
  /** Delay in milliseconds before hover or focus opens the tooltip. */
  readonly delay?: number;
  /** Disables tooltip opening while retaining the declared parts. */
  readonly disabled?: boolean;
  /** Reports every committed tooltip open-state change. */
  readonly onOpenChange?: (open: boolean) => void;
  /** Controlled open state; pair with onOpenChange. */
  readonly open?: boolean;
  /** Declares touch behavior; the current policy registers no long-press interaction. */
  readonly touchPolicy?: TooltipTouchPolicy;
}

export function TooltipRoot({
  children,
  closeDelay = 300,
  defaultOpen,
  delay = 700,
  disabled = false,
  onOpenChange,
  open,
  touchPolicy = "no-long-press",
}: TooltipRootProps) {
  const provider = useMergoraContext();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen ?? false);
  const isOpen = open ?? uncontrolledOpen;
  const context = useMemo(() => ({ isOpen, touchPolicy }), [isOpen, touchPolicy]);

  useEffect(() => {
    if (!isDevelopmentRuntime()) return;
    if (open !== undefined && defaultOpen !== undefined) {
      console.warn(
        "Mergora Tooltip.Root received both open and defaultOpen. Remove defaultOpen when controlling open.",
      );
    }
  }, [defaultOpen, open]);

  return (
    <ReactAriaI18nProvider locale={provider.locale}>
      <LayerManager.Provider>
        <TooltipContext.Provider value={context}>
          <ReactAriaTooltipTrigger
            closeDelay={closeDelay}
            delay={delay}
            isDisabled={disabled}
            isOpen={isOpen}
            onOpenChange={(nextOpen) => {
              if (open === undefined) setUncontrolledOpen(nextOpen);
              onOpenChange?.(nextOpen);
            }}
          >
            {children}
          </ReactAriaTooltipTrigger>
        </TooltipContext.Provider>
      </LayerManager.Provider>
    </ReactAriaI18nProvider>
  );
}

TooltipRoot.displayName = "Tooltip.Root";

export interface TooltipTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Trigger button content; native button semantics remain authoritative. */
  readonly children?: ReactNode;
}

export const TooltipTrigger = forwardRef<HTMLButtonElement, TooltipTriggerProps>(
  function TooltipTrigger({ children, className, disabled, type = "button", ...nativeProps }, ref) {
    const context = useTooltipContext("Trigger");
    return (
      <ReactAriaButton
        {...(nativeProps as ReactAriaButtonProps)}
        {...(disabled === undefined ? {} : { isDisabled: disabled })}
        ref={ref}
        className={joinClassName("mrg-tooltip__trigger", className)}
        data-slot="tooltip-trigger"
        data-state={context.isOpen ? "open" : "closed"}
        data-touch-policy={context.touchPolicy}
        type={type}
      >
        {children}
      </ReactAriaButton>
    );
  },
);

TooltipTrigger.displayName = "Tooltip.Trigger";

export interface TooltipDisabledTriggerProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "disabled"
> {
  /** Content of the focusable aria-disabled trigger adapter. */
  readonly children?: ReactNode;
}

export const TooltipDisabledTrigger = forwardRef<HTMLButtonElement, TooltipDisabledTriggerProps>(
  function TooltipDisabledTrigger(
    { children, className, onClick: _onClick, type = "button", ...nativeProps },
    ref,
  ) {
    const context = useTooltipContext("DisabledTrigger");
    return (
      <ReactAriaButton
        {...(nativeProps as ReactAriaButtonProps)}
        ref={ref}
        aria-disabled="true"
        className={joinClassName("mrg-tooltip__trigger", className)}
        data-disabled-adapter="true"
        data-slot="tooltip-disabled-trigger"
        data-state={context.isOpen ? "open" : "closed"}
        data-touch-policy={context.touchPolicy}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        type={type}
      >
        {children}
      </ReactAriaButton>
    );
  },
);

TooltipDisabledTrigger.displayName = "Tooltip.DisabledTrigger";

export interface TooltipContentProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  /** Supplemental, noninteractive description exposed by the tooltip lifecycle. */
  readonly children: ReactNode;
  /** Minimum collision padding, in CSS pixels, from the viewport edge. */
  readonly containerPadding?: number;
  /** Cross-axis displacement in CSS pixels from the aligned position. */
  readonly crossOffset?: number;
  /** Distance in CSS pixels between the trigger and tooltip. */
  readonly offset?: number;
  /** Requested logical or physical edge before collision adjustment. */
  readonly placement?: TooltipPlacement;
  /** Allows collision handling to flip the requested placement. */
  readonly shouldFlip?: boolean;
  /** Optional keyboard shortcut shown and announced with the supplemental description. */
  readonly shortcut?: ReactNode;
}

export const TooltipContent = forwardRef<HTMLDivElement, TooltipContentProps>(
  function TooltipContent(
    {
      children,
      className,
      containerPadding = 8,
      crossOffset = 0,
      offset = 8,
      placement = "top",
      shouldFlip = true,
      shortcut,
      ...nativeProps
    },
    forwardedRef,
  ) {
    const provider = useMergoraContext();
    const context = useTooltipContext("Content");
    const [element, setElement] = useState<HTMLDivElement | null>(null);
    const hasShortcut = hasAccessibleContent(shortcut);

    useEffect(() => {
      if (!context.isOpen || element === null || !isDevelopmentRuntime()) return;
      const interactive = element.querySelector(
        "a[href], button, input, select, textarea, [contenteditable='true'], [tabindex]:not([tabindex='-1'])",
      );
      if (interactive !== null) {
        console.warn(
          "Mergora Tooltip.Content must remain noninteractive. Move actions into Popover.Content and keep the tooltip descriptive.",
        );
      }
    }, [context.isOpen, element]);

    const props = {
      ...nativeProps,
      className: joinClassName("mrg-tooltip", className),
      containerPadding,
      crossOffset,
      "data-density": provider.density,
      "data-direction": provider.direction,
      "data-requested-placement": placement,
      "data-slot": "tooltip",
      "data-state": context.isOpen ? "open" : "closed",
      dir: provider.direction,
      lang: provider.locale,
      offset,
      placement: resolveTooltipPlacement(placement, provider.direction),
      shouldFlip,
      UNSTABLE_portalContainer: provider.portalContainer ?? undefined,
    } as unknown as ReactAriaTooltipProps;

    return (
      <LayerManager.Layer
        active={context.isOpen}
        asChild
        data-slot="tooltip"
        dismissible={false}
        modal={false}
      >
        <ReactAriaTooltip
          {...props}
          ref={(node) => {
            setElement(node);
            if (typeof forwardedRef === "function") forwardedRef(node);
            else if (forwardedRef !== null) forwardedRef.current = node;
          }}
        >
          <div className="mrg-tooltip__content" data-slot="tooltip-content">
            {hasShortcut ? (
              <>
                <span>{children}</span>
                <kbd className="mrg-tooltip__shortcut" data-slot="tooltip-shortcut">
                  {shortcut}
                </kbd>
              </>
            ) : (
              children
            )}
          </div>
        </ReactAriaTooltip>
      </LayerManager.Layer>
    );
  },
);

TooltipContent.displayName = "Tooltip.Content";

export interface TooltipArrowProps extends ComponentPropsWithoutRef<"svg"> {
  /** Arrow width and height in CSS pixels. */
  readonly size?: number;
}

export const TooltipArrow = forwardRef<SVGSVGElement, TooltipArrowProps>(function TooltipArrow(
  { className, size = 8, ...nativeProps },
  ref,
) {
  return (
    <ReactAriaOverlayArrow className="mrg-tooltip__arrow" data-slot="tooltip-arrow">
      <svg
        {...nativeProps}
        ref={ref}
        aria-hidden="true"
        className={className}
        height={size}
        viewBox="0 0 8 8"
        width={size}
      >
        <path d="M0 0L4 4L8 0" fill="currentColor" />
      </svg>
    </ReactAriaOverlayArrow>
  );
});

TooltipArrow.displayName = "Tooltip.Arrow";

export const Tooltip = Object.freeze({
  Arrow: TooltipArrow,
  Content: TooltipContent,
  DisabledTrigger: TooltipDisabledTrigger,
  Root: TooltipRoot,
  Trigger: TooltipTrigger,
});
