"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { INSTALL_BASKET_EVENT, readInstallBasket } from "./install-basket";
import { SiteLink as Link } from "./site-link";
import type { LocalDataClearResult } from "./site-local-data";
import {
  applySitePreferences,
  applySiteTheme,
  DEFAULT_SITE_PREFERENCES,
  persistSitePreference,
  readSitePreferences,
  SITE_PREFERENCES_EVENT,
  SITE_PREFERENCE_STORAGE_KEYS,
  type SitePreferenceName,
  type SitePreferences,
  type SiteThemePreference,
} from "./site-preferences";
import { SiteSearchTrigger } from "./site-search";
import { SiteShellDrawer } from "./site-shell-drawer";
import { navigationIsCurrent, type NavigationItem } from "./site-shell-model";
import { SiteVersionControl } from "./site-version-control";

export const SITE_THEME_EVENT = "mergora:site-theme-change";
export { SITE_PREFERENCES_EVENT };
export { navigationIsCurrent, type NavigationItem } from "./site-shell-model";

function prefersDarkTheme(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function SiteControls({ navigation }: { navigation: readonly NavigationItem[] }) {
  const pathname = usePathname();
  const [preferences, setPreferences] = useState<SitePreferences>(DEFAULT_SITE_PREFERENCES);
  const preferencesRef = useRef<SitePreferences>(DEFAULT_SITE_PREFERENCES);
  const [basketCount, setBasketCount] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.siteScript = "true";
    const initial = readSitePreferences(window.localStorage);
    preferencesRef.current = initial;
    setPreferences(initial);
    applySitePreferences(document.documentElement, initial, prefersDarkTheme());
    setBasketCount(readInstallBasket().length);

    const updateBasket = (event: Event) => {
      const count = (event as CustomEvent<{ readonly count?: unknown }>).detail?.count;
      setBasketCount(typeof count === "number" && Number.isSafeInteger(count) ? count : 0);
    };
    const updateTheme = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          readonly preference?: unknown;
          readonly theme?: unknown;
        }>
      ).detail;
      const candidate = detail?.preference ?? detail?.theme;
      if (candidate !== "light" && candidate !== "dark" && candidate !== "system") return;
      const next: SitePreferences = { ...preferencesRef.current, theme: candidate };
      preferencesRef.current = next;
      setPreferences(next);
      applySiteTheme(document.documentElement, candidate, prefersDarkTheme());
    };
    const updateSystemTheme = () => {
      if (preferencesRef.current.theme !== "system") return;
      const theme = applySiteTheme(document.documentElement, "system", prefersDarkTheme());
      window.dispatchEvent(
        new CustomEvent(SITE_THEME_EVENT, {
          detail: { preference: "system", source: "system", theme },
        }),
      );
    };
    const updateFromStorage = (event: StorageEvent) => {
      if (
        event.storageArea !== window.localStorage ||
        (event.key !== null &&
          !(Object.values(SITE_PREFERENCE_STORAGE_KEYS) as readonly string[]).includes(event.key))
      ) {
        return;
      }
      const next = readSitePreferences(window.localStorage);
      preferencesRef.current = next;
      setPreferences(next);
      applySitePreferences(document.documentElement, next, prefersDarkTheme());
    };
    const systemPreference = window.matchMedia("(prefers-color-scheme: dark)");
    window.addEventListener(INSTALL_BASKET_EVENT, updateBasket);
    window.addEventListener(SITE_THEME_EVENT, updateTheme);
    window.addEventListener("storage", updateFromStorage);
    systemPreference.addEventListener("change", updateSystemTheme);
    return () => {
      window.removeEventListener(INSTALL_BASKET_EVENT, updateBasket);
      window.removeEventListener(SITE_THEME_EVENT, updateTheme);
      window.removeEventListener("storage", updateFromStorage);
      systemPreference.removeEventListener("change", updateSystemTheme);
    };
  }, []);

  const changePreference = <Name extends SitePreferenceName>(
    name: Name,
    value: SitePreferences[Name],
  ) => {
    const next = { ...preferencesRef.current, [name]: value } as SitePreferences;
    preferencesRef.current = next;
    setPreferences(next);
    const resolvedTheme = applySitePreferences(document.documentElement, next, prefersDarkTheme());
    persistSitePreference(window.localStorage, name, value);
    window.dispatchEvent(
      new CustomEvent(SITE_PREFERENCES_EVENT, {
        detail: { name, preference: value, preferences: next, source: "site-controls" },
      }),
    );
    if (name === "theme") {
      window.dispatchEvent(
        new CustomEvent(SITE_THEME_EVENT, {
          detail: {
            preference: value as SiteThemePreference,
            source: "site-controls",
            theme: resolvedTheme,
          },
        }),
      );
    }
  };

  const localDataCleared = (result: LocalDataClearResult) => {
    if (result.failed.length === 0) {
      preferencesRef.current = DEFAULT_SITE_PREFERENCES;
      setPreferences(DEFAULT_SITE_PREFERENCES);
      applySitePreferences(document.documentElement, DEFAULT_SITE_PREFERENCES, prefersDarkTheme());
      setBasketCount(0);
      window.dispatchEvent(
        new CustomEvent(INSTALL_BASKET_EVENT, { detail: { count: 0, items: [] } }),
      );
      window.dispatchEvent(
        new CustomEvent(SITE_PREFERENCES_EVENT, {
          detail: {
            preferences: DEFAULT_SITE_PREFERENCES,
            source: "local-data-reset",
          },
        }),
      );
      return;
    }
    const restored = readSitePreferences(window.localStorage);
    preferencesRef.current = restored;
    setPreferences(restored);
    applySitePreferences(document.documentElement, restored, prefersDarkTheme());
    setBasketCount(readInstallBasket().length);
  };

  return (
    <div className="site-shell-actions">
      <div className="site-utilities">
        <Link
          aria-current={navigationIsCurrent(pathname, "/quality") ? "page" : undefined}
          className="site-utility-link"
          href="/quality"
        >
          Quality
        </Link>
        <SiteVersionControl />
        <SiteSearchTrigger aria-label="Search Mergora" className="site-search-link">
          <span>Search</span>
          <kbd aria-hidden="true">⌘ K</kbd>
        </SiteSearchTrigger>
        <Link
          aria-label={`Install basket, ${basketCount} ${basketCount === 1 ? "item" : "items"}`}
          className="site-basket-link"
          href="/components#install-basket"
        >
          Install <span aria-hidden="true">{basketCount}</span>
        </Link>
        <a
          aria-label="Mergora GitHub repository on github.com"
          className="site-utility-link"
          href="https://github.com/AkhilTrivediX/mergora"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>
      <SiteShellDrawer
        basketCount={basketCount}
        navigation={navigation}
        onLocalDataCleared={localDataCleared}
        onPreferenceChange={changePreference}
        pathname={pathname}
        preferences={preferences}
      />
    </div>
  );
}
