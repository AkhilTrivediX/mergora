"use client";

import "./sheet.css";

import { createContext, forwardRef, useContext, type ReactNode, type RefObject } from "react";
import type { ComponentPropsWithoutRef } from "react";

import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogRootImplementation,
  DialogTitle,
  DialogTrigger,
  markDialogPart,
} from "../dialog/dialog.js";
import type { DialogOpenChangeDetails } from "../dialog/model.js";

export type SheetSide = "start" | "end" | "top" | "bottom";
export type SheetSize = "sm" | "md" | "lg" | "full";

interface SheetContextValue {
  readonly side: SheetSide;
  readonly size: SheetSize;
}

const SheetContext = createContext<SheetContextValue | null>(null);

function useSheetContext(part: string): SheetContextValue {
  const context = useContext(SheetContext);
  if (context === null)
    throw new Error(`Mergora Sheet.${part} must be rendered inside Sheet.Root.`);
  return context;
}

export interface SheetRootProps {
  /** Declarative Sheet parts owned by this root. */
  readonly children?: ReactNode;
  /** Initial open state for uncontrolled use. */
  readonly defaultOpen?: boolean;
  /** Fallback focus target used when the invoking trigger is unavailable after close. */
  readonly finalFocusRef?: RefObject<HTMLElement | null>;
  /** Reports open-state changes with the originating dialog interaction. */
  readonly onOpenChange?: (open: boolean, details: DialogOpenChangeDetails) => void;
  /** Controlled open state; pair with onOpenChange. */
  readonly open?: boolean;
  /** Logical inline or physical block edge from which the sheet enters. */
  readonly side?: SheetSide;
  /** Bounded width or height selected from the sheet size scale. */
  readonly size?: SheetSize;
}

export function SheetRoot({ side = "end", size = "md", ...props }: SheetRootProps) {
  return (
    <SheetContext.Provider value={{ side, size }}>
      <DialogRootImplementation {...props} kind="sheet" modality="modal" />
    </SheetContext.Provider>
  );
}

SheetRoot.displayName = "Sheet.Root";
markDialogPart(SheetRoot, "root");

export type SheetTriggerProps = ComponentPropsWithoutRef<typeof DialogTrigger>;

export const SheetTrigger = forwardRef<HTMLButtonElement, SheetTriggerProps>(
  function SheetTrigger(props, ref) {
    return <DialogTrigger {...props} ref={ref} />;
  },
);

SheetTrigger.displayName = "Sheet.Trigger";

export type SheetOverlayProps = ComponentPropsWithoutRef<typeof DialogOverlay>;

export const SheetOverlay = forwardRef<HTMLDivElement, SheetOverlayProps>(
  function SheetOverlay(props, ref) {
    const { side, size } = useSheetContext("Overlay");
    return <DialogOverlay {...props} ref={ref} data-side={side} data-size={size} />;
  },
);

SheetOverlay.displayName = "Sheet.Overlay";

export interface SheetContentProps extends ComponentPropsWithoutRef<typeof DialogContent> {
  /** Optional controlled workflow progress shown as a native progress rail. */
  readonly progress?: {
    /** Visible and accessible label for the workflow progress value. */
    readonly label: string;
    /** Positive upper bound for progress; defaults to 100. */
    readonly max?: number;
    /** Current controlled progress value between zero and max. */
    readonly value: number;
  };
}

/** @internal Strict progress validation; not exported from the public item entrypoint. */
export function resolveSheetProgress(progress: SheetContentProps["progress"]):
  | {
      readonly label: string;
      readonly max: number;
      readonly value: number;
    }
  | undefined {
  if (progress === undefined) return undefined;
  const label = progress.label.trim();
  if (label.length === 0) {
    throw new Error("Mergora Sheet.Content progress.label must be a non-empty string.");
  }
  const max = progress.max ?? 100;
  if (!Number.isFinite(max) || max <= 0) {
    throw new RangeError("Mergora Sheet.Content progress.max must be finite and above zero.");
  }
  if (!Number.isFinite(progress.value) || progress.value < 0 || progress.value > max) {
    throw new RangeError(
      "Mergora Sheet.Content progress.value must be finite and between zero and progress.max.",
    );
  }
  return { label, max, value: progress.value };
}

export const SheetContent = forwardRef<HTMLElement, SheetContentProps>(function SheetContent(
  { children, progress, ...props },
  ref,
) {
  const { side, size } = useSheetContext("Content");
  const resolvedProgress = resolveSheetProgress(progress);
  return (
    <DialogContent {...props} ref={ref} data-side={side} data-size={size}>
      {resolvedProgress === undefined ? null : (
        <div className="mrg-sheet__progress" data-slot="sheet-progress">
          <span>{resolvedProgress.label}</span>
          <progress
            aria-label={resolvedProgress.label}
            max={resolvedProgress.max}
            value={resolvedProgress.value}
          />
        </div>
      )}
      {children}
    </DialogContent>
  );
});

SheetContent.displayName = "Sheet.Content";

export type SheetHeaderProps = ComponentPropsWithoutRef<typeof DialogHeader>;

export const SheetHeader = forwardRef<HTMLDivElement, SheetHeaderProps>(
  function SheetHeader(props, ref) {
    return <DialogHeader {...props} ref={ref} />;
  },
);

SheetHeader.displayName = "Sheet.Header";

export type SheetFooterProps = ComponentPropsWithoutRef<typeof DialogFooter>;

export const SheetFooter = forwardRef<HTMLDivElement, SheetFooterProps>(
  function SheetFooter(props, ref) {
    return <DialogFooter {...props} ref={ref} />;
  },
);

SheetFooter.displayName = "Sheet.Footer";

export type SheetTitleProps = ComponentPropsWithoutRef<typeof DialogTitle>;

export const SheetTitle = forwardRef<HTMLHeadingElement, SheetTitleProps>(
  function SheetTitle(props, ref) {
    return <DialogTitle {...props} ref={ref} />;
  },
);

SheetTitle.displayName = "Sheet.Title";

export type SheetDescriptionProps = ComponentPropsWithoutRef<typeof DialogDescription>;

export const SheetDescription = forwardRef<HTMLParagraphElement, SheetDescriptionProps>(
  function SheetDescription(props, ref) {
    return <DialogDescription {...props} ref={ref} />;
  },
);

SheetDescription.displayName = "Sheet.Description";

export type SheetCloseProps = ComponentPropsWithoutRef<typeof DialogClose>;

export const SheetClose = forwardRef<HTMLButtonElement, SheetCloseProps>(
  function SheetClose(props, ref) {
    return <DialogClose {...props} ref={ref} />;
  },
);

SheetClose.displayName = "Sheet.Close";

markDialogPart(SheetContent, "content");
markDialogPart(SheetTitle, "title");
markDialogPart(SheetDescription, "description");
markDialogPart(SheetClose, "close");

export const Sheet = Object.freeze({
  Close: SheetClose,
  Content: SheetContent,
  Description: SheetDescription,
  Footer: SheetFooter,
  Header: SheetHeader,
  Overlay: SheetOverlay,
  Root: SheetRoot,
  Title: SheetTitle,
  Trigger: SheetTrigger,
});
