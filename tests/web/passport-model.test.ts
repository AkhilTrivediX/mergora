import { describe, expect, it } from "vitest";

import documentationContracts from "../../registry/generated/documentation-contract-index.v1.json";
import passportSkeletons from "../../registry/generated/passport-skeletons.json";
import {
  generateStaticParams as passportStaticParams,
  GET as passportRoute,
} from "../../apps/web/src/app/m/v1/passports/[document]/route";
import {
  contentDigest,
  PASSPORT_EVIDENCE_VOCABULARY,
  passportMachineDocument,
  passportMachineIds,
  PASSPORT_SECTION_DEFINITIONS,
} from "../../apps/web/src/app/machine-documents";

describe("blocked unreleased Quality Passport model", () => {
  it("keeps every generated skeleton blocked, complete in shape, and free of inferred evidence", () => {
    expect(passportMachineIds).toEqual(documentationContracts.items.map(({ id }) => id));
    expect(passportMachineIds).toHaveLength(passportSkeletons.items.length);
    expect(new Set(passportMachineIds).size).toBe(passportMachineIds.length);

    for (const id of passportMachineIds) {
      const document = passportMachineDocument(id);
      expect(document, id).not.toBeNull();
      if (document === null) continue;

      expect(document).toMatchObject({
        artifactKind: "quality-passport-skeleton-document",
        documentProfile: "blocked-unreleased-preview-v1",
        id,
        publicationStatus: "blocked-unreleased",
        publishable: false,
        skeleton: true,
        overall: {
          aggregateState: "Blocked",
          evidenceState: "Not tested",
          releaseGateResult: "Blocked",
        },
        releaseIdentity: {
          evidenceDigest: null,
          evidenceGeneratedAt: null,
          release: null,
          sourceDigest: null,
        },
        manualReview: {
          lastReviewed: null,
          nextReviewAt: null,
          status: "not-yet-verified",
        },
        links: { immutableJson: null },
      });
      expect(
        document.releaseIdentity.sourceCommit === null ||
          /^[0-9a-f]{40}$/u.test(document.releaseIdentity.sourceCommit),
      ).toBe(true);
      expect(document.item.itemVersion).toBeNull();
      expect(document.item.uiVersion).toBeNull();
      expect(document.item.publishedMaturity).toBeNull();
      expect(document.missingInputs).toEqual(
        expect.arrayContaining(["release-identity", "source-digest", "manual-evidence"]),
      );

      expect(document.sections.map(({ id: sectionId }) => sectionId)).toEqual(
        PASSPORT_SECTION_DEFINITIONS.map(({ id: sectionId }) => sectionId),
      );
      expect(document.sections).toHaveLength(11);
      for (const section of document.sections) {
        expect(section.rows).toHaveLength(1);
        const [row] = section.rows;
        expect(row).toMatchObject({
          aggregateState: "Unknown",
          evidenceReferences: [],
          state: "Not tested",
        });
        expect(row?.summary.trim().length).toBeGreaterThan(0);
        expect(row?.details.length).toBeGreaterThan(0);
        expect(row?.details.every((detail) => detail.trim().length > 0)).toBe(true);
        expect(row?.missingEvidenceExplanation).toContain("no release-bound evidence reference");
      }
      expect(
        document.limitations.declarations.every(
          ({ reviewStatus }) => reviewStatus === "not-reviewed",
        ),
      ).toBe(true);

      const { generatedDigest, ...content } = document;
      expect(generatedDigest).toBe(contentDigest(content));
      expect(passportMachineDocument(id)).toEqual(document);
    }
  });

  it("publishes the complete Passport vocabulary without applying positive or stale states", () => {
    expect(PASSPORT_EVIDENCE_VOCABULARY.map(({ state }) => state)).toEqual([
      "Pass",
      "Pass with limitation",
      "Fail",
      "Not tested",
      "Not applicable",
      "Expired",
    ]);

    for (const id of passportMachineIds) {
      const document = passportMachineDocument(id);
      expect(document?.evidenceVocabulary).toEqual(PASSPORT_EVIDENCE_VOCABULARY);
      expect(document?.sections.flatMap(({ rows }) => rows).map(({ state }) => state)).toEqual(
        Array.from({ length: 11 }, () => "Not tested"),
      );
    }
  });

  it("exports one deterministic JSON route per generated Passport skeleton", async () => {
    expect(passportStaticParams()).toEqual(
      passportMachineIds.map((id) => ({ document: `${id}.json` })),
    );

    const response = await passportRoute(new Request("https://example.invalid"), {
      params: Promise.resolve({ document: "button.json" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="button-quality-passport.json"',
    );
    expect(await response.json()).toEqual(passportMachineDocument("button"));

    for (const document of ["button.md", "unknown.json", "../button.json"]) {
      const missing = await passportRoute(new Request("https://example.invalid"), {
        params: Promise.resolve({ document }),
      });
      expect(missing.status).toBe(404);
    }
  });
});
