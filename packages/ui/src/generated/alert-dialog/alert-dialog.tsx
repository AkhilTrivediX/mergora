// Generated from registry/source/components/alert-dialog/alert-dialog.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./alert-dialog.css";

import { forwardRef, useCallback, useEffect, useMemo, useRef } from "react";
import type { ButtonHTMLAttributes, ComponentPropsWithoutRef, ReactNode, RefObject } from "react";

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
import type { DialogOpenChangeDetails, DialogOpenChangeReason } from "../dialog/model.js";

export interface AlertDialogRootProps {
  readonly children?: ReactNode;
  readonly defaultOpen?: boolean;
  readonly finalFocusRef?: RefObject<HTMLElement | null>;
  readonly onOpenChange?: (open: boolean, details: DialogOpenChangeDetails) => void;
  readonly open?: boolean;
}

export function AlertDialogRoot(props: AlertDialogRootProps) {
  return (
    <DialogRootImplementation
      {...props}
      dismissPolicy="explicit"
      kind="alert-dialog"
      modality="modal"
    />
  );
}

AlertDialogRoot.displayName = "AlertDialog.Root";
markDialogPart(AlertDialogRoot, "root");

export type AlertDialogTriggerProps = ComponentPropsWithoutRef<typeof DialogTrigger>;

export const AlertDialogTrigger = forwardRef<HTMLButtonElement, AlertDialogTriggerProps>(
  function AlertDialogTrigger(props, ref) {
    return <DialogTrigger {...props} ref={ref} />;
  },
);

AlertDialogTrigger.displayName = "AlertDialog.Trigger";

export type AlertDialogOverlayProps = ComponentPropsWithoutRef<typeof DialogOverlay>;

export const AlertDialogOverlay = forwardRef<HTMLDivElement, AlertDialogOverlayProps>(
  function AlertDialogOverlay(props, ref) {
    return <DialogOverlay {...props} ref={ref} />;
  },
);

AlertDialogOverlay.displayName = "AlertDialog.Overlay";

export interface AlertDialogContentProps extends Omit<
  ComponentPropsWithoutRef<typeof DialogContent>,
  "dismissPolicy" | "initialFocus" | "initialFocusRef" | "role"
> {
  /** Must point to the contained cancel/return action. */
  readonly leastDestructiveRef: RefObject<HTMLElement | null>;
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

function isUsableLeastDestructiveTarget(
  target: HTMLElement | null,
  content: HTMLElement | null,
): target is HTMLElement {
  return (
    target !== null &&
    content !== null &&
    target.isConnected &&
    content.contains(target) &&
    target.dataset.intent !== "destructive" &&
    !target.hasAttribute("disabled") &&
    target.getAttribute("aria-disabled") !== "true"
  );
}

export const AlertDialogContent = forwardRef<HTMLElement, AlertDialogContentProps>(
  function AlertDialogContent({ leastDestructiveRef, ...props }, ref) {
    const contentRef = useRef<HTMLElement | null>(null);
    const mergedRef = useCallback(
      (node: HTMLElement | null) => {
        contentRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref !== null) ref.current = node;
      },
      [ref],
    );
    const guardedLeastDestructiveRef = useMemo<RefObject<HTMLElement | null>>(
      () => ({
        get current() {
          const content = contentRef.current;
          const requested = leastDestructiveRef.current;
          if (isUsableLeastDestructiveTarget(requested, content)) return requested;
          return (
            content?.querySelector<HTMLElement>(
              '[data-intent="least-destructive"]:not([disabled]):not([aria-disabled="true"])',
            ) ?? null
          );
        },
      }),
      [leastDestructiveRef],
    );

    useEffect(() => {
      if (!isDevelopmentRuntime()) return;
      if (!isUsableLeastDestructiveTarget(leastDestructiveRef.current, contentRef.current)) {
        console.warn(
          "Mergora AlertDialog.Content leastDestructiveRef must resolve to a connected, enabled, contained non-destructive action. AlertDialog.Cancel is used as the safe fallback when available.",
        );
      }
    }, [leastDestructiveRef]);

    return (
      <DialogContent
        {...props}
        ref={mergedRef}
        dismissPolicy="explicit"
        initialFocus="first-interactive"
        initialFocusRef={guardedLeastDestructiveRef}
        role="alertdialog"
      />
    );
  },
);

AlertDialogContent.displayName = "AlertDialog.Content";

export type AlertDialogHeaderProps = ComponentPropsWithoutRef<typeof DialogHeader>;

export const AlertDialogHeader = forwardRef<HTMLDivElement, AlertDialogHeaderProps>(
  function AlertDialogHeader(props, ref) {
    return <DialogHeader {...props} ref={ref} />;
  },
);

AlertDialogHeader.displayName = "AlertDialog.Header";

export type AlertDialogFooterProps = ComponentPropsWithoutRef<typeof DialogFooter>;

export const AlertDialogFooter = forwardRef<HTMLDivElement, AlertDialogFooterProps>(
  function AlertDialogFooter(props, ref) {
    return <DialogFooter {...props} ref={ref} />;
  },
);

AlertDialogFooter.displayName = "AlertDialog.Footer";

export type AlertDialogTitleProps = ComponentPropsWithoutRef<typeof DialogTitle>;

export const AlertDialogTitle = forwardRef<HTMLHeadingElement, AlertDialogTitleProps>(
  function AlertDialogTitle(props, ref) {
    return <DialogTitle {...props} ref={ref} />;
  },
);

AlertDialogTitle.displayName = "AlertDialog.Title";

export type AlertDialogDescriptionProps = ComponentPropsWithoutRef<typeof DialogDescription>;

export const AlertDialogDescription = forwardRef<HTMLParagraphElement, AlertDialogDescriptionProps>(
  function AlertDialogDescription(props, ref) {
    return <DialogDescription {...props} ref={ref} />;
  },
);

AlertDialogDescription.displayName = "AlertDialog.Description";

export type AlertDialogCancelProps = ComponentPropsWithoutRef<typeof DialogClose>;

export const AlertDialogCancel = forwardRef<HTMLButtonElement, AlertDialogCancelProps>(
  function AlertDialogCancel(props, ref) {
    return <DialogClose {...props} ref={ref} data-intent="least-destructive" />;
  },
);

AlertDialogCancel.displayName = "AlertDialog.Cancel";

export interface AlertDialogActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children: ReactNode;
}

export const AlertDialogAction = forwardRef<HTMLButtonElement, AlertDialogActionProps>(
  function AlertDialogAction(props, ref) {
    return <DialogClose {...props} ref={ref} data-intent="destructive" />;
  },
);

AlertDialogAction.displayName = "AlertDialog.Action";

markDialogPart(AlertDialogContent, "content");
markDialogPart(AlertDialogTitle, "title");
markDialogPart(AlertDialogDescription, "description");
markDialogPart(AlertDialogCancel, "close");
markDialogPart(AlertDialogAction, "close");

export const AlertDialog = Object.freeze({
  Action: AlertDialogAction,
  Cancel: AlertDialogCancel,
  Content: AlertDialogContent,
  Description: AlertDialogDescription,
  Footer: AlertDialogFooter,
  Header: AlertDialogHeader,
  Overlay: AlertDialogOverlay,
  Root: AlertDialogRoot,
  Title: AlertDialogTitle,
  Trigger: AlertDialogTrigger,
});

export type { DialogOpenChangeDetails, DialogOpenChangeReason };
