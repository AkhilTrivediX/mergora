import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  buildPublicApiDocs,
  type PublicApiDocs,
} from "../../tooling/registry-builder/src/public-api-docs.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");

const families = [
  { id: "alert", publicExports: ["AlertProps"], props: [] },
  {
    id: "badge",
    publicExports: ["BadgeCategoryProps", "BadgeCountProps", "BadgeStatusProps"],
    props: [
      "BadgeCategoryProps.children",
      "BadgeCategoryProps.kind",
      "BadgeCountProps.count",
      "BadgeCountProps.kind",
      "BadgeCountProps.label",
      "BadgeCountProps.maximum",
      "BadgeStatusProps.children",
      "BadgeStatusProps.kind",
      "BadgeStatusProps.variantLabel",
    ],
  },
  { id: "banner", publicExports: ["BannerProps"], props: [] },
  {
    id: "callout",
    publicExports: ["CalloutProps"],
    props: [
      "CalloutProps.aria-atomic",
      "CalloutProps.aria-label",
      "CalloutProps.aria-labelledby",
      "CalloutProps.aria-live",
      "CalloutProps.children",
      "CalloutProps.headingLevel",
      "CalloutProps.landmarkLabel",
      "CalloutProps.role",
      "CalloutProps.title",
      "CalloutProps.variant",
      "CalloutProps.variantLabel",
    ],
  },
  {
    id: "empty-state",
    publicExports: ["EmptyStateProps"],
    props: [
      "EmptyStateProps.children",
      "EmptyStateProps.context",
      "EmptyStateProps.description",
      "EmptyStateProps.headingLevel",
      "EmptyStateProps.icon",
      "EmptyStateProps.primaryAction",
      "EmptyStateProps.recoverySuggestions",
      "EmptyStateProps.secondaryAction",
      "EmptyStateProps.title",
    ],
  },
  {
    id: "error-state",
    publicExports: [
      "ErrorStateProps",
      "RecoverableErrorStateProps",
      "UnrecoverableErrorStateProps",
    ],
    props: [
      "RecoverableErrorStateProps.onRetry",
      "RecoverableErrorStateProps.recoverable",
      "RecoverableErrorStateProps.retryLabel",
      "UnrecoverableErrorStateProps.onRetry",
      "UnrecoverableErrorStateProps.recoverable",
      "UnrecoverableErrorStateProps.retryLabel",
    ],
  },
  {
    id: "meter",
    publicExports: ["MeterProps"],
    props: [
      "MeterProps.className",
      "MeterProps.formatValue",
      "MeterProps.high",
      "MeterProps.label",
      "MeterProps.low",
      "MeterProps.maximum",
      "MeterProps.minimum",
      "MeterProps.optimum",
      "MeterProps.showThresholdSummary",
      "MeterProps.value",
    ],
  },
  {
    id: "progress",
    publicExports: ["ProgressProps"],
    props: [
      "ProgressProps.className",
      "ProgressProps.formatValue",
      "ProgressProps.label",
      "ProgressProps.maximum",
      "ProgressProps.showValue",
      "ProgressProps.value",
    ],
  },
  {
    id: "skeleton",
    publicExports: ["SkeletonProps"],
    props: [
      "SkeletonProps.animated",
      "SkeletonProps.aria-atomic",
      "SkeletonProps.aria-hidden",
      "SkeletonProps.aria-label",
      "SkeletonProps.aria-labelledby",
      "SkeletonProps.aria-live",
      "SkeletonProps.blockSize",
      "SkeletonProps.children",
      "SkeletonProps.inlineSize",
      "SkeletonProps.role",
      "SkeletonProps.shape",
    ],
  },
  {
    id: "spinner",
    publicExports: ["BusyRegionProps", "SpinnerProps"],
    props: [
      "BusyRegionProps.announce",
      "BusyRegionProps.aria-atomic",
      "BusyRegionProps.aria-busy",
      "BusyRegionProps.aria-label",
      "BusyRegionProps.aria-labelledby",
      "BusyRegionProps.aria-live",
      "BusyRegionProps.busy",
      "BusyRegionProps.busyMessage",
      "BusyRegionProps.children",
      "BusyRegionProps.role",
      "SpinnerProps.aria-atomic",
      "SpinnerProps.aria-describedby",
      "SpinnerProps.aria-hidden",
      "SpinnerProps.aria-label",
      "SpinnerProps.aria-labelledby",
      "SpinnerProps.aria-live",
      "SpinnerProps.children",
      "SpinnerProps.role",
      "SpinnerProps.size",
      "SpinnerProps.tabIndex",
    ],
  },
  {
    id: "status",
    publicExports: ["StatusProps"],
    props: [
      "StatusProps.aria-atomic",
      "StatusProps.aria-label",
      "StatusProps.aria-labelledby",
      "StatusProps.aria-live",
      "StatusProps.children",
      "StatusProps.live",
      "StatusProps.role",
      "StatusProps.variant",
      "StatusProps.variantLabel",
    ],
  },
  {
    id: "notification-center",
    publicExports: ["NotificationCenterProps"],
    props: [
      "NotificationCenterProps.announceReadChanges",
      "NotificationCenterProps.bulkActions",
      "NotificationCenterProps.defaultFilter",
      "NotificationCenterProps.defaultReadIds",
      "NotificationCenterProps.disabled",
      "NotificationCenterProps.emptyContent",
      "NotificationCenterProps.error",
      "NotificationCenterProps.filter",
      "NotificationCenterProps.groupBy",
      "NotificationCenterProps.label",
      "NotificationCenterProps.liveUpdatePolicy",
      "NotificationCenterProps.loading",
      "NotificationCenterProps.locale",
      "NotificationCenterProps.notifications",
      "NotificationCenterProps.onFilterChange",
      "NotificationCenterProps.onOpen",
      "NotificationCenterProps.onReadIdsChange",
      "NotificationCenterProps.onRetry",
      "NotificationCenterProps.onRevealPending",
      "NotificationCenterProps.pendingLiveCount",
      "NotificationCenterProps.readIds",
      "NotificationCenterProps.readOnly",
      "NotificationCenterProps.renderAction",
      "NotificationCenterProps.virtualWindow",
    ],
  },
] as const;

const hiddenSurfaces = {
  alert: {
    AlertAnnouncementPolicy: ["announcement", "live", "announcement", "live"],
    AlertBaseProps: [
      "aria-atomic",
      "aria-label",
      "aria-labelledby",
      "aria-live",
      "actions",
      "children",
      "description",
      "headingLevel",
      "title",
      "variant",
      "variantLabel",
      "role",
    ],
  },
  badge: { BadgeBaseProps: ["variant"] },
  banner: {
    BannerBaseProps: [
      "aria-atomic",
      "aria-hidden",
      "aria-label",
      "aria-labelledby",
      "aria-live",
      "aria-relevant",
      "aria-roledescription",
      "actions",
      "children",
      "dismissible",
      "dismissLabel",
      "headingLevel",
      "hidden",
      "id",
      "onDismissedChange",
      "onPersistenceError",
      "role",
      "scope",
      "title",
      "variant",
      "variantLabel",
    ],
    BannerControlledDismissalProps: ["defaultDismissed", "dismissed", "persistence"],
    BannerUncontrolledDismissalProps: ["defaultDismissed", "dismissed", "persistence"],
  },
  "error-state": {
    ErrorStateAnnouncementPolicy: ["announcement", "live", "announcement", "live"],
    ErrorStateBaseProps: [
      "aria-atomic",
      "aria-describedby",
      "aria-label",
      "aria-labelledby",
      "aria-live",
      "actions",
      "description",
      "headingLevel",
      "role",
      "technicalDetails",
      "technicalDetailsLabel",
      "title",
    ],
  },
  spinner: { BusyRegionName: ["label", "labelledBy", "label", "labelledBy"] },
} as const;

function sourceFor(id: string): { sourcePath: string; text: string } {
  const sourcePath = `registry/source/components/${id}/${id}.tsx`;
  return { sourcePath, text: readFileSync(resolve(workspaceRoot, sourcePath), "utf8") };
}

function docsFor(family: (typeof families)[number]): PublicApiDocs {
  const source = sourceFor(family.id);
  return buildPublicApiDocs(
    {
      id: family.id,
      normalizedFiles: [
        {
          content: source.text,
          mediaType: "text/typescript-jsx",
          sourcePath: source.sourcePath,
        },
      ],
      publicExports: family.publicExports,
    },
    "client-island",
  );
}

function propertyName(member: ts.PropertySignature): string {
  if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) return member.name.text;
  throw new Error(`Unsupported property name: ${member.name.getText()}`);
}

function propertySignatures(node: ts.Node): readonly ts.PropertySignature[] {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node)) {
    return node.members.filter(ts.isPropertySignature);
  }
  if (ts.isTypeAliasDeclaration(node) || ts.isParenthesizedTypeNode(node)) {
    return propertySignatures(node.type);
  }
  if (ts.isIntersectionTypeNode(node) || ts.isUnionTypeNode(node)) {
    return node.types.flatMap((member) => propertySignatures(member));
  }
  return [];
}

function descriptionFor(sourceFile: ts.SourceFile, node: ts.Node): string | null {
  const comments = ts.getLeadingCommentRanges(sourceFile.text, node.getFullStart()) ?? [];
  const comment = [...comments]
    .reverse()
    .find(
      (candidate) =>
        candidate.kind === ts.SyntaxKind.MultiLineCommentTrivia &&
        sourceFile.text.slice(candidate.pos, candidate.pos + 3) === "/**",
    );
  if (comment === undefined) return null;
  return sourceFile.text
    .slice(comment.pos + 3, comment.end - 2)
    .split(/\r?\n/gu)
    .map((line) => line.replace(/^\s*\*?\s?/u, ""))
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

describe("feedback and status public API descriptions", () => {
  it("describes a deterministic recursive inventory without review-required rows", () => {
    let propCount = 0;
    let describedCount = 0;
    let localizationReviewCount = 0;
    let semanticReviewCount = 0;

    for (const family of families) {
      const docs = docsFor(family);
      const propNames = docs.props.map((prop) => `${prop.owner}.${prop.name}`);
      expect(propNames, `${family.id} ordering`).toEqual(
        [...propNames].sort((left, right) => left.localeCompare(right, "en-US")),
      );
      expect(propNames, `${family.id} curated inventory`).toEqual(
        expect.arrayContaining([...family.props]),
      );
      expect(docs.summary.describedProps, family.id).toBe(docs.summary.props);
      for (const prop of docs.props) {
        const key = `${family.id}:${prop.owner}.${prop.name}`;
        expect(prop.description, key).not.toBeNull();
        expect(prop.description?.length, key).toBeGreaterThanOrEqual(28);
        localizationReviewCount += Number(prop.localizationBehavior === "review-required");
        semanticReviewCount += Number(prop.semanticContract === "review-required");
      }
      propCount += docs.summary.props;
      describedCount += docs.summary.describedProps;
    }

    expect(describedCount).toBe(propCount);
    expect(propCount).toBeGreaterThanOrEqual(115);
    expect(localizationReviewCount).toBe(0);
    expect(semanticReviewCount).toBe(0);
  });

  it("documents private base and union properties that define exported aliases", () => {
    for (const [id, expectedDeclarations] of Object.entries(hiddenSurfaces)) {
      const source = sourceFor(id);
      const sourceFile = ts.createSourceFile(
        source.sourcePath,
        source.text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );

      for (const [declarationName, expectedProperties] of Object.entries(expectedDeclarations)) {
        const declaration = sourceFile.statements.find(
          (statement) =>
            (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
            statement.name.text === declarationName,
        );
        expect(declaration, `${id}:${declarationName}`).toBeDefined();
        const members = propertySignatures(declaration!);
        expect(members.map(propertyName), `${id}:${declarationName}`).toEqual(expectedProperties);
        for (const member of members) {
          const key = `${id}:${declarationName}.${propertyName(member)}`;
          const description = descriptionFor(sourceFile, member);
          expect(description, key).not.toBeNull();
          expect(description?.length, key).toBeGreaterThanOrEqual(28);
        }
      }
    }
  });

  it("keeps behavior claims tied to implemented family contracts", () => {
    const descriptions = new Map(
      families.flatMap((family) =>
        docsFor(family).props.map(
          (prop) => [`${family.id}:${prop.owner}.${prop.name}`, prop.description] as const,
        ),
      ),
    );

    expect(descriptions.get("badge:BadgeCountProps.maximum")).toContain("exact accessible");
    expect(descriptions.get("callout:CalloutProps.landmarkLabel")).toContain("aside");
    expect(descriptions.get("empty-state:EmptyStateProps.recoverySuggestions")).toContain(
      "labelled",
    );
    expect(descriptions.get("error-state:RecoverableErrorStateProps.recoverable")).toContain(
      "requires `onRetry`",
    );
    expect(descriptions.get("meter:MeterProps.showThresholdSummary")).toContain("links them");
    expect(descriptions.get("progress:ProgressProps.showValue")).toContain("aria-valuetext");
    expect(descriptions.get("skeleton:SkeletonProps.animated")).toContain("reduced-motion");
    expect(descriptions.get("spinner:BusyRegionProps.announce")).toContain("shared announcer");
    expect(descriptions.get("status:StatusProps.live")).toContain("atomic live");
    expect(
      descriptions.get("notification-center:NotificationCenterProps.liveUpdatePolicy"),
    ).toContain("pending-update queue");
    expect(descriptions.get("notification-center:NotificationCenterProps.virtualWindow")).toContain(
      "set-position semantics",
    );
  });
});
