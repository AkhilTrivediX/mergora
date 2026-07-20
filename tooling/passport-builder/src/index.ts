export interface PassportCatalogDefinition {
  readonly id: string;
  readonly riskClass: 1 | 2 | 3;
  readonly implementationStatus: "unimplemented";
  readonly requiredEvidenceFamilies: readonly string[];
  readonly requiredStateGroups: readonly string[];
}

export interface QualityPassportSkeletons {
  readonly schemaVersion: 1;
  readonly artifactKind: "quality-passport-skeletons";
  readonly generated: {
    readonly by: "@mergora-internal/passport-builder";
    readonly editPolicy: "do-not-edit";
  };
  readonly targetSchema: string;
  readonly publicationPolicy: {
    readonly skeletonsArePassports: false;
    readonly publishWithoutCanonicalSource: false;
    readonly publishWithoutEvidence: false;
    readonly inferManualEvidence: false;
  };
  readonly items: readonly {
    readonly itemId: string;
    readonly passportId: string;
    readonly skeleton: true;
    readonly publishable: false;
    readonly implementationStatus: "unimplemented";
    readonly riskClass: 1 | 2 | 3;
    readonly claim: "No quality, accessibility, compatibility, or release claim is made.";
    readonly overall: {
      readonly state: "blocked";
      readonly aggregateState: "blocked";
      readonly explanation: string;
    };
    readonly manualEvidenceStatus: "not-supplied";
    readonly knownLimitationsStatus: "not-assessed";
    readonly requiredEvidence: readonly {
      readonly family: string;
      readonly state: "blocked-upstream";
      readonly aggregateState: "blocked";
      readonly references: readonly [];
    }[];
    readonly requiredStates: readonly string[];
    readonly missingInputs: readonly (
      | "canonical-source"
      | "release-identity"
      | "source-digest"
      | "contract"
      | "automated-evidence"
      | "manual-evidence"
    )[];
  }[];
}

export function buildQualityPassportSkeletons(
  definitions: readonly PassportCatalogDefinition[],
  targetSchema: string,
): QualityPassportSkeletons {
  if (!/^https:\/\/[^?#]+$/u.test(targetSchema)) {
    throw new Error("Quality Passport target schema must be an immutable HTTPS URL.");
  }

  return {
    schemaVersion: 1,
    artifactKind: "quality-passport-skeletons",
    generated: {
      by: "@mergora-internal/passport-builder",
      editPolicy: "do-not-edit",
    },
    targetSchema,
    publicationPolicy: {
      skeletonsArePassports: false,
      publishWithoutCanonicalSource: false,
      publishWithoutEvidence: false,
      inferManualEvidence: false,
    },
    items: [...definitions]
      .sort((left, right) => left.id.localeCompare(right.id, "en-US"))
      .map((definition) => ({
        itemId: definition.id,
        passportId: `${definition.id}-passport-skeleton`,
        skeleton: true,
        publishable: false,
        implementationStatus: definition.implementationStatus,
        riskClass: definition.riskClass,
        claim: "No quality, accessibility, compatibility, or release claim is made.",
        overall: {
          state: "blocked",
          aggregateState: "blocked",
          explanation:
            "Canonical source, release identity, contract, and required evidence do not yet exist.",
        },
        manualEvidenceStatus: "not-supplied",
        knownLimitationsStatus: "not-assessed",
        requiredEvidence: [...definition.requiredEvidenceFamilies]
          .sort((left, right) => left.localeCompare(right, "en-US"))
          .map((family) => ({
            family,
            state: "blocked-upstream" as const,
            aggregateState: "blocked" as const,
            references: [] as const,
          })),
        requiredStates: [...definition.requiredStateGroups].sort((left, right) =>
          left.localeCompare(right, "en-US"),
        ),
        missingInputs: [
          "canonical-source",
          "release-identity",
          "source-digest",
          "contract",
          "automated-evidence",
          "manual-evidence",
        ] as const,
      })),
  };
}
