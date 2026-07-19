export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type Sha256 = `sha256:${string}`;
export type Semver = string;
export type SemverRange = string;
export type CatalogId = string;
export type QualifiedItemId = `${string}:${string}`;
export type ProjectRelativePath = string;

export type SchemaKind =
  | "accessibility-contract"
  | "catalog-metadata"
  | "compatibility"
  | "component-metadata"
  | "config"
  | "conflict"
  | "evidence"
  | "latest-alias"
  | "manifest"
  | "native-release-reference"
  | "operation-plan"
  | "quality-passport"
  | "registry-index"
  | "registry-item"
  | "release-manifest"
  | "release-protocol-plan"
  | "result-envelope"
  | "theme"
  | "transaction-journal"
  | "transaction"
  | "vendor-manifest";

export type MeasurementEvidenceState =
  "pass" | "fail" | "warning" | "manual-check" | "not-measurable";

export type PassportEvidenceState =
  | "pass"
  | "pass-with-limitation"
  | "fail"
  | "not-tested"
  | "not-applicable"
  | "expired"
  | "blocked-upstream";

export type ContractEvidenceState = "pass" | "fail" | "blocked-upstream" | "not-applicable";

export type ReleaseGateState = "pass" | "fail" | "blocked" | "not-applicable";

export type AggregateEvidenceState =
  "satisfied" | "conditional" | "failed" | "unknown" | "stale" | "blocked" | "not-applicable";

export type EvidenceRecord =
  | ContextEvidenceRecord<"measurement", MeasurementEvidenceState>
  | ContextEvidenceRecord<"passport", PassportEvidenceState>
  | ContextEvidenceRecord<"contract", ContractEvidenceState>
  | ContextEvidenceRecord<"release-gate", ReleaseGateState>;

export interface ContextEvidenceRecord<Context extends string, State extends string> {
  readonly schemaVersion: 1;
  readonly evidenceId: CatalogId;
  readonly context: Context;
  readonly state: State;
  readonly aggregateState: AggregateEvidenceState;
  readonly summary: string;
  readonly sourceDigest?: Sha256;
  readonly performedAt?: string;
  readonly expiresAt?: string;
  readonly references: readonly EvidenceReference[];
}

export interface EvidenceReference {
  readonly id: CatalogId;
  readonly artifact: string;
  readonly digest: Sha256;
}

export interface Compatibility {
  readonly cli: SemverRange;
  readonly node: SemverRange;
  readonly react: SemverRange;
  readonly typescript: SemverRange;
  readonly tailwind: SemverRange;
  readonly frameworks: Readonly<Record<string, SemverRange>>;
  readonly packageManagers: Readonly<Record<string, SemverRange>>;
  readonly browserCapabilities: readonly string[];
}

export interface CompatibilityDocumentV1 {
  readonly schemaVersion: 1;
  readonly compatibility: Compatibility;
}

export interface MergoraConfigV1 {
  readonly $schema: "https://akhiltrivedix.github.io/mergora/r/v1/schemas/config-v1.schema.json";
  readonly schemaVersion: 1;
  readonly project: {
    readonly framework: "next-app" | "next-pages" | "vite-react" | "react";
    readonly language: "typescript";
    readonly sourceRoot: ProjectRelativePath;
    readonly packageJson: ProjectRelativePath;
    readonly tsconfig: ProjectRelativePath;
  };
  readonly distribution: {
    readonly defaultMode: "source" | "package" | "hybrid";
    readonly packageName: string;
  };
  readonly targets: Readonly<Record<TargetRole, ProjectRelativePath>>;
  readonly aliases: Readonly<Record<TargetRole, string>>;
  readonly styling: {
    readonly engine: "tailwind-v4";
    readonly globalCss: ProjectRelativePath;
    readonly tokenPreset: CatalogId;
    readonly colorMode: "system" | "light" | "dark";
    readonly density: "comfortable" | "compact" | "touch";
    readonly direction: "ltr" | "rtl" | "auto";
    readonly packageCssStrategy: "source-directive" | "precompiled";
  };
  readonly registries: Readonly<Record<string, RegistryEnrollment>>;
  readonly policy: {
    readonly allowExternalRegistries: boolean;
    readonly allowPrereleases: boolean;
    readonly dependencyProtocols: readonly ["registry-semver"];
    readonly requireLicenses: boolean;
    readonly retainSuccessfulTransactions: number;
    readonly maxRegistryItemBytes: number;
    readonly maxOperationBytes: number;
  };
  readonly formatting: {
    readonly strategy: "project" | "mergora" | "none";
    readonly fallback: "mergora" | "none";
    readonly lineEndings: "preserve-existing" | "lf";
  };
}

export type TargetRole = "components" | "hooks" | "lib" | "systems" | "kits" | "styles" | "tokens";

export interface RegistryEnrollment {
  readonly protocol: "mergora-v1" | "shadcn-v1";
  readonly origin: string;
  readonly trust: "official" | "enrolled" | "local-development";
  readonly authEnvironmentVariable?: string;
  readonly identityDigest?: Sha256;
}

export interface CatalogMetadataV1 {
  readonly schemaVersion: 1;
  readonly id: CatalogId;
  readonly displayName: string;
  readonly description: string;
  readonly layer: "foundation" | "component" | "system" | "kit";
  readonly category: CatalogId;
  readonly kind:
    "component" | "hook" | "utility" | "system" | "kit" | "theme" | "contract" | "migration";
  readonly trust: "core" | "labs" | "community";
  readonly maturity: "experimental" | "beta" | "stable" | "deprecated";
  readonly riskClass: 1 | 2 | 3;
  readonly tags: readonly CatalogId[];
  readonly aliases: readonly CatalogId[];
  readonly keywords: readonly string[];
  readonly availability: { readonly source: boolean; readonly package: boolean };
}

export interface ComponentMetadataV1 {
  readonly schemaVersion: 1;
  readonly itemId: CatalogId;
  readonly riskClass: 1 | 2 | 3;
  readonly serverBoundary: "server-compatible" | "client-island" | "client-only";
  readonly directions: readonly ("ltr" | "rtl")[];
  readonly locales: readonly string[];
  readonly inputModalities: readonly (
    "keyboard" | "mouse" | "touch" | "screen-reader" | "speech" | "switch"
  )[];
  readonly themes: readonly ("light" | "dark" | "enhanced-contrast" | "forced-colors")[];
  readonly densities: readonly ("comfortable" | "compact" | "touch")[];
  readonly stateGroups: readonly CatalogId[];
  readonly slots: readonly {
    readonly name: CatalogId;
    readonly semanticElement: string;
    readonly refTarget: string;
    readonly states?: readonly string[];
  }[];
  readonly contract: VersionedId;
  readonly passport: VersionedId;
}

export interface RegistryIndexV1 {
  readonly schemaVersion: 1;
  readonly protocolVersion: "mergora-v1";
  readonly registry: {
    readonly id: CatalogId;
    readonly origin: string;
    readonly trust: "official" | "enrolled" | "local-development";
    readonly identityDigest: Sha256;
  };
  readonly releases: {
    readonly currentStable: Semver;
    readonly currentPrerelease?: Semver | null;
    readonly supportedHistorical: readonly Semver[];
  };
  readonly items: readonly RegistryIndexItem[];
  readonly dependencyGraphDigest: Sha256;
}

export interface RegistryIndexItem {
  readonly id: CatalogId;
  readonly aliases: readonly CatalogId[];
  readonly displayName: string;
  readonly description: string;
  readonly kind: string;
  readonly category: CatalogId;
  readonly tags: readonly CatalogId[];
  readonly keywords?: readonly string[];
  readonly maturity: "experimental" | "beta" | "stable" | "deprecated";
  readonly latestStableVersion: Semver | null;
  readonly lastChangedVersion: Semver;
  readonly compatibility: Compatibility;
  readonly license: string;
  readonly provenance: string;
  readonly links: Readonly<Record<"payload" | "passport" | "contract" | "docs" | "source", string>>;
  readonly registryDependencies: readonly QualifiedItemId[];
  readonly quality: {
    readonly tier: "complete" | "partial" | "not-supplied";
    readonly manualAssistiveTechnologyEvidence: boolean;
  };
}

export interface RegistryItemV1 {
  readonly schemaVersion: 1;
  readonly registryId: CatalogId;
  readonly itemId: CatalogId;
  readonly kind: string;
  readonly version: Semver;
  readonly lastChangedVersion: Semver;
  readonly maturity: "experimental" | "beta" | "stable" | "deprecated";
  readonly license: string;
  readonly title: string;
  readonly description: string;
  readonly links: Readonly<Record<string, string>>;
  readonly compatibility: Compatibility;
  readonly files: readonly RegistryItemFile[];
  readonly registryDependencies: readonly QualifiedItemId[];
  readonly dependencies: DependencySets;
  readonly structuredPatches: readonly StructuredPatch[];
  readonly migrations: readonly MigrationDeclaration[];
  readonly contract: VersionedId;
  readonly passport: VersionedId;
  readonly examples: readonly ProjectRelativePath[];
  readonly importPaths: readonly string[];
  readonly payloadDigest: Sha256;
}

export interface LatestAliasV1 {
  readonly schemaVersion: 1;
  readonly protocolVersion: "mergora-v1";
  readonly registryId: CatalogId;
  readonly itemId: CatalogId;
  readonly resolvedVersion: Semver;
  readonly releaseManifest: {
    readonly url: string;
    readonly digest: Sha256;
  };
  readonly payload: {
    readonly url: string;
    readonly digest: Sha256;
  };
}

export type ReleaseProtocolBlocker =
  | "release-identity-missing"
  | "release-version-missing"
  | "release-commit-missing"
  | "release-artifacts-missing"
  | "quality-evidence-missing"
  | "manual-assistive-technology-evidence-missing"
  | "packed-consumer-evidence-missing"
  | "catalog-implementation-incomplete"
  | "public-origin-not-deployed";

export interface ReleaseProtocolPlanV1 {
  readonly schemaVersion: 1;
  readonly artifactKind: "release-protocol-plan";
  readonly generated: {
    readonly by: "@mergora-internal/registry-builder";
    readonly editPolicy: "do-not-edit";
  };
  readonly protocolVersion: "mergora-v1";
  readonly publicationStatus: "blocked-unreleased";
  readonly publishable: false;
  readonly schemaContracts: Readonly<
    Record<"catalog" | "item" | "releaseManifest" | "latestAlias", string>
  >;
  readonly inventory: {
    readonly catalogDefinitions: number;
    readonly sourceItems: number;
    readonly itemsWithoutSource: number;
    readonly sourceItemIds: readonly CatalogId[];
  };
  readonly endpointTemplates: Readonly<
    Record<
      | "catalog"
      | "searchIndex"
      | "schema"
      | "releaseManifest"
      | "item"
      | "latestAlias"
      | "passport"
      | "contract"
      | "mirrorManifest"
      | "releaseBundle"
      | "sbom"
      | "checksums",
      string
    >
  >;
  readonly emittedReleaseArtifacts: readonly [];
  readonly blockers: readonly ReleaseProtocolBlocker[];
}

export interface RegistryItemFile {
  readonly logicalPath: ProjectRelativePath;
  readonly targetRole: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly content?: string;
  readonly sourceUrl?: string;
  readonly digest: Sha256;
  readonly executable: false;
  readonly transformPipeline: readonly {
    readonly adapter:
      "alias-rewrite" | "import-rewrite" | "target-map" | "format" | "token-resolve" | "none";
    readonly version: Semver;
  }[];
}

export interface DependencySets {
  readonly runtime: Readonly<Record<string, SemverRange>>;
  readonly development: Readonly<Record<string, SemverRange>>;
}

export interface StructuredPatch {
  readonly id: CatalogId;
  readonly adapter: string;
  readonly semanticKey: string;
  readonly desiredValue: JsonPrimitive | readonly string[];
  readonly reversible: true;
}

export interface MigrationDeclaration {
  readonly id: CatalogId;
  readonly from: SemverRange;
  readonly to: SemverRange;
  readonly phase: "remote" | "proposed";
  readonly adapter:
    | "rename-file"
    | "rename-export"
    | "rename-prop"
    | "rename-token"
    | "config-v1"
    | "manual-checklist";
  readonly arguments: Readonly<Record<string, JsonValue>>;
}

export interface VersionedId {
  readonly id: CatalogId;
  readonly version: Semver;
}

export interface ProvenanceManifestV1 {
  readonly $schema: "https://akhiltrivedix.github.io/mergora/r/v1/schemas/manifest-v1.schema.json";
  readonly schemaVersion: 1;
  readonly projectId: Sha256;
  /** Present as a complete set after the explicit legacy-to-distribution migration. */
  readonly configDigest?: Sha256;
  readonly defaultMode?: "source" | "package" | "hybrid";
  readonly packageName?: string;
  readonly toolchain: Readonly<Record<"cli" | "schema" | "transformer" | "formatter", string>>;
  readonly releases?: Readonly<Record<string, ManifestDistributionRelease>>;
  readonly items: Readonly<Record<QualifiedItemId, ManifestItem>>;
  readonly sharedTargets: Readonly<Record<ProjectRelativePath, readonly CatalogId[]>>;
  readonly dependencyOwners: Readonly<Record<string, readonly QualifiedItemId[]>>;
  readonly dependencyOwnership?: Readonly<Record<string, ManifestDependencyOwnership>>;
  readonly patchOwnership?: Readonly<Record<CatalogId, ManifestPatchOwnership>>;
}

export interface ManifestDistributionRelease {
  readonly registryId: CatalogId;
  readonly origin: string;
  readonly trust: "official" | "enrolled" | "local-development";
  readonly identityDigest: Sha256;
  readonly release: Semver;
  readonly manifestUrl: string;
  readonly manifestDigest: Sha256;
  readonly packages: Readonly<Record<string, ManifestPackageArtifact>>;
}

export interface ManifestPackageArtifact {
  readonly name: string;
  readonly version: Semver;
  readonly tarballDigest: Sha256;
}

export interface ManifestDependencyOwnership {
  readonly scope: "runtime" | "development";
  readonly package: string;
  readonly range: SemverRange;
  readonly owners: readonly QualifiedItemId[];
  readonly retention: "remove-if-unowned" | "retain-if-unowned";
}

export interface ManifestStructuredPatch {
  readonly id: CatalogId;
  readonly adapter:
    | "css-import"
    | "css-source"
    | "css-token-block"
    | "package-dependency"
    | "tsconfig-path"
    | "tsconfig-include"
    | "framework-config";
  readonly target?: ProjectRelativePath;
  readonly semanticKey: string;
  readonly ownedValueDigest: Sha256;
}

export interface ManifestPatchOwnership extends Omit<ManifestStructuredPatch, "target"> {
  readonly target: ProjectRelativePath;
  readonly owners: readonly QualifiedItemId[];
  readonly retention: "remove-if-unowned" | "retain-if-unowned";
}

export interface ManifestItem {
  readonly registry: CatalogId;
  readonly itemId: CatalogId;
  readonly kind: string;
  readonly requested: SemverRange;
  readonly resolved: Semver;
  readonly releaseRef?: string;
  readonly payload: { readonly url: string; readonly digest: Sha256 };
  readonly mode: "source" | "package";
  readonly direct: boolean;
  readonly transformContextDigest: Sha256;
  readonly transformContext: JsonValue;
  readonly files: readonly ManifestFile[];
  readonly packageClaims?: readonly string[];
  readonly importSubpaths?: readonly string[];
  readonly registryDependencies: readonly QualifiedItemId[];
  readonly dependencies: DependencySets;
  readonly structuredPatches: readonly ManifestStructuredPatch[];
  readonly contractVersion: Semver;
  readonly lastMigration: CatalogId | null;
}

export interface ManifestFile {
  readonly logicalPath: ProjectRelativePath;
  readonly target: ProjectRelativePath;
  readonly role: string;
  readonly base: Sha256;
  readonly installed: Sha256 | null;
  readonly mediaType: string;
  readonly executable: false;
  readonly tombstone?: boolean;
}

export interface OperationPlanV1 {
  readonly schemaVersion: 1;
  readonly command:
    | "create"
    | "clean"
    | "init"
    | "add"
    | "remove"
    | "update"
    | "resolve"
    | "rollback"
    | "recover"
    | "doctor-fix"
    | "theme-apply"
    | "migrate"
    | "adopt"
    | "vendor"
    | "registry-enroll"
    | "registry-remove";
  readonly cliVersion: Semver;
  readonly projectRoot: ".";
  readonly configDigest: Sha256;
  readonly manifestPreconditionDigest: Sha256 | null;
  readonly planDigest: Sha256;
  readonly registries: readonly JsonValue[];
  readonly items: readonly JsonValue[];
  readonly fileOperations: readonly FileOperation[];
  readonly dependencyChanges: readonly JsonValue[];
  readonly structuredPatches: readonly JsonValue[];
  readonly migrations: readonly JsonValue[];
  readonly contractChanges: readonly JsonValue[];
  readonly warnings: readonly string[];
  readonly consentRequirements: readonly JsonValue[];
  readonly conflicts: readonly JsonValue[];
  readonly estimatedBytes: { readonly download: number; readonly write: number };
  readonly validationSuite: readonly string[];
  readonly rollbackAvailable: boolean;
}

export interface FileOperation {
  readonly operation: string;
  readonly target: ProjectRelativePath;
  readonly owner: QualifiedItemId;
  readonly base: Sha256 | null;
  readonly local: Sha256 | null;
  readonly remote: Sha256 | null;
  readonly proposed: Sha256 | null;
  readonly mediaType: string;
  readonly risk: string;
  readonly reason: string;
}

export interface ConflictV1 {
  readonly schemaVersion: 1;
  readonly target: ProjectRelativePath;
  readonly owner: QualifiedItemId;
  readonly mediaType: string;
  readonly base: Sha256 | null;
  readonly local: Sha256 | null;
  readonly remote: Sha256 | null;
  readonly proposed: Sha256 | null;
  readonly semanticUnits: readonly string[];
  readonly hints: readonly { readonly line: number; readonly column: number }[];
  readonly localSummary: string;
  readonly upstreamSummary: string;
  readonly safeChoices: readonly ("take-local" | "take-upstream" | "manual")[];
  readonly livePreconditionDigest: Sha256;
}

export interface TransactionJournalV1 {
  readonly schemaVersion: 1;
  readonly transactionId: string;
  readonly state: TransactionState;
  readonly entries: readonly {
    readonly sequence: number;
    readonly recordedAt: string;
    readonly state: TransactionState;
    readonly checkpoint: string;
    readonly target?: ProjectRelativePath;
    readonly preconditionDigest?: Sha256;
    readonly postconditionDigest?: Sha256;
    readonly recordDigest: Sha256;
  }[];
}

export type TransactionState =
  | "planning"
  | "awaiting-consent"
  | "staged"
  | "validated"
  | "committing"
  | "post-validating"
  | "committed"
  | "rolled-back"
  | "conflicted"
  | "abandoned";

export interface TransactionV1 {
  readonly schemaVersion: 1;
  readonly transactionId: string;
  readonly state: TransactionState;
  readonly plan: { readonly path: ProjectRelativePath; readonly digest: Sha256 };
  readonly preconditions: {
    readonly config: Sha256;
    readonly manifest: Sha256 | null;
    readonly liveTargets: Readonly<Record<ProjectRelativePath, Sha256 | null>>;
  };
  readonly registryPayloads: readonly {
    readonly registry: CatalogId;
    readonly release: Semver;
    readonly url: string;
    readonly digest: Sha256;
  }[];
  readonly staged: readonly {
    readonly target: ProjectRelativePath;
    readonly stagePath: ProjectRelativePath;
    readonly digest: Sha256 | null;
    readonly operation: "write" | "delete";
  }[];
  readonly backups: readonly {
    readonly target: ProjectRelativePath;
    readonly backupPath: ProjectRelativePath;
    readonly digest: Sha256 | null;
  }[];
  readonly conflicts: readonly ConflictV1[];
  readonly consents: readonly {
    readonly id: string;
    readonly accepted: true;
    readonly flag: string;
    readonly planDigest: Sha256;
  }[];
  readonly resolutions: readonly {
    readonly target: ProjectRelativePath;
    readonly choice: "take-local" | "take-upstream" | "manual" | "reset";
    readonly resultDigest: Sha256;
  }[];
  readonly validations: readonly {
    readonly id: CatalogId;
    readonly state: ReleaseGateState;
    readonly summary: string;
  }[];
  readonly command: { readonly name: string; readonly redactedArguments: readonly string[] };
  readonly packageManager: {
    readonly name: "npm" | "pnpm" | "yarn" | "bun" | "none";
    readonly invoked: boolean;
    readonly exitCode: number | null;
  };
}

export interface QualityPassportV1 {
  readonly schemaVersion: 1;
  readonly passportId: CatalogId;
  readonly item: JsonValue;
  readonly release: Semver;
  readonly evidenceDigest: Sha256;
  readonly generatedAt: string;
  readonly manualReview: JsonValue;
  readonly overall: {
    readonly state: ReleaseGateState;
    readonly aggregateState: AggregateEvidenceState;
    readonly explanation: string;
  };
  readonly claimScope: string;
  readonly links: JsonValue;
  readonly sections: JsonValue;
  readonly limitations: readonly JsonValue[];
}

export interface ThemeV1 {
  readonly schemaVersion: 1;
  readonly dtcgVersion: "2025.10";
  readonly id: CatalogId;
  readonly displayName: string;
  readonly modes: readonly ("light" | "dark" | "enhanced-contrast" | "forced-colors")[];
  readonly densities: readonly ("comfortable" | "compact" | "touch")[];
  readonly tokens: Readonly<Record<string, JsonValue>>;
  readonly acknowledgedRuleIds: readonly CatalogId[];
  readonly checksum?: Sha256;
  readonly compatibleMergora?: SemverRange;
}

/** The full contract is structurally validated by contract-v1.schema.json. */
export interface AccessibilityContractV1 {
  readonly schemaVersion: "1.0.0";
  readonly contractVersion: Semver;
  readonly component: JsonValue;
  readonly claim: JsonValue;
  readonly standards: JsonValue;
  readonly semantics: JsonValue;
  readonly naming: JsonValue;
  readonly interaction: JsonValue;
  readonly states: JsonValue;
  readonly preferences: JsonValue;
  readonly responsive: JsonValue;
  readonly internationalization: JsonValue;
  readonly consumerResponsibilities: JsonValue;
  readonly tests: JsonValue;
  readonly manualEvidence: JsonValue;
  readonly limitations: readonly JsonValue[];
  readonly issues: readonly JsonValue[];
  readonly acceptance: JsonValue;
}

export interface ReleaseManifestV1 {
  readonly schemaVersion: 1;
  readonly registryId: CatalogId;
  readonly uiVersion: Semver;
  readonly releaseCommit: string;
  readonly items: Readonly<
    Record<
      CatalogId,
      {
        readonly version: Semver;
        readonly payload: EvidenceReference;
        readonly passport: EvidenceReference;
        readonly contract: EvidenceReference;
        readonly dependencies: readonly QualifiedItemId[];
      }
    >
  >;
  readonly dependencyGraphDigest: Sha256;
  readonly artifacts: readonly {
    readonly name: string;
    readonly url: string;
    readonly digest: Sha256;
    readonly mediaType: string;
    readonly bytes: number;
  }[];
  /** Optional only for backward-compatible reads of early v1 manifests. */
  readonly npmPackageInventory?: {
    readonly allowedLicenses: readonly string[];
    readonly entries: readonly (
      | {
          readonly package: string;
          readonly version: Semver;
          readonly url: string;
          readonly bytes: number;
          readonly digest: Sha256;
          readonly integrity: string;
          readonly license: string;
          readonly disposition: "include";
        }
      | {
          readonly package: string;
          readonly version: Semver;
          readonly url: string;
          readonly bytes: number;
          readonly digest: Sha256;
          readonly integrity: string;
          readonly license: string;
          readonly disposition: "omit";
          readonly omissionReason: "explicitly-omitted" | "license-not-allowed";
        }
    )[];
  };
  readonly qualitySummary: EvidenceReference;
  readonly manifestDigest: Sha256;
}

export interface NativeReleaseReferenceV1 {
  readonly schemaVersion: 1;
  readonly artifactKind: "mergora-native-release-reference";
  readonly registryId: CatalogId;
  readonly release: Semver;
  readonly catalog: {
    readonly digest: Sha256;
    readonly bytes: number;
  };
  readonly manifest: {
    readonly digest: Sha256;
    readonly bytes: number;
  };
}

export interface VendorManifestV1 {
  readonly schemaVersion: 1;
  readonly format: "mergora-vendor-v1";
  readonly registry: {
    readonly id: CatalogId;
    readonly origin: string;
    readonly identityDigest: Sha256;
  };
  readonly release: Semver;
  readonly selection: {
    readonly mode: "all" | "items";
    readonly requested: readonly CatalogId[];
  };
  readonly releaseManifest: EvidenceReference;
  readonly items: readonly EvidenceReference[];
  readonly schemas: readonly EvidenceReference[];
  readonly contracts: readonly EvidenceReference[];
  readonly passports: readonly EvidenceReference[];
  readonly npmCoverage: "not-requested" | "complete";
  readonly npmTarballs: readonly {
    readonly package: string;
    readonly version: Semver;
    readonly url: string;
    readonly bytes: number;
    readonly digest: Sha256;
    readonly integrity: string;
    readonly license: string;
  }[];
  readonly dependencyGraphDigest: Sha256;
  readonly sha256SumsDigest: Sha256;
}

export interface ResultMessage {
  readonly code: string;
  readonly docs?: string;
  readonly message: string;
  readonly recovery?: string;
  readonly reportId?: string;
  readonly target?: ProjectRelativePath;
  readonly transactionId?: string;
}

export type ResultEnvelopeStatus =
  | "success"
  | "created"
  | "planned"
  | "applied"
  | "no-op"
  | "differences"
  | "no-differences"
  | "fix-planned"
  | "healthy"
  | "issues-found"
  | "pass"
  | "fail"
  | "incomplete"
  | "not-applicable"
  | "conflict"
  | "conflicted"
  | "resolved"
  | "committed"
  | "rolled-back"
  | "recorded"
  | "manual-only"
  | "transaction"
  | "report"
  | "cleaned"
  | "match"
  | "mismatch"
  | "not-pinned"
  | "not-checked"
  | "verified"
  | "identity-mismatch"
  | "valid"
  | "rollback-planned"
  | "resume-planned"
  | "finalize-planned"
  | "invalid"
  | "unavailable"
  | "incompatible"
  | "recovery-required"
  | "failed"
  | "consent-required"
  | "error";

export interface ResultEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly command: string;
  readonly ok: boolean;
  readonly status: ResultEnvelopeStatus;
  readonly exitCode: number;
  readonly result: JsonValue;
  readonly warnings: readonly string[];
  readonly errors: readonly ResultMessage[];
}

export interface SchemaValidationError {
  readonly code: string;
  readonly path: string;
  readonly keyword: string;
  readonly message: string;
}

export interface SchemaValidationResult<T = unknown> {
  readonly ok: boolean;
  readonly kind: SchemaKind;
  readonly value?: T;
  readonly errors: readonly SchemaValidationError[];
}
