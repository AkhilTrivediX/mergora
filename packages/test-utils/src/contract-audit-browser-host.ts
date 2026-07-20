import type { Locator, Page } from "@playwright/test";
import axe from "axe-core";
import {
  createOfficialBrowserHostAdaptersV1,
  OFFICIAL_BROWSER_HOST_ID,
  OFFICIAL_BROWSER_HOST_PROTOCOL_VERSION,
  type AuditAnnouncementObservationV1,
  type AuditAxeObservationV1,
  type AuditFocusObservationV1,
  type AuditGeometryObservationV1,
  type AuditKeyboardObservationV1,
  type AuditRuntimeContextV1,
  type AuditStateObservationV1,
  type JsonPrimitive,
  type OfficialBrowserHostContractBindingV1,
  type OfficialBrowserHostRequestV1,
  type OfficialBrowserHostV1,
  type RuntimeAuditMode,
  type RuntimeHarnessOutcomeV1,
} from "mergora-contracts";

type PlaywrightRole = Parameters<Page["getByRole"]>[0];

const catalogIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const projectSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const runtimeModes = ["a11y", "browser", "keyboard", "responsive"] as const;
const MAX_OBSERVATIONS = 32;

export interface OfficialPlaywrightLocatorV1 {
  readonly role: PlaywrightRole;
  readonly name?: string;
}

export type OfficialPlaywrightStateNameV1 =
  | "busy"
  | "checked"
  | "disabled"
  | "expanded"
  | "invalid"
  | "pressed"
  | "readonly"
  | "required"
  | "selected"
  | "value";

export interface OfficialPlaywrightStateExpectationV1 {
  readonly name: OfficialPlaywrightStateNameV1;
  readonly expected: JsonPrimitive;
}

export type OfficialPlaywrightActionV1 =
  | { readonly kind: "click" }
  | { readonly kind: "none" }
  | { readonly kind: "press"; readonly key: string };

export interface OfficialPlaywrightFocusExpectationV1 {
  readonly step: string;
  readonly target: OfficialPlaywrightLocatorV1;
  readonly visible?: boolean;
  readonly occluded?: boolean;
}

export interface OfficialPlaywrightAnnouncementExpectationV1 {
  /** Trusted compiled selector; this value never comes from Contract JSON. */
  readonly selector: string;
  readonly text: string;
  readonly politeness: "assertive" | "off" | "polite";
}

export interface OfficialPlaywrightAxeExpectationV1 {
  /** Trusted compiled selector. Omit it to scan the document. */
  readonly scopeSelector?: string;
}

export interface OfficialPlaywrightResponsiveExpectationV1 {
  readonly width: number;
  readonly height: number;
  /** Trusted compiled selector for the reflow root. */
  readonly rootSelector: string;
  readonly maximumHorizontalOverflowPx?: number;
}

interface OfficialPlaywrightAssertionBaseV1 {
  readonly assertionId: string;
  readonly mode: RuntimeAuditMode;
  /** Exact consumer source target recorded in actionable evidence. */
  readonly projectPath: string;
}

export interface OfficialPlaywrightApplicableAssertionV1 extends OfficialPlaywrightAssertionBaseV1 {
  readonly applicability: "applicable";
  readonly target: OfficialPlaywrightLocatorV1;
  readonly action?: OfficialPlaywrightActionV1;
  readonly states?: readonly OfficialPlaywrightStateExpectationV1[];
  readonly focus?: OfficialPlaywrightFocusExpectationV1;
  readonly announcement?: OfficialPlaywrightAnnouncementExpectationV1;
  readonly axe?: OfficialPlaywrightAxeExpectationV1;
  readonly responsive?: OfficialPlaywrightResponsiveExpectationV1;
}

export interface OfficialPlaywrightNotApplicableAssertionV1 extends OfficialPlaywrightAssertionBaseV1 {
  readonly applicability: "not-applicable";
  readonly reason: string;
}

export type OfficialPlaywrightAssertionV1 =
  OfficialPlaywrightApplicableAssertionV1 | OfficialPlaywrightNotApplicableAssertionV1;

export interface OfficialPlaywrightContractV1 {
  readonly registryId: string;
  readonly itemId: string;
  readonly contractId: string;
  readonly contractVersion: string;
  readonly payloadDigest: string;
  readonly assertions: readonly OfficialPlaywrightAssertionV1[];
}

export interface OfficialPlaywrightHarnessV1 {
  readonly harnessId: string;
  readonly contracts: readonly OfficialPlaywrightContractV1[];
}

export interface OfficialPlaywrightBrowserHostOptionsV1 {
  /** A live page already bound to the trusted consumer build or story route. */
  readonly page: Page;
  readonly harnesses: readonly OfficialPlaywrightHarnessV1[];
  /** Reload the current page before every assertion to isolate state. Defaults to true. */
  readonly reloadBeforeEach?: boolean;
  /** Per-Playwright action timeout. The audit runner owns the outer wall-clock timeout. */
  readonly actionTimeoutMs?: number;
}

interface CompiledProgram {
  readonly harnessId: string;
  readonly contract: OfficialPlaywrightContractV1;
  readonly assertion: OfficialPlaywrightAssertionV1;
}

interface RuntimeFindings {
  readonly violations: readonly {
    readonly id: string;
    readonly impact: "critical" | "minor" | "moderate" | "serious" | null;
    readonly nodeCount: number;
  }[];
  readonly incomplete: readonly { readonly id: string; readonly nodeCount: number }[];
}

interface MutableContext {
  role: string | null;
  name: string | null;
  states: AuditStateObservationV1[];
  keyboard: AuditKeyboardObservationV1[];
  focus: AuditFocusObservationV1[];
  announcements: AuditAnnouncementObservationV1[];
  axe: AuditAxeObservationV1[];
  geometry: AuditGeometryObservationV1[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function catalogId(value: string, label: string): void {
  if (value.length > 128 || !catalogIdPattern.test(value)) {
    throw new TypeError(`${label} must be a catalog id.`);
  }
}

function boundedText(value: string, maximum: number, label: string): void {
  const hasDisallowedControl = [...value].some((character) => {
    const code = character.codePointAt(0)!;
    return (code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f;
  });
  if (
    value.trim().length === 0 ||
    value.length > maximum ||
    value.normalize("NFC") !== value ||
    hasDisallowedControl
  ) {
    throw new TypeError(`${label} must be bounded normalized text.`);
  }
}

function projectPath(value: string): void {
  if (
    value.length === 0 ||
    value.length > 512 ||
    value !== value.normalize("NFC") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    !value
      .split("/")
      .every(
        (segment) =>
          segment !== "." &&
          segment !== ".." &&
          !segment.endsWith(".") &&
          !segment.endsWith(" ") &&
          projectSegmentPattern.test(segment),
      )
  ) {
    throw new TypeError("Official Playwright projectPath must be portable and project-relative.");
  }
}

function actionTimeout(value: number | undefined): number {
  const result = value ?? 5_000;
  if (!Number.isSafeInteger(result) || result < 100 || result > 30_000) {
    throw new TypeError("Official Playwright action timeout must be 100 through 30000 ms.");
  }
  return result;
}

function locatorConfiguration(value: OfficialPlaywrightLocatorV1, label: string): void {
  boundedText(value.role, 64, `${label} role`);
  if (value.name !== undefined) boundedText(value.name, 512, `${label} name`);
}

function validateAssertion(assertion: OfficialPlaywrightAssertionV1): void {
  catalogId(assertion.assertionId, "Official Playwright assertion id");
  if (!runtimeModes.includes(assertion.mode)) {
    throw new TypeError("Official Playwright assertion mode is invalid.");
  }
  projectPath(assertion.projectPath);
  if (assertion.applicability === "not-applicable") {
    boundedText(assertion.reason, 1_024, "Official Playwright not-applicable reason");
    return;
  }
  locatorConfiguration(assertion.target, "Official Playwright target");
  const action = assertion.action ?? { kind: "none" as const };
  if (action.kind === "press") boundedText(action.key, 64, "Official Playwright key");
  if (assertion.mode === "keyboard" && action.kind !== "press") {
    throw new TypeError("Official Playwright keyboard assertions require a compiled keypress.");
  }
  const states = assertion.states ?? [];
  if (
    states.length > MAX_OBSERVATIONS ||
    new Set(states.map(({ name }) => name)).size !== states.length
  ) {
    throw new TypeError("Official Playwright state expectations are invalid.");
  }
  for (const state of states) {
    if (state.name === "value" && typeof state.expected === "object") {
      throw new TypeError("Official Playwright state values must be JSON primitives.");
    }
  }
  if (assertion.focus !== undefined) {
    catalogId(assertion.focus.step, "Official Playwright focus step");
    locatorConfiguration(assertion.focus.target, "Official Playwright focus target");
  }
  if (assertion.announcement !== undefined) {
    boundedText(assertion.announcement.selector, 512, "Official Playwright live selector");
    boundedText(assertion.announcement.text, 512, "Official Playwright announcement");
  }
  if (assertion.axe?.scopeSelector !== undefined) {
    boundedText(assertion.axe.scopeSelector, 512, "Official Playwright axe scope");
  }
  if (assertion.responsive !== undefined) {
    if (
      !Number.isSafeInteger(assertion.responsive.width) ||
      !Number.isSafeInteger(assertion.responsive.height) ||
      assertion.responsive.width < 240 ||
      assertion.responsive.width > 3_840 ||
      assertion.responsive.height < 240 ||
      assertion.responsive.height > 3_840 ||
      (assertion.responsive.maximumHorizontalOverflowPx !== undefined &&
        (!Number.isFinite(assertion.responsive.maximumHorizontalOverflowPx) ||
          assertion.responsive.maximumHorizontalOverflowPx < 0 ||
          assertion.responsive.maximumHorizontalOverflowPx > 1_000))
    ) {
      throw new TypeError("Official Playwright responsive dimensions are invalid.");
    }
    boundedText(assertion.responsive.rootSelector, 512, "Official Playwright responsive root");
  }
  if (assertion.mode === "responsive" && assertion.responsive === undefined) {
    throw new TypeError("Official Playwright responsive assertions require viewport geometry.");
  }
}

function contractKey(value: {
  readonly registryId: string;
  readonly itemId: string;
  readonly contractId: string;
  readonly contractVersion: string;
  readonly payloadDigest: string;
}): string {
  return `${value.registryId}:${value.itemId}:${value.contractId}:${value.contractVersion}:${value.payloadDigest}`;
}

function programKey(
  harnessId: string,
  contract: Parameters<typeof contractKey>[0],
  assertionId: string,
): string {
  return `${harnessId}\u0000${contractKey(contract)}\u0000${assertionId}`;
}

function compileHarnesses(harnesses: readonly OfficialPlaywrightHarnessV1[]): {
  readonly registrations: OfficialBrowserHostV1["harnesses"];
  readonly programs: ReadonlyMap<string, CompiledProgram>;
} {
  if (harnesses.length === 0 || harnesses.length > 64) {
    throw new TypeError("Official Playwright harness count is invalid.");
  }
  const programs = new Map<string, CompiledProgram>();
  const registrations = harnesses.map((harness) => {
    catalogId(harness.harnessId, "Official Playwright harness id");
    if (harness.contracts.length === 0) {
      throw new TypeError("Official Playwright harness requires compiled Contracts.");
    }
    const modes = new Set<RuntimeAuditMode>();
    const contracts: OfficialBrowserHostContractBindingV1[] = harness.contracts.map((contract) => {
      if (contract.assertions.length === 0) {
        throw new TypeError("Official Playwright Contract requires compiled assertions.");
      }
      const assertionIds = new Set<string>();
      for (const assertion of contract.assertions) {
        validateAssertion(assertion);
        if (assertionIds.has(assertion.assertionId)) {
          throw new TypeError("Official Playwright repeats a compiled assertion.");
        }
        assertionIds.add(assertion.assertionId);
        modes.add(assertion.mode);
        const key = programKey(harness.harnessId, contract, assertion.assertionId);
        if (programs.has(key)) throw new TypeError("Official Playwright repeats a program route.");
        programs.set(key, { harnessId: harness.harnessId, contract, assertion });
      }
      return {
        registryId: contract.registryId,
        itemId: contract.itemId,
        contractId: contract.contractId,
        contractVersion: contract.contractVersion,
        payloadDigest: contract.payloadDigest,
        assertionIds: [...assertionIds].sort(compareText),
      };
    });
    return {
      harnessId: harness.harnessId,
      modes: [...modes].sort(compareText),
      contracts,
    };
  });
  if (new Set(registrations.map(({ harnessId }) => harnessId)).size !== registrations.length) {
    throw new TypeError("Official Playwright repeats a harness id.");
  }
  return { registrations, programs };
}

function emptyMutableContext(): MutableContext {
  return {
    role: null,
    name: null,
    states: [],
    keyboard: [],
    focus: [],
    announcements: [],
    axe: [],
    geometry: [],
  };
}

function immutableContext(value: MutableContext): AuditRuntimeContextV1 {
  return {
    role: value.role,
    name: value.name,
    states: value.states,
    keyboard: value.keyboard,
    focus: value.focus,
    announcements: value.announcements,
    axe: value.axe,
    geometry: value.geometry,
  };
}

function locatorFor(page: Page, specification: OfficialPlaywrightLocatorV1): Locator {
  return page.getByRole(specification.role, {
    ...(specification.name === undefined ? {} : { name: specification.name }),
    exact: true,
  });
}

function fallbackEvidence(
  mode: RuntimeAuditMode,
  context: MutableContext,
  action: OfficialPlaywrightActionV1,
  count: number,
): void {
  if (mode === "keyboard") {
    context.keyboard.push({
      key: action.kind === "press" ? action.key : "Tab",
      action: "locate",
      outcome: `The compiled target resolved ${String(count)} times.`,
    });
  } else if (mode === "responsive") {
    context.geometry.push({ metric: "target-count", value: count, unit: "count" });
  } else {
    context.states.push({ name: "target-count", value: count });
  }
}

async function readState(
  locator: Locator,
  state: OfficialPlaywrightStateNameV1,
): Promise<JsonPrimitive> {
  return locator.evaluate((element, stateName): JsonPrimitive => {
    const aria = (name: string): string | null => element.getAttribute(`aria-${name}`);
    const booleanValue = (name: string, nativeName?: string): boolean | string | null => {
      if (nativeName !== undefined && nativeName in element) {
        const native = (element as unknown as Record<string, unknown>)[nativeName];
        if (typeof native === "boolean") return native;
      }
      const value = aria(name);
      return value === "true" ? true : value === "false" ? false : value;
    };
    if (stateName === "busy") return booleanValue("busy");
    if (stateName === "checked") return booleanValue("checked", "checked");
    if (stateName === "disabled") return booleanValue("disabled", "disabled") ?? false;
    if (stateName === "expanded") return booleanValue("expanded");
    if (stateName === "invalid") return booleanValue("invalid") ?? false;
    if (stateName === "pressed") return booleanValue("pressed");
    if (stateName === "readonly") return booleanValue("readonly", "readOnly") ?? false;
    if (stateName === "required") return booleanValue("required", "required") ?? false;
    if (stateName === "selected") return booleanValue("selected", "selected") ?? false;
    const nativeValue = (element as unknown as { readonly value?: unknown }).value;
    if (typeof nativeValue === "string" || typeof nativeValue === "number") return nativeValue;
    const ariaValue = aria("valuenow");
    if (ariaValue === null) return null;
    const number = Number(ariaValue);
    return Number.isFinite(number) ? number : ariaValue;
  }, state);
}

async function applyAction(
  locator: Locator,
  action: OfficialPlaywrightActionV1,
  timeout: number,
  context: MutableContext,
  failures: string[],
): Promise<void> {
  if (action.kind === "none") return;
  try {
    if (action.kind === "click") await locator.click({ timeout });
    else {
      await locator.focus({ timeout });
      await locator.press(action.key, { timeout });
      context.keyboard.push({
        key: action.key,
        action: "press",
        outcome: "The compiled keypress completed.",
      });
    }
  } catch {
    failures.push(action.kind === "press" ? "AUDIT_KEYBOARD_ACTION_FAILED" : "AUDIT_ACTION_FAILED");
    if (action.kind === "press") {
      context.keyboard.push({
        key: action.key,
        action: "press",
        outcome: "The compiled keypress could not complete.",
      });
    }
  }
}

async function observeFocus(
  page: Page,
  expectation: OfficialPlaywrightFocusExpectationV1,
  context: MutableContext,
  failures: string[],
): Promise<void> {
  const expected = locatorFor(page, expectation.target);
  const count = await expected.count();
  if (count !== 1) {
    context.focus.push({
      step: expectation.step,
      target: null,
      visible: null,
      occluded: null,
    });
    failures.push("AUDIT_FOCUS_TARGET_COUNT");
    return;
  }
  const observation = await expected.evaluate((element) => {
    const active = document.activeElement;
    const expectedFocused = active === element || (active !== null && element.contains(active));
    const focused = active instanceof HTMLElement ? active : null;
    if (focused === null) return { expectedFocused, visible: false, occluded: false };
    const rect = focused.getBoundingClientRect();
    const style = getComputedStyle(focused);
    const visible =
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.visibility !== "collapse" &&
      style.opacity !== "0";
    const top = visible
      ? document.elementFromPoint(
          Math.max(0, Math.min(Math.max(0, innerWidth - 1), rect.left + rect.width / 2)),
          Math.max(0, Math.min(Math.max(0, innerHeight - 1), rect.top + rect.height / 2)),
        )
      : null;
    return {
      expectedFocused,
      visible,
      occluded: visible && (top === null || (top !== focused && !focused.contains(top))),
    };
  });
  context.focus.push({
    step: expectation.step,
    target: observation.expectedFocused
      ? (expectation.target.name ?? expectation.target.role)
      : "different-focus-target",
    visible: observation.visible,
    occluded: observation.occluded,
  });
  if (!observation.expectedFocused) failures.push("AUDIT_FOCUS_TARGET_MISMATCH");
  if (observation.visible !== (expectation.visible ?? true)) {
    failures.push("AUDIT_FOCUS_VISIBILITY_MISMATCH");
  }
  if (observation.occluded !== (expectation.occluded ?? false)) {
    failures.push("AUDIT_FOCUS_OCCLUSION_MISMATCH");
  }
}

async function observeAnnouncement(
  page: Page,
  expectation: OfficialPlaywrightAnnouncementExpectationV1,
  context: MutableContext,
  failures: string[],
): Promise<void> {
  const live = page.locator(expectation.selector);
  if ((await live.count()) !== 1) {
    failures.push("AUDIT_ANNOUNCEMENT_TARGET_COUNT");
    return;
  }
  const observed = await live.evaluate(
    (element): { readonly text: string; readonly politeness: "assertive" | "off" | "polite" } => {
      const role = element.getAttribute("role");
      const explicit = element.getAttribute("aria-live");
      const politeness =
        explicit === "assertive" || explicit === "off" || explicit === "polite"
          ? explicit
          : role === "alert"
            ? "assertive"
            : role === "log" || role === "status"
              ? "polite"
              : "off";
      return { text: element.textContent?.trim() ?? "", politeness };
    },
  );
  if (observed.text.length > 512) {
    failures.push("AUDIT_ANNOUNCEMENT_OUTPUT_TOO_LARGE");
  } else if (observed.text.length > 0) {
    context.announcements.push(observed);
  }
  if (observed.text !== expectation.text || observed.politeness !== expectation.politeness) {
    failures.push("AUDIT_ANNOUNCEMENT_MISMATCH");
  }
}

async function observeAxe(
  page: Page,
  expectation: OfficialPlaywrightAxeExpectationV1,
  context: MutableContext,
  failures: string[],
): Promise<void> {
  await page.addScriptTag({ content: axe.source });
  const findings = await page.evaluate(async (scopeSelector): Promise<RuntimeFindings> => {
    const scope = scopeSelector === null ? document : document.querySelector(scopeSelector);
    if (scope === null) throw new Error("The compiled axe scope did not resolve.");
    const runtime = (
      globalThis as unknown as {
        readonly axe?: {
          run(
            target: Document | Element,
            options: Record<string, unknown>,
          ): Promise<{
            readonly violations: readonly {
              readonly id: string;
              readonly impact: "critical" | "minor" | "moderate" | "serious" | null;
              readonly nodes: readonly unknown[];
            }[];
            readonly incomplete: readonly {
              readonly id: string;
              readonly nodes: readonly unknown[];
            }[];
          }>;
        };
      }
    ).axe;
    if (runtime === undefined) throw new Error("axe-core was not injected.");
    const result = await runtime.run(scope, {
      reporter: "v2",
      resultTypes: ["violations", "incomplete"],
    });
    return {
      violations: result.violations.map((entry) => ({
        id: entry.id,
        impact: entry.impact,
        nodeCount: entry.nodes.length,
      })),
      incomplete: result.incomplete.map((entry) => ({
        id: entry.id,
        nodeCount: entry.nodes.length,
      })),
    };
  }, expectation.scopeSelector ?? null);
  const observations = new Map<string, AuditAxeObservationV1>();
  for (const finding of findings.violations) {
    observations.set(finding.id, {
      ruleId: finding.id,
      impact: finding.impact,
      nodeCount: finding.nodeCount,
    });
  }
  for (const finding of findings.incomplete) {
    if (!observations.has(finding.id)) {
      observations.set(finding.id, {
        ruleId: finding.id,
        impact: null,
        nodeCount: finding.nodeCount,
      });
    }
  }
  context.axe.push(
    ...[...observations.values()]
      .sort((left, right) => compareText(left.ruleId, right.ruleId))
      .slice(0, MAX_OBSERVATIONS),
  );
  if (findings.violations.length > 0) failures.push("AUDIT_AXE_VIOLATION");
  if (findings.incomplete.length > 0) failures.push("AUDIT_AXE_INCOMPLETE");
  if (observations.size > MAX_OBSERVATIONS) failures.push("AUDIT_AXE_OUTPUT_TOO_LARGE");
}

async function observeResponsive(
  page: Page,
  expectation: OfficialPlaywrightResponsiveExpectationV1,
  context: MutableContext,
  failures: string[],
): Promise<void> {
  await page.setViewportSize({ width: expectation.width, height: expectation.height });
  const root = page.locator(expectation.rootSelector);
  const count = await root.count();
  context.geometry.push(
    { metric: "viewport-height", value: expectation.height, unit: "px" },
    { metric: "viewport-width", value: expectation.width, unit: "px" },
  );
  if (count !== 1) {
    context.geometry.push({ metric: "root-count", value: count, unit: "count" });
    failures.push("AUDIT_RESPONSIVE_ROOT_COUNT");
    return;
  }
  const overflow = await root.evaluate((element) =>
    Math.max(0, element.scrollWidth - element.clientWidth),
  );
  context.geometry.push({ metric: "horizontal-overflow", value: overflow, unit: "px" });
  if (overflow > (expectation.maximumHorizontalOverflowPx ?? 1)) {
    failures.push("AUDIT_RESPONSIVE_OVERFLOW");
  }
}

async function executeProgram(
  page: Page,
  program: CompiledProgram,
  signal: AbortSignal,
  reloadBeforeEach: boolean,
  timeout: number,
): Promise<RuntimeHarnessOutcomeV1> {
  const { assertion } = program;
  if (assertion.applicability === "not-applicable") {
    return {
      state: "not-applicable",
      actualBehavior: assertion.reason,
      projectPath: assertion.projectPath,
      failureCode: null,
      context: emptyMutableContext(),
    };
  }
  if (signal.aborted) throw new TypeError("Official Playwright execution was cancelled.");
  if (reloadBeforeEach && page.url() !== "about:blank") {
    await page.reload({ waitUntil: "load", timeout });
  }
  const context = emptyMutableContext();
  const failures: string[] = [];
  if (assertion.responsive !== undefined) {
    await observeResponsive(page, assertion.responsive, context, failures);
  }
  if (signal.aborted) throw new TypeError("Official Playwright execution was cancelled.");
  const target = locatorFor(page, assertion.target);
  const count = await target.count();
  const action = assertion.action ?? { kind: "none" as const };
  if (count !== 1) {
    fallbackEvidence(assertion.mode, context, action, count);
    return {
      state: "fail",
      actualBehavior: `The compiled semantic target resolved ${String(count)} times.`,
      projectPath: assertion.projectPath,
      failureCode: "AUDIT_SEMANTIC_TARGET_COUNT",
      context: immutableContext(context),
    };
  }
  context.role = assertion.target.role;
  context.name = assertion.target.name ?? null;
  await applyAction(target, action, timeout, context, failures);
  for (const state of assertion.states ?? []) {
    const observed = await readState(target, state.name);
    context.states.push({ name: state.name, value: observed });
    if (!Object.is(observed, state.expected)) failures.push("AUDIT_STATE_MISMATCH");
  }
  if (assertion.focus !== undefined) {
    await observeFocus(page, assertion.focus, context, failures);
  }
  if (assertion.announcement !== undefined) {
    await observeAnnouncement(page, assertion.announcement, context, failures);
  }
  if (assertion.axe !== undefined) {
    await observeAxe(page, assertion.axe, context, failures);
  }
  if (signal.aborted) throw new TypeError("Official Playwright execution was cancelled.");
  const uniqueFailures = [...new Set(failures)];
  return {
    state: uniqueFailures.length === 0 ? "pass" : "fail",
    actualBehavior:
      uniqueFailures.length === 0
        ? "The compiled Playwright assertion completed with bounded browser evidence."
        : `The compiled Playwright assertion failed: ${uniqueFailures.join(", ")}.`,
    projectPath: assertion.projectPath,
    failureCode: uniqueFailures[0] ?? null,
    context: immutableContext(context),
  };
}

/**
 * Creates the concrete official browser host backed by a caller-owned live
 * Playwright page. All executable programs are trusted code-side inputs; the
 * host dispatches registry Contracts only after exact immutable allowlisting.
 */
export function createOfficialPlaywrightBrowserHostV1(
  options: OfficialPlaywrightBrowserHostOptionsV1,
): OfficialBrowserHostV1 {
  if (options.page === null || typeof options.page !== "object") {
    throw new TypeError("Official Playwright host requires a live Page.");
  }
  const timeout = actionTimeout(options.actionTimeoutMs);
  const compiled = compileHarnesses(options.harnesses);
  const host: OfficialBrowserHostV1 = {
    hostId: OFFICIAL_BROWSER_HOST_ID,
    protocolVersion: OFFICIAL_BROWSER_HOST_PROTOCOL_VERSION,
    harnesses: compiled.registrations,
    async execute(request: OfficialBrowserHostRequestV1, execution) {
      const program = compiled.programs.get(
        programKey(request.harnessId, request.contract, request.assertion.assertionId),
      );
      if (program === undefined || program.assertion.mode !== request.assertion.mode) {
        throw new TypeError("Official Playwright has no compiled program for this request.");
      }
      return executeProgram(
        options.page,
        program,
        execution.signal,
        options.reloadBeforeEach ?? true,
        timeout,
      );
    },
  };
  // Reuse the public protocol validator so malformed concrete hosts cannot escape review.
  createOfficialBrowserHostAdaptersV1(host);
  return host;
}
