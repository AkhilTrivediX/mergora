// Generated from registry/source/components/action-menu/action-menu.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import { forwardRef, useId, useState, type ButtonHTMLAttributes, type HTMLAttributes } from "react";
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
} from "react-aria-components/Button";
import { I18nProvider as AriaI18nProvider } from "react-aria-components/I18nProvider";
import {
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuTrigger as AriaMenuTrigger,
  Popover as AriaPopover,
} from "react-aria-components/Menu";

import { useDirection, type DirectionValue } from "../direction/index.js";
import { LayerManager } from "../layer-manager/index.js";
import { useMergoraContext } from "../provider/index.js";
import "./action-menu.css";

interface ActionMenuItemBase {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly description?: string;
  readonly onSelect?: () => void;
}

export interface ActionMenuDefaultItem extends ActionMenuItemBase {
  readonly intent?: "default";
  readonly confirmLabel?: never;
}

export interface ActionMenuDestructiveItem extends ActionMenuItemBase {
  readonly intent: "destructive";
  /** Required second-step text, for example “Confirm delete project”. */
  readonly confirmLabel: string;
}

export type ActionMenuItem = ActionMenuDefaultItem | ActionMenuDestructiveItem;
export type ActionMenuPlacement = "start" | "end";

function assertValidActionMenuItemIds(items: readonly ActionMenuItem[]): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.id.trim().length === 0) {
      throw new Error("ActionMenu item ids must be non-empty strings.");
    }
    if (ids.has(item.id)) {
      throw new Error(
        `ActionMenu item ids must be unique. Duplicate id: ${JSON.stringify(item.id)}.`,
      );
    }
    ids.add(item.id);
  }
}

export interface ActionMenuProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  "children" | "defaultValue" | "onChange"
> {
  readonly label: string;
  readonly items: readonly ActionMenuItem[];
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onAction?: (id: string) => void;
  readonly direction?: DirectionValue;
  readonly placement?: ActionMenuPlacement;
  readonly pending?: boolean;
  readonly pendingLabel?: string;
  readonly triggerProps?: Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "aria-expanded" | "aria-haspopup" | "children" | "onClick"
  >;
}

/** Kept as a deterministic helper for collection-level contract tests. */
export function resolveMenuIndex(input: {
  readonly current: number;
  readonly itemCount: number;
  readonly key: string;
}): number | null {
  const { current, itemCount, key } = input;
  if (itemCount === 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  if (key === "ArrowDown") return (current + 1 + itemCount) % itemCount;
  if (key === "ArrowUp") return (current - 1 + itemCount) % itemCount;
  return null;
}

export const ActionMenu = forwardRef<HTMLButtonElement, ActionMenuProps>(function ActionMenu(
  {
    className,
    defaultOpen = false,
    direction,
    items,
    label,
    onAction,
    onOpenChange,
    open,
    pending = false,
    pendingLabel,
    placement = "start",
    triggerProps,
    ...nativeProps
  },
  forwardedRef,
) {
  const layerId = `mrg-action-menu-${useId().replaceAll(":", "")}`;
  const inheritedDirection = useDirection();
  const { locale } = useMergoraContext();
  const resolvedDirection = direction ?? inheritedDirection;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [confirmationId, setConfirmationId] = useState<string | null>(null);
  assertValidActionMenuItemIds(items);
  const controlled = open !== undefined;
  const isOpen = pending ? false : (open ?? uncontrolledOpen);
  const usablePendingLabel = pendingLabel?.trim() ? pendingLabel : undefined;
  const triggerLabel = pending && usablePendingLabel !== undefined ? usablePendingLabel : label;
  const ariaPlacement =
    placement === "start"
      ? resolvedDirection === "rtl"
        ? "bottom right"
        : "bottom left"
      : resolvedDirection === "rtl"
        ? "bottom left"
        : "bottom right";
  const {
    "aria-disabled": triggerAriaDisabled,
    className: triggerClassName,
    disabled: triggerDisabled,
    onKeyDown: triggerOnKeyDown,
    ...nativeTriggerProps
  } = triggerProps ?? {};

  const setOpen = (next: boolean): void => {
    if (pending && next) return;
    if (!controlled) setUncontrolledOpen(next);
    if (!next) setConfirmationId(null);
    onOpenChange?.(next);
  };
  const activateItem = (item: ActionMenuItem): void => {
    if (item.disabled) return;
    if (item.intent === "destructive" && confirmationId !== item.id) {
      setConfirmationId(item.id);
      return;
    }
    item.onSelect?.();
    onAction?.(item.id);
  };

  const ariaTriggerProps = nativeTriggerProps as unknown as AriaButtonProps;
  return (
    <AriaI18nProvider locale={locale}>
      <span
        {...nativeProps}
        className={className === undefined ? "mrg-action-menu" : `mrg-action-menu ${className}`}
        data-open={isOpen || undefined}
        data-slot="action-menu"
        dir={resolvedDirection}
        lang={locale}
      >
        <AriaMenuTrigger isOpen={isOpen} onOpenChange={setOpen}>
          <AriaButton
            {...ariaTriggerProps}
            {...(pending
              ? { "aria-disabled": true }
              : triggerAriaDisabled === undefined
                ? {}
                : { "aria-disabled": triggerAriaDisabled })}
            {...(pending ? { "aria-busy": true, "data-pending": true } : {})}
            {...(triggerDisabled === undefined ? {} : { isDisabled: triggerDisabled })}
            {...(triggerOnKeyDown === undefined ? {} : { onKeyDown: triggerOnKeyDown })}
            ref={forwardedRef}
            aria-label={triggerLabel}
            className={
              triggerClassName === undefined
                ? "mrg-action-menu-trigger"
                : `mrg-action-menu-trigger ${triggerClassName}`
            }
            data-slot="action-menu-trigger"
          >
            <span data-slot="action-menu-trigger-label">{triggerLabel}</span>
            <span aria-hidden="true" data-slot="action-menu-trigger-indicator">
              ▾
            </span>
          </AriaButton>
          <AriaPopover
            className="mrg-action-menu-popover"
            containerPadding={12}
            data-slot="action-menu-popover"
            offset={8}
            placement={ariaPlacement}
            shouldFlip
          >
            <LayerManager.Layer active dismissible={false} id={`${layerId}-layer`}>
              <AriaMenu
                aria-label={label}
                className="mrg-action-menu-content"
                data-slot="action-menu-content"
              >
                {items.map((item, index) => {
                  const confirming = item.intent === "destructive" && confirmationId === item.id;
                  const descriptionId = `${layerId}-item-${index}-description`;
                  return (
                    <AriaMenuItem
                      {...(item.description === undefined
                        ? {}
                        : { "aria-describedby": descriptionId })}
                      {...(item.disabled === undefined ? {} : { isDisabled: item.disabled })}
                      className="mrg-action-menu-item"
                      data-confirming={confirming || undefined}
                      data-intent={item.intent ?? "default"}
                      data-slot="action-menu-item"
                      id={item.id}
                      key={item.id}
                      onAction={() => activateItem(item)}
                      shouldCloseOnSelect={item.intent !== "destructive" || confirming}
                      textValue={item.label}
                    >
                      <span data-slot="action-menu-item-label">
                        {confirming ? item.confirmLabel : item.label}
                      </span>
                      {item.description === undefined ? null : (
                        <span data-slot="action-menu-item-description" id={descriptionId}>
                          {item.description}
                        </span>
                      )}
                    </AriaMenuItem>
                  );
                })}
              </AriaMenu>
            </LayerManager.Layer>
          </AriaPopover>
        </AriaMenuTrigger>
      </span>
    </AriaI18nProvider>
  );
});

ActionMenu.displayName = "ActionMenu";
