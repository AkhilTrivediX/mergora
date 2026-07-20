"use client";

import {
  Fragment,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useId,
  type ReactNode,
  type Ref,
} from "react";
import { I18nProvider as AriaI18nProvider } from "react-aria-components/I18nProvider";
import {
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  TabPanels as AriaTabPanels,
  Tabs as AriaTabs,
  type TabListProps as AriaTabListProps,
  type TabPanelProps as AriaTabPanelProps,
  type TabPanelsProps as AriaTabPanelsProps,
  type TabProps as AriaTabProps,
  type TabsProps as AriaTabsProps,
  TabListStateContext as AriaTabListStateContext,
} from "react-aria-components/Tabs";

import { useDirection, type DirectionValue } from "../direction/index.js";
import "./tabs.css";

export type TabsActivationMode = "automatic" | "manual";
export type TabsOrientation = "horizontal" | "vertical";

interface TabsDirectionContextValue {
  readonly direction: DirectionValue;
}

const TabsDirectionContext = createContext<TabsDirectionContextValue | null>(null);

function hasAccessibleContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasAccessibleContent);
  if (isValidElement<{ readonly children?: ReactNode }>(value)) {
    if (value.type === Fragment) return hasAccessibleContent(value.props.children);
    return typeof value.type === "string" ? hasAccessibleContent(value.props.children) : true;
  }
  return true;
}

function setForwardedRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref !== null && ref !== undefined) ref.current = value;
}

export interface TabsRootProps extends Omit<
  AriaTabsProps,
  | "children"
  | "className"
  | "defaultSelectedKey"
  | "disabledKeys"
  | "keyboardActivation"
  | "onSelectionChange"
  | "orientation"
  | "selectedKey"
> {
  /** Chooses focus-following selection or explicit Enter and Space activation. */
  readonly activationMode?: TabsActivationMode;
  /** List and panel parts owned by this tab system. */
  readonly children: ReactNode;
  /** Initial selected tab identifier for uncontrolled use. */
  readonly defaultValue?: string;
  /** Direction used for horizontal spatial arrow-key behavior. */
  readonly direction?: DirectionValue;
  /** Unique tab identifiers removed from selection and focus movement. */
  readonly disabledValues?: readonly string[];
  /** Reports the newly selected tab identifier. */
  readonly onValueChange?: (value: string) => void;
  /** Axis used for tab layout and arrow-key movement. */
  readonly orientation?: TabsOrientation;
  /** Controlled selected tab identifier; pair with onValueChange. */
  readonly value?: string;
}

function assertTabKey(value: string | undefined, name: string): void {
  if (value !== undefined && value.trim().length === 0) {
    throw new Error(`Mergora Tabs ${name} must be a non-empty string.`);
  }
}

export function isSafeTabHref(href: string): boolean {
  const normalized = href.trim().toLowerCase();
  return normalized.length > 0 && !/^(?:data|javascript|vbscript):/u.test(normalized);
}

export const TabsRoot = forwardRef<HTMLDivElement, TabsRootProps>(function TabsRoot(
  {
    activationMode = "automatic",
    children,
    defaultValue,
    direction,
    disabledValues = [],
    onValueChange,
    orientation = "horizontal",
    value,
    ...props
  },
  ref,
) {
  assertTabKey(value, "value");
  assertTabKey(defaultValue, "defaultValue");
  for (const disabledValue of disabledValues) assertTabKey(disabledValue, "disabledValues entry");
  if (new Set(disabledValues).size !== disabledValues.length) {
    throw new Error("Mergora Tabs disabledValues must be unique.");
  }
  const inheritedDirection = useDirection();
  const resolvedDirection = direction ?? inheritedDirection;

  return (
    <TabsDirectionContext.Provider value={{ direction: resolvedDirection }}>
      <AriaTabs
        {...props}
        {...(defaultValue === undefined ? {} : { defaultSelectedKey: defaultValue })}
        {...(value === undefined ? {} : { selectedKey: value })}
        className="mrg-tabs"
        data-activation={activationMode}
        data-slot="tabs"
        dir={resolvedDirection}
        disabledKeys={disabledValues}
        keyboardActivation={activationMode}
        onSelectionChange={(key) => onValueChange?.(String(key))}
        orientation={orientation}
        ref={ref}
      >
        {children}
      </AriaTabs>
    </TabsDirectionContext.Provider>
  );
});

TabsRoot.displayName = "TabsRoot";

export interface TabsListProps extends Omit<
  AriaTabListProps<unknown>,
  "aria-label" | "children" | "className"
> {
  /** Tab parts rendered inside this labelled tablist. */
  readonly children: ReactNode;
  /** Optional visible keyboard discovery text linked to the tablist description. */
  readonly keyboardHint?: ReactNode;
  /** Non-empty accessible name applied to the tablist. */
  readonly label: string;
}

export const TabsList = forwardRef<HTMLDivElement, TabsListProps>(function TabsList(
  { "aria-describedby": ariaDescribedBy, children, keyboardHint, label, ...props },
  ref,
) {
  const context = useContext(TabsDirectionContext);
  if (context === null) throw new Error("Mergora Tabs.List requires Tabs.Root.");
  if (label.trim().length === 0) throw new Error("Mergora Tabs.List label must be non-empty.");
  // React Aria derives horizontal arrow behavior from its I18n context. This private provider is
  // scoped to the tab list so explicit direction remains independent from the content locale.
  const directionLocale = context.direction === "rtl" ? "ar-EG" : "en-US";
  const hintId = `mrg-tabs-hint-${useId().replaceAll(":", "")}`;
  const hasKeyboardHint = hasAccessibleContent(keyboardHint);
  const describedBy = [ariaDescribedBy, hasKeyboardHint ? hintId : undefined]
    .filter((candidate): candidate is string => candidate !== undefined && candidate.length > 0)
    .join(" ");
  const collectionState = useContext(AriaTabListStateContext);
  const setListElement = useCallback(
    (element: HTMLDivElement | null) => {
      setForwardedRef(ref, element);
      if (element === null) return;
      if (describedBy.length === 0) element.removeAttribute("aria-describedby");
      else element.setAttribute("aria-describedby", describedBy);
    },
    [describedBy, ref],
  );
  return (
    <AriaI18nProvider locale={directionLocale}>
      <>
        <AriaTabList
          {...props}
          {...(describedBy.length === 0 ? {} : { "aria-describedby": describedBy })}
          aria-label={label}
          className="mrg-tabs__list"
          data-slot="tabs-list"
          ref={setListElement}
        >
          {children}
        </AriaTabList>
        {hasKeyboardHint && collectionState !== null ? (
          <span className="mrg-tabs__keyboard-hint" data-slot="tabs-keyboard-hint" id={hintId}>
            {keyboardHint}
          </span>
        ) : null}
      </>
    </AriaI18nProvider>
  );
});

TabsList.displayName = "TabsList";

export interface TabsTabProps extends Omit<AriaTabProps, "children" | "className" | "id"> {
  /** Visible tab name rendered inside the selectable tab. */
  readonly children: ReactNode;
  /** Stable non-empty identifier shared with its tab panel. */
  readonly value: string;
}

export const TabsTab = forwardRef<HTMLDivElement, TabsTabProps>(function TabsTab(
  { children, href, value, ...props },
  ref,
) {
  assertTabKey(value, "Tab value");
  if (href !== undefined && !isSafeTabHref(href)) {
    throw new Error("Mergora Tabs.Tab href uses a prohibited navigation protocol.");
  }
  return (
    <AriaTab
      {...props}
      {...(href === undefined ? {} : { href })}
      className="mrg-tabs__tab"
      data-slot="tabs-tab"
      id={value}
      ref={ref}
    >
      {children}
    </AriaTab>
  );
});

TabsTab.displayName = "TabsTab";

export interface TabsPanelsProps extends Omit<
  AriaTabPanelsProps<unknown>,
  "children" | "className"
> {
  /** Tab panel parts managed by the parent tab system. */
  readonly children: ReactNode;
}

export const TabsPanels = forwardRef<HTMLDivElement, TabsPanelsProps>(function TabsPanels(
  { children, ...props },
  ref,
) {
  return (
    <AriaTabPanels {...props} className="mrg-tabs__panels" data-slot="tabs-panels" ref={ref}>
      {children}
    </AriaTabPanels>
  );
});

TabsPanels.displayName = "TabsPanels";

export interface TabsPanelProps extends Omit<AriaTabPanelProps, "children" | "className" | "id"> {
  /** Content associated with the matching tab identifier. */
  readonly children: ReactNode;
  /** Stable non-empty identifier shared with its tab. */
  readonly value: string;
}

export const TabsPanel = forwardRef<HTMLDivElement, TabsPanelProps>(function TabsPanel(
  { children, value, ...props },
  ref,
) {
  assertTabKey(value, "Panel value");
  return (
    <AriaTabPanel
      {...props}
      className="mrg-tabs__panel"
      data-slot="tabs-panel"
      id={value}
      ref={ref}
    >
      {children}
    </AriaTabPanel>
  );
});

TabsPanel.displayName = "TabsPanel";

export const Tabs = {
  List: TabsList,
  Panel: TabsPanel,
  Panels: TabsPanels,
  Root: TabsRoot,
  Tab: TabsTab,
} as const;
