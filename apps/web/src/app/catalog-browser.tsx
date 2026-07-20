"use client";

import { SiteLink as Link } from "./site-link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  announceInstallBasket,
  createInstallBasketCliPlan,
  CURRENT_INSTALL_BASKET_CLI_CONTEXT,
  DEFAULT_INSTALL_BASKET_OPTIONS,
  installBasketShareFragment,
  parseInstallBasketShareState,
  persistInstallBasket,
  readInstallBasketState,
  resolveInstallBasket,
  type InstallBasketFramework,
  type InstallBasketMode,
  type InstallBasketOptions,
  type InstallBasketPackageManager,
} from "./install-basket";

export interface CatalogBrowserItem {
  readonly category: string;
  readonly displayName: string;
  readonly directions: readonly ("ltr" | "rtl")[];
  readonly fileTargets: readonly string[];
  readonly id: string;
  readonly implementationStatus: "source-present-unreleased" | "unimplemented";
  readonly layer: "component" | "foundation" | "kit" | "system";
  readonly locales: readonly string[];
  readonly packageImport: string | null;
  readonly registryDependencies: readonly string[];
  readonly runtimeDependencies: readonly string[];
  readonly reviewStatus: "audit-pending" | "profiled-incomplete";
  readonly riskClass: 1 | 2 | 3;
  readonly route: string;
  readonly serverBoundary: "client-island" | "client-only" | "server-compatible" | "unavailable";
  readonly sourceAvailable: boolean;
  readonly summary: string;
  readonly targetMaturity: "beta" | "deprecated" | "experimental" | "stable";
  readonly trust: "community" | "core" | "labs";
}

type Availability = "all" | "planned" | "source-present";
type Boundary = CatalogBrowserItem["serverBoundary"] | "all";
type CatalogLayer = CatalogBrowserItem["layer"] | "all";
type Direction = "all" | "ltr" | "not-recorded" | "rtl";
type ImplementationStatus = CatalogBrowserItem["implementationStatus"] | "all";
type Maturity = CatalogBrowserItem["targetMaturity"] | "all";
type ReviewStatus = CatalogBrowserItem["reviewStatus"] | "all";
type RiskClass = "1" | "2" | "3" | "all";
type Trust = CatalogBrowserItem["trust"] | "all";

export function CatalogBrowser({
  catalogItems,
  items,
}: {
  readonly catalogItems: readonly CatalogBrowserItem[];
  readonly items: readonly CatalogBrowserItem[];
}) {
  const [query, setQuery] = useState("");
  const [deferredQuery, setDeferredQuery] = useState("");
  const [layer, setLayer] = useState<CatalogLayer>("all");
  const [category, setCategory] = useState("all");
  const [availability, setAvailability] = useState<Availability>("all");
  const [boundary, setBoundary] = useState<Boundary>("all");
  const [direction, setDirection] = useState<Direction>("all");
  const [implementationStatus, setImplementationStatus] = useState<ImplementationStatus>("all");
  const [locale, setLocale] = useState("all");
  const [maturity, setMaturity] = useState<Maturity>("all");
  const [riskClass, setRiskClass] = useState<RiskClass>("all");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("all");
  const [trust, setTrust] = useState<Trust>("core");
  const [basket, setBasket] = useState<readonly string[]>([]);
  const [basketOptions, setBasketOptions] = useState<InstallBasketOptions>(
    DEFAULT_INSTALL_BASKET_OPTIONS,
  );
  const [basketNotice, setBasketNotice] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [urlReady, setUrlReady] = useState(false);
  const navigationMode = useRef<"push" | "replace">("replace");

  const categories = useMemo(
    () => [...new Set(items.map((item) => item.category))].sort((a, b) => a.localeCompare(b)),
    [items],
  );
  const maturities = useMemo(
    () => [...new Set(items.map((item) => item.targetMaturity))].sort((a, b) => a.localeCompare(b)),
    [items],
  );
  const layers = useMemo(
    () => [...new Set(items.map((item) => item.layer))].sort((a, b) => a.localeCompare(b)),
    [items],
  );
  const locales = useMemo(
    () => [...new Set(items.flatMap((item) => item.locales))].sort((a, b) => a.localeCompare(b)),
    [items],
  );

  useEffect(() => {
    const shared = parseInstallBasketShareState(window.location.hash);
    const hasBasketFragment = window.location.hash.startsWith("#basket.");
    const stored = readInstallBasketState();
    const initial = shared ?? stored;
    setBasket(initial.direct);
    setBasketOptions(initial.options);
    if (shared !== null) {
      setStorageUnavailable(!persistInstallBasket(shared.direct, shared.options));
      setBasketNotice("The checked install basket from this link has been restored.");
    } else if (hasBasketFragment) {
      setBasketNotice(
        "That install-basket link is invalid or incomplete. Your saved basket was kept.",
      );
    }
    announceInstallBasket(initial.direct);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDeferredQuery(query), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const restore = () => {
      const parameters = new URLSearchParams(window.location.search);
      const nextQuery = parameters.get("q") ?? parameters.get("search") ?? "";
      const nextLayer = parameters.get("layer");
      const nextCategory = parameters.get("category");
      const nextMaturity = parameters.get("maturity");
      const nextTrust = parameters.get("trust");
      const nextRisk = parameters.get("risk");
      const nextAvailability = parameters.get("distribution");
      const nextBoundary = parameters.get("boundary");
      const nextDirection = parameters.get("direction");
      const nextImplementationStatus = parameters.get("status");
      const nextLocale = parameters.get("locale");
      const nextReview = parameters.get("review");
      setQuery(nextQuery.slice(0, 120));
      setLayer(
        nextLayer === "foundation" ||
          nextLayer === "component" ||
          nextLayer === "system" ||
          nextLayer === "kit"
          ? nextLayer
          : "all",
      );
      setCategory(
        nextCategory !== null && categories.includes(nextCategory) ? nextCategory : "all",
      );
      setMaturity(
        nextMaturity !== null &&
          maturities.includes(nextMaturity as CatalogBrowserItem["targetMaturity"])
          ? (nextMaturity as CatalogBrowserItem["targetMaturity"])
          : "all",
      );
      setTrust(
        nextTrust === "all" ||
          nextTrust === "core" ||
          nextTrust === "labs" ||
          nextTrust === "community"
          ? nextTrust
          : "core",
      );
      setRiskClass(nextRisk === "1" || nextRisk === "2" || nextRisk === "3" ? nextRisk : "all");
      setAvailability(
        nextAvailability === "planned" || nextAvailability === "source-present"
          ? nextAvailability
          : "all",
      );
      setBoundary(
        nextBoundary === "client-island" ||
          nextBoundary === "client-only" ||
          nextBoundary === "server-compatible"
          ? nextBoundary
          : "all",
      );
      setDirection(
        nextDirection === "ltr" || nextDirection === "rtl" || nextDirection === "not-recorded"
          ? nextDirection
          : "all",
      );
      setImplementationStatus(
        nextImplementationStatus === "source-present-unreleased" ||
          nextImplementationStatus === "unimplemented"
          ? nextImplementationStatus
          : "all",
      );
      setLocale(
        nextLocale === "not-recorded" || (nextLocale !== null && locales.includes(nextLocale))
          ? nextLocale
          : "all",
      );
      setReviewStatus(
        nextReview === "profiled-incomplete" || nextReview === "audit-pending" ? nextReview : "all",
      );
      setUrlReady(true);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [categories, locales, maturities]);

  useEffect(() => {
    if (!urlReady) return;
    const parameters = new URLSearchParams(window.location.search);
    parameters.delete("search");
    const setParameter = (name: string, value: string, defaultValue: string) => {
      if (value === defaultValue) parameters.delete(name);
      else parameters.set(name, value);
    };
    setParameter("q", query, "");
    setParameter("layer", layer, "all");
    setParameter("category", category, "all");
    setParameter("maturity", maturity, "all");
    setParameter("trust", trust, "core");
    setParameter("risk", riskClass, "all");
    setParameter("distribution", availability, "all");
    setParameter("boundary", boundary, "all");
    setParameter("direction", direction, "all");
    setParameter("status", implementationStatus, "all");
    setParameter("locale", locale, "all");
    setParameter("review", reviewStatus, "all");
    parameters.sort();
    const search = parameters.size === 0 ? "" : `?${parameters.toString()}`;
    const next = `${window.location.pathname}${search}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current !== next) {
      window.history[navigationMode.current === "push" ? "pushState" : "replaceState"](
        null,
        "",
        next,
      );
    }
    navigationMode.current = "replace";
  }, [
    availability,
    boundary,
    category,
    direction,
    implementationStatus,
    layer,
    locale,
    maturity,
    query,
    reviewStatus,
    riskClass,
    trust,
    urlReady,
  ]);

  const visible = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (layer !== "all" && item.layer !== layer) return false;
      if (category !== "all" && item.category !== category) return false;
      if (availability === "source-present" && !item.sourceAvailable) return false;
      if (availability === "planned" && item.sourceAvailable) return false;
      if (boundary !== "all" && item.serverBoundary !== boundary) return false;
      if (direction === "not-recorded" && item.directions.length !== 0) return false;
      if (direction === "ltr" || direction === "rtl") {
        if (!item.directions.includes(direction)) return false;
      }
      if (locale === "not-recorded" && item.locales.length !== 0) return false;
      if (locale !== "all" && locale !== "not-recorded" && !item.locales.includes(locale)) {
        return false;
      }
      if (implementationStatus !== "all" && item.implementationStatus !== implementationStatus) {
        return false;
      }
      if (maturity !== "all" && item.targetMaturity !== maturity) return false;
      if (trust !== "all" && item.trust !== trust) return false;
      if (riskClass !== "all" && String(item.riskClass) !== riskClass) return false;
      if (reviewStatus !== "all" && item.reviewStatus !== reviewStatus) return false;
      return (
        normalizedQuery === "" ||
        `${item.id} ${item.displayName} ${item.summary} ${item.category}`
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      );
    });
  }, [
    availability,
    boundary,
    category,
    deferredQuery,
    direction,
    implementationStatus,
    items,
    layer,
    locale,
    maturity,
    reviewStatus,
    riskClass,
    trust,
  ]);

  const markHistoryEntry = () => {
    navigationMode.current = "push";
  };

  const resetFilters = () => {
    markHistoryEntry();
    setQuery("");
    setLayer("all");
    setCategory("all");
    setAvailability("all");
    setBoundary("all");
    setDirection("all");
    setImplementationStatus("all");
    setLocale("all");
    setMaturity("all");
    setRiskClass("all");
    setReviewStatus("all");
    setTrust("core");
  };

  const activeFilters = [
    query === "" ? null : `search “${query}”`,
    layer === "all" ? null : `layer ${layer}`,
    category === "all" ? null : `family ${category.replaceAll("-", " ")}`,
    maturity === "all" ? null : `target maturity ${maturity}`,
    trust === "all" ? null : `trust ${trust}`,
    riskClass === "all" ? null : `risk ${riskClass}`,
    availability === "all" ? null : `distribution ${availability.replaceAll("-", " ")}`,
    boundary === "all" ? null : `boundary ${boundary.replaceAll("-", " ")}`,
    direction === "all" ? null : `direction ${direction}`,
    implementationStatus === "all" ? null : `status ${implementationStatus.replaceAll("-", " ")}`,
    locale === "all" ? null : `locale ${locale}`,
    reviewStatus === "all" ? null : `review ${reviewStatus.replaceAll("-", " ")}`,
  ].filter((value): value is string => value !== null);

  const resolution = useMemo(
    () => resolveInstallBasket(basket, catalogItems),
    [basket, catalogItems],
  );
  const basketTotal = resolution.direct.length + resolution.implicit.length;
  const selectedItems = useMemo(() => {
    const selectedIds = new Set([...resolution.direct, ...resolution.implicit]);
    return catalogItems.filter((item) => selectedIds.has(item.id));
  }, [catalogItems, resolution.direct, resolution.implicit]);
  const sourceOnlyItems = selectedItems.filter((item) => item.packageImport === null);
  const packageModeUnavailable = sourceOnlyItems.length > 0;
  const packageReleaseUnavailable = CURRENT_INSTALL_BASKET_CLI_CONTEXT.releaseFile === undefined;
  const planResult =
    basketOptions.mode === "package" && packageModeUnavailable
      ? null
      : createInstallBasketCliPlan(
          resolution.direct,
          basketOptions,
          CURRENT_INSTALL_BASKET_CLI_CONTEXT,
        );
  const planCommand = planResult?.status === "ready" ? planResult.command : "";
  const boundarySummary = [...new Set(selectedItems.map((item) => item.serverBoundary))].sort();
  const fileTargets = [...new Set(selectedItems.flatMap((item) => item.fileTargets))].sort();
  const maturityWarnings = selectedItems.filter(
    (item) => item.targetMaturity !== "stable" || item.trust !== "core",
  );

  const updateBasket = (next: readonly string[]) => {
    setBasket(next);
    setStorageUnavailable(!persistInstallBasket(next, basketOptions));
    setShareStatus("");
    announceInstallBasket(next);
  };

  const updateBasketOptions = (next: InstallBasketOptions) => {
    setBasketOptions(next);
    setStorageUnavailable(!persistInstallBasket(basket, next));
    setShareStatus("");
  };

  const toggleBasket = (id: string) => {
    const dependents = resolution.requiredBy[id] ?? [];
    const next = basket.includes(id)
      ? basket.filter((candidate) => candidate !== id)
      : [...basket, id];
    updateBasket(next);
    if (basket.includes(id) && dependents.length > 0) {
      setBasketNotice(
        `${id} is no longer a direct choice, but remains required by ${dependents.join(", ")}.`,
      );
    }
  };

  const shareBasket = async () => {
    const fragment = installBasketShareFragment(resolution.direct, basketOptions);
    if (fragment === null) {
      setShareStatus("This basket is too large to encode safely. Remove items and try again.");
      return;
    }
    const shareUrl = `${window.location.pathname}${window.location.search}${fragment}`;
    window.history.replaceState(null, "", shareUrl);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareStatus("A checked share link was copied. It contains component IDs only.");
    } catch {
      setShareStatus("A checked share link is now in the address bar and ready to copy.");
    }
  };

  const copyPlanCommand = async () => {
    if (planCommand === "") return;
    try {
      await navigator.clipboard.writeText(planCommand);
      setShareStatus("The review-only install-plan command was copied.");
    } catch {
      setShareStatus("Clipboard access is unavailable. Select the visible command and copy it.");
    }
  };

  return (
    <div className="catalog-browser">
      <form
        className="catalog-browser__filters"
        onSubmit={(event) => event.preventDefault()}
        role="search"
      >
        <label>
          <span>Search this catalog</span>
          <input
            autoComplete="off"
            name="q"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Name, capability, or family"
            type="search"
            value={query}
          />
        </label>
        <label>
          <span>Layer</span>
          <select
            onChange={(event) => {
              markHistoryEntry();
              setLayer(event.currentTarget.value as CatalogLayer);
            }}
            value={layer}
          >
            <option value="all">All layers</option>
            {layers.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Family</span>
          <select
            onChange={(event) => {
              markHistoryEntry();
              setCategory(event.currentTarget.value);
            }}
            value={category}
          >
            <option value="all">All families</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("-", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Target maturity</span>
          <select
            onChange={(event) => {
              markHistoryEntry();
              setMaturity(event.currentTarget.value as Maturity);
            }}
            value={maturity}
          >
            <option value="all">All maturity targets</option>
            {maturities.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Trust tier</span>
          <select
            onChange={(event) => {
              markHistoryEntry();
              setTrust(event.currentTarget.value as Trust);
            }}
            value={trust}
          >
            <option value="core">Core (default)</option>
            <option value="all">All trust tiers</option>
            <option value="labs">Labs</option>
            <option value="community">Community</option>
          </select>
        </label>
        <label>
          <span>Interaction risk</span>
          <select
            onChange={(event) => {
              markHistoryEntry();
              setRiskClass(event.currentTarget.value as RiskClass);
            }}
            value={riskClass}
          >
            <option value="all">All risk classes</option>
            <option value="1">Risk 1</option>
            <option value="2">Risk 2</option>
            <option value="3">Risk 3</option>
          </select>
        </label>
        <label>
          <span>Distribution state</span>
          <select
            onChange={(event) => {
              markHistoryEntry();
              setAvailability(event.currentTarget.value as Availability);
            }}
            value={availability}
          >
            <option value="all">All distribution states</option>
            <option value="source-present">Source present</option>
            <option value="planned">Planned</option>
          </select>
        </label>
        <label>
          <span>Review status</span>
          <select
            onChange={(event) => {
              markHistoryEntry();
              setReviewStatus(event.currentTarget.value as ReviewStatus);
            }}
            value={reviewStatus}
          >
            <option value="all">All review states</option>
            <option value="profiled-incomplete">Profiled, incomplete</option>
            <option value="audit-pending">Audit pending</option>
          </select>
        </label>
        <label>
          <span>Implementation status</span>
          <select
            onChange={(event) => {
              markHistoryEntry();
              setImplementationStatus(event.currentTarget.value as ImplementationStatus);
            }}
            value={implementationStatus}
          >
            <option value="all">All implementation states</option>
            <option value="source-present-unreleased">Source present, unreleased</option>
            <option value="unimplemented">Unimplemented</option>
          </select>
        </label>
        <label>
          <span>Rendering boundary</span>
          <select
            onChange={(event) => {
              markHistoryEntry();
              setBoundary(event.currentTarget.value as Boundary);
            }}
            value={boundary}
          >
            <option value="all">All boundaries</option>
            <option value="server-compatible">Server compatible</option>
            <option value="client-island">Interactive client island</option>
            <option value="client-only">Client only</option>
            <option value="unavailable">Not recorded</option>
          </select>
        </label>
        <label>
          <span>Direction support</span>
          <select
            onChange={(event) => {
              markHistoryEntry();
              setDirection(event.currentTarget.value as Direction);
            }}
            value={direction}
          >
            <option value="all">All directions</option>
            <option value="ltr">LTR</option>
            <option value="rtl">RTL</option>
            <option value="not-recorded">Not recorded</option>
          </select>
        </label>
        <label>
          <span>Locale evidence</span>
          <select
            onChange={(event) => {
              markHistoryEntry();
              setLocale(event.currentTarget.value);
            }}
            value={locale}
          >
            <option value="all">All locale records</option>
            <option value="not-recorded">Not recorded</option>
            {locales.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button onClick={resetFilters} type="button">
          Reset filters
        </button>
      </form>
      <div className="catalog-browser__result-line" id="install-basket">
        <output aria-live="polite">
          {visible.length} {visible.length === 1 ? "result" : "results"}
        </output>
        <span>
          {resolution.direct.length} direct + {resolution.implicit.length} required = {basketTotal}{" "}
          install items
        </span>
      </div>
      <section className="catalog-browser__basket" aria-labelledby="install-plan-heading">
        <div className="catalog-browser__basket-heading">
          <div>
            <p className="site-eyebrow">Local install planner</p>
            <h2 id="install-plan-heading">Dependency-aware install basket</h2>
          </div>
          <dl>
            <div>
              <dt>Direct</dt>
              <dd>{resolution.direct.length}</dd>
            </div>
            <div>
              <dt>Required</dt>
              <dd>{resolution.implicit.length}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{basketTotal}</dd>
            </div>
          </dl>
        </div>
        <fieldset className="catalog-browser__basket-options">
          <legend>Plan context</legend>
          <label>
            <span>Distribution mode</span>
            <select
              onChange={(event) =>
                updateBasketOptions({
                  ...basketOptions,
                  mode: event.currentTarget.value as InstallBasketMode,
                })
              }
              value={basketOptions.mode}
            >
              <option value="source">Source ownership</option>
              <option
                disabled={packageModeUnavailable || packageReleaseUnavailable}
                value="package"
              >
                Package import â€” available with an exact release
              </option>
            </select>
          </label>
          <label>
            <span>Package manager</span>
            <select
              onChange={(event) =>
                updateBasketOptions({
                  ...basketOptions,
                  packageManager: event.currentTarget.value as InstallBasketPackageManager,
                })
              }
              value={basketOptions.packageManager}
            >
              <option value="pnpm">pnpm</option>
              <option value="npm">npm</option>
              <option value="yarn">Yarn</option>
              <option value="bun">Bun</option>
            </select>
          </label>
          <label>
            <span>Framework profile</span>
            <select
              onChange={(event) =>
                updateBasketOptions({
                  ...basketOptions,
                  framework: event.currentTarget.value as InstallBasketFramework,
                })
              }
              value={basketOptions.framework}
            >
              <option value="next-app">Next.js App Router</option>
              <option value="next-pages">Next.js Pages Router</option>
              <option value="vite-react">Vite + React</option>
              <option value="react">React library</option>
            </select>
          </label>
          <label>
            <span>Preset</span>
            <select disabled value={basketOptions.preset}>
              <option value="none">None — exact selections only</option>
            </select>
          </label>
          <p>
            No preset manifest is published yet, so the planner keeps every selection explicit.
            Unsupported combinations are not presented as runnable commands.
          </p>
          <p>
            Framework is applied by <code>mergora init</code> and checked from the initialized
            project. The <code>add</code> command does not accept a framework flag.
          </p>
          {packageReleaseUnavailable ? (
            <p role={basketOptions.mode === "package" ? "alert" : undefined}>
              Package mode requires an exact verified release file. The current catalog is
              unreleased, so no executable-looking package command is shown.
            </p>
          ) : null}
          {packageModeUnavailable ? (
            <p role={basketOptions.mode === "package" ? "alert" : undefined}>
              {sourceOnlyItems.map((item) => item.displayName).join(", ")}{" "}
              {sourceOnlyItems.length === 1 ? "is" : "are"} explicitly source-only. Choose Source
              ownership for this basket.
            </p>
          ) : null}
        </fieldset>
        {resolution.direct.length === 0 ? (
          <p>Add a source-present item to build a non-mutating CLI plan.</p>
        ) : (
          <div className="catalog-browser__basket-groups">
            <div>
              <h3>Chosen directly</h3>
              <ul>
                {resolution.direct.map((id) => (
                  <li key={id}>
                    <span>{id}</span>
                    {(resolution.requiredBy[id] ?? []).length > 0 ? (
                      <small>
                        Also required by {(resolution.requiredBy[id] ?? []).join(", ")}.
                      </small>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Included dependencies</h3>
              {resolution.implicit.length === 0 ? (
                <p>None recorded.</p>
              ) : (
                <ul>
                  {resolution.implicit.map((id) => (
                    <li key={id}>
                      <span>{id}</span>
                      <small>
                        Required by {(resolution.requiredBy[id] ?? []).join(", ") || "the plan"}.
                      </small>
                      {(resolution.requiredBy[id] ?? []).length > 0 ? (
                        <button
                          onClick={() => {
                            const dependents = resolution.requiredBy[id] ?? [];
                            updateBasket(basket.filter((item) => !dependents.includes(item)));
                            setBasketNotice(
                              `Removed ${dependents.join(", ")} so ${id} is no longer required.`,
                            );
                          }}
                          type="button"
                        >
                          Remove dependent{" "}
                          {resolution.requiredBy[id]?.length === 1 ? "item" : "items"}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {resolution.missing.length > 0 || resolution.cycles.length > 0 ? (
          <div className="catalog-browser__basket-warning" role="alert">
            <strong>The generated dependency graph needs attention.</strong>
            {resolution.missing.length > 0 ? (
              <span>Missing records: {resolution.missing.join(", ")}.</span>
            ) : null}
            {resolution.cycles.length > 0 ? (
              <span>Cycles: {resolution.cycles.join("; ")}.</span>
            ) : null}
          </div>
        ) : null}
        {maturityWarnings.length > 0 ? (
          <div className="catalog-browser__basket-warning" role="alert">
            <strong>Review maturity and trust before copying.</strong>
            <span>
              {maturityWarnings
                .map(
                  (item) =>
                    `${item.id} (target ${item.targetMaturity}, ${item.trust} trust, unreleased)`,
                )
                .join("; ")}
              .
            </span>
          </div>
        ) : null}
        {basketTotal > 0 ? (
          <div className="catalog-browser__basket-evidence">
            <dl>
              <div>
                <dt>Client boundaries</dt>
                <dd>{boundarySummary.join(", ") || "Not recorded"}</dd>
              </div>
              <div>
                <dt>Runtime packages</dt>
                <dd>{resolution.runtimeDependencies.length}</dd>
              </div>
              <div>
                <dt>Source file targets</dt>
                <dd>{fileTargets.length}</dd>
              </div>
            </dl>
            <details>
              <summary>Inspect deterministic install inputs</summary>
              <h3>Runtime dependencies</h3>
              {resolution.runtimeDependencies.length === 0 ? (
                <p>None recorded.</p>
              ) : (
                <ul>
                  {resolution.runtimeDependencies.map((dependency) => (
                    <li key={dependency}>{dependency}</li>
                  ))}
                </ul>
              )}
              <h3>Package imports</h3>
              <ul>
                {[...new Set(selectedItems.flatMap((item) => item.packageImport ?? []))]
                  .sort()
                  .map((packageImport) => (
                    <li key={packageImport}>{packageImport}</li>
                  ))}
              </ul>
              <h3>Source targets</h3>
              {fileTargets.length === 0 ? (
                <p>Targets will appear after the next deterministic catalog generation.</p>
              ) : (
                <ul>
                  {fileTargets.map((target) => (
                    <li key={target}>{target}</li>
                  ))}
                </ul>
              )}
            </details>
          </div>
        ) : null}
        {planCommand === "" ? null : (
          <div className="catalog-browser__plan-command">
            <span>
              {basketOptions.packageManager} shell · review-only command · packages remain
              unreleased
            </span>
            <code aria-label="Scrollable install-plan command" tabIndex={0}>
              {planCommand}
            </code>
            <button onClick={copyPlanCommand} type="button">
              Copy plan command
            </button>
          </div>
        )}
        {planResult?.status === "unavailable" &&
        planResult.code !== "empty-basket" &&
        !(planResult.code === "package-release-required" && packageReleaseUnavailable) ? (
          <p className="catalog-browser__basket-warning" role="alert">
            {planResult.message}
          </p>
        ) : null}
        <div className="catalog-browser__basket-actions">
          <button disabled={resolution.direct.length === 0} onClick={shareBasket} type="button">
            Create checked share link
          </button>
          <button
            disabled={resolution.direct.length === 0}
            onClick={() => updateBasket([])}
            type="button"
          >
            Clear direct selections
          </button>
        </div>
        {basketNotice === "" ? null : <p role="status">{basketNotice}</p>}
        {shareStatus === "" ? null : <p role="status">{shareStatus}</p>}
      </section>
      {storageUnavailable ? (
        <p className="catalog-browser__notice" role="status">
          Browser storage is unavailable. The basket will last for this page session only.
        </p>
      ) : null}
      {visible.length === 0 ? (
        <div className="catalog-browser__empty">
          <h2>No matching items</h2>
          <p>
            {activeFilters.length === 0
              ? "No items are available in this catalog."
              : `Active filters: ${activeFilters.join(", ")}.`}
          </p>
          <button onClick={resetFilters} type="button">
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="catalog-browser__results">
          {visible.map((item) => {
            const selected = resolution.direct.includes(item.id);
            const required = resolution.implicit.includes(item.id);
            return (
              <li key={item.id}>
                <div className="catalog-browser__identity">
                  <p>{item.category.replaceAll("-", " ")}</p>
                  <h2>
                    <Link href={item.route}>{item.displayName}</Link>
                  </h2>
                  <p>{item.summary}</p>
                </div>
                <dl>
                  <div>
                    <dt>Layer</dt>
                    <dd>{item.layer}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{item.sourceAvailable ? "Present" : "Planned"}</dd>
                  </div>
                  <div>
                    <dt>Maturity</dt>
                    <dd>Unreleased · target {item.targetMaturity}</dd>
                  </div>
                  <div>
                    <dt>Trust / risk</dt>
                    <dd>
                      {item.trust} / {item.riskClass}
                    </dd>
                  </div>
                  <div>
                    <dt>Distribution</dt>
                    <dd>
                      {item.sourceAvailable
                        ? item.packageImport === null
                          ? "Source only"
                          : "Source + package generated"
                        : "Planned"}
                    </dd>
                  </div>
                  <div>
                    <dt>Review</dt>
                    <dd>{item.reviewStatus.replaceAll("-", " ")}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{item.implementationStatus.replaceAll("-", " ")}</dd>
                  </div>
                  <div>
                    <dt>Boundary</dt>
                    <dd>{item.serverBoundary.replaceAll("-", " ")}</dd>
                  </div>
                  <div>
                    <dt>Direction / locale</dt>
                    <dd>
                      {item.directions.length === 0 ? "Not recorded" : item.directions.join(" + ")}
                      {item.locales.length === 0 ? "" : ` · ${String(item.locales.length)} locales`}
                    </dd>
                  </div>
                </dl>
                <div className="catalog-browser__actions">
                  <Link href={item.route}>Inspect item</Link>
                  <button
                    aria-pressed={selected}
                    data-required={required ? "true" : undefined}
                    disabled={!item.sourceAvailable}
                    onClick={() => toggleBasket(item.id)}
                    type="button"
                  >
                    {item.sourceAvailable
                      ? selected
                        ? "Remove from install"
                        : required
                          ? "Add directly"
                          : "Add to install"
                      : "Source planned"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
