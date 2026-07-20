"use client";

import "./drawer.css";

import {
  createContext,
  forwardRef,
  useContext,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { markDialogPart } from "../dialog/dialog.js";
import type { DialogOpenChangeReason } from "../dialog/model.js";
import { useDirection } from "../direction/index.js";
import {
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetRoot,
  SheetTitle,
  SheetTrigger,
  type SheetSide,
  type SheetSize,
} from "../sheet/sheet.js";

export type DrawerSide = Extract<SheetSide, "start" | "end" | "bottom">;
export type DrawerSize = SheetSize;
export type DrawerOpenChangeReason = DialogOpenChangeReason | "swipe" | "swipe-handle";

export interface DrawerOpenChangeDetails {
  /** Dialog, touch-swipe, or swipe-handle interaction that changed open state. */
  readonly reason: DrawerOpenChangeReason;
}

interface DrawerContextValue {
  readonly requestClose: (reason: DrawerOpenChangeReason) => void;
  readonly side: DrawerSide;
  readonly swipeHandleLabel: string;
  readonly swipeThreshold: number;
  readonly swipeToClose: boolean;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

function useDrawerContext(part: string): DrawerContextValue {
  const value = useContext(DrawerContext);
  if (value === null) throw new Error(`Mergora Drawer.${part} must be inside Drawer.Root.`);
  return value;
}

export interface DrawerRootProps {
  /** Declarative Drawer parts owned by this root. */
  readonly children?: ReactNode;
  /** Controlled open state; pair with onOpenChange. */
  readonly open?: boolean;
  /** Initial open state for uncontrolled use. */
  readonly defaultOpen?: boolean;
  /** Reports open-state changes, including swipe and swipe-handle dismissal. */
  readonly onOpenChange?: (open: boolean, details: DrawerOpenChangeDetails) => void;
  /** Fallback focus target used when the invoking trigger is unavailable after close. */
  readonly finalFocusRef?: RefObject<HTMLElement | null>;
  /** Logical or bottom edge from which the drawer enters. */
  readonly side?: DrawerSide;
  /** Bounded drawer size inherited from the Sheet size scale. */
  readonly size?: DrawerSize;
  /** Enables dependency-free touch swipe dismissal and its keyboard-operable handle. */
  readonly swipeToClose?: boolean;
  /** Touch travel in CSS pixels required to complete swipe dismissal. */
  readonly swipeThreshold?: number;
  /** Accessible name for the optional keyboard-operable swipe handle. */
  readonly swipeHandleLabel?: string;
}

export function DrawerRoot({
  children,
  defaultOpen = false,
  finalFocusRef,
  onOpenChange,
  open,
  side = "bottom",
  size = "md",
  swipeHandleLabel = "Close drawer",
  swipeThreshold = 72,
  swipeToClose = false,
}: DrawerRootProps) {
  if (!Number.isFinite(swipeThreshold) || swipeThreshold < 24 || swipeThreshold > 240) {
    throw new RangeError("Mergora Drawer swipeThreshold must be from 24 through 240 pixels.");
  }
  if (swipeToClose && swipeHandleLabel.trim().length === 0) {
    throw new Error("Mergora Drawer swipeHandleLabel must be non-empty when swipeToClose is on.");
  }
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = open ?? uncontrolledOpen;

  const requestClose = (reason: DrawerOpenChangeReason): void => {
    if (open === undefined) setUncontrolledOpen(false);
    onOpenChange?.(false, { reason });
  };

  return (
    <DrawerContext.Provider
      value={{ requestClose, side, swipeHandleLabel, swipeThreshold, swipeToClose }}
    >
      <SheetRoot
        {...(finalFocusRef === undefined ? {} : { finalFocusRef })}
        onOpenChange={(next, details) => {
          if (open === undefined) setUncontrolledOpen(next);
          onOpenChange?.(next, { reason: details.reason });
        }}
        open={isOpen}
        side={side}
        size={size}
      >
        {children}
      </SheetRoot>
    </DrawerContext.Provider>
  );
}

DrawerRoot.displayName = "Drawer.Root";
markDialogPart(DrawerRoot, "root");

export type DrawerTriggerProps = ComponentPropsWithoutRef<typeof SheetTrigger>;
export const DrawerTrigger = forwardRef<HTMLButtonElement, DrawerTriggerProps>(
  function DrawerTrigger(props, ref) {
    return <SheetTrigger {...props} ref={ref} />;
  },
);
DrawerTrigger.displayName = "Drawer.Trigger";

export type DrawerOverlayProps = ComponentPropsWithoutRef<typeof SheetOverlay>;
export const DrawerOverlay = forwardRef<HTMLDivElement, DrawerOverlayProps>(function DrawerOverlay(
  { className, ...props },
  ref,
) {
  return (
    <SheetOverlay
      {...props}
      ref={ref}
      className={
        className === undefined ? "mrg-drawer__overlay" : `mrg-drawer__overlay ${className}`
      }
      data-slot="drawer-overlay"
    />
  );
});
DrawerOverlay.displayName = "Drawer.Overlay";

export type DrawerContentProps = ComponentPropsWithoutRef<typeof SheetContent>;
export const DrawerContent = forwardRef<HTMLElement, DrawerContentProps>(function DrawerContent(
  { children, className, ...props },
  forwardedRef,
) {
  const context = useDrawerContext("Content");
  const direction = useDirection();
  const contentRef = useRef<HTMLElement | null>(null);
  const gesture = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);

  const mergeRef = (node: HTMLElement | null): void => {
    contentRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef !== null) forwardedRef.current = node;
  };

  const closingDistance = (event: PointerEvent<HTMLButtonElement>): number => {
    const start = gesture.current;
    if (start === null) return 0;
    if (context.side === "bottom") return Math.max(0, event.clientY - start.startY);
    const delta = event.clientX - start.startX;
    const closesTowardPositive =
      (context.side === "start" && direction === "rtl") ||
      (context.side === "end" && direction === "ltr");
    return Math.max(0, closesTowardPositive ? delta : -delta);
  };

  const clearGesture = (): void => {
    gesture.current = null;
    contentRef.current?.style.removeProperty("--mrg-drawer-swipe-offset");
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    if (event.pointerType !== "touch") return;
    gesture.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>): void => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    const distance = closingDistance(event);
    contentRef.current?.style.setProperty("--mrg-drawer-swipe-offset", `${distance}px`);
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>): void => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    const shouldClose = closingDistance(event) >= context.swipeThreshold;
    clearGesture();
    if (shouldClose) context.requestClose("swipe");
  };

  return (
    <SheetContent
      {...props}
      ref={mergeRef}
      className={
        className === undefined ? "mrg-drawer__content" : `mrg-drawer__content ${className}`
      }
      data-swipe-enabled={context.swipeToClose || undefined}
      data-slot="drawer-content"
    >
      {context.swipeToClose ? (
        <button
          aria-label={context.swipeHandleLabel}
          className="mrg-drawer__swipe-handle"
          data-slot="drawer-swipe-handle"
          onClick={() => context.requestClose("swipe-handle")}
          onPointerCancel={clearGesture}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          type="button"
        >
          <span aria-hidden="true" />
        </button>
      ) : null}
      {children}
    </SheetContent>
  );
});
DrawerContent.displayName = "Drawer.Content";
markDialogPart(DrawerContent, "content");

export type DrawerHeaderProps = ComponentPropsWithoutRef<typeof SheetHeader>;
export const DrawerHeader = forwardRef<HTMLDivElement, DrawerHeaderProps>(
  function DrawerHeader(props, ref) {
    return <SheetHeader {...props} ref={ref} />;
  },
);
DrawerHeader.displayName = "Drawer.Header";

export type DrawerFooterProps = ComponentPropsWithoutRef<typeof SheetFooter>;
export const DrawerFooter = forwardRef<HTMLDivElement, DrawerFooterProps>(
  function DrawerFooter(props, ref) {
    return <SheetFooter {...props} ref={ref} />;
  },
);
DrawerFooter.displayName = "Drawer.Footer";

export type DrawerTitleProps = ComponentPropsWithoutRef<typeof SheetTitle>;
export const DrawerTitle = forwardRef<HTMLHeadingElement, DrawerTitleProps>(
  function DrawerTitle(props, ref) {
    return <SheetTitle {...props} ref={ref} />;
  },
);
DrawerTitle.displayName = "Drawer.Title";
markDialogPart(DrawerTitle, "title");

export type DrawerDescriptionProps = ComponentPropsWithoutRef<typeof SheetDescription>;
export const DrawerDescription = forwardRef<HTMLParagraphElement, DrawerDescriptionProps>(
  function DrawerDescription(props, ref) {
    return <SheetDescription {...props} ref={ref} />;
  },
);
DrawerDescription.displayName = "Drawer.Description";
markDialogPart(DrawerDescription, "description");

export type DrawerCloseProps = ComponentPropsWithoutRef<typeof SheetClose>;
export const DrawerClose = forwardRef<HTMLButtonElement, DrawerCloseProps>(
  function DrawerClose(props, ref) {
    return <SheetClose {...props} ref={ref} />;
  },
);
DrawerClose.displayName = "Drawer.Close";
markDialogPart(DrawerClose, "close");

export const Drawer = Object.freeze({
  Close: DrawerClose,
  Content: DrawerContent,
  Description: DrawerDescription,
  Footer: DrawerFooter,
  Header: DrawerHeader,
  Overlay: DrawerOverlay,
  Root: DrawerRoot,
  Title: DrawerTitle,
  Trigger: DrawerTrigger,
});
