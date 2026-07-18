"use client";

import { createContext, forwardRef, useContext, type ReactNode } from "react";
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
} from "react-aria-components/Tabs";

import { useDirection, type DirectionValue } from "../direction/index.js";
import "./tabs.css";

export type TabsActivationMode = "automatic" | "manual";
export type TabsOrientation = "horizontal" | "vertical";

interface TabsDirectionContextValue {
  readonly direction: DirectionValue;
}

const TabsDirectionContext = createContext<TabsDirectionContextValue | null>(null);

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
  readonly activationMode?: TabsActivationMode;
  readonly children: ReactNode;
  readonly defaultValue?: string;
  readonly direction?: DirectionValue;
  readonly disabledValues?: readonly string[];
  readonly onValueChange?: (value: string) => void;
  readonly orientation?: TabsOrientation;
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
  readonly children: ReactNode;
  readonly label: string;
}

export const TabsList = forwardRef<HTMLDivElement, TabsListProps>(function TabsList(
  { children, label, ...props },
  ref,
) {
  const context = useContext(TabsDirectionContext);
  if (context === null) throw new Error("Mergora Tabs.List requires Tabs.Root.");
  if (label.trim().length === 0) throw new Error("Mergora Tabs.List label must be non-empty.");
  // React Aria derives horizontal arrow behavior from its I18n context. This private provider is
  // scoped to the tab list so explicit direction remains independent from the content locale.
  const directionLocale = context.direction === "rtl" ? "ar-EG" : "en-US";
  return (
    <AriaI18nProvider locale={directionLocale}>
      <AriaTabList
        {...props}
        aria-label={label}
        className="mrg-tabs__list"
        data-slot="tabs-list"
        ref={ref}
      >
        {children}
      </AriaTabList>
    </AriaI18nProvider>
  );
});

TabsList.displayName = "TabsList";

export interface TabsTabProps extends Omit<AriaTabProps, "children" | "className" | "id"> {
  readonly children: ReactNode;
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
  readonly children: ReactNode;
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
