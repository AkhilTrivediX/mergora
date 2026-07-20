import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import type { GeneratorCatalogDefinition } from "./model.ts";

export type ProfileDeliveryStatus =
  "planned" | "implemented-unverified" | "evidence-backed" | "blocked";

export type EvidenceAssessmentStatus = "not-verified" | "partial" | "verified" | "blocked";

export interface ImplementationEvidenceReference {
  readonly kind:
    "repository-file" | "generated-artifact" | "official-documentation" | "manual-record";
  readonly location: string;
}

export interface ProfileStatement {
  readonly status: ProfileDeliveryStatus;
  readonly summary: string;
  readonly references: readonly ImplementationEvidenceReference[];
}

export interface ShadcnBaselineProfile {
  readonly comparison: "direct-component" | "common-composition" | "no-direct-equivalent";
  readonly summary: string;
  readonly references: readonly ImplementationEvidenceReference[];
}

export interface MergoraAdvantageProfile extends ProfileStatement {
  readonly enhancementIds: readonly string[];
}

export interface VisualSignatureProfile extends ProfileStatement {
  readonly patternIds: readonly string[];
  readonly tokenReferences: readonly string[];
}

export interface OptionalEnhancementProfile extends ProfileStatement {
  readonly id: string;
  readonly storybookControlNames: readonly string[];
  readonly api: {
    readonly kind: "prop" | "compound-part" | "hook" | "composition";
    readonly names: readonly string[];
    readonly enableWhen: string;
  };
  readonly defaultEnabled: boolean;
  readonly disabledBehavior: {
    readonly ui: string;
    readonly behavior: string;
    readonly events: string;
    readonly accessibility: string;
  };
}

export interface StorybookEvidenceProfile {
  readonly status: "missing" | "declared" | "tested" | "blocked";
  readonly mode: "basic-enhancements-disabled" | "recommended-enhancements-enabled";
  readonly modulePath: string | null;
  readonly exportName: string | null;
  readonly enhancementControls: readonly string[];
  readonly references: readonly ImplementationEvidenceReference[];
}

export interface EvidenceAssessmentProfile {
  readonly status: EvidenceAssessmentStatus;
  readonly summary: string;
  readonly references: readonly ImplementationEvidenceReference[];
}

export interface MaturityAssessmentProfile {
  readonly status:
    | "not-ready"
    | "experimental-candidate"
    | "beta-candidate"
    | "ready-for-promotion-review"
    | "deprecated-candidate"
    | "blocked";
  readonly rationale: string;
  readonly references: readonly ImplementationEvidenceReference[];
}

export interface ImplementationProfileBlocker {
  readonly code: string;
  readonly summary: string;
  readonly references: readonly ImplementationEvidenceReference[];
}

export interface ImplementationProfile {
  readonly id: string;
  readonly ordinaryShadcnBaseline: ShadcnBaselineProfile;
  readonly mergoraAdvantage: MergoraAdvantageProfile;
  readonly visualSignature: VisualSignatureProfile;
  readonly optionalEnhancements: readonly OptionalEnhancementProfile[];
  readonly storybook: {
    readonly basic: StorybookEvidenceProfile;
    readonly enhanced: StorybookEvidenceProfile;
  };
  readonly accessibilityEvidence: EvidenceAssessmentProfile;
  readonly interactionEvidence: EvidenceAssessmentProfile;
  readonly parityEvidence: EvidenceAssessmentProfile;
  readonly blockers: readonly ImplementationProfileBlocker[];
  readonly maturityAssessment: MaturityAssessmentProfile;
}

export interface ImplementationProfileShard {
  readonly schemaVersion: 1;
  readonly category: string;
  readonly auditPendingIds: readonly string[];
  readonly profiles: readonly ImplementationProfile[];
}

export interface MergoraSignaturePolicy {
  readonly schemaVersion: 1;
  readonly tokenReferencePolicy: "semantic-only";
  readonly maximumCornerRadiusCssPx: 16;
  readonly patterns: readonly {
    readonly id: string;
    readonly description: string;
  }[];
}

export interface ImplementationMatrixSource {
  readonly id: string;
  readonly entryPath: string;
  readonly packageEntryPath: string;
  readonly contractPath: string;
  readonly storyPath: string | null;
}

type MatrixImplementationStatus = "unimplemented" | "source-present-unreleased";
type MatrixProfileStatus = "audit-pending" | "profiled-incomplete" | "evidence-backed";

interface MatrixGeneratedMarker {
  readonly by: "@mergora-internal/registry-builder";
  readonly editPolicy: "do-not-edit";
}

interface MatrixPendingStatement {
  readonly status: "audit-pending";
  readonly summary: null;
  readonly references: readonly [];
}

interface MatrixPendingStory {
  readonly status: "audit-pending";
  readonly mode: "basic-enhancements-disabled" | "recommended-enhancements-enabled";
  readonly modulePath: null;
  readonly exportName: null;
  readonly enhancementControls: readonly [];
  readonly references: readonly [];
}

interface MatrixPendingAssessment {
  readonly status: "audit-pending";
  readonly summary: null;
  readonly references: readonly [];
}

export interface ImplementationMatrix {
  readonly schemaVersion: 1;
  readonly artifactKind: "catalog-implementation-matrix";
  readonly generated: MatrixGeneratedMarker;
  readonly authority: "registry/generated/catalog.json";
  readonly profileSchema: "registry/quality/implementation-profile-shard.v1.schema.json";
  readonly matrixSchema: "registry/quality/implementation-matrix.v1.schema.json";
  readonly signaturePolicy: "registry/quality/mergora-signature-policy.v1.json";
  readonly publicationStatus: "blocked-unreleased";
  readonly inventory: {
    readonly entries: number;
    readonly categories: number;
    readonly implementationStatus: Readonly<Record<MatrixImplementationStatus, number>>;
    readonly profileStatus: Readonly<Record<MatrixProfileStatus, number>>;
  };
  readonly items: readonly {
    readonly id: string;
    readonly displayName: string;
    readonly family: string;
    readonly layer: "foundation" | "component" | "system" | "kit";
    readonly kind: "catalog-item" | "kit";
    readonly implementationStatus: MatrixImplementationStatus;
    readonly sourceAvailable: boolean;
    readonly profileStatus: MatrixProfileStatus;
    readonly ordinaryShadcnBaseline: ShadcnBaselineProfile | MatrixPendingStatement;
    readonly mergoraAdvantage: MergoraAdvantageProfile | MatrixPendingStatement;
    readonly visualSignature:
      | VisualSignatureProfile
      | (MatrixPendingStatement & {
          readonly patternIds: readonly [];
          readonly tokenReferences: readonly [];
        });
    readonly optionalEnhancements: {
      readonly status: "audit-pending" | "profiled";
      readonly items: readonly OptionalEnhancementProfile[];
    };
    readonly storybook: {
      readonly stateContractPath: string | null;
      readonly basic: StorybookEvidenceProfile | MatrixPendingStory;
      readonly enhanced: StorybookEvidenceProfile | MatrixPendingStory;
    };
    readonly accessibilityEvidence: EvidenceAssessmentProfile | MatrixPendingAssessment;
    readonly interactionEvidence: EvidenceAssessmentProfile | MatrixPendingAssessment;
    readonly packageSourceShadcnParity: {
      readonly artifacts: {
        readonly canonicalSource: string | null;
        readonly packageEntry: string | null;
        readonly nativeRegistry: string | null;
        readonly shadcn: string | null;
      };
      readonly assessment: EvidenceAssessmentProfile | MatrixPendingAssessment;
    };
    readonly remainingBlockers: readonly ImplementationProfileBlocker[];
    readonly maturity: {
      readonly target: "experimental" | "beta" | "stable" | "deprecated";
      readonly published: null;
      readonly assessment:
        | MaturityAssessmentProfile
        | {
            readonly status: "audit-pending";
            readonly rationale: null;
            readonly references: readonly [];
          };
    };
  }[];
}

const GENERATED_MARKER: MatrixGeneratedMarker = {
  by: "@mergora-internal/registry-builder",
  editPolicy: "do-not-edit",
};

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const TOKEN_PATTERN = /^--mrg-semantic-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const EXPORT_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
const SAFE_PATH_PATTERN =
  /^(?!\/)(?![A-Za-z]:)(?!.*\\)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u;
const PRIVATE_PATH_PREFIXES = ["PLANS/", ".codex-runs/", ".git/"] as const;
const PROFILE_DIRECTORY = "registry/quality/implementation-profiles";
const EVIDENCE_REFERENCE_KINDS = [
  "repository-file",
  "generated-artifact",
  "official-documentation",
  "manual-record",
] as const;
const DELIVERY_STATUSES = [
  "planned",
  "implemented-unverified",
  "evidence-backed",
  "blocked",
] as const;
const ASSESSMENT_STATUSES = ["not-verified", "partial", "verified", "blocked"] as const;
const STORY_STATUSES = ["missing", "declared", "tested", "blocked"] as const;
const MATURITY_ASSESSMENTS = [
  "not-ready",
  "experimental-candidate",
  "beta-candidate",
  "ready-for-promotion-review",
  "deprecated-candidate",
  "blocked",
] as const;
const ENHANCEMENT_API_KINDS = ["prop", "compound-part", "hook", "composition"] as const;
const SHADCN_COMPARISONS = [
  "direct-component",
  "common-composition",
  "no-direct-equivalent",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): void {
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key))
      throw new Error(`${path} contains unsupported field ${JSON.stringify(key)}.`);
  }
  for (const key of keys) {
    if (!(key in value))
      throw new Error(`${path} is missing required field ${JSON.stringify(key)}.`);
  }
}

function assertEnum<const Value extends string>(
  value: unknown,
  values: readonly Value[],
  path: string,
): asserts value is Value {
  if (typeof value !== "string" || !values.includes(value as Value)) {
    throw new Error(`${path} must be one of ${values.join(", ")}.`);
  }
}

function assertNonEmptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 4_000) {
    throw new Error(`${path} must be a non-empty string no longer than 4000 characters.`);
  }
}

function assertId(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new Error(`${path} must be lowercase ASCII kebab-case.`);
  }
}

function assertUniqueStrings(
  value: unknown,
  path: string,
  validate: (entry: unknown, path: string) => asserts entry is string = assertNonEmptyString,
): asserts value is string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    validate(entry, `${path}/${index}`);
    if (seen.has(entry)) throw new Error(`${path} contains duplicate ${JSON.stringify(entry)}.`);
    seen.add(entry);
  });
}

function assertPortableReferencePath(path: string, context: string): void {
  if (
    !SAFE_PATH_PATTERN.test(path) ||
    path.includes("//") ||
    path.split("/").some((segment) => segment === "" || segment === ".") ||
    PRIVATE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
  ) {
    throw new Error(`${context} must be a safe public repository-relative path.`);
  }
}

function assertEvidenceReference(
  value: unknown,
  path: string,
  workspaceRoot?: string,
): asserts value is ImplementationEvidenceReference {
  assertRecord(value, path);
  assertExactKeys(value, ["kind", "location"], path);
  assertEnum(value.kind, EVIDENCE_REFERENCE_KINDS, `${path}/kind`);
  assertNonEmptyString(value.location, `${path}/location`);

  if (value.kind === "official-documentation") {
    let url: URL;
    try {
      url = new URL(value.location);
    } catch {
      throw new Error(`${path}/location must be a valid HTTPS URL.`);
    }
    if (url.protocol !== "https:") {
      throw new Error(`${path}/location must be a valid HTTPS URL.`);
    }
    return;
  }

  assertPortableReferencePath(value.location, `${path}/location`);
  if (value.kind === "generated-artifact") {
    if (
      !value.location.startsWith("registry/generated/") &&
      !value.location.startsWith("content/generated/") &&
      !value.location.startsWith("packages/ui/src/generated/")
    ) {
      throw new Error(`${path}/location must name a generator-owned artifact.`);
    }
    return;
  }
  if (value.kind === "manual-record" && !value.location.startsWith("docs/quality/")) {
    throw new Error(`${path}/location must name a public docs/quality manual record.`);
  }
  if (workspaceRoot !== undefined && !existsSync(resolve(workspaceRoot, value.location))) {
    throw new Error(`${path}/location references missing file ${JSON.stringify(value.location)}.`);
  }
}

function assertEvidenceReferences(
  value: unknown,
  path: string,
  workspaceRoot?: string,
): asserts value is ImplementationEvidenceReference[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    assertEvidenceReference(entry, `${path}/${index}`, workspaceRoot);
    const key = `${entry.kind}:${entry.location}`;
    if (seen.has(key)) throw new Error(`${path} contains duplicate evidence reference ${key}.`);
    seen.add(key);
  });
}

function assertEvidenceBacked(
  status: string,
  references: readonly ImplementationEvidenceReference[],
  path: string,
): void {
  if (
    (status === "evidence-backed" || status === "verified" || status === "tested") &&
    references.length === 0
  ) {
    throw new Error(`${path} cannot claim ${status} without at least one evidence reference.`);
  }
}

function assertShadcnBaseline(
  value: unknown,
  path: string,
  workspaceRoot?: string,
): asserts value is ShadcnBaselineProfile {
  assertRecord(value, path);
  assertExactKeys(value, ["comparison", "summary", "references"], path);
  assertEnum(value.comparison, SHADCN_COMPARISONS, `${path}/comparison`);
  assertNonEmptyString(value.summary, `${path}/summary`);
  assertEvidenceReferences(value.references, `${path}/references`, workspaceRoot);
  if (value.references.length === 0) {
    throw new Error(`${path} must cite the ordinary Shadcn baseline or its absence.`);
  }
}

function assertMergoraAdvantage(
  value: unknown,
  path: string,
  workspaceRoot?: string,
): asserts value is MergoraAdvantageProfile {
  assertRecord(value, path);
  assertExactKeys(value, ["status", "summary", "references", "enhancementIds"], path);
  assertEnum(value.status, DELIVERY_STATUSES, `${path}/status`);
  assertNonEmptyString(value.summary, `${path}/summary`);
  assertEvidenceReferences(value.references, `${path}/references`, workspaceRoot);
  assertUniqueStrings(value.enhancementIds, `${path}/enhancementIds`, assertId);
  if (value.enhancementIds.length === 0) {
    throw new Error(`${path}/enhancementIds must identify at least one useful differentiator.`);
  }
  assertEvidenceBacked(value.status, value.references, path);
}

function assertVisualSignature(
  value: unknown,
  path: string,
  signatureIds: ReadonlySet<string>,
  workspaceRoot?: string,
): asserts value is VisualSignatureProfile {
  assertRecord(value, path);
  assertExactKeys(
    value,
    ["status", "summary", "references", "patternIds", "tokenReferences"],
    path,
  );
  assertEnum(value.status, DELIVERY_STATUSES, `${path}/status`);
  assertNonEmptyString(value.summary, `${path}/summary`);
  assertEvidenceReferences(value.references, `${path}/references`, workspaceRoot);
  assertUniqueStrings(value.patternIds, `${path}/patternIds`, assertId);
  assertUniqueStrings(value.tokenReferences, `${path}/tokenReferences`);
  if (value.patternIds.length === 0) {
    throw new Error(`${path}/patternIds must name at least one shared Mergora signature.`);
  }
  for (const patternId of value.patternIds) {
    if (!signatureIds.has(patternId)) {
      throw new Error(
        `${path}/patternIds contains unknown signature ${JSON.stringify(patternId)}.`,
      );
    }
  }
  if (value.tokenReferences.length === 0) {
    throw new Error(`${path}/tokenReferences must name semantic tokens used by the signature.`);
  }
  value.tokenReferences.forEach((token, index) => {
    if (!TOKEN_PATTERN.test(token)) {
      throw new Error(`${path}/tokenReferences/${index} must be a --mrg-semantic-* token.`);
    }
  });
  if (workspaceRoot !== undefined) {
    const generatedTokensPath = resolve(workspaceRoot, "packages/tokens/src/generated/tokens.css");
    if (!existsSync(generatedTokensPath)) {
      throw new Error(`${path}/tokenReferences cannot be verified before tokens are generated.`);
    }
    const generatedTokens = readFileSync(generatedTokensPath, "utf8");
    for (const token of value.tokenReferences) {
      if (!generatedTokens.includes(`${token}:`)) {
        throw new Error(
          `${path}/tokenReferences names unknown semantic token ${JSON.stringify(token)}.`,
        );
      }
    }
  }
  assertEvidenceBacked(value.status, value.references, path);
}

function assertOptionalEnhancement(
  value: unknown,
  path: string,
  workspaceRoot?: string,
): asserts value is OptionalEnhancementProfile {
  assertRecord(value, path);
  assertExactKeys(
    value,
    [
      "id",
      "status",
      "summary",
      "references",
      "storybookControlNames",
      "api",
      "defaultEnabled",
      "disabledBehavior",
    ],
    path,
  );
  assertId(value.id, `${path}/id`);
  assertEnum(value.status, DELIVERY_STATUSES, `${path}/status`);
  assertNonEmptyString(value.summary, `${path}/summary`);
  assertEvidenceReferences(value.references, `${path}/references`, workspaceRoot);
  assertUniqueStrings(value.storybookControlNames, `${path}/storybookControlNames`);
  if (value.storybookControlNames.length === 0) {
    throw new Error(`${path}/storybookControlNames must name at least one selective control.`);
  }
  if (typeof value.defaultEnabled !== "boolean") {
    throw new Error(`${path}/defaultEnabled must be boolean.`);
  }
  assertRecord(value.api, `${path}/api`);
  assertExactKeys(value.api, ["kind", "names", "enableWhen"], `${path}/api`);
  assertEnum(value.api.kind, ENHANCEMENT_API_KINDS, `${path}/api/kind`);
  assertUniqueStrings(value.api.names, `${path}/api/names`);
  if (value.api.names.length === 0) throw new Error(`${path}/api/names must not be empty.`);
  assertNonEmptyString(value.api.enableWhen, `${path}/api/enableWhen`);
  assertRecord(value.disabledBehavior, `${path}/disabledBehavior`);
  assertExactKeys(
    value.disabledBehavior,
    ["ui", "behavior", "events", "accessibility"],
    `${path}/disabledBehavior`,
  );
  assertNonEmptyString(value.disabledBehavior.ui, `${path}/disabledBehavior/ui`);
  assertNonEmptyString(value.disabledBehavior.behavior, `${path}/disabledBehavior/behavior`);
  assertNonEmptyString(value.disabledBehavior.events, `${path}/disabledBehavior/events`);
  assertNonEmptyString(
    value.disabledBehavior.accessibility,
    `${path}/disabledBehavior/accessibility`,
  );
  assertEvidenceBacked(value.status, value.references, path);
}

function assertStorybookEvidence(
  value: unknown,
  path: string,
  expectedMode: StorybookEvidenceProfile["mode"],
  workspaceRoot?: string,
): asserts value is StorybookEvidenceProfile {
  assertRecord(value, path);
  assertExactKeys(
    value,
    ["status", "mode", "modulePath", "exportName", "enhancementControls", "references"],
    path,
  );
  assertEnum(value.status, STORY_STATUSES, `${path}/status`);
  if (value.mode !== expectedMode) {
    throw new Error(`${path}/mode must equal ${expectedMode}.`);
  }
  assertUniqueStrings(value.enhancementControls, `${path}/enhancementControls`);
  assertEvidenceReferences(value.references, `${path}/references`, workspaceRoot);
  if (value.status === "missing" || value.status === "blocked") {
    if (
      value.modulePath !== null ||
      value.exportName !== null ||
      value.enhancementControls.length !== 0
    ) {
      throw new Error(`${path} ${value.status} evidence must not name a Storybook export.`);
    }
  } else {
    assertNonEmptyString(value.modulePath, `${path}/modulePath`);
    assertPortableReferencePath(value.modulePath, `${path}/modulePath`);
    if (
      !value.modulePath.startsWith("apps/storybook/") ||
      !value.modulePath.endsWith(".stories.tsx")
    ) {
      throw new Error(`${path}/modulePath must name an apps/storybook .stories.tsx module.`);
    }
    if (workspaceRoot !== undefined && !existsSync(resolve(workspaceRoot, value.modulePath))) {
      throw new Error(`${path}/modulePath references a missing Storybook module.`);
    }
    if (typeof value.exportName !== "string" || !EXPORT_PATTERN.test(value.exportName)) {
      throw new Error(`${path}/exportName must be a valid named export.`);
    }
    if (value.enhancementControls.length === 0) {
      throw new Error(`${path}/enhancementControls must expose selective enhancement controls.`);
    }
    if (workspaceRoot !== undefined) {
      const moduleSource = readFileSync(resolve(workspaceRoot, value.modulePath), "utf8");
      const escapedExportName = value.exportName.replaceAll(/[$()*+.?[\\\]^{|}]/gu, "\\$&");
      if (!new RegExp(`\\bexport\\s+const\\s+${escapedExportName}\\b`, "u").test(moduleSource)) {
        throw new Error(
          `${path}/exportName does not name an exported story in ${JSON.stringify(value.modulePath)}.`,
        );
      }
      for (const controlName of value.enhancementControls) {
        const escapedControlName = controlName.replaceAll(/[$()*+.?[\\\]^{|}]/gu, "\\$&");
        const controlPattern = new RegExp(
          `(?:^|\\n)\\s*(?:["']${escapedControlName}["']|${escapedControlName})\\s*:\\s*\\{[\\s\\S]{0,400}?\\bcontrol\\s*:`,
          "u",
        );
        if (!controlPattern.test(moduleSource)) {
          throw new Error(
            `${path}/enhancementControls names missing Storybook control ${JSON.stringify(controlName)}.`,
          );
        }
      }
    }
  }
  assertEvidenceBacked(value.status, value.references, path);
}

function assertEvidenceAssessment(
  value: unknown,
  path: string,
  workspaceRoot?: string,
): asserts value is EvidenceAssessmentProfile {
  assertRecord(value, path);
  assertExactKeys(value, ["status", "summary", "references"], path);
  assertEnum(value.status, ASSESSMENT_STATUSES, `${path}/status`);
  assertNonEmptyString(value.summary, `${path}/summary`);
  assertEvidenceReferences(value.references, `${path}/references`, workspaceRoot);
  assertEvidenceBacked(value.status, value.references, path);
}

function assertBlocker(
  value: unknown,
  path: string,
  workspaceRoot?: string,
): asserts value is ImplementationProfileBlocker {
  assertRecord(value, path);
  assertExactKeys(value, ["code", "summary", "references"], path);
  assertId(value.code, `${path}/code`);
  assertNonEmptyString(value.summary, `${path}/summary`);
  assertEvidenceReferences(value.references, `${path}/references`, workspaceRoot);
}

function assertMaturityAssessment(
  value: unknown,
  path: string,
  workspaceRoot?: string,
): asserts value is MaturityAssessmentProfile {
  assertRecord(value, path);
  assertExactKeys(value, ["status", "rationale", "references"], path);
  assertEnum(value.status, MATURITY_ASSESSMENTS, `${path}/status`);
  assertNonEmptyString(value.rationale, `${path}/rationale`);
  assertEvidenceReferences(value.references, `${path}/references`, workspaceRoot);
  if (value.status === "ready-for-promotion-review" && value.references.length === 0) {
    throw new Error(`${path} cannot request promotion review without evidence references.`);
  }
}

function assertImplementationProfile(
  value: unknown,
  path: string,
  signatureIds: ReadonlySet<string>,
  workspaceRoot?: string,
): asserts value is ImplementationProfile {
  assertRecord(value, path);
  assertExactKeys(
    value,
    [
      "id",
      "ordinaryShadcnBaseline",
      "mergoraAdvantage",
      "visualSignature",
      "optionalEnhancements",
      "storybook",
      "accessibilityEvidence",
      "interactionEvidence",
      "parityEvidence",
      "blockers",
      "maturityAssessment",
    ],
    path,
  );
  assertId(value.id, `${path}/id`);
  assertShadcnBaseline(
    value.ordinaryShadcnBaseline,
    `${path}/ordinaryShadcnBaseline`,
    workspaceRoot,
  );
  assertMergoraAdvantage(value.mergoraAdvantage, `${path}/mergoraAdvantage`, workspaceRoot);
  assertVisualSignature(
    value.visualSignature,
    `${path}/visualSignature`,
    signatureIds,
    workspaceRoot,
  );
  if (!Array.isArray(value.optionalEnhancements) || value.optionalEnhancements.length === 0) {
    throw new Error(`${path}/optionalEnhancements must contain at least one useful enhancement.`);
  }
  const enhancementIds = new Set<string>();
  const enhancementOwnerByControl = new Map<string, string>();
  value.optionalEnhancements.forEach((enhancement, index) => {
    assertOptionalEnhancement(enhancement, `${path}/optionalEnhancements/${index}`, workspaceRoot);
    if (enhancementIds.has(enhancement.id)) {
      throw new Error(`${path}/optionalEnhancements duplicates ${JSON.stringify(enhancement.id)}.`);
    }
    enhancementIds.add(enhancement.id);
    for (const controlName of enhancement.storybookControlNames) {
      const existingOwner = enhancementOwnerByControl.get(controlName);
      if (existingOwner !== undefined) {
        throw new Error(
          `${path}/optionalEnhancements shares selective control ${JSON.stringify(controlName)} between ${JSON.stringify(existingOwner)} and ${JSON.stringify(enhancement.id)}; independently selectable enhancements require distinct controls.`,
        );
      }
      enhancementOwnerByControl.set(controlName, enhancement.id);
    }
  });
  for (const enhancementId of value.mergoraAdvantage.enhancementIds) {
    if (!enhancementIds.has(enhancementId)) {
      throw new Error(
        `${path}/mergoraAdvantage references missing enhancement ${JSON.stringify(enhancementId)}.`,
      );
    }
  }
  assertRecord(value.storybook, `${path}/storybook`);
  assertExactKeys(value.storybook, ["basic", "enhanced"], `${path}/storybook`);
  assertStorybookEvidence(
    value.storybook.basic,
    `${path}/storybook/basic`,
    "basic-enhancements-disabled",
    workspaceRoot,
  );
  assertStorybookEvidence(
    value.storybook.enhanced,
    `${path}/storybook/enhanced`,
    "recommended-enhancements-enabled",
    workspaceRoot,
  );
  const expectedStorybookControls = new Set(
    value.optionalEnhancements.flatMap((enhancement) => enhancement.storybookControlNames),
  );
  for (const [storyKind, story] of [
    ["basic", value.storybook.basic],
    ["enhanced", value.storybook.enhanced],
  ] as const) {
    if (story.status !== "declared" && story.status !== "tested") continue;
    const controls = new Set(story.enhancementControls);
    for (const controlName of expectedStorybookControls) {
      if (!controls.has(controlName)) {
        throw new Error(
          `${path}/storybook/${storyKind} is missing selective control ${JSON.stringify(controlName)}.`,
        );
      }
    }
    for (const controlName of controls) {
      if (!expectedStorybookControls.has(controlName)) {
        throw new Error(
          `${path}/storybook/${storyKind} exposes undeclared enhancement control ${JSON.stringify(controlName)}.`,
        );
      }
    }
  }
  assertEvidenceAssessment(
    value.accessibilityEvidence,
    `${path}/accessibilityEvidence`,
    workspaceRoot,
  );
  assertEvidenceAssessment(value.interactionEvidence, `${path}/interactionEvidence`, workspaceRoot);
  assertEvidenceAssessment(value.parityEvidence, `${path}/parityEvidence`, workspaceRoot);
  if (!Array.isArray(value.blockers)) throw new Error(`${path}/blockers must be an array.`);
  const blockerCodes = new Set<string>();
  value.blockers.forEach((blocker, index) => {
    assertBlocker(blocker, `${path}/blockers/${index}`, workspaceRoot);
    if (blockerCodes.has(blocker.code)) {
      throw new Error(`${path}/blockers duplicates ${JSON.stringify(blocker.code)}.`);
    }
    blockerCodes.add(blocker.code);
  });
  assertMaturityAssessment(value.maturityAssessment, `${path}/maturityAssessment`, workspaceRoot);
  const hasBlockedCell = [
    value.mergoraAdvantage.status,
    value.visualSignature.status,
    value.storybook.basic.status,
    value.storybook.enhanced.status,
    value.accessibilityEvidence.status,
    value.interactionEvidence.status,
    value.parityEvidence.status,
    value.maturityAssessment.status,
    ...value.optionalEnhancements.map((enhancement) => enhancement.status),
  ].includes("blocked");
  if (hasBlockedCell && value.blockers.length === 0) {
    throw new Error(`${path} has a blocked assessment but no remaining blocker.`);
  }
}

export function assertImplementationProfileShard(
  value: unknown,
  signaturePolicy: MergoraSignaturePolicy,
  workspaceRoot?: string,
): asserts value is ImplementationProfileShard {
  assertRecord(value, "implementation-profile-shard");
  assertExactKeys(
    value,
    ["schemaVersion", "category", "auditPendingIds", "profiles"],
    "implementation-profile-shard",
  );
  if (value.schemaVersion !== 1) {
    throw new Error("implementation-profile-shard/schemaVersion must equal 1.");
  }
  assertId(value.category, "implementation-profile-shard/category");
  assertUniqueStrings(
    value.auditPendingIds,
    "implementation-profile-shard/auditPendingIds",
    assertId,
  );
  if (!Array.isArray(value.profiles)) {
    throw new Error("implementation-profile-shard/profiles must be an array.");
  }
  const signatureIds = new Set(signaturePolicy.patterns.map((pattern) => pattern.id));
  const profileIds = new Set<string>();
  value.profiles.forEach((profile, index) => {
    assertImplementationProfile(
      profile,
      `implementation-profile-shard/profiles/${index}`,
      signatureIds,
      workspaceRoot,
    );
    if (profileIds.has(profile.id)) {
      throw new Error(
        `implementation-profile-shard/profiles duplicates ${JSON.stringify(profile.id)}.`,
      );
    }
    profileIds.add(profile.id);
  });
  for (const id of value.auditPendingIds) {
    if (profileIds.has(id)) {
      throw new Error(
        `Implementation profile ${JSON.stringify(id)} cannot be both audit-pending and profiled.`,
      );
    }
  }
}

export function assertMergoraSignaturePolicy(
  value: unknown,
): asserts value is MergoraSignaturePolicy {
  assertRecord(value, "mergora-signature-policy");
  assertExactKeys(
    value,
    ["schemaVersion", "tokenReferencePolicy", "maximumCornerRadiusCssPx", "patterns"],
    "mergora-signature-policy",
  );
  if (value.schemaVersion !== 1)
    throw new Error("mergora-signature-policy/schemaVersion must equal 1.");
  if (value.tokenReferencePolicy !== "semantic-only") {
    throw new Error("mergora-signature-policy/tokenReferencePolicy must equal semantic-only.");
  }
  if (value.maximumCornerRadiusCssPx !== 16) {
    throw new Error("mergora-signature-policy/maximumCornerRadiusCssPx must remain 16.");
  }
  if (!Array.isArray(value.patterns) || value.patterns.length === 0) {
    throw new Error("mergora-signature-policy/patterns must not be empty.");
  }
  const ids = new Set<string>();
  value.patterns.forEach((pattern, index) => {
    const path = `mergora-signature-policy/patterns/${index}`;
    assertRecord(pattern, path);
    assertExactKeys(pattern, ["id", "description"], path);
    assertId(pattern.id, `${path}/id`);
    assertNonEmptyString(pattern.description, `${path}/description`);
    if (ids.has(pattern.id))
      throw new Error(`Signature policy duplicates ${JSON.stringify(pattern.id)}.`);
    ids.add(pattern.id);
  });
}

export function loadMergoraSignaturePolicy(workspaceRoot: string): MergoraSignaturePolicy {
  const path = resolve(workspaceRoot, "registry/quality/mergora-signature-policy.v1.json");
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  assertMergoraSignaturePolicy(value);
  return value;
}

export function loadImplementationProfileShards(
  workspaceRoot: string,
  signaturePolicy: MergoraSignaturePolicy,
): readonly ImplementationProfileShard[] {
  const directory = resolve(workspaceRoot, PROFILE_DIRECTORY);
  if (!existsSync(directory)) {
    throw new Error(`Implementation profile directory ${PROFILE_DIRECTORY} is missing.`);
  }
  const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name, "en-US"),
  );
  const shards: ImplementationProfileShard[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".v1.json")) {
      throw new Error(`Unexpected implementation profile entry ${JSON.stringify(entry.name)}.`);
    }
    const category = entry.name.slice(0, -".v1.json".length);
    assertId(category, `implementation profile filename ${entry.name}`);
    const value: unknown = JSON.parse(readFileSync(resolve(directory, entry.name), "utf8"));
    assertImplementationProfileShard(value, signaturePolicy, workspaceRoot);
    if (value.category !== category) {
      throw new Error(
        `Implementation profile shard ${entry.name} declares category ${JSON.stringify(value.category)}.`,
      );
    }
    shards.push(value);
  }
  return shards;
}

function automaticBlocker(code: string, summary: string): ImplementationProfileBlocker {
  return { code, summary, references: [] };
}

const AUDIT_PENDING_BLOCKERS = [
  automaticBlocker(
    "component-profile-audit-pending",
    "The component-specific Mergora identity and enhancement audit has not been recorded.",
  ),
  automaticBlocker(
    "shadcn-baseline-unverified",
    "The ordinary Shadcn baseline comparison has not been documented with a reference.",
  ),
  automaticBlocker(
    "mergora-advantage-unverified",
    "No useful Mergora differentiator has been documented with implementation evidence.",
  ),
  automaticBlocker(
    "visual-signature-unverified",
    "Shared Mergora visual signatures and semantic token usage have not been audited.",
  ),
  automaticBlocker(
    "optional-enhancement-contract-unverified",
    "No independently disableable enhancement API and exact disabled behavior have been audited.",
  ),
  automaticBlocker(
    "basic-storybook-evidence-missing",
    "A basic Storybook export with enhancements disabled has not been evidenced.",
  ),
  automaticBlocker(
    "enhanced-storybook-evidence-missing",
    "A recommended Mergora Storybook export has not been evidenced.",
  ),
  automaticBlocker(
    "accessibility-evidence-incomplete",
    "Required automated and manual accessibility evidence is incomplete.",
  ),
  automaticBlocker(
    "interaction-evidence-incomplete",
    "Keyboard, pointer, touch, responsive, RTL, forced-colors, and reduced-motion interaction evidence is incomplete.",
  ),
  automaticBlocker(
    "package-source-shadcn-parity-unverified",
    "Package, editable source, native registry, and Shadcn-compatible parity has not been verified.",
  ),
  automaticBlocker(
    "maturity-evidence-incomplete",
    "The item has not satisfied the evidence required for a maturity promotion.",
  ),
] as const;

function assessmentBlockers(profile: ImplementationProfile): ImplementationProfileBlocker[] {
  const blockers = [...profile.blockers];
  const add = (condition: boolean, code: string, summary: string) => {
    if (condition && !blockers.some((blocker) => blocker.code === code)) {
      blockers.push(automaticBlocker(code, summary));
    }
  };
  add(
    profile.mergoraAdvantage.status !== "evidence-backed",
    "mergora-advantage-evidence-incomplete",
    "The documented Mergora advantage does not yet have complete implementation evidence.",
  );
  add(
    profile.visualSignature.status !== "evidence-backed",
    "visual-signature-evidence-incomplete",
    "The shared visual signature does not yet have complete implementation evidence.",
  );
  add(
    profile.optionalEnhancements.some((enhancement) => enhancement.status !== "evidence-backed"),
    "optional-enhancement-evidence-incomplete",
    "At least one optional enhancement lacks complete implementation evidence.",
  );
  add(
    profile.storybook.basic.status !== "tested",
    "basic-storybook-evidence-incomplete",
    "The basic Storybook mode has not been tested as evidence.",
  );
  add(
    profile.storybook.enhanced.status !== "tested",
    "enhanced-storybook-evidence-incomplete",
    "The recommended Mergora Storybook mode has not been tested as evidence.",
  );
  add(
    profile.accessibilityEvidence.status !== "verified",
    "accessibility-evidence-incomplete",
    "Required accessibility evidence remains incomplete or unverified.",
  );
  add(
    profile.interactionEvidence.status !== "verified",
    "interaction-evidence-incomplete",
    "Required interaction evidence remains incomplete or unverified.",
  );
  add(
    profile.parityEvidence.status !== "verified",
    "package-source-shadcn-parity-unverified",
    "Package, source, native registry, and Shadcn-compatible parity remains unverified.",
  );
  add(
    profile.maturityAssessment.status !== "ready-for-promotion-review",
    "maturity-evidence-incomplete",
    "The evidence record is not ready for a maturity promotion review.",
  );
  return blockers.sort((left, right) => left.code.localeCompare(right.code, "en-US"));
}

function isEvidenceBackedProfile(
  profile: ImplementationProfile,
  blockers: readonly unknown[],
): boolean {
  return (
    blockers.length === 0 &&
    profile.mergoraAdvantage.status === "evidence-backed" &&
    profile.visualSignature.status === "evidence-backed" &&
    profile.optionalEnhancements.every((enhancement) => enhancement.status === "evidence-backed") &&
    profile.storybook.basic.status === "tested" &&
    profile.storybook.enhanced.status === "tested" &&
    profile.accessibilityEvidence.status === "verified" &&
    profile.interactionEvidence.status === "verified" &&
    profile.parityEvidence.status === "verified" &&
    profile.maturityAssessment.status === "ready-for-promotion-review"
  );
}

function pendingStatement(): MatrixPendingStatement {
  return { status: "audit-pending", summary: null, references: [] };
}

function pendingStory(mode: MatrixPendingStory["mode"]): MatrixPendingStory {
  return {
    status: "audit-pending",
    mode,
    modulePath: null,
    exportName: null,
    enhancementControls: [],
    references: [],
  };
}

function pendingAssessment(): MatrixPendingAssessment {
  return { status: "audit-pending", summary: null, references: [] };
}

export function buildImplementationMatrix(
  definitions: readonly GeneratorCatalogDefinition[],
  sources: readonly ImplementationMatrixSource[],
  shards: readonly ImplementationProfileShard[],
  signaturePolicy: MergoraSignaturePolicy,
): ImplementationMatrix {
  assertMergoraSignaturePolicy(signaturePolicy);
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));
  const sourceById = new Map<string, ImplementationMatrixSource>();
  for (const source of sources) {
    if (!definitionById.has(source.id)) {
      throw new Error(
        `Implementation matrix source ${JSON.stringify(source.id)} is not in the catalog.`,
      );
    }
    if (sourceById.has(source.id)) {
      throw new Error(`Implementation matrix source ${JSON.stringify(source.id)} is duplicated.`);
    }
    sourceById.set(source.id, source);
  }

  const expectedCategories = new Set(definitions.map((definition) => definition.category));
  const shardByCategory = new Map<string, ImplementationProfileShard>();
  const profileById = new Map<string, ImplementationProfile>();
  const pendingIds = new Set<string>();
  for (const shard of shards) {
    assertImplementationProfileShard(shard, signaturePolicy);
    if (!expectedCategories.has(shard.category)) {
      throw new Error(
        `Implementation profile category ${JSON.stringify(shard.category)} is not in the catalog.`,
      );
    }
    if (shardByCategory.has(shard.category)) {
      throw new Error(
        `Implementation profile category ${JSON.stringify(shard.category)} is duplicated.`,
      );
    }
    shardByCategory.set(shard.category, shard);
    for (const id of shard.auditPendingIds) {
      const definition = definitionById.get(id);
      if (definition === undefined) {
        throw new Error(
          `Audit-pending implementation profile ${JSON.stringify(id)} is not in the catalog.`,
        );
      }
      if (definition.category !== shard.category) {
        throw new Error(
          `Audit-pending implementation profile ${JSON.stringify(id)} belongs to ${JSON.stringify(definition.category)}, not ${JSON.stringify(shard.category)}.`,
        );
      }
      if (pendingIds.has(id) || profileById.has(id)) {
        throw new Error(`Implementation profile ${JSON.stringify(id)} is declared more than once.`);
      }
      pendingIds.add(id);
    }
    for (const profile of shard.profiles) {
      const definition = definitionById.get(profile.id);
      if (definition === undefined) {
        throw new Error(
          `Implementation profile ${JSON.stringify(profile.id)} is not in the catalog.`,
        );
      }
      if (definition.category !== shard.category) {
        throw new Error(
          `Implementation profile ${JSON.stringify(profile.id)} belongs to ${JSON.stringify(definition.category)}, not ${JSON.stringify(shard.category)}.`,
        );
      }
      if (pendingIds.has(profile.id) || profileById.has(profile.id)) {
        throw new Error(
          `Implementation profile ${JSON.stringify(profile.id)} is declared more than once.`,
        );
      }
      profileById.set(profile.id, profile);
    }
  }

  const missingCategories = [...expectedCategories].filter(
    (category) => !shardByCategory.has(category),
  );
  if (missingCategories.length > 0) {
    throw new Error(
      `Implementation profile shards are missing categories: ${missingCategories.sort().join(", ")}.`,
    );
  }
  const missingIds = definitions
    .map((definition) => definition.id)
    .filter((id) => !pendingIds.has(id) && !profileById.has(id));
  if (missingIds.length > 0) {
    throw new Error(
      `Implementation profile coverage is missing IDs: ${missingIds.sort().join(", ")}.`,
    );
  }

  const storyOwnerByPointer = new Map<
    string,
    { readonly id: string; readonly mode: "basic" | "enhanced" }
  >();
  for (const profile of profileById.values()) {
    for (const [mode, story] of [
      ["basic", profile.storybook.basic],
      ["enhanced", profile.storybook.enhanced],
    ] as const) {
      if (story.modulePath === null || story.exportName === null) continue;
      const pointer = `${story.modulePath}#${story.exportName}`;
      const existing = storyOwnerByPointer.get(pointer);
      if (existing !== undefined) {
        throw new Error(
          `Storybook export ${JSON.stringify(pointer)} is shared by ${JSON.stringify(existing.id)} ${existing.mode} and ${JSON.stringify(profile.id)} ${mode}; every component and mode requires one dedicated export.`,
        );
      }
      storyOwnerByPointer.set(pointer, { id: profile.id, mode });
    }
  }

  const items = [...definitions]
    .sort((left, right) => left.id.localeCompare(right.id, "en-US"))
    .map((definition) => {
      const source = sourceById.get(definition.id);
      const profile = profileById.get(definition.id);
      const implementationStatus: MatrixImplementationStatus =
        source === undefined ? "unimplemented" : "source-present-unreleased";
      const artifacts = {
        canonicalSource: source?.entryPath ?? null,
        packageEntry:
          source === undefined || definition.availabilityIntent.package !== "planned"
            ? null
            : source.packageEntryPath,
        nativeRegistry:
          source === undefined
            ? null
            : `registry/generated/native-source-items/${definition.id}.json`,
        shadcn: source === undefined ? null : `registry/generated/shadcn/${definition.id}.json`,
      };

      if (profile === undefined) {
        const blockers = [
          ...(source === undefined
            ? [
                automaticBlocker(
                  "canonical-source-missing",
                  "Canonical implementation source has not been added to the generated catalog.",
                ),
              ]
            : []),
          ...AUDIT_PENDING_BLOCKERS,
        ].sort((left, right) => left.code.localeCompare(right.code, "en-US"));
        return {
          id: definition.id,
          displayName: definition.displayName,
          family: definition.category,
          layer: definition.layer,
          kind: definition.kind,
          implementationStatus,
          sourceAvailable: source !== undefined,
          profileStatus: "audit-pending" as const,
          ordinaryShadcnBaseline: pendingStatement(),
          mergoraAdvantage: pendingStatement(),
          visualSignature: {
            ...pendingStatement(),
            patternIds: [] as const,
            tokenReferences: [] as const,
          },
          optionalEnhancements: { status: "audit-pending" as const, items: [] },
          storybook: {
            stateContractPath: source?.storyPath ?? null,
            basic: pendingStory("basic-enhancements-disabled"),
            enhanced: pendingStory("recommended-enhancements-enabled"),
          },
          accessibilityEvidence: pendingAssessment(),
          interactionEvidence: pendingAssessment(),
          packageSourceShadcnParity: { artifacts, assessment: pendingAssessment() },
          remainingBlockers: blockers,
          maturity: {
            target: definition.targetMaturity,
            published: null,
            assessment: {
              status: "audit-pending" as const,
              rationale: null,
              references: [] as const,
            },
          },
        };
      }

      const blockers = assessmentBlockers(profile);
      if (
        source === undefined &&
        !blockers.some((blocker) => blocker.code === "canonical-source-missing")
      ) {
        blockers.push(
          automaticBlocker(
            "canonical-source-missing",
            "Canonical implementation source has not been added to the generated catalog.",
          ),
        );
        blockers.sort((left, right) => left.code.localeCompare(right.code, "en-US"));
      }
      const profileStatus: MatrixProfileStatus = isEvidenceBackedProfile(profile, blockers)
        ? "evidence-backed"
        : "profiled-incomplete";
      return {
        id: definition.id,
        displayName: definition.displayName,
        family: definition.category,
        layer: definition.layer,
        kind: definition.kind,
        implementationStatus,
        sourceAvailable: source !== undefined,
        profileStatus,
        ordinaryShadcnBaseline: profile.ordinaryShadcnBaseline,
        mergoraAdvantage: profile.mergoraAdvantage,
        visualSignature: profile.visualSignature,
        optionalEnhancements: { status: "profiled" as const, items: profile.optionalEnhancements },
        storybook: {
          stateContractPath: source?.storyPath ?? null,
          basic: profile.storybook.basic,
          enhanced: profile.storybook.enhanced,
        },
        accessibilityEvidence: profile.accessibilityEvidence,
        interactionEvidence: profile.interactionEvidence,
        packageSourceShadcnParity: { artifacts, assessment: profile.parityEvidence },
        remainingBlockers: blockers,
        maturity: {
          target: definition.targetMaturity,
          published: null,
          assessment: profile.maturityAssessment,
        },
      };
    });

  const profileStatuses: MatrixProfileStatus[] = items.map((item) => item.profileStatus);
  const implementationStatuses: MatrixImplementationStatus[] = items.map(
    (item) => item.implementationStatus,
  );
  const count = <Value extends string>(values: readonly Value[], expected: Value) =>
    values.filter((value) => value === expected).length;

  return {
    schemaVersion: 1,
    artifactKind: "catalog-implementation-matrix",
    generated: GENERATED_MARKER,
    authority: "registry/generated/catalog.json",
    profileSchema: "registry/quality/implementation-profile-shard.v1.schema.json",
    matrixSchema: "registry/quality/implementation-matrix.v1.schema.json",
    signaturePolicy: "registry/quality/mergora-signature-policy.v1.json",
    publicationStatus: "blocked-unreleased",
    inventory: {
      entries: items.length,
      categories: expectedCategories.size,
      implementationStatus: {
        unimplemented: count(implementationStatuses, "unimplemented"),
        "source-present-unreleased": count(implementationStatuses, "source-present-unreleased"),
      },
      profileStatus: {
        "audit-pending": count(profileStatuses, "audit-pending"),
        "profiled-incomplete": count(profileStatuses, "profiled-incomplete"),
        "evidence-backed": count(profileStatuses, "evidence-backed"),
      },
    },
    items,
  };
}
