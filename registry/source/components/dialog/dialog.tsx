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
  shouldDismissNonModalOutsideActivation,
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

const FOREIGN_OVERLAY_OWNER_SELECTOR = [
  "[data-react-aria-top-layer]",
  "[data-slot$='-overlay']",
  "[data-slot$='-positioner']",
  "[role='alertdialog']",
  "[role='dialog']",
  "[role='listbox']",
  "[role='menu']",
  "[role='tooltip']",
].join(",");

function activationTarget(event: Event): Element | null {
  for (const target of event.composedPath()) {
    if (target instanceof Element) return target;
  }
  return event.target instanceof Element ? event.target : null;
}

function belongsToForeignOverlay(target: Element, overlay: Element): boolean {
  const owner = target.closest(FOREIGN_OVERLAY_OWNER_SELECTOR);
  return owner !== null && owner !== overlay && !overlay.contains(owner);
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
  readonly requestClose: (reason: DialogOpenChangeReason) => void;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
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
  /** Declarative Dialog parts owned by this root. */
  readonly children?: ReactNode;
  /** Initial open state for uncontrolled use. */
  readonly defaultOpen?: boolean;
  /** Receives focus only when the invoking trigger no longer exists at close/unmount. */
  readonly finalFocusRef?: RefObject<HTMLElement | null>;
  /** Chooses modal containment or a non-modal, background-operable surface. */
  readonly modality?: DialogModality;
  /** Reports open-state changes with the originating dismissal or trigger reason. */
  readonly onOpenChange?: (open: boolean, details: DialogOpenChangeDetails) => void;
  /** Controlled open state; pair with onOpenChange. */
  readonly open?: boolean;
}

interface DialogRootImplementationProps extends DialogRootProps {
  /** Internal family namespace used by Dialog, AlertDialog, and Sheet parts. */
  readonly kind?: DialogPartKind;
  /** Internal root-level dismissal override used by family wrappers. */
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

  const restoreFocus = useCallback(
    (warnWhenUnavailable = true): boolean => {
      if (typeof document === "undefined") return true;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        active !== document.body &&
        active.isConnected &&
        active.closest("[data-slot$='-overlay'], [data-slot$='-positioner']") === null
      ) {
        return true;
      }
      const trigger = triggerRef.current;
      const fallback = finalFocusRef?.current ?? null;
      const target = elementCanReceiveFocus(trigger)
        ? trigger
        : elementCanReceiveFocus(fallback)
          ? fallback
          : null;
      target?.focus({ preventScroll: true });
      if (target !== null && document.activeElement === target) return true;
      if (warnWhenUnavailable && isDevelopmentRuntime()) {
        console.warn(
          "Mergora Dialog.Root could not restore focus because its trigger was removed and finalFocusRef did not resolve to a connected focus target.",
        );
      }
      return false;
    },
    [finalFocusRef],
  );

  useEffect(() => {
    const previouslyOpen = wasOpen.current;
    wasOpen.current = isOpen;
    if (!previouslyOpen || isOpen || typeof requestAnimationFrame === "undefined") return;
    let cancelled = false;
    let frame = 0;
    let attempt = 0;
    const retry = (): void => {
      if (cancelled) return;
      attempt += 1;
      const finalAttempt = attempt >= 4;
      if (restoreFocus(finalAttempt) || finalAttempt) return;
      frame = requestAnimationFrame(retry);
    };
    frame = requestAnimationFrame(retry);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [isOpen, restoreFocus]);

  useEffect(
    () => () => {
      if (!openRef.current || typeof queueMicrotask === "undefined") return;
      queueMicrotask(() => {
        if (
          typeof document !== "undefined" &&
          (document.visibilityState === "hidden" || document.body?.isConnected !== true)
        ) {
          return;
        }
        restoreFocus();
      });
    },
    [restoreFocus],
  );

  const markReason = useCallback((reason: DialogOpenChangeReason) => {
    pendingReason.current = reason;
  }, []);

  const commitOpenChange = useCallback(
    (nextOpen: boolean, explicitReason?: DialogOpenChangeReason) => {
      const reason =
        explicitReason ?? resolveDialogOpenChangeReason(pendingReason.current, nextOpen);
      pendingReason.current = null;
      if (nextOpen === openRef.current) return;
      openRef.current = nextOpen;
      if (open === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen, { reason });
    },
    [onOpenChange, open],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => commitOpenChange(nextOpen),
    [commitOpenChange],
  );

  const requestClose = useCallback(
    (reason: DialogOpenChangeReason) => commitOpenChange(false, reason),
    [commitOpenChange],
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
      requestClose,
      triggerRef,
    }),
    [dismissPolicy, isOpen, kind, markReason, modality, requestClose],
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
  /** Trigger button content; native button semantics remain authoritative. */
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
        onPress={() => {
          // Opening already resolves to `trigger`; recording only the close-side toggle avoids
          // leaving a stale reason for a later Escape or outside dismissal.
          if (isOpen) markReason("trigger");
        }}
        type={type}
      >
        {children}
      </ReactAriaButton>
    );
  },
);

DialogTrigger.displayName = "Dialog.Trigger";

export interface DialogOverlayProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Dialog positioner and content rendered inside the managed overlay. */
  readonly children?: ReactNode;
  /** Placement used only by non-modal Dialog roots. */
  readonly placement?: DialogPlacement;
}

export const DialogOverlay = forwardRef<HTMLDivElement, DialogOverlayProps>(function DialogOverlay(
  { children, className, dir, onPointerDownCapture, placement = "bottom", style, ...nativeProps },
  forwardedRef,
) {
  const provider = useMergoraContext();
  const { dismissPolicy, isOpen, kind, markReason, modality, requestClose, triggerRef } =
    useDialogContext("Overlay");
  const dismissBehavior = getDialogDismissBehavior(dismissPolicy);
  const slot = slotName(kind, "overlay");
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      overlayRef.current = node;
      assignRef(forwardedRef, node);
    },
    [forwardedRef],
  );

  useEffect(() => {
    if (modality !== "non-modal" || !isOpen || !dismissBehavior.allowsOutsideInteraction) {
      return;
    }
    const overlay = overlayRef.current;
    if (overlay === null) return;
    const ownerDocument = overlay.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    if (ownerWindow === null) return;

    let closeFrame = 0;
    let start:
      | {
          readonly event: Event;
          readonly isPrimary: boolean;
          readonly target: Element;
        }
      | undefined;

    const isOutsideOwnedSurface = (event: Event, target: Element): boolean => {
      const path = event.composedPath();
      const trigger = triggerRef.current;
      return (
        !path.includes(overlay) &&
        !overlay.contains(target) &&
        (trigger === null || (!path.includes(trigger) && !trigger.contains(target)))
      );
    };

    const reset = (): void => {
      start = undefined;
    };

    const onPointerStart = (event: Event): void => {
      const pointerEvent = event as MouseEvent & { readonly isPrimary?: boolean };
      const target = activationTarget(event);
      const isPrimary =
        pointerEvent.button === 0 &&
        (pointerEvent.isPrimary === undefined || pointerEvent.isPrimary);
      if (
        target === null ||
        !isPrimary ||
        !isOutsideOwnedSurface(event, target) ||
        belongsToForeignOverlay(target, overlay)
      ) {
        reset();
        return;
      }
      start = { event, isPrimary, target };
    };

    const onClick = (event: MouseEvent): void => {
      const pointerStart = start;
      reset();
      const target = activationTarget(event);
      if (pointerStart === undefined || target === null) return;

      const clickEndedOutside = isOutsideOwnedSurface(event, target);
      const topLayerOwned =
        belongsToForeignOverlay(pointerStart.target, overlay) ||
        belongsToForeignOverlay(target, overlay);
      const sameTargetLineage =
        pointerStart.target === target ||
        pointerStart.target.contains(target) ||
        target.contains(pointerStart.target);
      if (
        !shouldDismissNonModalOutsideActivation({
          clickEndedOutside,
          defaultPrevented: pointerStart.event.defaultPrevented || event.defaultPrevented,
          isPrimary: pointerStart.isPrimary && event.button === 0,
          pointerStartedOutside: true,
          sameTargetLineage,
          topLayerOwned,
        })
      ) {
        return;
      }

      // React Aria normally closes first. Waiting one frame lets that state commit, while the
      // guarded root transition makes this a no-op there and supplies the missing Safari path.
      closeFrame = ownerWindow.requestAnimationFrame(() => {
        requestClose("outside-interaction");
      });
    };

    const startEvent = typeof ownerWindow.PointerEvent === "function" ? "pointerdown" : "mousedown";
    ownerDocument.addEventListener(startEvent, onPointerStart, true);
    ownerDocument.addEventListener("click", onClick, true);
    ownerDocument.addEventListener("pointercancel", reset, true);
    ownerDocument.addEventListener("dragstart", reset, true);
    return () => {
      ownerDocument.removeEventListener(startEvent, onPointerStart, true);
      ownerDocument.removeEventListener("click", onClick, true);
      ownerDocument.removeEventListener("pointercancel", reset, true);
      ownerDocument.removeEventListener("dragstart", reset, true);
      if (closeFrame !== 0) ownerWindow.cancelAnimationFrame(closeFrame);
    };
  }, [dismissBehavior.allowsOutsideInteraction, isOpen, modality, requestClose, triggerRef]);

  useEffect(() => {
    if (!isOpen || !dismissBehavior.allowsEscape) return;
    const overlay = overlayRef.current;
    if (overlay === null) return;
    const ownerDocument = overlay.ownerDocument;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key !== "Escape" ||
        event.isComposing ||
        overlay.dataset.layerTop !== "true" ||
        (!event.composedPath().includes(overlay) &&
          !(event.target instanceof Node && overlay.contains(event.target)))
      ) {
        return;
      }
      // React Aria owns the close; this capture listener only records the exact reason before its
      // non-modal Popover handler consumes the event.
      markReason("escape-key");
    };
    ownerDocument.addEventListener("keydown", onKeyDown, true);
    return () => ownerDocument.removeEventListener("keydown", onKeyDown, true);
  }, [dismissBehavior.allowsEscape, isOpen, markReason]);

  const sharedProps = {
    ...nativeProps,
    ref: mergedRef,
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
          ref={mergedRef}
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
        ref={mergedRef}
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
  /** Dialog body and named parts rendered inside the content surface. */
  readonly children?: ReactNode;
  /** Optional visible dismissal guidance. When supplied it joins the dialog description. */
  readonly dismissHint?: ReactNode;
  /** Controls whether Escape and outside interaction may dismiss the surface. */
  readonly dismissPolicy?: DialogDismissPolicy;
  /** Entry-focus policy, with modal roots always receiving contained focus. */
  readonly initialFocus?: DialogInitialFocus;
  /** Preferred contained entry-focus target, with the content surface as fallback. */
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
    dismissHint,
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
  const dismissHintId = useId();
  const inspection = useMemo(() => inspectDialogTree(children), [children]);
  const hasAriaLabel = typeof ariaLabel === "string" && ariaLabel.trim().length > 0;
  const hasAriaLabelledBy = typeof ariaLabelledBy === "string" && ariaLabelledBy.trim().length > 0;
  const usesAutomaticDescription =
    inspection.descriptionCount === 1 && ariaDescribedBy === undefined;
  const resolvedDescriptionId = usesAutomaticDescription
    ? (inspection.descriptionIds[0] ?? descriptionId)
    : undefined;
  const hasDismissHint = hasAccessibleContent(dismissHint);
  const resolvedAriaDescribedBy =
    [ariaDescribedBy ?? resolvedDescriptionId, hasDismissHint ? dismissHintId : undefined]
      .filter((value): value is string => value !== undefined && value.length > 0)
      .join(" ") || undefined;
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
          {hasDismissHint ? (
            <p
              className={partClass(root.kind, "dismiss-hint")}
              data-dismiss-policy={dismissPolicy}
              data-slot={slotName(root.kind, "dismiss-hint")}
              id={dismissHintId}
            >
              {dismissHint}
            </p>
          ) : null}
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
  /** Semantic heading level used for the rendered dialog title. */
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
  /** Close-button content; localized default text is used when omitted. */
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
