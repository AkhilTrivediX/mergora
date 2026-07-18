// Generated from registry/source/components/dialog/dialog.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./dialog.css";

import { Button as ReactAriaButton } from "react-aria-components/Button";
import type { ButtonProps as ReactAriaButtonProps } from "react-aria-components/Button";
import {
  Dialog as ReactAriaDialog,
  DialogTrigger as ReactAriaDialogTrigger,
  Heading as ReactAriaHeading,
} from "react-aria-components/Dialog";
import type { DialogProps as ReactAriaDialogProps } from "react-aria-components/Dialog";
import { I18nProvider as ReactAriaI18nProvider } from "react-aria-components/I18nProvider";
import {
  Modal as ReactAriaModal,
  ModalOverlay as ReactAriaModalOverlay,
} from "react-aria-components/Modal";
import type { ModalOverlayProps as ReactAriaModalOverlayProps } from "react-aria-components/Modal";
import { Popover as ReactAriaPopover } from "react-aria-components/Popover";
import type {
  Placement as ReactAriaPlacement,
  PopoverProps as ReactAriaPopoverProps,
} from "react-aria-components/Popover";
import {
  Children,
  createContext,
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
  ForwardedRef,
  HTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  ReactElement,
  ReactNode,
  RefObject,
} from "react";

import { LayerManager } from "../layer-manager/index.js";
import { useMergoraContext, useMergoraMessage } from "../provider/index.js";
import {
  getDialogDismissBehavior,
  getDialogNamingDiagnostics,
  joinDialogClassName,
  resolveDialogOpenChangeReason,
} from "./model.js";
import type {
  DialogDismissPolicy,
  DialogOpenChangeDetails,
  DialogOpenChangeReason,
} from "./model.js";

const DEFAULT_DISMISS_POLICY: DialogDismissPolicy = "outside-and-escape";
const DIALOG_PART = Symbol.for("mergora.dialog.part");
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

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

export type DialogModality = "modal" | "non-modal";
export type DialogInitialFocus = "first-interactive" | "content" | "none";
export type DialogPlacement = "top" | "bottom" | "start" | "end";
export type DialogPartKind = "dialog" | "alert-dialog" | "sheet";

type DialogPart = "close" | "content" | "description" | "root" | "title";
type MarkedElementType = ReactElement["type"] & { [DIALOG_PART]?: DialogPart };

interface DialogTreeInspection {
  readonly closeCount: number;
  readonly contentCount: number;
  readonly descriptionCount: number;
  readonly descriptionIds: readonly string[];
  readonly dismissPolicies: readonly DialogDismissPolicy[];
  readonly titleCount: number;
}

function inspectDialogTree(children: ReactNode): DialogTreeInspection {
  let closeCount = 0;
  let contentCount = 0;
  let descriptionCount = 0;
  let titleCount = 0;
  const descriptionIds: string[] = [];
  const dismissPolicies: DialogDismissPolicy[] = [];

  const visit = (node: ReactNode): void => {
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) return;
      const element = child as ReactElement<{
        children?: ReactNode;
        dismissPolicy?: unknown;
        id?: unknown;
      }>;
      const part = (element.type as MarkedElementType)[DIALOG_PART];
      // A nested Dialog family owns its own anatomy and dismissal policy. Counting through the
      // boundary would make valid nested modal composition look like duplicate parent parts.
      if (part === "root") return;
      if (part === "close") closeCount += 1;
      if (part === "content") {
        contentCount += 1;
        if (
          element.props.dismissPolicy === "outside-and-escape" ||
          element.props.dismissPolicy === "escape-only" ||
          element.props.dismissPolicy === "explicit"
        ) {
          dismissPolicies.push(element.props.dismissPolicy);
        } else {
          dismissPolicies.push(DEFAULT_DISMISS_POLICY);
        }
      }
      if (part === "description") {
        descriptionCount += 1;
        if (typeof element.props.id === "string" && element.props.id.trim().length > 0) {
          descriptionIds.push(element.props.id);
        }
      }
      if (part === "title") titleCount += 1;
      visit(element.props.children);
    });
  };

  visit(children);
  return {
    closeCount,
    contentCount,
    descriptionCount,
    descriptionIds,
    dismissPolicies,
    titleCount,
  };
}

export function markDialogPart<Component>(component: Component, part: DialogPart): Component {
  Object.defineProperty(component, DIALOG_PART, { configurable: true, value: part });
  return component;
}

function assignRef<Element>(ref: ForwardedRef<Element>, value: Element | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref !== null) ref.current = value;
}

function partClass(kind: DialogPartKind, part: string): string {
  const base = `mrg-dialog__${part}`;
  return kind === "dialog" ? base : `${base} mrg-${kind}__${part}`;
}

function slotName(kind: DialogPartKind, part: string): string {
  return `${kind}-${part}`;
}

function resolveNonModalPlacement(
  placement: DialogPlacement,
  direction: "ltr" | "rtl",
): ReactAriaPlacement {
  if (placement === "start") return direction === "rtl" ? "right" : "left";
  if (placement === "end") return direction === "rtl" ? "left" : "right";
  return placement;
}

function elementCanReceiveFocus(element: HTMLElement | null): element is HTMLElement {
  if (
    element === null ||
    !element.isConnected ||
    element.matches(":disabled") ||
    element.closest("[inert], [hidden], [aria-hidden='true']") !== null
  ) {
    return false;
  }
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

interface DialogContextValue {
  readonly dismissPolicy: DialogDismissPolicy;
  readonly isOpen: boolean;
  readonly kind: DialogPartKind;
  readonly markReason: (reason: DialogOpenChangeReason) => void;
  readonly modality: DialogModality;
  readonly registerTrigger: (node: HTMLButtonElement | null) => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogContext(part: string): DialogContextValue {
  const context = useContext(DialogContext);
  if (context === null) {
    throw new Error(`Mergora Dialog.${part} must be rendered inside Dialog.Root.`);
  }
  return context;
}

interface DialogContentContextValue {
  readonly descriptionId: string | undefined;
}

const DialogContentContext = createContext<DialogContentContextValue | null>(null);

export interface DialogRootProps {
  readonly children?: ReactNode;
  readonly defaultOpen?: boolean;
  /** Receives focus only when the invoking trigger no longer exists at close/unmount. */
  readonly finalFocusRef?: RefObject<HTMLElement | null>;
  readonly modality?: DialogModality;
  readonly onOpenChange?: (open: boolean, details: DialogOpenChangeDetails) => void;
  readonly open?: boolean;
}

interface DialogRootImplementationProps extends DialogRootProps {
  readonly kind?: DialogPartKind;
  readonly dismissPolicy?: DialogDismissPolicy;
}

/** Internal family primitive imported by Alert Dialog and Sheet, but not re-exported publicly. */
export function DialogRootImplementation({
  children,
  defaultOpen = false,
  dismissPolicy: dismissPolicyOverride,
  finalFocusRef,
  kind = "dialog",
  modality = "modal",
  onOpenChange,
  open,
}: DialogRootImplementationProps) {
  const provider = useMergoraContext();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const pendingReason = useRef<DialogOpenChangeReason | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inspection = useMemo(() => inspectDialogTree(children), [children]);
  const dismissPolicy =
    dismissPolicyOverride ?? inspection.dismissPolicies[0] ?? DEFAULT_DISMISS_POLICY;
  const isOpen = open ?? uncontrolledOpen;
  const wasOpen = useRef(isOpen);
  const openRef = useRef(isOpen);
  openRef.current = isOpen;

  useEffect(() => {
    if (!isDevelopmentRuntime()) return;
    if (open !== undefined && defaultOpen) {
      console.warn(
        "Mergora Dialog.Root received both open and defaultOpen. Remove defaultOpen when controlling open.",
      );
    }
    if (inspection.contentCount === 0) {
      console.warn("Mergora Dialog.Root requires one Dialog.Content descendant.");
    }
    if (inspection.contentCount > 1) {
      console.warn(
        "Mergora Dialog.Root found multiple Dialog.Content descendants. Use one surface per root.",
      );
    }
    if (new Set(inspection.dismissPolicies).size > 1) {
      console.warn(
        "Mergora Dialog.Root found conflicting dismissPolicy values. Give every surface its own Dialog.Root.",
      );
    }
  }, [defaultOpen, inspection, open]);

  const restoreFocus = useCallback(() => {
    if (typeof document === "undefined") return;
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active !== document.body &&
      active.isConnected &&
      active.closest("[data-slot$='-overlay'], [data-slot$='-positioner']") === null
    ) {
      return;
    }
    const trigger = triggerRef.current;
    const fallback = finalFocusRef?.current ?? null;
    const target = elementCanReceiveFocus(trigger)
      ? trigger
      : elementCanReceiveFocus(fallback)
        ? fallback
        : null;
    target?.focus({ preventScroll: true });
    if (target === null && isDevelopmentRuntime()) {
      console.warn(
        "Mergora Dialog.Root could not restore focus because its trigger was removed and finalFocusRef did not resolve to a connected focus target.",
      );
    }
  }, [finalFocusRef]);

  useEffect(() => {
    const previouslyOpen = wasOpen.current;
    wasOpen.current = isOpen;
    if (!previouslyOpen || isOpen || typeof requestAnimationFrame === "undefined") return;
    const first = requestAnimationFrame(() => {
      requestAnimationFrame(restoreFocus);
    });
    return () => cancelAnimationFrame(first);
  }, [isOpen, restoreFocus]);

  useEffect(
    () => () => {
      if (!openRef.current || typeof queueMicrotask === "undefined") return;
      queueMicrotask(restoreFocus);
    },
    [restoreFocus],
  );

  const markReason = useCallback((reason: DialogOpenChangeReason) => {
    pendingReason.current = reason;
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) setUncontrolledOpen(nextOpen);
      const reason = resolveDialogOpenChangeReason(pendingReason.current, nextOpen);
      pendingReason.current = null;
      onOpenChange?.(nextOpen, { reason });
    },
    [onOpenChange, open],
  );

  const context = useMemo<DialogContextValue>(
    () => ({
      dismissPolicy,
      isOpen,
      kind,
      markReason,
      modality,
      registerTrigger: (node) => {
        triggerRef.current = node;
      },
    }),
    [dismissPolicy, isOpen, kind, markReason, modality],
  );

  return (
    <ReactAriaI18nProvider locale={provider.locale}>
      <LayerManager.Provider>
        <DialogContext.Provider value={context}>
          <ReactAriaDialogTrigger isOpen={isOpen} onOpenChange={handleOpenChange}>
            {children}
          </ReactAriaDialogTrigger>
        </DialogContext.Provider>
      </LayerManager.Provider>
    </ReactAriaI18nProvider>
  );
}

export function DialogRoot(props: DialogRootProps) {
  return <DialogRootImplementation {...props} />;
}

DialogRoot.displayName = "Dialog.Root";
markDialogPart(DialogRoot, "root");

export interface DialogTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children?: ReactNode;
}

export const DialogTrigger = forwardRef<HTMLButtonElement, DialogTriggerProps>(
  function DialogTrigger(
    { children, className, disabled, type = "button", ...nativeProps },
    forwardedRef,
  ) {
    const { isOpen, kind, markReason, registerTrigger } = useDialogContext("Trigger");
    const mergedRef = useCallback(
      (node: HTMLButtonElement | null) => {
        registerTrigger(node);
        assignRef(forwardedRef, node);
      },
      [forwardedRef, registerTrigger],
    );

    return (
      <ReactAriaButton
        {...(nativeProps as ReactAriaButtonProps)}
        {...(disabled === undefined ? {} : { isDisabled: disabled })}
        ref={mergedRef}
        aria-haspopup="dialog"
        className={joinDialogClassName(partClass(kind, "trigger"), className)}
        data-slot={slotName(kind, "trigger")}
        data-state={isOpen ? "open" : "closed"}
        onPress={() => markReason("trigger")}
        type={type}
      >
        {children}
      </ReactAriaButton>
    );
  },
);

DialogTrigger.displayName = "Dialog.Trigger";

export interface DialogOverlayProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  readonly children?: ReactNode;
  /** Placement used only by non-modal Dialog roots. */
  readonly placement?: DialogPlacement;
}

export const DialogOverlay = forwardRef<HTMLDivElement, DialogOverlayProps>(function DialogOverlay(
  { children, className, dir, onPointerDownCapture, placement = "bottom", style, ...nativeProps },
  forwardedRef,
) {
  const provider = useMergoraContext();
  const { dismissPolicy, isOpen, kind, markReason, modality } = useDialogContext("Overlay");
  const dismissBehavior = getDialogDismissBehavior(dismissPolicy);
  const slot = slotName(kind, "overlay");
  const sharedProps = {
    ...nativeProps,
    ref: forwardedRef,
    className: joinDialogClassName(partClass(kind, "overlay"), className),
    "data-density": provider.density,
    "data-direction": provider.direction,
    "data-dismiss-policy": dismissPolicy,
    "data-modal": modality === "modal" ? "true" : "false",
    "data-slot": slot,
    "data-state": isOpen ? "open" : "closed",
    dir: dir ?? provider.direction,
    lang: provider.locale,
    onPointerDownCapture,
    isDismissable: dismissBehavior.allowsOutsideInteraction,
    isKeyboardDismissDisabled: !dismissBehavior.allowsEscape,
    shouldCloseOnInteractOutside: () => {
      if (dismissBehavior.allowsOutsideInteraction) markReason("outside-interaction");
      return dismissBehavior.allowsOutsideInteraction;
    },
    style,
    UNSTABLE_portalContainer: provider.portalContainer ?? undefined,
  } as const;

  const popoverProps = sharedProps as unknown as ReactAriaPopoverProps;
  const modalProps = sharedProps as unknown as ReactAriaModalOverlayProps;

  if (modality === "non-modal") {
    return (
      <LayerManager.Layer
        active={isOpen}
        asChild
        data-slot={slot}
        dismissible={false}
        modal={false}
      >
        <ReactAriaPopover
          {...popoverProps}
          ref={forwardedRef}
          containerPadding={12}
          isNonModal
          offset={8}
          placement={resolveNonModalPlacement(placement, provider.direction)}
          shouldFlip
        >
          {children}
        </ReactAriaPopover>
      </LayerManager.Layer>
    );
  }

  return (
    <LayerManager.Layer
      active={isOpen}
      asChild
      data-slot={slot}
      dismissible={false}
      manageEnvironment={false}
      modal
    >
      <ReactAriaModalOverlay
        {...modalProps}
        ref={forwardedRef}
        onPointerDownCapture={(event) => {
          onPointerDownCapture?.(event);
          if (
            !event.defaultPrevented &&
            event.target === event.currentTarget &&
            dismissBehavior.allowsOutsideInteraction
          ) {
            markReason("outside-interaction");
          }
        }}
      >
        <ReactAriaModal
          className={partClass(kind, "positioner")}
          data-dismiss-policy={dismissPolicy}
          data-slot={slotName(kind, "positioner")}
          data-state={isOpen ? "open" : "closed"}
        >
          {children}
        </ReactAriaModal>
      </ReactAriaModalOverlay>
    </LayerManager.Layer>
  );
});

DialogOverlay.displayName = "Dialog.Overlay";

export interface DialogContentProps extends Omit<
  ComponentPropsWithoutRef<"section">,
  "children" | "role"
> {
  readonly children?: ReactNode;
  readonly dismissPolicy?: DialogDismissPolicy;
  readonly initialFocus?: DialogInitialFocus;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  /** AlertDialog uses this internally. General dialogs should retain role=dialog. */
  readonly role?: "dialog" | "alertdialog";
}

export const DialogContent = forwardRef<HTMLElement, DialogContentProps>(function DialogContent(
  {
    "aria-describedby": ariaDescribedBy,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    children,
    className,
    dismissPolicy = DEFAULT_DISMISS_POLICY,
    initialFocus,
    initialFocusRef,
    onKeyDownCapture,
    role = "dialog",
    ...nativeProps
  },
  forwardedRef,
) {
  const root = useDialogContext("Content");
  const contentRef = useRef<HTMLElement | null>(null);
  const descriptionId = useId();
  const inspection = useMemo(() => inspectDialogTree(children), [children]);
  const hasAriaLabel = typeof ariaLabel === "string" && ariaLabel.trim().length > 0;
  const hasAriaLabelledBy = typeof ariaLabelledBy === "string" && ariaLabelledBy.trim().length > 0;
  const usesAutomaticDescription =
    inspection.descriptionCount === 1 && ariaDescribedBy === undefined;
  const resolvedDescriptionId = usesAutomaticDescription
    ? (inspection.descriptionIds[0] ?? descriptionId)
    : undefined;
  const resolvedAriaDescribedBy = ariaDescribedBy ?? resolvedDescriptionId;
  const requestedInitialFocus =
    initialFocus ?? (root.modality === "modal" ? "first-interactive" : "none");
  const resolvedInitialFocus =
    root.modality === "modal" && requestedInitialFocus === "none"
      ? "first-interactive"
      : requestedInitialFocus;

  const mergedRef = useCallback(
    (node: HTMLElement | null) => {
      contentRef.current = node;
      assignRef(forwardedRef, node);
    },
    [forwardedRef],
  );

  useEffect(() => {
    if (!isDevelopmentRuntime()) return;
    for (const diagnostic of getDialogNamingDiagnostics({
      closeCount: inspection.closeCount,
      descriptionCount: inspection.descriptionCount,
      hasAriaLabel,
      hasAriaLabelledBy,
      titleCount: inspection.titleCount,
    })) {
      console.warn(`Mergora ${diagnostic}`);
    }
    if (root.dismissPolicy !== dismissPolicy) {
      console.warn(
        "Mergora Dialog.Content dismissPolicy could not be resolved by Dialog.Root. Keep Content in the declarative Root tree.",
      );
    }
    if (root.kind === "alert-dialog" && inspection.descriptionCount === 0) {
      console.warn(
        "Mergora AlertDialog.Content requires AlertDialog.Description with the concrete consequence of the decision.",
      );
    }
    if (root.modality === "modal" && initialFocus === "none") {
      console.warn(
        "Mergora Dialog.Content initialFocus='none' is limited to non-modal surfaces. Modal dialogs use first-interactive focus so focus cannot remain behind the modal.",
      );
    }
  }, [
    dismissPolicy,
    hasAriaLabel,
    hasAriaLabelledBy,
    inspection,
    initialFocus,
    root.dismissPolicy,
    root.kind,
    root.modality,
  ]);

  useEffect(() => {
    if (!root.isOpen || resolvedInitialFocus === "none") return;
    const content = contentRef.current;
    if (content === null) return;
    const requested = initialFocusRef?.current ?? null;
    const target =
      requested ??
      (resolvedInitialFocus === "content"
        ? content
        : content.querySelector<HTMLElement>(FOCUSABLE_SELECTOR));
    if (target === null || !content.contains(target) || !elementCanReceiveFocus(target)) {
      if (isDevelopmentRuntime()) {
        console.warn(
          "Mergora Dialog.Content initial focus must resolve to a connected, enabled descendant. Use initialFocus='content' for long semantic content or provide initialFocusRef.",
        );
      }
      content.focus({ preventScroll: true });
      return;
    }
    target.focus({ preventScroll: true });
  }, [initialFocusRef, resolvedInitialFocus, root.isOpen]);

  const contentContext = useMemo<DialogContentContextValue>(
    () => ({ descriptionId: resolvedDescriptionId }),
    [resolvedDescriptionId],
  );

  return (
    <DialogContentContext.Provider value={contentContext}>
      <ReactAriaDialog
        {...(nativeProps as ReactAriaDialogProps)}
        {...(resolvedAriaDescribedBy === undefined
          ? {}
          : { "aria-describedby": resolvedAriaDescribedBy })}
        {...(ariaLabel === undefined ? {} : { "aria-label": ariaLabel })}
        {...(ariaLabelledBy === undefined ? {} : { "aria-labelledby": ariaLabelledBy })}
        ref={mergedRef}
        className={joinDialogClassName(partClass(root.kind, "content"), className)}
        data-dismiss-policy={dismissPolicy}
        data-modal={root.modality === "modal" ? "true" : "false"}
        data-slot={slotName(root.kind, "content")}
        data-state={root.isOpen ? "open" : "closed"}
        role={role}
      >
        <div
          className={partClass(root.kind, "keyboard-boundary")}
          data-slot={slotName(root.kind, "keyboard-boundary")}
          onKeyDownCapture={(event: ReactKeyboardEvent<HTMLDivElement>) => {
            onKeyDownCapture?.(event as ReactKeyboardEvent<HTMLElement>);
            if (event.key !== "Escape") return;
            if (event.nativeEvent.isComposing) {
              event.stopPropagation();
              return;
            }
            const layer = event.currentTarget.closest<HTMLElement>("[data-layer-id]");
            if (
              layer?.dataset.layerTop === "true" &&
              getDialogDismissBehavior(root.dismissPolicy).allowsEscape
            ) {
              root.markReason("escape-key");
            }
          }}
        >
          {children}
        </div>
      </ReactAriaDialog>
    </DialogContentContext.Provider>
  );
});

DialogContent.displayName = "Dialog.Content";

export type DialogHeaderProps = ComponentPropsWithoutRef<"div">;

export const DialogHeader = forwardRef<HTMLDivElement, DialogHeaderProps>(function DialogHeader(
  { className, ...nativeProps },
  forwardedRef,
) {
  const { kind } = useDialogContext("Header");
  return (
    <div
      {...nativeProps}
      ref={forwardedRef}
      className={joinDialogClassName(partClass(kind, "header"), className)}
      data-slot={slotName(kind, "header")}
    />
  );
});

DialogHeader.displayName = "Dialog.Header";

export type DialogFooterProps = ComponentPropsWithoutRef<"div">;

export const DialogFooter = forwardRef<HTMLDivElement, DialogFooterProps>(function DialogFooter(
  { className, ...nativeProps },
  forwardedRef,
) {
  const { kind } = useDialogContext("Footer");
  return (
    <div
      {...nativeProps}
      ref={forwardedRef}
      className={joinDialogClassName(partClass(kind, "footer"), className)}
      data-slot={slotName(kind, "footer")}
    />
  );
});

DialogFooter.displayName = "Dialog.Footer";

export interface DialogTitleProps extends Omit<HTMLAttributes<HTMLHeadingElement>, "slot"> {
  readonly level?: 1 | 2 | 3 | 4 | 5 | 6;
}

export const DialogTitle = forwardRef<HTMLHeadingElement, DialogTitleProps>(function DialogTitle(
  { className, level = 2, ...nativeProps },
  forwardedRef,
) {
  const { kind } = useDialogContext("Title");
  return (
    <ReactAriaHeading
      {...nativeProps}
      ref={forwardedRef}
      className={joinDialogClassName(partClass(kind, "title"), className)}
      data-slot={slotName(kind, "title")}
      level={level}
      slot="title"
    />
  );
});

DialogTitle.displayName = "Dialog.Title";

export type DialogDescriptionProps = ComponentPropsWithoutRef<"p">;

export const DialogDescription = forwardRef<HTMLParagraphElement, DialogDescriptionProps>(
  function DialogDescription({ className, id, ...nativeProps }, forwardedRef) {
    const content = useContext(DialogContentContext);
    const { kind } = useDialogContext("Description");
    if (content === null) {
      throw new Error("Mergora Dialog.Description must be rendered inside Dialog.Content.");
    }
    return (
      <p
        {...nativeProps}
        ref={forwardedRef}
        className={joinDialogClassName(partClass(kind, "description"), className)}
        data-slot={slotName(kind, "description")}
        id={typeof id === "string" && id.trim().length > 0 ? id : content.descriptionId}
      />
    );
  },
);

DialogDescription.displayName = "Dialog.Description";

export interface DialogCloseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children?: ReactNode;
}

export const DialogClose = forwardRef<HTMLButtonElement, DialogCloseProps>(function DialogClose(
  { children, className, disabled, type = "button", ...nativeProps },
  forwardedRef,
) {
  const { isOpen, kind, markReason } = useDialogContext("Close");
  const messageKey =
    kind === "alert-dialog"
      ? "alertDialog.cancel"
      : kind === "sheet"
        ? "sheet.close"
        : "dialog.close";
  const fallback =
    kind === "alert-dialog" ? "Cancel" : kind === "sheet" ? "Close panel" : "Close dialog";
  const closeLabel = useMergoraMessage(messageKey, fallback);
  return (
    <ReactAriaButton
      {...(nativeProps as ReactAriaButtonProps)}
      {...(disabled === undefined ? {} : { isDisabled: disabled })}
      ref={forwardedRef}
      className={joinDialogClassName(partClass(kind, "close"), className)}
      data-slot={slotName(kind, "close")}
      data-state={isOpen ? "open" : "closed"}
      onPress={() => markReason("close-button")}
      slot="close"
      type={type}
    >
      {children ?? closeLabel}
    </ReactAriaButton>
  );
});

DialogClose.displayName = "Dialog.Close";

markDialogPart(DialogContent, "content");
markDialogPart(DialogTitle, "title");
markDialogPart(DialogDescription, "description");
markDialogPart(DialogClose, "close");

export const Dialog = Object.freeze({
  Close: DialogClose,
  Content: DialogContent,
  Description: DialogDescription,
  Footer: DialogFooter,
  Header: DialogHeader,
  Overlay: DialogOverlay,
  Root: DialogRoot,
  Title: DialogTitle,
  Trigger: DialogTrigger,
});
