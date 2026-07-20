"use client";

import "./alert-dialog.css";

import {
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

/** @internal Controlled/default conflict predicate; not exported from the public item entrypoint. */
export function hasAcknowledgementStateConflict(
  acknowledged: boolean | undefined,
  defaultAcknowledged: boolean | undefined,
): boolean {
  return acknowledged !== undefined && defaultAcknowledged !== undefined;
}

export interface AlertDialogRootProps {
  /** Declarative AlertDialog parts owned by this root. */
  readonly children?: ReactNode;
  /** Initial open state for uncontrolled use. */
  readonly defaultOpen?: boolean;
  /** Fallback focus target used when the invoking trigger is unavailable after close. */
  readonly finalFocusRef?: RefObject<HTMLElement | null>;
  /** Reports open-state changes with the originating dialog interaction. */
  readonly onOpenChange?: (open: boolean, details: DialogOpenChangeDetails) => void;
  /** Controlled open state; pair with onOpenChange. */
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
  /** Enables a native acknowledgement control and holds destructive actions until accepted. */
  readonly acknowledgementLabel?: ReactNode;
  /** Controlled state of the optional acknowledgement checkbox. */
  readonly acknowledged?: boolean;
  /** Initial acknowledgement state for uncontrolled use. */
  readonly defaultAcknowledged?: boolean;
  /** Must point to the contained cancel/return action. */
  readonly leastDestructiveRef: RefObject<HTMLElement | null>;
  /** Reports acknowledgement checkbox changes in controlled and uncontrolled modes. */
  readonly onAcknowledgedChange?: (acknowledged: boolean) => void;
}

interface AlertDialogAcknowledgementContextValue {
  readonly acknowledged: boolean;
  readonly descriptionId: string | undefined;
  readonly required: boolean;
}

const AlertDialogAcknowledgementContext = createContext<AlertDialogAcknowledgementContextValue>({
  acknowledged: true,
  descriptionId: undefined,
  required: false,
});

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
  function AlertDialogContent(
    {
      acknowledgementLabel,
      acknowledged,
      children,
      defaultAcknowledged,
      leastDestructiveRef,
      onAcknowledgedChange,
      ...props
    },
    ref,
  ) {
    const contentRef = useRef<HTMLElement | null>(null);
    const acknowledgementId = useId();
    const [uncontrolledAcknowledged, setUncontrolledAcknowledged] = useState(
      defaultAcknowledged ?? false,
    );
    const acknowledgementRequired = hasAccessibleContent(acknowledgementLabel);
    const currentAcknowledged = acknowledged ?? uncontrolledAcknowledged;
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
      if (hasAcknowledgementStateConflict(acknowledged, defaultAcknowledged)) {
        console.warn(
          "Mergora AlertDialog.Content received both acknowledged and defaultAcknowledged. Remove defaultAcknowledged when controlling acknowledgement.",
        );
      }
      if (!isUsableLeastDestructiveTarget(leastDestructiveRef.current, contentRef.current)) {
        console.warn(
          "Mergora AlertDialog.Content leastDestructiveRef must resolve to a connected, enabled, contained non-destructive action. AlertDialog.Cancel is used as the safe fallback when available.",
        );
      }
    }, [acknowledged, defaultAcknowledged, leastDestructiveRef]);

    const acknowledgementContext = useMemo<AlertDialogAcknowledgementContextValue>(
      () => ({
        acknowledged: !acknowledgementRequired || currentAcknowledged,
        descriptionId: acknowledgementRequired ? acknowledgementId : undefined,
        required: acknowledgementRequired,
      }),
      [acknowledgementId, acknowledgementRequired, currentAcknowledged],
    );

    return (
      <AlertDialogAcknowledgementContext.Provider value={acknowledgementContext}>
        <DialogContent
          {...props}
          ref={mergedRef}
          dismissPolicy="explicit"
          initialFocus="first-interactive"
          initialFocusRef={guardedLeastDestructiveRef}
          role="alertdialog"
        >
          {children}
          {acknowledgementRequired ? (
            <label className="mrg-alert-dialog__acknowledgement" id={acknowledgementId}>
              <input
                checked={currentAcknowledged}
                data-slot="alert-dialog-acknowledgement-input"
                onChange={(event) => {
                  const nextAcknowledged = event.currentTarget.checked;
                  if (acknowledged === undefined) setUncontrolledAcknowledged(nextAcknowledged);
                  onAcknowledgedChange?.(nextAcknowledged);
                }}
                type="checkbox"
              />
              <span>{acknowledgementLabel}</span>
            </label>
          ) : null}
        </DialogContent>
      </AlertDialogAcknowledgementContext.Provider>
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
  /** Destructive action content rendered inside the closing button. */
  readonly children: ReactNode;
}

export const AlertDialogAction = forwardRef<HTMLButtonElement, AlertDialogActionProps>(
  function AlertDialogAction({ "aria-describedby": ariaDescribedBy, disabled, ...props }, ref) {
    const acknowledgement = useContext(AlertDialogAcknowledgementContext);
    const blocked = acknowledgement.required && !acknowledgement.acknowledged;
    const resolvedAriaDescribedBy =
      [ariaDescribedBy, blocked ? acknowledgement.descriptionId : undefined]
        .filter((value): value is string => value !== undefined && value.length > 0)
        .join(" ") || undefined;
    return (
      <DialogClose
        {...props}
        ref={ref}
        aria-describedby={resolvedAriaDescribedBy}
        data-acknowledgement-required={acknowledgement.required || undefined}
        data-intent="destructive"
        disabled={disabled || blocked}
      />
    );
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
