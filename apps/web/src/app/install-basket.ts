export const INSTALL_BASKET_EVENT = "mergora:install-basket-change";
export const INSTALL_BASKET_KEY = "mergora.install-basket.v2";
const LEGACY_INSTALL_BASKET_KEY = "mergora.install-basket.v1";
const BASKET_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_BASKET_ITEMS = 100;
const MAX_BASKET_SHARE_LENGTH = 2_048;

export type InstallBasketFramework = "next-app" | "next-pages" | "react" | "vite-react";
export type InstallBasketMode = "package" | "source";
export type InstallBasketPackageManager = "bun" | "npm" | "pnpm" | "yarn";
export type InstallBasketPreset = "none";

export interface InstallBasketOptions {
  readonly framework: InstallBasketFramework;
  readonly mode: InstallBasketMode;
  readonly packageManager: InstallBasketPackageManager;
  readonly preset: InstallBasketPreset;
}

export interface InstallBasketState {
  readonly direct: readonly string[];
  readonly options: InstallBasketOptions;
}

export interface InstallBasketCliContext {
  /**
   * Exact project-relative native release reference. Package-mode add fails closed
   * until the release workflow can provide this value.
   */
  readonly releaseFile?: string | undefined;
}

export interface InstallBasketCliPlan {
  /** Arguments after the package-manager launcher, suitable for the CLI parser. */
  readonly argv: readonly string[];
  readonly command: string;
  readonly frameworkBinding: "initialized-project";
  readonly releaseFile: string | null;
  readonly state: InstallBasketState;
  readonly status: "ready";
}

export interface InstallBasketCliPlanUnavailable {
  readonly code: "empty-basket" | "invalid-input" | "package-release-required";
  readonly message: string;
  readonly status: "unavailable";
}

export type InstallBasketCliPlanResult = InstallBasketCliPlan | InstallBasketCliPlanUnavailable;

export const DEFAULT_INSTALL_BASKET_OPTIONS: InstallBasketOptions = Object.freeze({
  framework: "next-app",
  mode: "source",
  packageManager: "pnpm",
  preset: "none",
});

/** Release generation replaces this only after an exact public native release exists. */
export const CURRENT_INSTALL_BASKET_CLI_CONTEXT: InstallBasketCliContext = Object.freeze({});

interface StoredInstallBasketV1 {
  readonly checksum: string;
  readonly direct: readonly string[];
  readonly schemaVersion: 1;
}

interface StoredInstallBasketV2 extends InstallBasketState {
  readonly checksum: string;
  readonly schemaVersion: 2;
}

export interface InstallBasketGraphItem {
  readonly id: string;
  readonly registryDependencies: readonly string[];
  readonly runtimeDependencies?: readonly string[];
}

export interface ResolvedInstallBasket {
  readonly cycles: readonly string[];
  readonly direct: readonly string[];
  readonly implicit: readonly string[];
  readonly missing: readonly string[];
  readonly requiredBy: Readonly<Record<string, readonly string[]>>;
  readonly runtimeDependencies: readonly string[];
}

function checksum(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function canonicalInstallBasket(items: readonly string[]): readonly string[] | null {
  if (items.length > MAX_BASKET_ITEMS) return null;
  const direct = [...new Set(items)].sort((left, right) => left.localeCompare(right, "en-US"));
  return direct.length <= MAX_BASKET_ITEMS && direct.every((item) => BASKET_ID.test(item))
    ? direct
    : null;
}

export function resolveInstallBasket(
  items: readonly string[],
  graphItems: readonly InstallBasketGraphItem[],
): ResolvedInstallBasket {
  const direct = canonicalInstallBasket(items) ?? [];
  const graph = new Map(graphItems.map((item) => [item.id, item] as const));
  const directSet = new Set(direct);
  const closure = new Set(direct);
  const missing = new Set<string>();
  const cycles = new Set<string>();
  const expanded = new Set<string>();
  const runtimeDependencies = new Set<string>();

  const visit = (id: string, path: readonly string[]) => {
    const repeatedAt = path.indexOf(id);
    if (repeatedAt >= 0) {
      cycles.add([...path.slice(repeatedAt), id].join(" -> "));
      return;
    }
    if (expanded.has(id)) return;
    const item = graph.get(id);
    if (item === undefined) {
      missing.add(id);
      return;
    }
    for (const dependency of item.runtimeDependencies ?? []) {
      if (dependency.trim().length > 0) runtimeDependencies.add(dependency);
    }
    const nextPath = [...path, id];
    for (const dependency of item.registryDependencies) {
      if (!BASKET_ID.test(dependency)) {
        missing.add(dependency);
        continue;
      }
      closure.add(dependency);
      visit(dependency, nextPath);
    }
    expanded.add(id);
  };

  for (const id of direct) visit(id, []);
  const requiredBy = new Map<string, Set<string>>();
  for (const root of direct) {
    const seen = new Set<string>();
    const collect = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      for (const dependency of graph.get(id)?.registryDependencies ?? []) {
        if (!BASKET_ID.test(dependency)) continue;
        if (dependency !== root) {
          const roots = requiredBy.get(dependency) ?? new Set<string>();
          roots.add(root);
          requiredBy.set(dependency, roots);
        }
        collect(dependency);
      }
    };
    collect(root);
  }
  return {
    cycles: [...cycles].sort((left, right) => left.localeCompare(right, "en-US")),
    direct,
    implicit: [...closure]
      .filter((id) => !directSet.has(id))
      .sort((left, right) => left.localeCompare(right, "en-US")),
    missing: [...missing].sort((left, right) => left.localeCompare(right, "en-US")),
    requiredBy: Object.fromEntries(
      [...requiredBy]
        .sort(([left], [right]) => left.localeCompare(right, "en-US"))
        .map(([id, roots]) => [id, [...roots].sort((left, right) => left.localeCompare(right))]),
    ),
    runtimeDependencies: [...runtimeDependencies].sort((left, right) =>
      left.localeCompare(right, "en-US"),
    ),
  };
}

export function canonicalInstallBasketOptions(value: unknown): InstallBasketOptions | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Partial<InstallBasketOptions>;
  const framework = candidate.framework;
  const mode = candidate.mode;
  const packageManager = candidate.packageManager;
  const preset = candidate.preset;
  if (
    (framework !== "next-app" &&
      framework !== "next-pages" &&
      framework !== "react" &&
      framework !== "vite-react") ||
    (mode !== "source" && mode !== "package") ||
    (packageManager !== "pnpm" &&
      packageManager !== "npm" &&
      packageManager !== "yarn" &&
      packageManager !== "bun") ||
    preset !== "none"
  ) {
    return null;
  }
  return { framework, mode, packageManager, preset };
}

export function installBasketPlanCommand(
  items: readonly string[],
  options: InstallBasketOptions,
  context: InstallBasketCliContext = {},
): string | null {
  const result = createInstallBasketCliPlan(items, options, context);
  return result.status === "ready" ? result.command : null;
}

function canonicalReleaseFile(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (
    value.length === 0 ||
    value.length > 240 ||
    value !== value.normalize("NFKC") ||
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[A-Za-z]:/u.test(value) ||
    !/^[A-Za-z0-9._/-]+$/u.test(value)
  ) {
    return null;
  }
  const segments = value.split("/");
  return segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
    ? null
    : value;
}

export function createInstallBasketCliPlan(
  items: readonly string[],
  options: InstallBasketOptions,
  context: InstallBasketCliContext = {},
): InstallBasketCliPlanResult {
  const state = canonicalState(items, options);
  if (state === null) {
    return {
      code: "invalid-input",
      message: "The selected items or install options are invalid.",
      status: "unavailable",
    };
  }
  if (state.direct.length === 0) {
    return {
      code: "empty-basket",
      message: "Add at least one source-present item before building a CLI plan.",
      status: "unavailable",
    };
  }
  const releaseFile = canonicalReleaseFile(context.releaseFile);
  if (releaseFile === null) {
    return {
      code: "invalid-input",
      message: "The exact release file must be a safe project-relative path.",
      status: "unavailable",
    };
  }
  if (state.options.mode === "package" && releaseFile === undefined) {
    return {
      code: "package-release-required",
      message:
        "Package mode requires an exact verified release file. No runnable package command is available for the unreleased catalog.",
      status: "unavailable",
    };
  }
  const runner: Record<InstallBasketPackageManager, string> = {
    bun: "bunx mergora@0.0.0",
    npm: "npx --yes mergora@0.0.0",
    pnpm: "pnpm dlx mergora@0.0.0",
    yarn: "yarn dlx mergora@0.0.0",
  };
  const argv = [
    "add",
    ...state.direct,
    "--mode",
    state.options.mode,
    "--package-manager",
    state.options.packageManager,
    ...(releaseFile === undefined ? [] : ["--release-file", releaseFile]),
    "--plan",
  ];
  return {
    argv,
    command: `${runner[state.options.packageManager]} ${argv.join(" ")}`,
    frameworkBinding: "initialized-project",
    releaseFile: releaseFile ?? null,
    state,
    status: "ready",
  };
}

function canonicalState(
  items: readonly string[],
  options: InstallBasketOptions,
): InstallBasketState | null {
  const direct = canonicalInstallBasket(items);
  const canonicalOptions = canonicalInstallBasketOptions(options);
  return direct === null || canonicalOptions === null
    ? null
    : { direct, options: canonicalOptions };
}

function canonicalPayload(state: InstallBasketState): string {
  return JSON.stringify({ direct: state.direct, options: state.options, schemaVersion: 2 });
}

function storedInstallBasket(state: InstallBasketState): StoredInstallBasketV2 {
  const payload = canonicalPayload(state);
  return { ...state, checksum: checksum(payload), schemaVersion: 2 };
}

function parseLegacyInstallBasket(value: unknown): InstallBasketState | null {
  if (Array.isArray(value)) {
    if (!value.every((item) => typeof item === "string")) return null;
    const direct = canonicalInstallBasket(value);
    return direct === null ? null : { direct, options: DEFAULT_INSTALL_BASKET_OPTIONS };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Partial<StoredInstallBasketV1>;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.checksum !== "string" ||
    !Array.isArray(candidate.direct) ||
    !candidate.direct.every((item) => typeof item === "string")
  ) {
    return null;
  }
  const direct = canonicalInstallBasket(candidate.direct);
  if (direct === null || direct.length !== candidate.direct.length) return null;
  const payload = JSON.stringify({ direct, schemaVersion: 1 });
  return checksum(payload) === candidate.checksum
    ? { direct, options: DEFAULT_INSTALL_BASKET_OPTIONS }
    : null;
}

export function parseInstallBasketState(value: unknown): InstallBasketState | null {
  const legacy = parseLegacyInstallBasket(value);
  if (legacy !== null) return legacy;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Partial<StoredInstallBasketV2>;
  if (
    candidate.schemaVersion !== 2 ||
    typeof candidate.checksum !== "string" ||
    !Array.isArray(candidate.direct) ||
    !candidate.direct.every((item) => typeof item === "string")
  ) {
    return null;
  }
  const options = canonicalInstallBasketOptions(candidate.options);
  const direct = canonicalInstallBasket(candidate.direct);
  if (options === null || direct === null || direct.length !== candidate.direct.length) return null;
  const state = { direct, options };
  return checksum(canonicalPayload(state)) === candidate.checksum ? state : null;
}

export function parseInstallBasket(value: unknown): readonly string[] | null {
  return parseInstallBasketState(value)?.direct ?? null;
}

export function readInstallBasketState(): InstallBasketState {
  try {
    const stored = window.localStorage.getItem(INSTALL_BASKET_KEY);
    if (stored !== null) {
      return (
        parseInstallBasketState(JSON.parse(stored) as unknown) ?? {
          direct: [],
          options: DEFAULT_INSTALL_BASKET_OPTIONS,
        }
      );
    }
    const legacy = window.localStorage.getItem(LEGACY_INSTALL_BASKET_KEY);
    return legacy === null
      ? { direct: [], options: DEFAULT_INSTALL_BASKET_OPTIONS }
      : (parseInstallBasketState(JSON.parse(legacy) as unknown) ?? {
          direct: [],
          options: DEFAULT_INSTALL_BASKET_OPTIONS,
        });
  } catch {
    return { direct: [], options: DEFAULT_INSTALL_BASKET_OPTIONS };
  }
}

export function readInstallBasket(): readonly string[] {
  return readInstallBasketState().direct;
}

export function persistInstallBasket(
  items: readonly string[],
  options?: InstallBasketOptions,
): boolean {
  try {
    const state = canonicalState(items, options ?? readInstallBasketState().options);
    if (state === null) return false;
    window.localStorage.setItem(INSTALL_BASKET_KEY, JSON.stringify(storedInstallBasket(state)));
    window.localStorage.removeItem(LEGACY_INSTALL_BASKET_KEY);
    return true;
  } catch {
    return false;
  }
}

function encode(value: string): string {
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decode(value: string): string {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  return atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
}

export function installBasketShareFragment(
  items: readonly string[],
  options: InstallBasketOptions = DEFAULT_INSTALL_BASKET_OPTIONS,
): string | null {
  const state = canonicalState(items, options);
  if (state === null) return null;
  const payload = canonicalPayload(state);
  const fragment = `#basket.v2.${encode(payload)}.${checksum(payload)}`;
  return fragment.length <= MAX_BASKET_SHARE_LENGTH ? fragment : null;
}

export function parseInstallBasketShareState(fragment: string): InstallBasketState | null {
  if (
    fragment.length === 0 ||
    fragment.length > MAX_BASKET_SHARE_LENGTH ||
    (!fragment.startsWith("#basket.v1.") && !fragment.startsWith("#basket.v2."))
  ) {
    return null;
  }
  const parts = fragment.split(".");
  if (parts.length !== 4) return null;
  const payload = parts[2];
  const expected = parts[3];
  if (payload === undefined || expected === undefined || !/^[0-9a-f]{8}$/u.test(expected)) {
    return null;
  }
  try {
    const decoded = decode(payload);
    if (checksum(decoded) !== expected) return null;
    const parsed = JSON.parse(decoded) as unknown;
    if (fragment.startsWith("#basket.v1.")) {
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
      const legacy = parsed as { readonly direct?: unknown; readonly schemaVersion?: unknown };
      if (
        legacy.schemaVersion !== 1 ||
        !Array.isArray(legacy.direct) ||
        !legacy.direct.every((item) => typeof item === "string")
      ) {
        return null;
      }
      const direct = canonicalInstallBasket(legacy.direct);
      return direct !== null && direct.length === legacy.direct.length
        ? { direct, options: DEFAULT_INSTALL_BASKET_OPTIONS }
        : null;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const candidate = parsed as {
      readonly direct?: unknown;
      readonly options?: unknown;
      readonly schemaVersion?: unknown;
    };
    if (
      candidate.schemaVersion !== 2 ||
      !Array.isArray(candidate.direct) ||
      !candidate.direct.every((item) => typeof item === "string")
    ) {
      return null;
    }
    const direct = canonicalInstallBasket(candidate.direct);
    const options = canonicalInstallBasketOptions(candidate.options);
    return direct !== null && direct.length === candidate.direct.length && options !== null
      ? { direct, options }
      : null;
  } catch {
    return null;
  }
}

export function parseInstallBasketShareFragment(fragment: string): readonly string[] | null {
  return parseInstallBasketShareState(fragment)?.direct ?? null;
}

export function announceInstallBasket(items: readonly string[]): void {
  window.dispatchEvent(
    new CustomEvent(INSTALL_BASKET_EVENT, { detail: { count: items.length, items } }),
  );
}
