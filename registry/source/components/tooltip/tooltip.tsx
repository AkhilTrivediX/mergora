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
  forwardRef,
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
  readonly children: ReactNode;
  readonly closeDelay?: number;
  readonly defaultOpen?: boolean;
  readonly delay?: number;
  readonly disabled?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly open?: boolean;
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
  readonly children: ReactNode;
  readonly containerPadding?: number;
  readonly crossOffset?: number;
  readonly offset?: number;
  readonly placement?: TooltipPlacement;
  readonly shouldFlip?: boolean;
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
      ...nativeProps
    },
    forwardedRef,
  ) {
    const provider = useMergoraContext();
    const context = useTooltipContext("Content");
    const [element, setElement] = useState<HTMLDivElement | null>(null);

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
            {children}
          </div>
        </ReactAriaTooltip>
      </LayerManager.Layer>
    );
  },
);

TooltipContent.displayName = "Tooltip.Content";

export interface TooltipArrowProps extends ComponentPropsWithoutRef<"svg"> {
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
