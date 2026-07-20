"use client";

import "./hover-card.css";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FocusEvent,
  type HTMLAttributes,
  type PointerEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
} from "react-aria-components/Button";
import { Dialog as AriaDialog, Heading as AriaHeading } from "react-aria-components/Dialog";
import { I18nProvider as AriaI18nProvider } from "react-aria-components/I18nProvider";
import {
  Popover as AriaPopover,
  type PopoverProps as AriaPopoverProps,
} from "react-aria-components/Popover";

import { LayerManager } from "../layer-manager/index.js";
import { useMergoraContext } from "../provider/index.js";

export type HoverCardOpenReason =
  "focus" | "hover" | "press" | "pin" | "close-button" | "escape" | "outside";

export interface HoverCardOpenChangeDetails {
  /** Interaction channel that opened, pinned, or dismissed the preview. */
  readonly reason: HoverCardOpenReason;
  /** Whether the preview remains explicitly pinned after this change. */
  readonly pinned: boolean;
}

export interface HoverCardProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  "children" | "title"
> {
  /** Visible content of the native preview trigger button. */
  readonly trigger: ReactNode;
  /** Heading content that supplies the preview dialog's accessible name. */
  readonly title: ReactNode;
  /** Required supplemental content associated with the preview dialog. */
  readonly description: ReactNode;
  /** Optional additional preview details rendered after the description. */
  readonly children?: ReactNode;
  /** Controlled open state; pair with onOpenChange. */
  readonly open?: boolean;
  /** Initial open state for uncontrolled use. */
  readonly defaultOpen?: boolean;
  /** Reports open-state changes with their interaction reason and pinned state. */
  readonly onOpenChange?: (open: boolean, details: HoverCardOpenChangeDetails) => void;
  /** Delay in milliseconds before focus or hover opens the preview. */
  readonly openDelay?: number;
  /** Delay in milliseconds before an unpinned preview closes. */
  readonly closeDelay?: number;
  /** Disables the trigger and suppresses scheduled preview opening. */
  readonly disabled?: boolean;
  /** Lets press/touch pin the preview; false removes the close action, pin rail, and announcement. */
  readonly pinOnPress?: boolean;
  /** Polite status text announced while the optional preview is pinned. */
  readonly pinnedLabel?: string;
  /** Visible label for the close action added by pinOnPress. */
  readonly closeLabel?: string;
  /** Additional native trigger props; owned popup and disabled attributes remain internal. */
  readonly triggerProps?: Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "aria-controls" | "aria-expanded" | "aria-haspopup" | "children" | "disabled" | "onClick"
  >;
}

function boundedDelay(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 5_000) {
    throw new RangeError(`Mergora HoverCard ${label} must be from 0 through 5000 milliseconds.`);
  }
  return value;
}

export const HoverCard = forwardRef<HTMLButtonElement, HoverCardProps>(function HoverCard(
  {
    children,
    className,
    closeDelay = 160,
    closeLabel = "Close preview",
    defaultOpen = false,
    description,
    disabled = false,
    onOpenChange,
    open,
    openDelay = 240,
    pinOnPress = false,
    pinnedLabel = "Preview pinned. Use the close action or Escape to dismiss.",
    title,
    trigger,
    triggerProps,
    ...nativeProps
  },
  forwardedRef,
) {
  const resolvedOpenDelay = boundedDelay(openDelay, "openDelay");
  const resolvedCloseDelay = boundedDelay(closeDelay, "closeDelay");
  if (pinOnPress && (pinnedLabel.trim().length === 0 || closeLabel.trim().length === 0)) {
    throw new Error("Mergora HoverCard pin labels must be non-empty when pinOnPress is on.");
  }
  const provider = useMergoraContext();
  const baseId = `mrg-hover-card-${useId().replaceAll(":", "")}`;
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;
  const contentId = `${baseId}-content`;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [pinned, setPinned] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOpen = open ?? uncontrolledOpen;

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const mergeRef = (node: HTMLButtonElement | null): void => {
    triggerRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef !== null) forwardedRef.current = node;
  };

  const clearTimer = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  const updateOpen = (next: boolean, reason: HoverCardOpenReason, nextPinned = pinned): void => {
    clearTimer();
    if (open === undefined) setUncontrolledOpen(next);
    if (!next) setPinned(false);
    onOpenChange?.(next, { pinned: next ? nextPinned : false, reason });
  };

  const scheduleOpen = (reason: HoverCardOpenReason): void => {
    if (disabled) return;
    clearTimer();
    timer.current = setTimeout(() => updateOpen(true, reason), resolvedOpenDelay);
  };

  const scheduleClose = (reason: HoverCardOpenReason): void => {
    if (pinned) return;
    clearTimer();
    timer.current = setTimeout(() => updateOpen(false, reason), resolvedCloseDelay);
  };

  const containsFocusTarget = (event: FocusEvent<Element>): boolean => {
    const next = event.relatedTarget;
    return (
      next instanceof Node &&
      (triggerRef.current?.contains(next) === true || contentRef.current?.contains(next) === true)
    );
  };

  const popoverProps = {
    className: "mrg-hover-card__popover",
    containerPadding: 12,
    "data-density": provider.density,
    "data-slot": "hover-card-popover",
    isDismissable: true,
    isNonModal: true,
    isOpen,
    offset: 8,
    onBlur: (event: FocusEvent<Element>) => {
      if (!containsFocusTarget(event)) scheduleClose("focus");
    },
    onKeyDownCapture: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
      updateOpen(false, "escape");
    },
    onOpenChange: (next: boolean) => {
      if (!next) updateOpen(false, "outside");
    },
    onPointerEnter: clearTimer,
    onPointerLeave: () => scheduleClose("hover"),
    placement: "bottom start",
    shouldFlip: true,
    triggerRef,
    ...(provider.portalContainer === null
      ? {}
      : { UNSTABLE_portalContainer: provider.portalContainer }),
  } as unknown as AriaPopoverProps;

  return (
    <AriaI18nProvider locale={provider.locale}>
      <LayerManager.Provider>
        <span
          {...nativeProps}
          className={className === undefined ? "mrg-hover-card" : `mrg-hover-card ${className}`}
          data-open={isOpen || undefined}
          data-pinned={pinOnPress && pinned ? "true" : undefined}
          data-slot="hover-card"
        >
          <AriaButton
            {...(triggerProps as unknown as AriaButtonProps)}
            ref={mergeRef}
            {...(isOpen ? { "aria-controls": contentId } : {})}
            aria-expanded={isOpen}
            aria-haspopup="dialog"
            className={
              triggerProps?.className === undefined
                ? "mrg-hover-card__trigger"
                : `mrg-hover-card__trigger ${triggerProps.className}`
            }
            data-slot="hover-card-trigger"
            isDisabled={disabled}
            onBlur={(event) => {
              if (!containsFocusTarget(event)) scheduleClose("focus");
            }}
            onFocus={() => scheduleOpen("focus")}
            onPointerEnter={(event: PointerEvent<HTMLButtonElement>) => {
              if (event.pointerType !== "touch") scheduleOpen("hover");
            }}
            onPointerLeave={(event: PointerEvent<HTMLButtonElement>) => {
              if (event.pointerType !== "touch") scheduleClose("hover");
            }}
            onPress={() => {
              if (pinOnPress) {
                const nextPinned = !pinned;
                setPinned(nextPinned);
                updateOpen(nextPinned || !isOpen, nextPinned ? "pin" : "press", nextPinned);
              } else {
                updateOpen(true, "press", false);
              }
            }}
          >
            {trigger}
          </AriaButton>
          <LayerManager.Layer active={isOpen} asChild dismissible={false} modal={false}>
            <AriaPopover
              {...popoverProps}
              ref={(node) => {
                contentRef.current = node;
                if (node !== null) {
                  node.dir = provider.direction;
                  node.lang = provider.locale;
                }
              }}
            >
              <AriaDialog
                aria-describedby={descriptionId}
                aria-labelledby={titleId}
                className="mrg-hover-card__content"
                data-slot="hover-card-content"
                id={contentId}
              >
                <AriaHeading
                  className="mrg-hover-card__title"
                  data-slot="hover-card-title"
                  id={titleId}
                  level={2}
                  slot="title"
                >
                  {title}
                </AriaHeading>
                <p
                  className="mrg-hover-card__description"
                  data-slot="hover-card-description"
                  id={descriptionId}
                >
                  {description}
                </p>
                {children === undefined ? null : (
                  <div className="mrg-hover-card__details" data-slot="hover-card-details">
                    {children}
                  </div>
                )}
                {pinOnPress ? (
                  <div className="mrg-hover-card__pin-rail" data-slot="hover-card-pin-rail">
                    <output aria-live="polite" data-slot="hover-card-pin-status">
                      {pinned ? pinnedLabel : "Preview available to pin"}
                    </output>
                    <button
                      data-slot="hover-card-close"
                      onClick={() => updateOpen(false, "close-button")}
                      type="button"
                    >
                      {closeLabel}
                    </button>
                  </div>
                ) : null}
              </AriaDialog>
            </AriaPopover>
          </LayerManager.Layer>
        </span>
      </LayerManager.Provider>
    </AriaI18nProvider>
  );
});

HoverCard.displayName = "HoverCard";
