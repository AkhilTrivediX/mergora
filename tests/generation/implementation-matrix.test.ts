import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { catalogDefinitions } from "../../registry/definitions/index.ts";
import type { CatalogDefinition } from "../../registry/definitions/types.ts";
import {
  assertHonestGeneratedArtifact,
  assertImplementationProfileShard,
  buildImplementationMatrix,
  loadImplementationProfileShards,
  loadMergoraSignaturePolicy,
  type ImplementationMatrixSource,
  type ImplementationProfile,
  type ImplementationProfileShard,
} from "../../tooling/registry-builder/src/index.ts";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function definition(id = "button", category = "actions-selection"): CatalogDefinition {
  return {
    kind: "catalog-item",
    id,
    displayName: "Button",
    layer: "component",
    category: category as CatalogDefinition["category"],
    routeKind: "component",
    riskClass: 1,
    trust: "core",
    implementationStatus: "unimplemented",
    targetMaturity: "stable",
    availabilityIntent: { package: "planned", source: "planned" },
    normativeBehavior: "Preserve native action semantics.",
    requiredEvidenceFamilies: ["schema-and-types", "package-source-parity"],
    requiredStateGroups: ["base", "interaction"],
  };
}

function source(id = "button"): ImplementationMatrixSource {
  return {
    id,
    entryPath: `registry/source/components/${id}/${id}.tsx`,
    packageEntryPath: `packages/ui/src/generated/${id}/${id}.tsx`,
    contractPath: `registry/source/components/${id}/${id}.contract.json`,
    storyPath: `registry/source/components/${id}/${id}.stories.json`,
  };
}

const officialShadcnReference = {
  kind: "official-documentation",
  location: "https://ui.shadcn.com/docs/components/button",
} as const;

const sourceReference = {
  kind: "repository-file",
  location: "registry/source/components/button/button.tsx",
} as const;

function incompleteProfile(): ImplementationProfile {
  return {
    id: "button",
    ordinaryShadcnBaseline: {
      comparison: "direct-component",
      summary: "The ordinary Shadcn button provides variants over a native button.",
      references: [officialShadcnReference],
    },
    mergoraAdvantage: {
      status: "implemented-unverified",
      summary: "Pending preserves focus while preventing duplicate activation.",
      references: [sourceReference],
      enhancementIds: ["pending-activation"],
    },
    visualSignature: {
      status: "implemented-unverified",
      summary: "Ink structure and the shared focus treatment identify the action family.",
      references: [sourceReference],
      patternIds: ["ink-structure", "distinctive-focus"],
      tokenReferences: ["--mrg-semantic-color-border-default", "--mrg-semantic-color-focus-ring"],
    },
    optionalEnhancements: [
      {
        id: "pending-activation",
        status: "implemented-unverified",
        summary: "Expose a focus-preserving pending action state.",
        references: [sourceReference],
        storybookControlNames: ["pending"],
        api: {
          kind: "prop",
          names: ["pending", "pendingLabel"],
          enableWhen: "Set pending to true; pendingLabel remains independently optional.",
        },
        defaultEnabled: false,
        disabledBehavior: {
          ui: "No pending indicator or pending label is rendered.",
          behavior: "Native button activation runs without pending interception.",
          events: "No pending-specific event cancellation occurs.",
          accessibility: "No pending aria-busy or aria-disabled output is emitted.",
        },
      },
    ],
    storybook: {
      basic: {
        status: "missing",
        mode: "basic-enhancements-disabled",
        modulePath: null,
        exportName: null,
        enhancementControls: [],
        references: [],
      },
      enhanced: {
        status: "missing",
        mode: "recommended-enhancements-enabled",
        modulePath: null,
        exportName: null,
        enhancementControls: [],
        references: [],
      },
    },
    accessibilityEvidence: {
      status: "not-verified",
      summary: "The complete risk-class accessibility matrix has not been verified.",
      references: [],
    },
    interactionEvidence: {
      status: "partial",
      summary: "Source behavior exists, but browser and modality evidence remains incomplete.",
      references: [sourceReference],
    },
    parityEvidence: {
      status: "not-verified",
      summary: "Package, source, native registry, and Shadcn parity remains unverified.",
      references: [],
    },
    blockers: [],
    maturityAssessment: {
      status: "not-ready",
      rationale:
        "Storybook, accessibility, interaction, parity, and release evidence remain incomplete.",
      references: [],
    },
  };
}

function shard(
  profile: ImplementationProfile | null = null,
  category = "actions-selection",
): ImplementationProfileShard {
  return {
    schemaVersion: 1,
    category,
    auditPendingIds: profile === null ? ["button"] : [],
    profiles: profile === null ? [] : [profile],
  };
}

describe("catalog implementation matrix", () => {
  it("covers the exact generated-catalog inventory with honest audited and pending cells", () => {
    const catalog = JSON.parse(
      readFileSync(resolve(workspaceRoot, "registry/generated/catalog.json"), "utf8"),
    ) as {
      items: { id: string; implementationStatus: string }[];
    };
    const transformPlan = JSON.parse(
      readFileSync(resolve(workspaceRoot, "registry/generated/source-transform-plan.json"), "utf8"),
    ) as {
      items: {
        source: null | {
          id: string;
          entryPath: string;
          packageEntryPath: string;
          contractPath: string;
          storyPath: string | null;
        };
      }[];
    };
    const policy = loadMergoraSignaturePolicy(workspaceRoot);
    const shards = loadImplementationProfileShards(workspaceRoot, policy);
    const profiledIds = new Set(
      shards.flatMap((shardEntry) => shardEntry.profiles.map((profile) => profile.id)),
    );
    const sources = transformPlan.items.flatMap(({ source: itemSource }) =>
      itemSource === null ? [] : [itemSource],
    );
    const matrix = buildImplementationMatrix(catalogDefinitions, sources, shards, policy);
    const repeated = buildImplementationMatrix(catalogDefinitions, sources, shards, policy);

    expect(repeated).toEqual(matrix);
    expect(() => assertHonestGeneratedArtifact(matrix)).not.toThrow();
    expect(matrix.inventory.entries).toBe(catalog.items.length);
    expect(matrix.inventory.categories).toBe(
      new Set(catalogDefinitions.map(({ category }) => category)).size,
    );
    expect(matrix.items.map(({ id }) => id)).toEqual(catalog.items.map(({ id }) => id));
    expect(matrix.items.map(({ id }) => id)).toEqual(
      [...matrix.items.map(({ id }) => id)].sort((left, right) =>
        left.localeCompare(right, "en-US"),
      ),
    );
    expect(matrix.inventory.profileStatus["audit-pending"]).toBe(
      catalog.items.length - profiledIds.size,
    );
    expect(
      matrix.inventory.profileStatus["profiled-incomplete"] +
        matrix.inventory.profileStatus["evidence-backed"],
    ).toBe(profiledIds.size);

    for (const item of matrix.items) {
      const catalogItem = catalog.items.find(({ id }) => id === item.id);
      expect(item.implementationStatus).toBe(catalogItem?.implementationStatus);
      if (profiledIds.has(item.id)) {
        expect(item.profileStatus).not.toBe("audit-pending");
        expect(item.ordinaryShadcnBaseline).toHaveProperty("comparison");
        expect(item.optionalEnhancements.status).toBe("profiled");
        expect(item.optionalEnhancements.items.length).toBeGreaterThan(0);
        expect(item.maturity.published).toBeNull();
        expect(item.remainingBlockers.map(({ code }) => code)).not.toContain(
          "component-profile-audit-pending",
        );
      } else {
        expect(item.profileStatus).toBe("audit-pending");
        expect(item.ordinaryShadcnBaseline).toEqual({
          status: "audit-pending",
          summary: null,
          references: [],
        });
        expect(item.optionalEnhancements).toEqual({ status: "audit-pending", items: [] });
        expect(item.packageSourceShadcnParity.assessment.status).toBe("audit-pending");
        expect(item.maturity).toMatchObject({
          published: null,
          assessment: { status: "audit-pending" },
        });
        expect(item.remainingBlockers.map(({ code }) => code)).toContain(
          "component-profile-audit-pending",
        );
      }
      if (item.implementationStatus === "source-present-unreleased") {
        expect(item.packageSourceShadcnParity.artifacts.canonicalSource).not.toBeNull();
        const definition = catalogDefinitions.find(({ id }) => id === item.id)!;
        if (definition.availabilityIntent.package === "planned") {
          expect(item.packageSourceShadcnParity.artifacts.packageEntry).not.toBeNull();
        } else {
          expect(item.packageSourceShadcnParity.artifacts.packageEntry).toBeNull();
        }
        expect(item.packageSourceShadcnParity.artifacts.shadcn).toBe(
          `registry/generated/shadcn/${item.id}.json`,
        );
      } else {
        expect(item.packageSourceShadcnParity.artifacts.canonicalSource).toBeNull();
        expect(item.packageSourceShadcnParity.artifacts.shadcn).toBeNull();
        expect(item.remainingBlockers.map(({ code }) => code)).toContain(
          "canonical-source-missing",
        );
      }
    }
  });

  it("loads one exclusive shard for every canonical category and ID", () => {
    const signaturePolicy = loadMergoraSignaturePolicy(workspaceRoot);
    const shards = loadImplementationProfileShards(workspaceRoot, signaturePolicy);
    const categories = [...new Set(catalogDefinitions.map(({ category }) => category))].sort();
    const ids = shards
      .flatMap((entry) => [
        ...entry.auditPendingIds,
        ...entry.profiles.map((profile) => profile.id),
      ])
      .sort();

    expect(shards.map(({ category }) => category)).toEqual(categories);
    expect(ids).toEqual(catalogDefinitions.map(({ id }) => id).sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("fails closed for missing, extra, duplicated, or wrong-family profile IDs", () => {
    const policy = loadMergoraSignaturePolicy(workspaceRoot);
    const button = definition();

    expect(() => buildImplementationMatrix([button], [], [], policy)).toThrow(
      /missing categories/u,
    );
    expect(() =>
      buildImplementationMatrix(
        [button],
        [],
        [{ schemaVersion: 1, category: "actions-selection", auditPendingIds: [], profiles: [] }],
        policy,
      ),
    ).toThrow(/coverage is missing IDs/u);
    expect(() =>
      buildImplementationMatrix(
        [button],
        [],
        [
          {
            schemaVersion: 1,
            category: "actions-selection",
            auditPendingIds: ["button", "unknown-item"],
            profiles: [],
          },
        ],
        policy,
      ),
    ).toThrow(/not in the catalog/u);
    expect(() => buildImplementationMatrix([button], [], [shard(), shard()], policy)).toThrow(
      /category .* duplicated|declared more than once/u,
    );
    expect(() =>
      buildImplementationMatrix(
        [button],
        [],
        [
          {
            schemaVersion: 1,
            category: "actions-selection",
            auditPendingIds: [],
            profiles: [{ ...incompleteProfile(), id: "field" }],
          },
        ],
        policy,
      ),
    ).toThrow(/not in the catalog/u);
  });

  it("requires one dedicated Storybook export for every component and mode", () => {
    const policy = loadMergoraSignaturePolicy(workspaceRoot);
    const button = {
      ...incompleteProfile(),
      storybook: {
        basic: {
          status: "tested",
          mode: "basic-enhancements-disabled",
          modulePath: "apps/storybook/src/Shared.stories.tsx",
          exportName: "Basic",
          enhancementControls: ["pending"],
          references: [sourceReference],
        },
        enhanced: {
          status: "tested",
          mode: "recommended-enhancements-enabled",
          modulePath: "apps/storybook/src/Shared.stories.tsx",
          exportName: "Recommended",
          enhancementControls: ["pending"],
          references: [sourceReference],
        },
      },
    } satisfies ImplementationProfile;
    const toggle = { ...button, id: "toggle" } satisfies ImplementationProfile;

    expect(() =>
      buildImplementationMatrix(
        [definition("button"), definition("toggle")],
        [source("button"), source("toggle")],
        [
          {
            schemaVersion: 1,
            category: "actions-selection",
            auditPendingIds: [],
            profiles: [button, toggle],
          },
        ],
        policy,
      ),
    ).toThrow(/every component and mode requires one dedicated export/u);
  });

  it("preserves component-specific enhancement and disabled-mode evidence without promoting maturity", () => {
    const policy = loadMergoraSignaturePolicy(workspaceRoot);
    const profile = incompleteProfile();
    const matrix = buildImplementationMatrix([definition()], [source()], [shard(profile)], policy);
    const button = matrix.items[0]!;

    expect(button.profileStatus).toBe("profiled-incomplete");
    expect(button.ordinaryShadcnBaseline).toMatchObject({ comparison: "direct-component" });
    expect(button.mergoraAdvantage).toMatchObject({
      enhancementIds: ["pending-activation"],
    });
    expect(button.optionalEnhancements.items[0]).toMatchObject({
      id: "pending-activation",
      defaultEnabled: false,
      disabledBehavior: {
        ui: "No pending indicator or pending label is rendered.",
        behavior: "Native button activation runs without pending interception.",
        events: "No pending-specific event cancellation occurs.",
        accessibility: "No pending aria-busy or aria-disabled output is emitted.",
      },
    });
    expect(button.maturity).toMatchObject({
      target: "stable",
      published: null,
      assessment: { status: "not-ready" },
    });
    expect(button.remainingBlockers.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "basic-storybook-evidence-incomplete",
        "enhanced-storybook-evidence-incomplete",
        "accessibility-evidence-incomplete",
        "package-source-shadcn-parity-unverified",
        "maturity-evidence-incomplete",
      ]),
    );
  });

  it("rejects unsupported signatures and evidence claims without references", () => {
    const policy = loadMergoraSignaturePolicy(workspaceRoot);
    const unsupportedSignature = structuredClone(shard(incompleteProfile())) as unknown as {
      profiles: { visualSignature: { patternIds: string[] } }[];
    };
    unsupportedSignature.profiles[0]!.visualSignature.patternIds = ["random-decoration"];
    expect(() => assertImplementationProfileShard(unsupportedSignature, policy)).toThrow(
      /unknown signature/u,
    );

    const fabricatedEvidence = structuredClone(shard(incompleteProfile())) as unknown as {
      profiles: { accessibilityEvidence: { status: string; references: unknown[] } }[];
    };
    fabricatedEvidence.profiles[0]!.accessibilityEvidence.status = "verified";
    fabricatedEvidence.profiles[0]!.accessibilityEvidence.references = [];
    expect(() => assertImplementationProfileShard(fabricatedEvidence, policy)).toThrow(
      /cannot claim verified without at least one evidence reference/u,
    );

    const fabricatedToken = structuredClone(shard(incompleteProfile())) as unknown as {
      profiles: { visualSignature: { tokenReferences: string[] } }[];
    };
    fabricatedToken.profiles[0]!.visualSignature.tokenReferences = [
      "--mrg-semantic-color-fabricated-token",
    ];
    expect(() => assertImplementationProfileShard(fabricatedToken, policy, workspaceRoot)).toThrow(
      /unknown semantic token/u,
    );

    const sharedEnhancementControl = structuredClone(shard(incompleteProfile())) as unknown as {
      profiles: {
        optionalEnhancements: {
          id: string;
          storybookControlNames: string[];
        }[];
      }[];
    };
    sharedEnhancementControl.profiles[0]!.optionalEnhancements.push({
      ...structuredClone(sharedEnhancementControl.profiles[0]!.optionalEnhancements[0]!),
      id: "second-enhancement",
    });
    expect(() => assertImplementationProfileShard(sharedEnhancementControl, policy)).toThrow(
      /independently selectable enhancements require distinct controls/u,
    );
  });

  it("publishes strict source and generated schemas without a Stable assessment state", () => {
    const profileSchema = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, "registry/quality/implementation-profile-shard.v1.schema.json"),
        "utf8",
      ),
    ) as { $schema: string; additionalProperties: boolean; $defs: Record<string, unknown> };
    const matrixSchema = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, "registry/quality/implementation-matrix.v1.schema.json"),
        "utf8",
      ),
    ) as { $schema: string; additionalProperties: boolean; $defs: Record<string, unknown> };
    const serialized = JSON.stringify({ profileSchema, matrixSchema });

    expect(profileSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(matrixSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(profileSchema.additionalProperties).toBe(false);
    expect(matrixSchema.additionalProperties).toBe(false);
    expect(profileSchema.$defs).toHaveProperty("profile");
    expect(matrixSchema.$defs).toHaveProperty("item");
    expect(serialized).not.toContain('"status":"stable"');
    expect(serialized).not.toContain('"publishedMaturity":"stable"');
  });
});
