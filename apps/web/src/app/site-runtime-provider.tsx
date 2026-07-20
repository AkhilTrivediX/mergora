"use client";

import { MergoraProvider } from "mergora-ui/provider";
import { useEffect, useState, type ReactNode } from "react";

import {
  DEFAULT_SITE_PREFERENCES,
  parseSitePreferences,
  readSitePreferences,
  SITE_PREFERENCES_EVENT,
  SITE_PREFERENCE_STORAGE_KEYS,
  type SitePreferences,
} from "./site-preferences";

export function SiteRuntimeProvider({ children }: { readonly children: ReactNode }) {
  const [preferences, setPreferences] = useState<SitePreferences>(DEFAULT_SITE_PREFERENCES);

  useEffect(() => {
    setPreferences(readSitePreferences(window.localStorage));
    const updateFromControls = (event: Event) => {
      const next = parseSitePreferences(
        (event as CustomEvent<{ readonly preferences?: unknown }>).detail?.preferences,
      );
      if (next !== null) setPreferences(next);
    };
    const updateFromStorage = (event: StorageEvent) => {
      if (
        event.storageArea !== window.localStorage ||
        (event.key !== null &&
          !(Object.values(SITE_PREFERENCE_STORAGE_KEYS) as readonly string[]).includes(event.key))
      ) {
        return;
      }
      setPreferences(readSitePreferences(window.localStorage));
    };
    window.addEventListener(SITE_PREFERENCES_EVENT, updateFromControls);
    window.addEventListener("storage", updateFromStorage);
    return () => {
      window.removeEventListener(SITE_PREFERENCES_EVENT, updateFromControls);
      window.removeEventListener("storage", updateFromStorage);
    };
  }, []);

  return (
    <MergoraProvider
      className="site-runtime-provider"
      density={preferences.density}
      direction={preferences.direction}
      locale="en-US"
      reducedMotion={preferences.motion === "reduced" ? "reduce" : "system"}
    >
      {children}
    </MergoraProvider>
  );
}
