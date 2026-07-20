"use client";

import { MergoraProvider } from "mergora-ui/provider";
import { Sheet } from "mergora-ui/sheet";
import { useEffect, useState } from "react";

import { SiteLink as Link } from "./site-link";
import { SiteLocalDataReset } from "./site-local-data-reset";
import type { LocalDataClearResult } from "./site-local-data";
import type {
  SiteDensityPreference,
  SiteDirectionPreference,
  SiteMotionPreference,
  SitePreferenceName,
  SitePreferences,
  SiteThemePreference,
} from "./site-preferences";
import { navigationIsCurrent, type NavigationItem } from "./site-shell-model";
import { SiteSearchTrigger } from "./site-search";

interface SiteShellDrawerProps {
  readonly basketCount: number;
  readonly navigation: readonly NavigationItem[];
  readonly onLocalDataCleared: (result: LocalDataClearResult) => void;
  readonly onPreferenceChange: <Name extends SitePreferenceName>(
    name: Name,
    value: SitePreferences[Name],
  ) => void;
  readonly pathname: string;
  readonly preferences: SitePreferences;
}

function releaseSiteDrawerIsolation(): void {
  const applicationRoot = document.querySelector<HTMLElement>("#site-application-root");
  if (applicationRoot?.dataset.siteDrawerIsolated === "true") {
    applicationRoot.inert = false;
    delete applicationRoot.dataset.siteDrawerIsolated;
  }
  delete document.documentElement.dataset.siteDrawerOpen;
}

function SitePreferenceFields({
  onPreferenceChange,
  preferences,
}: Pick<SiteShellDrawerProps, "onPreferenceChange" | "preferences">) {
  return (
    <div className="site-preference-fields">
      <label>
        Site theme
        <select
          onChange={(event) =>
            onPreferenceChange("theme", event.currentTarget.value as SiteThemePreference)
          }
          value={preferences.theme}
        >
          <option value="system">System theme</option>
          <option value="light">Light theme</option>
          <option value="dark">Dark theme</option>
        </select>
      </label>
      <label>
        Interface density
        <select
          onChange={(event) =>
            onPreferenceChange("density", event.currentTarget.value as SiteDensityPreference)
          }
          value={preferences.density}
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
          <option value="touch">Touch</option>
        </select>
      </label>
      <label>
        Layout direction
        <select
          onChange={(event) =>
            onPreferenceChange("direction", event.currentTarget.value as SiteDirectionPreference)
          }
          value={preferences.direction}
        >
          <option value="ltr">Left to right</option>
          <option value="rtl">Right to left</option>
        </select>
      </label>
      <label>
        Motion
        <select
          onChange={(event) =>
            onPreferenceChange("motion", event.currentTarget.value as SiteMotionPreference)
          }
          value={preferences.motion}
        >
          <option value="system">Follow system</option>
          <option value="reduced">Reduce motion</option>
        </select>
      </label>
      <p className="site-preference-fields__locale">
        Site messages currently ship in English. Direction is an independent layout and bidi review
        control; no unshipped locale is implied.
      </p>
    </div>
  );
}

export function SiteShellDrawer({
  basketCount,
  navigation,
  onLocalDataCleared,
  onPreferenceChange,
  pathname,
  preferences,
}: SiteShellDrawerProps) {
  const [open, setOpen] = useState(false);

  const changeOpen = (next: boolean) => {
    if (!next) releaseSiteDrawerIsolation();
    setOpen(next);
  };

  useEffect(() => {
    if (!open) return;
    const applicationRoot = document.querySelector<HTMLElement>("#site-application-root");
    const documentRoot = document.documentElement;
    if (applicationRoot !== null) {
      applicationRoot.inert = true;
      applicationRoot.dataset.siteDrawerIsolated = "true";
    }
    documentRoot.dataset.siteDrawerOpen = "true";
    return releaseSiteDrawerIsolation;
  }, [open]);

  const closeForNavigation = () => changeOpen(false);

  return (
    <MergoraProvider
      className="site-shell-drawer-host"
      density={preferences.density}
      direction={preferences.direction}
      locale="en-US"
      reducedMotion={preferences.motion === "reduced" ? "reduce" : "system"}
    >
      <Sheet.Root onOpenChange={changeOpen} open={open} side="end" size="sm">
        <Sheet.Trigger aria-label="Open Menu and Preferences" className="site-shell-drawer-trigger">
          <span className="site-shell-drawer-trigger__mobile">Menu</span>
          <span className="site-shell-drawer-trigger__desktop">Preferences</span>
        </Sheet.Trigger>
        <Sheet.Overlay className="site-shell-drawer-overlay">
          <Sheet.Content className="site-shell-drawer" initialFocus="first-interactive">
            <Sheet.Header className="site-shell-drawer__header">
              <Sheet.Title>Navigation and preferences</Sheet.Title>
              <Sheet.Close aria-label="Close navigation and preferences">Close</Sheet.Close>
            </Sheet.Header>
            <Sheet.Description>
              Move through Mergora, search the catalog, or set browser-local display preferences.
            </Sheet.Description>

            <nav aria-label="Mobile primary" className="site-shell-drawer__navigation">
              {navigation.map(([label, href]) => (
                <Link
                  aria-current={navigationIsCurrent(pathname, href) ? "page" : undefined}
                  href={href}
                  key={href}
                  onClick={closeForNavigation}
                >
                  {label}
                </Link>
              ))}
            </nav>

            <section aria-labelledby="site-drawer-tools-title" className="site-shell-drawer__tools">
              <h3 id="site-drawer-tools-title">Tools and evidence</h3>
              <SiteSearchTrigger>Search catalog</SiteSearchTrigger>
              <Link
                aria-current={navigationIsCurrent(pathname, "/quality") ? "page" : undefined}
                href="/quality"
                onClick={closeForNavigation}
              >
                Quality evidence
              </Link>
              <Link href="/releases/unreleased" onClick={closeForNavigation}>
                Docs 0.0.0 · unreleased checkpoint
              </Link>
              <Link href="/docs/migrations" onClick={closeForNavigation}>
                Upgrade and migration guidance
              </Link>
              <Link href="/components#install-basket" onClick={closeForNavigation}>
                Open install basket ({basketCount})
              </Link>
              <a
                aria-label="Mergora GitHub repository on github.com"
                href="https://github.com/AkhilTrivediX/mergora"
                onClick={closeForNavigation}
                rel="noreferrer"
              >
                GitHub repository
              </a>
            </section>

            <section
              aria-labelledby="site-drawer-preferences-title"
              className="site-shell-drawer__preferences"
            >
              <h3 id="site-drawer-preferences-title">Display preferences</h3>
              <SitePreferenceFields
                onPreferenceChange={onPreferenceChange}
                preferences={preferences}
              />
            </section>

            <SiteLocalDataReset onCleared={onLocalDataCleared} />
          </Sheet.Content>
        </Sheet.Overlay>
      </Sheet.Root>

      <noscript>
        <details className="site-no-script-navigation">
          <summary>Menu</summary>
          <nav aria-label="No-script primary">
            {navigation.map(([label, href]) => (
              <Link href={href} key={href}>
                {label}
              </Link>
            ))}
            <Link href="/quality">Quality evidence</Link>
            <a href="https://github.com/AkhilTrivediX/mergora">GitHub repository</a>
          </nav>
        </details>
      </noscript>
    </MergoraProvider>
  );
}
