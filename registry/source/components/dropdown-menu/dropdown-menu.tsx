"use client";

import "./dropdown-menu.css";

import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
} from "react-aria-components/Button";
import { I18nProvider as AriaI18nProvider } from "react-aria-components/I18nProvider";
import {
  Keyboard as AriaKeyboard,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuTrigger as AriaMenuTrigger,
  Popover as AriaPopover,
  Separator as AriaSeparator,
  SubmenuTrigger as AriaSubmenuTrigger,
  Text as AriaText,
} from "react-aria-components/Menu";

import { useDirection, type DirectionValue } from "../direction/index.js";
import { LayerManager } from "../layer-manager/index.js";
import { useMergoraContext } from "../provider/index.js";

export type DropdownMenuPlacement = "start" | "end";
export type DropdownMenuSelectionMode = "none" | "single" | "multiple";

interface DropdownMenuItemBase {
  /** Stable non-empty identifier, unique across the complete nested menu tree. */
  readonly id: string;
  /** Visible item text and the value used for menu typeahead. */
  readonly label: string;
  /** Optional supplemental text associated with the menu item. */
  readonly description?: string;
  /** Removes the item from activation and selection. */
  readonly disabled?: boolean;
  /** Display-only keyboard shortcut hint; consumers retain shortcut behavior ownership. */
  readonly shortcut?: string;
}

export interface DropdownMenuActionItem extends DropdownMenuItemBase {
  /** Optional action discriminant; omission also creates an action item. */
  readonly kind?: "action";
  /** Visual intent used to distinguish ordinary and destructive actions. */
  readonly intent?: "default" | "destructive";
  /** Replacement copy shown while an enabled destructive confirmation awaits reactivation. */
  readonly confirmationLabel?: string;
  /** Item-local action callback invoked before the menu-level callback. */
  readonly onAction?: () => void;
}

export interface DropdownMenuLinkItem extends DropdownMenuItemBase {
  /** Discriminant selecting link menu-item behavior. */
  readonly kind: "link";
  /** Navigation destination owned by the rendered link menu item. */
  readonly href: string;
  /** Browsing-context target for the link action. */
  readonly target?: "_blank" | "_self";
}

export interface DropdownMenuSubmenuItem extends DropdownMenuItemBase {
  /** Discriminant selecting nested submenu behavior. */
  readonly kind: "submenu";
  /** Non-empty ordered model for the nested menu level. */
  readonly items: readonly DropdownMenuItem[];
}

export interface DropdownMenuSeparatorItem {
  /** Stable non-empty identifier, unique across the complete nested menu tree. */
  readonly id: string;
  /** Discriminant selecting noninteractive separator semantics. */
  readonly kind: "separator";
}

export type DropdownMenuItem =
  | DropdownMenuActionItem
  | DropdownMenuLinkItem
  | DropdownMenuSubmenuItem
  | DropdownMenuSeparatorItem;

export interface DropdownMenuProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  "children" | "defaultValue" | "onChange"
> {
  /** Visible content rendered inside the menu trigger button. */
  readonly label: ReactNode;
  /** Accessible name applied directly to the opened menu. */
  readonly menuLabel: string;
  /** Ordered item model, including actions, links, submenus, and separators. */
  readonly items: readonly DropdownMenuItem[];
  /** Controlled open state; pair with onOpenChange. */
  readonly open?: boolean;
  /** Initial open state for uncontrolled use. */
  readonly defaultOpen?: boolean;
  /** Reports every committed open-state change. */
  readonly onOpenChange?: (open: boolean) => void;
  /** Reports the identifier of an activated action or link item. */
  readonly onAction?: (id: string) => void;
  /** Direction used for logical placement and menu navigation. */
  readonly direction?: DirectionValue;
  /** Logical inline alignment of the menu relative to its trigger. */
  readonly placement?: DropdownMenuPlacement;
  /** Chooses action-only, single-selection, or multiple-selection semantics. */
  readonly selectionMode?: DropdownMenuSelectionMode;
  /** Controlled identifiers selected in single or multiple selection mode. */
  readonly selectedIds?: readonly string[];
  /** Initial selected identifiers for uncontrolled use. */
  readonly defaultSelectedIds?: readonly string[];
  /** Reports the complete selected-identifier set after a selection change. */
  readonly onSelectionChange?: (ids: readonly string[]) => void;
  /** Disables the trigger and prevents the menu from opening. */
  readonly disabled?: boolean;
  /** Content rendered when the item collection is empty. */
  readonly emptyContent?: ReactNode;
  /** Adds a persistent selected-count rail. When false, no rail or live-region output exists. */
  readonly selectionSummary?: boolean;
  /** Formats the selected-count rail and its polite live-region text. */
  readonly selectionSummaryLabel?: (count: number) => string;
  /** Requires a second explicit activation for destructive items that provide confirmationLabel. */
  readonly confirmDestructiveActions?: boolean;
  /** Internal family composition hook used by Menubar's APG top-level menu items. */
  readonly triggerRole?: "button" | "menuitem";
  /** Additional native trigger props; owned popup and disabled attributes remain internal. */
  readonly triggerProps?: Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "aria-expanded" | "aria-haspopup" | "children" | "disabled" | "onClick"
  >;
}

function classes(...values: readonly (string | undefined | false)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

function assertMenu(items: readonly DropdownMenuItem[], menuLabel: string): void {
  if (menuLabel.trim().length === 0) {
    throw new Error("Mergora DropdownMenu requires a non-empty menuLabel.");
  }
  const ids = new Set<string>();
  const visit = (entries: readonly DropdownMenuItem[]): void => {
    for (const item of entries) {
      if (item.id.trim().length === 0) {
        throw new Error("Mergora DropdownMenu item ids must be non-empty strings.");
      }
      if (ids.has(item.id)) {
        throw new Error(`Mergora DropdownMenu item ids must be unique. Duplicate: ${item.id}.`);
      }
      ids.add(item.id);
      if (item.kind === "submenu") {
        if (item.items.length === 0) {
          throw new Error(`Mergora DropdownMenu submenu ${item.id} requires at least one item.`);
        }
        visit(item.items);
      }
      if (
        (item.kind === undefined || item.kind === "action") &&
        item.intent === "destructive" &&
        item.confirmationLabel !== undefined &&
        item.confirmationLabel.trim().length === 0
      ) {
        throw new Error(
          `Mergora DropdownMenu destructive item ${item.id} confirmationLabel must be non-empty.`,
        );
      }
    }
  };
  visit(items);
}

function selectableIds(items: readonly DropdownMenuItem[]): readonly string[] {
  return items
    .filter((item) => item.kind !== "separator" && item.kind !== "submenu" && !item.disabled)
    .map((item) => item.id);
}

interface MenuItemsProps {
  readonly items: readonly DropdownMenuItem[];
  readonly confirmDestructiveActions: boolean;
  readonly confirmationId: string | null;
  readonly onConfirmationChange: (id: string | null) => void;
  readonly onAction?: (id: string) => void;
  readonly layerId: string;
}

function MenuItems({
  items,
  confirmDestructiveActions,
  confirmationId,
  onConfirmationChange,
  onAction,
  layerId,
}: MenuItemsProps) {
  return items.map((item) => {
    if (item.kind === "separator") {
      return (
        <AriaSeparator
          className="mrg-dropdown-menu__separator"
          data-slot="dropdown-menu-separator"
          key={item.id}
        />
      );
    }

    const isAction = item.kind === undefined || item.kind === "action";
    const destructive = isAction && item.intent === "destructive";
    const confirming = destructive && confirmDestructiveActions && confirmationId === item.id;
    const requiresConfirmation =
      destructive && confirmDestructiveActions && item.confirmationLabel !== undefined;
    const content = ({ isSelected }: { readonly isSelected: boolean }) => (
      <>
        <span aria-hidden="true" className="mrg-dropdown-menu__selection-mark">
          {isSelected ? "✓" : ""}
        </span>
        <span className="mrg-dropdown-menu__copy" data-slot="dropdown-menu-item-copy">
          <span data-slot="dropdown-menu-item-label">
            {confirming && isAction ? item.confirmationLabel : item.label}
          </span>
          {item.description === undefined ? null : (
            <AriaText
              className="mrg-dropdown-menu__description"
              data-slot="dropdown-menu-item-description"
              slot="description"
            >
              {item.description}
            </AriaText>
          )}
        </span>
        {item.shortcut === undefined ? null : (
          <AriaKeyboard
            className="mrg-dropdown-menu__shortcut"
            data-slot="dropdown-menu-item-shortcut"
          >
            {item.shortcut}
          </AriaKeyboard>
        )}
        {item.kind === "submenu" ? (
          <span aria-hidden="true" className="mrg-dropdown-menu__submenu-mark">
            ›
          </span>
        ) : null}
      </>
    );

    if (item.kind === "submenu") {
      return (
        <AriaSubmenuTrigger key={item.id}>
          <AriaMenuItem
            className="mrg-dropdown-menu__item"
            data-slot="dropdown-menu-item"
            id={item.id}
            {...(item.disabled === undefined ? {} : { isDisabled: item.disabled })}
            textValue={item.label}
          >
            {content}
          </AriaMenuItem>
          <AriaPopover
            className="mrg-dropdown-menu__popover"
            containerPadding={12}
            data-slot="dropdown-menu-submenu-popover"
            offset={6}
            placement="right top"
            shouldFlip
          >
            <LayerManager.Layer active dismissible={false} id={`${layerId}-${item.id}`}>
              <AriaMenu
                aria-label={item.label}
                className="mrg-dropdown-menu__content"
                data-slot="dropdown-menu-submenu"
              >
                <MenuItems
                  confirmDestructiveActions={confirmDestructiveActions}
                  confirmationId={confirmationId}
                  items={item.items}
                  layerId={layerId}
                  {...(onAction === undefined ? {} : { onAction })}
                  onConfirmationChange={onConfirmationChange}
                />
              </AriaMenu>
            </LayerManager.Layer>
          </AriaPopover>
        </AriaSubmenuTrigger>
      );
    }

    const handleAction = (): void => {
      if (requiresConfirmation && !confirming) {
        onConfirmationChange(item.id);
        return;
      }
      if (isAction) item.onAction?.();
      onAction?.(item.id);
      onConfirmationChange(null);
    };

    return (
      <AriaMenuItem
        {...(item.kind === "link" ? { href: item.href, target: item.target } : {})}
        className="mrg-dropdown-menu__item"
        data-confirming={confirming || undefined}
        data-intent={destructive ? "destructive" : "default"}
        data-slot="dropdown-menu-item"
        id={item.id}
        {...(item.disabled === undefined ? {} : { isDisabled: item.disabled })}
        key={item.id}
        onAction={handleAction}
        shouldCloseOnSelect={!requiresConfirmation || confirming}
        textValue={item.label}
      >
        {content}
      </AriaMenuItem>
    );
  });
}

export const DropdownMenu = forwardRef<HTMLButtonElement, DropdownMenuProps>(function DropdownMenu(
  {
    className,
    confirmDestructiveActions = false,
    defaultOpen = false,
    defaultSelectedIds = [],
    direction,
    disabled = false,
    emptyContent = "No actions available",
    items,
    label,
    menuLabel,
    onAction,
    onOpenChange,
    onSelectionChange,
    open,
    placement = "start",
    selectedIds,
    selectionMode = "none",
    selectionSummary = false,
    selectionSummaryLabel = (count) => `${count} ${count === 1 ? "option" : "options"} selected`,
    triggerProps,
    triggerRole = "button",
    ...nativeProps
  },
  forwardedRef,
) {
  assertMenu(items, menuLabel);
  const layerId = `mrg-dropdown-menu-${useId().replaceAll(":", "")}`;
  const inheritedDirection = useDirection();
  const { locale } = useMergoraContext();
  const resolvedDirection = direction ?? inheritedDirection;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [uncontrolledSelectedIds, setUncontrolledSelectedIds] =
    useState<readonly string[]>(defaultSelectedIds);
  const [confirmationId, setConfirmationId] = useState<string | null>(null);
  const isOpen = open ?? uncontrolledOpen;
  const currentSelectedIds =
    selectionMode === "none" ? [] : (selectedIds ?? uncontrolledSelectedIds);
  const availableIds = useMemo(() => selectableIds(items), [items]);
  const placementValue =
    placement === "start"
      ? resolvedDirection === "rtl"
        ? "bottom right"
        : "bottom left"
      : resolvedDirection === "rtl"
        ? "bottom left"
        : "bottom right";
  const {
    className: triggerClassName,
    onKeyDown: triggerOnKeyDown,
    ...nativeTriggerProps
  } = triggerProps ?? {};
  const triggerRef = (node: HTMLButtonElement | null): void => {
    if (node !== null && triggerRole === "menuitem") node.setAttribute("role", "menuitem");
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef !== null) forwardedRef.current = node;
  };

  const updateOpen = (nextOpen: boolean): void => {
    if (open === undefined) setUncontrolledOpen(nextOpen);
    if (!nextOpen) setConfirmationId(null);
    onOpenChange?.(nextOpen);
  };

  return (
    <AriaI18nProvider locale={locale}>
      <LayerManager.Provider>
        <span
          {...nativeProps}
          className={classes("mrg-dropdown-menu", className)}
          data-open={isOpen || undefined}
          data-slot="dropdown-menu"
          dir={resolvedDirection}
          lang={locale}
        >
          <AriaMenuTrigger isOpen={isOpen} onOpenChange={updateOpen}>
            <AriaButton
              {...(nativeTriggerProps as unknown as AriaButtonProps)}
              {...(triggerOnKeyDown === undefined ? {} : { onKeyDown: triggerOnKeyDown })}
              ref={triggerRef}
              className={classes("mrg-dropdown-menu__trigger", triggerClassName)}
              data-slot="dropdown-menu-trigger"
              isDisabled={disabled}
            >
              <span data-slot="dropdown-menu-trigger-label">{label}</span>
              <span aria-hidden="true" data-slot="dropdown-menu-trigger-indicator">
                ▾
              </span>
            </AriaButton>
            <AriaPopover
              className="mrg-dropdown-menu__popover"
              containerPadding={12}
              data-slot="dropdown-menu-popover"
              offset={8}
              placement={placementValue}
              shouldFlip
            >
              <LayerManager.Layer active dismissible={false} id={`${layerId}-layer`}>
                <AriaMenu
                  ref={(node) => {
                    if (node === null) return;
                    node.setAttribute("aria-label", menuLabel);
                    node.removeAttribute("aria-labelledby");
                  }}
                  aria-label={menuLabel}
                  className="mrg-dropdown-menu__content"
                  data-slot="dropdown-menu-content"
                  onSelectionChange={(selection) => {
                    if (selectionMode === "none") return;
                    const next =
                      selection === "all" ? availableIds : [...selection].map((id) => String(id));
                    if (selectedIds === undefined) setUncontrolledSelectedIds(next);
                    onSelectionChange?.(next);
                  }}
                  renderEmptyState={() => (
                    <div className="mrg-dropdown-menu__empty" data-slot="dropdown-menu-empty">
                      {emptyContent}
                    </div>
                  )}
                  selectedKeys={new Set(currentSelectedIds)}
                  selectionMode={selectionMode}
                  shouldCloseOnSelect={selectionMode !== "multiple"}
                >
                  <MenuItems
                    confirmDestructiveActions={confirmDestructiveActions}
                    confirmationId={confirmationId}
                    items={items}
                    layerId={layerId}
                    {...(onAction === undefined ? {} : { onAction })}
                    onConfirmationChange={setConfirmationId}
                  />
                </AriaMenu>
                {selectionSummary && selectionMode !== "none" ? (
                  <output
                    aria-live="polite"
                    className="mrg-dropdown-menu__summary"
                    data-slot="dropdown-menu-selection-summary"
                  >
                    {selectionSummaryLabel(currentSelectedIds.length)}
                  </output>
                ) : null}
              </LayerManager.Layer>
            </AriaPopover>
          </AriaMenuTrigger>
        </span>
      </LayerManager.Provider>
    </AriaI18nProvider>
  );
});

DropdownMenu.displayName = "DropdownMenu";
