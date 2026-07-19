import accessibilityContractSchemaJson from "./accessibility-contract-v1.schema.json" with { type: "json" };
import catalogMetadataSchemaJson from "./catalog-metadata-v1.schema.json" with { type: "json" };
import commonSchemaJson from "./common-v1.schema.json" with { type: "json" };
import compatibilitySchemaJson from "./compatibility-v1.schema.json" with { type: "json" };
import componentMetadataSchemaJson from "./component-metadata-v1.schema.json" with { type: "json" };
import configSchemaJson from "./config-v1.schema.json" with { type: "json" };
import conflictSchemaJson from "./conflict-v1.schema.json" with { type: "json" };
import evidenceSchemaJson from "./evidence-v1.schema.json" with { type: "json" };
import latestAliasSchemaJson from "./latest-alias-v1.schema.json" with { type: "json" };
import manifestSchemaJson from "./manifest-v1.schema.json" with { type: "json" };
import nativeReleaseReferenceSchemaJson from "./native-release-reference-v1.schema.json" with { type: "json" };
import operationPlanSchemaJson from "./operation-plan-v1.schema.json" with { type: "json" };
import qualityPassportSchemaJson from "./quality-passport-v1.schema.json" with { type: "json" };
import registryIndexSchemaJson from "./registry-index-v1.schema.json" with { type: "json" };
import registryItemSchemaJson from "./registry-item-v1.schema.json" with { type: "json" };
import releaseManifestSchemaJson from "./release-manifest-v1.schema.json" with { type: "json" };
import releaseProtocolPlanSchemaJson from "./release-protocol-plan-v1.schema.json" with { type: "json" };
import resultEnvelopeSchemaJson from "./result-envelope-v1.schema.json" with { type: "json" };
import themeSchemaJson from "./theme-v1.schema.json" with { type: "json" };
import transactionJournalSchemaJson from "./transaction-journal-v1.schema.json" with { type: "json" };
import transactionSchemaJson from "./transaction-v1.schema.json" with { type: "json" };
import vendorManifestSchemaJson from "./vendor-manifest-v1.schema.json" with { type: "json" };

import type { SchemaKind } from "./types.ts";

export interface JsonSchema {
  readonly [key: string]: unknown;
  readonly $id?: string;
  readonly $schema?: string;
}

export const commonSchema = commonSchemaJson as JsonSchema;
export const operationPlanSchema = operationPlanSchemaJson as JsonSchema;

export const SCHEMA_REGISTRY: Readonly<Record<SchemaKind, JsonSchema>> = {
  "accessibility-contract": accessibilityContractSchemaJson as JsonSchema,
  "catalog-metadata": catalogMetadataSchemaJson as JsonSchema,
  compatibility: compatibilitySchemaJson as JsonSchema,
  "component-metadata": componentMetadataSchemaJson as JsonSchema,
  config: configSchemaJson as JsonSchema,
  conflict: conflictSchemaJson as JsonSchema,
  evidence: evidenceSchemaJson as JsonSchema,
  "latest-alias": latestAliasSchemaJson as JsonSchema,
  manifest: manifestSchemaJson as JsonSchema,
  "native-release-reference": nativeReleaseReferenceSchemaJson as JsonSchema,
  "operation-plan": operationPlanSchema,
  "quality-passport": qualityPassportSchemaJson as JsonSchema,
  "registry-index": registryIndexSchemaJson as JsonSchema,
  "registry-item": registryItemSchemaJson as JsonSchema,
  "release-manifest": releaseManifestSchemaJson as JsonSchema,
  "release-protocol-plan": releaseProtocolPlanSchemaJson as JsonSchema,
  "result-envelope": resultEnvelopeSchemaJson as JsonSchema,
  theme: themeSchemaJson as JsonSchema,
  "transaction-journal": transactionJournalSchemaJson as JsonSchema,
  transaction: transactionSchemaJson as JsonSchema,
  "vendor-manifest": vendorManifestSchemaJson as JsonSchema,
};

export const ALL_SCHEMAS = [commonSchema, ...Object.values(SCHEMA_REGISTRY)] as const;

export const EXPECTED_SCHEMA_VERSION: Readonly<Record<SchemaKind, 1 | "1.0.0">> = {
  "accessibility-contract": "1.0.0",
  "catalog-metadata": 1,
  compatibility: 1,
  "component-metadata": 1,
  config: 1,
  conflict: 1,
  evidence: 1,
  "latest-alias": 1,
  manifest: 1,
  "native-release-reference": 1,
  "operation-plan": 1,
  "quality-passport": 1,
  "registry-index": 1,
  "registry-item": 1,
  "release-manifest": 1,
  "release-protocol-plan": 1,
  "result-envelope": 1,
  theme: 1,
  "transaction-journal": 1,
  transaction: 1,
  "vendor-manifest": 1,
};

export function schemaFor(kind: SchemaKind): JsonSchema {
  return SCHEMA_REGISTRY[kind];
}
