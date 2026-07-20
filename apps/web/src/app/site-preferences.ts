export const SITE_PREFERENCE_STORAGE_KEYS = {
  density: "mergora.site.density.v1",
  direction: "mergora.site.direction.v1",
  motion: "mergora.site.motion.v1",
  theme: "mergora.site.theme.v1",
} as const;
export const SITE_PREFERENCES_EVENT = "mergora:site-preferences-change";

export type SiteDensityPreference = "comfortable" | "compact" | "touch";
export type SiteDirectionPreference = "ltr" | "rtl";
export type SiteMotionPreference = "reduced" | "system";
export type SiteResolvedTheme = "dark" | "light";
export type SiteThemePreference = SiteResolvedTheme | "system";
export type SitePreferenceName = keyof typeof SITE_PREFERENCE_STORAGE_KEYS;

export interface SitePreferences {
  readonly density: SiteDensityPreference;
  readonly direction: SiteDirectionPreference;
  readonly motion: SiteMotionPreference;
  readonly theme: SiteThemePreference;
}

export const DEFAULT_SITE_PREFERENCES: SitePreferences = Object.freeze({
  density: "comfortable",
  direction: "ltr",
  motion: "system",
  theme: "system",
});

export function parseSitePreferences(value: unknown): SitePreferences | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Partial<SitePreferences>;
  if (
    (candidate.density !== "comfortable" &&
      candidate.density !== "compact" &&
      candidate.density !== "touch") ||
    (candidate.direction !== "ltr" && candidate.direction !== "rtl") ||
    (candidate.motion !== "system" && candidate.motion !== "reduced") ||
    (candidate.theme !== "system" && candidate.theme !== "light" && candidate.theme !== "dark")
  ) {
    return null;
  }
  return {
    density: candidate.density,
    direction: candidate.direction,
    motion: candidate.motion,
    theme: candidate.theme,
  };
}

interface PreferenceRoot {
  readonly dataset: DOMStringMap;
  dir: string;
  readonly style: Pick<CSSStyleDeclaration, "colorScheme">;
}

function storedValue<Value extends string>(
  storage: Pick<Storage, "getItem">,
  key: string,
  allowed: readonly Value[],
  fallback: Value,
): Value {
  const value = storage.getItem(key);
  return value !== null && allowed.includes(value as Value) ? (value as Value) : fallback;
}

export function readSitePreferences(storage: Pick<Storage, "getItem">): SitePreferences {
  try {
    return {
      density: storedValue(
        storage,
        SITE_PREFERENCE_STORAGE_KEYS.density,
        ["comfortable", "compact", "touch"],
        DEFAULT_SITE_PREFERENCES.density,
      ),
      direction: storedValue(
        storage,
        SITE_PREFERENCE_STORAGE_KEYS.direction,
        ["ltr", "rtl"],
        DEFAULT_SITE_PREFERENCES.direction,
      ),
      motion: storedValue(
        storage,
        SITE_PREFERENCE_STORAGE_KEYS.motion,
        ["system", "reduced"],
        DEFAULT_SITE_PREFERENCES.motion,
      ),
      theme: storedValue(
        storage,
        SITE_PREFERENCE_STORAGE_KEYS.theme,
        ["system", "light", "dark"],
        DEFAULT_SITE_PREFERENCES.theme,
      ),
    };
  } catch {
    return DEFAULT_SITE_PREFERENCES;
  }
}

export function applySiteTheme(
  root: PreferenceRoot,
  preference: SiteThemePreference,
  prefersDark: boolean,
): SiteResolvedTheme {
  const resolved = preference === "system" ? (prefersDark ? "dark" : "light") : preference;
  if (preference === "system") {
    delete root.dataset.theme;
    root.style.colorScheme = "light dark";
  } else {
    root.dataset.theme = preference;
    root.style.colorScheme = preference;
  }
  root.dataset.themePreference = preference;
  return resolved;
}

export function applySitePreferences(
  root: PreferenceRoot,
  preferences: SitePreferences,
  prefersDark: boolean,
): SiteResolvedTheme {
  const resolvedTheme = applySiteTheme(root, preferences.theme, prefersDark);
  root.dataset.density = preferences.density;
  root.dataset.densityPreference = preferences.density;
  root.dataset.direction = preferences.direction;
  root.dataset.directionPreference = preferences.direction;
  root.dataset.motionPreference = preferences.motion;
  root.dir = preferences.direction;
  if (preferences.motion === "reduced") root.dataset.motion = "reduced";
  else delete root.dataset.motion;
  return resolvedTheme;
}

export function persistSitePreference<Name extends SitePreferenceName>(
  storage: Pick<Storage, "setItem">,
  name: Name,
  value: SitePreferences[Name],
): boolean {
  try {
    storage.setItem(SITE_PREFERENCE_STORAGE_KEYS[name], value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs in the document head before React hydration. Values are fixed enumerations, so no stored
 * text is ever evaluated or interpolated into markup.
 */
export function sitePreferenceBootstrap(): string {
  const keys = JSON.stringify(SITE_PREFERENCE_STORAGE_KEYS);
  return `(()=>{const r=document.documentElement,k=${keys};r.dataset.siteScript="true";const g=(n,a,f)=>{try{const v=localStorage.getItem(k[n]);return a.includes(v)?v:f}catch{return f}},t=g("theme",["system","light","dark"],"system"),d=g("density",["comfortable","compact","touch"],"comfortable"),i=g("direction",["ltr","rtl"],"ltr"),m=g("motion",["system","reduced"],"system");r.dataset.themePreference=t;if(t==="system"){delete r.dataset.theme;r.style.colorScheme="light dark"}else{r.dataset.theme=t;r.style.colorScheme=t}r.dataset.density=d;r.dataset.densityPreference=d;r.dataset.direction=i;r.dataset.directionPreference=i;r.dir=i;r.dataset.motionPreference=m;if(m==="reduced")r.dataset.motion="reduced";else delete r.dataset.motion})()`;
}
