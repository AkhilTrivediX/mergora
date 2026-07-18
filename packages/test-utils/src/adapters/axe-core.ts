import type axe from "axe-core";

import type { AxeAdapter, AxeImpact, AxeRunResult } from "../runtime-contracts.js";
import { HarnessConfigurationError, RuntimeCapabilityError } from "../runtime-capability.js";

export interface AxeCoreFinding {
  readonly id: string;
  readonly impact?: string | null;
  readonly nodes: readonly unknown[];
}

export interface AxeCoreResult {
  readonly violations: readonly AxeCoreFinding[];
  readonly incomplete: readonly AxeCoreFinding[];
}

export interface AxeCoreRuntime {
  run(target: axe.ElementContext, options: axe.RunOptions): AxeCoreResult | Promise<AxeCoreResult>;
}

export interface AxeCoreAdapterOptions {
  /** An explicit document for selector contexts or non-global DOM implementations. */
  readonly document?: Document;
  /** A test/browser seam. Omit it to load the installed axe-core runtime on first run. */
  readonly runtime?: AxeCoreRuntime;
  readonly loadRuntime?: () => Promise<AxeCoreRuntime>;
}

export type AxeCoreTarget = axe.ElementContext | undefined;
export type AxeCoreRunOptions = axe.RunOptions | undefined;

const impacts = new Set<AxeImpact>(["minor", "moderate", "serious", "critical", null]);

function documentForTarget(
  target: AxeCoreTarget,
  configuredDocument: Document | undefined,
): Document | undefined {
  if (configuredDocument !== undefined) return configuredDocument;
  if (typeof target === "object" && target !== null) {
    if ("nodeType" in target && target.nodeType === 9) return target as Document;
    if ("ownerDocument" in target) {
      const ownerDocument = (target as { readonly ownerDocument?: Document | null }).ownerDocument;
      if (ownerDocument != null) return ownerDocument;
    }
  }
  return typeof document === "undefined" ? undefined : document;
}

async function loadInstalledAxeCore(): Promise<AxeCoreRuntime> {
  const loaded = await import("axe-core");
  const runtime = ("default" in loaded ? loaded.default : loaded) as unknown as AxeCoreRuntime;
  if (typeof runtime.run !== "function") {
    throw new RuntimeCapabilityError("axe-core", "The loaded module does not expose axe.run().");
  }
  return runtime;
}

function requireFindings(
  findings: readonly AxeCoreFinding[] | undefined,
  category: "violations" | "incomplete",
): readonly AxeCoreFinding[] {
  if (!Array.isArray(findings)) {
    throw new HarnessConfigurationError(
      "axe-core.invalid-result",
      `axe-core did not return a ${category} array.`,
    );
  }
  for (const finding of findings) {
    if (
      typeof finding.id !== "string" ||
      finding.id.trim().length === 0 ||
      !Array.isArray(finding.nodes) ||
      finding.nodes.length === 0
    ) {
      throw new HarnessConfigurationError(
        "axe-core.invalid-result",
        `axe-core returned an invalid ${category} finding.`,
      );
    }
  }
  return findings;
}

function normalizeViolations(
  findings: readonly AxeCoreFinding[] | undefined,
): AxeRunResult["violations"] {
  return requireFindings(findings, "violations")
    .map((finding) => {
      const impact = finding.impact ?? null;
      if (!impacts.has(impact as AxeImpact)) {
        throw new HarnessConfigurationError(
          "axe-core.invalid-impact",
          `axe-core rule ${finding.id} returned an unknown impact.`,
        );
      }
      return { id: finding.id, impact: impact as AxeImpact, nodeCount: finding.nodes.length };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeIncomplete(
  findings: readonly AxeCoreFinding[] | undefined,
): AxeRunResult["incomplete"] {
  return requireFindings(findings, "incomplete")
    .map((finding) => ({ id: finding.id, nodeCount: finding.nodes.length }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Creates a lazy axe-core adapter. It records only real violation and incomplete counts; assessment,
 * waivers, and serious/critical gating remain in runAxeContract/assessAxeResult.
 */
export function createAxeCoreAdapter(
  configuration: AxeCoreAdapterOptions = {},
): AxeAdapter<AxeCoreTarget, AxeCoreRunOptions> {
  return {
    async run(target, options): Promise<AxeRunResult> {
      const activeDocument = documentForTarget(target, configuration.document);
      if (activeDocument === undefined || activeDocument.defaultView == null) {
        throw new RuntimeCapabilityError(
          "axe-document",
          "axe-core requires a browser-compatible document with a defaultView.",
        );
      }

      const resolvedTarget = target ?? activeDocument;
      const runtime =
        configuration.runtime ??
        (await (configuration.loadRuntime ?? loadInstalledAxeCore)().catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : String(error);
          throw new RuntimeCapabilityError("axe-core", detail);
        }));
      if (typeof runtime.run !== "function") {
        throw new RuntimeCapabilityError("axe-core", "The configured runtime has no run method.");
      }

      const raw = await runtime.run(resolvedTarget, {
        ...options,
        reporter: "v2",
        resultTypes: ["violations", "incomplete"],
      });
      return {
        violations: normalizeViolations(raw.violations),
        incomplete: normalizeIncomplete(raw.incomplete),
      };
    },
  };
}
