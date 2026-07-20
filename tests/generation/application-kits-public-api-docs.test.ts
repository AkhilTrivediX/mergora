import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  buildPublicApiDocs,
  type PublicApiDocs,
  type PublicApiSource,
} from "../../tooling/registry-builder/src/public-api-docs.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");

const families = [
  { id: "admin-dashboard-shell", publicExports: ["AdminDashboardShellProps"], props: 12 },
  { id: "ai-chat-workspace", publicExports: ["AiChatWorkspaceProps"], props: 14 },
  { id: "authentication-kit", publicExports: ["AuthenticationKitProps"], props: 13 },
  {
    id: "billing-subscription-kit",
    publicExports: ["BillingSubscriptionKitProps"],
    props: 15,
  },
  { id: "command-center", publicExports: ["CommandCenterProps"], props: 16 },
  { id: "crud-data-workspace", publicExports: ["CrudDataWorkspaceProps"], props: 7 },
  { id: "file-manager", publicExports: ["FileManagerProps"], props: 21 },
  { id: "onboarding-wizard", publicExports: ["OnboardingWizardProps"], props: 15 },
  { id: "scheduler-kit", publicExports: ["SchedulerKitProps"], props: 23 },
  { id: "settings-workspace", publicExports: ["SettingsWorkspaceProps"], props: 15 },
] as const;

const supportingPropertyCounts: Readonly<Record<(typeof families)[number]["id"], number>> = {
  "admin-dashboard-shell": 35,
  "ai-chat-workspace": 37,
  "authentication-kit": 9,
  "billing-subscription-kit": 16,
  "command-center": 17,
  "crud-data-workspace": 29,
  "file-manager": 45,
  "onboarding-wizard": 18,
  "scheduler-kit": 34,
  "settings-workspace": 15,
};

interface FamilySources {
  readonly files: PublicApiSource["normalizedFiles"];
  readonly sourceFiles: readonly ts.SourceFile[];
}

function sourcesFor(id: string): FamilySources {
  const relativeDirectory = `registry/source/kits/${id}`;
  const directory = resolve(workspaceRoot, relativeDirectory);
  const sourceNames = readdirSync(directory)
    .filter((name) => name !== "index.ts" && /\.tsx?$/u.test(name))
    .sort((left, right) => left.localeCompare(right, "en-US"));
  const files = sourceNames.map((name) => {
    const sourcePath = `${relativeDirectory}/${name}`;
    return {
      content: readFileSync(resolve(workspaceRoot, sourcePath), "utf8"),
      mediaType: name.endsWith(".tsx")
        ? ("text/typescript-jsx" as const)
        : ("text/typescript" as const),
      sourcePath,
    };
  });
  return {
    files,
    sourceFiles: files.map((file) =>
      ts.createSourceFile(
        file.sourcePath,
        file.content,
        ts.ScriptTarget.Latest,
        true,
        file.mediaType === "text/typescript-jsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      ),
    ),
  };
}

function docsFor(family: (typeof families)[number]): PublicApiDocs {
  const sources = sourcesFor(family.id);
  return buildPublicApiDocs(
    {
      id: family.id,
      normalizedFiles: sources.files,
      publicExports: family.publicExports,
    },
    "client-island",
  );
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

function exportedSupportingProperties(sourceFile: ts.SourceFile): readonly ts.PropertySignature[] {
  const properties: ts.PropertySignature[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertySignature(node)) properties.push(node);
    ts.forEachChild(node, visit);
  };
  for (const statement of sourceFile.statements) {
    if (!ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement)) continue;
    if (statement.name.text.endsWith("Props")) continue;
    const exported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (exported) visit(statement);
  }
  return properties;
}

describe("application kit public API descriptions", () => {
  it("describes the exact extractor-visible kit inventory without review placeholders", () => {
    let props = 0;
    let describedProps = 0;

    for (const family of families) {
      const docs = docsFor(family);
      expect(
        docs.groups.map((group) => group.name),
        family.id,
      ).toEqual(family.publicExports);
      expect(docs.summary.props, family.id).toBe(family.props);
      expect(docs.summary.describedProps, family.id).toBe(family.props);
      for (const prop of docs.props) {
        const key = `${family.id}:${prop.owner}.${prop.name}`;
        expect(prop.description?.length, key).toBeGreaterThanOrEqual(28);
        expect(prop.localizationBehavior, key).not.toBe("review-required");
        expect(prop.semanticContract, key).not.toBe("review-required");
      }
      props += docs.summary.props;
      describedProps += docs.summary.describedProps;
    }

    expect({ describedProps, props }).toEqual({ describedProps: 151, props: 151 });
  });

  it("documents every field in exported structured adapter, state, request, and message models", () => {
    let propertyCount = 0;
    for (const family of families) {
      const properties = sourcesFor(family.id).sourceFiles.flatMap(exportedSupportingProperties);
      expect(properties, family.id).toHaveLength(supportingPropertyCounts[family.id]);
      for (const property of properties) {
        const sourceFile = property.getSourceFile();
        const key = `${family.id}:${sourceFile.fileName}:${property.name.getText(sourceFile)}`;
        expect(descriptionFor(sourceFile, property)?.length, key).toBeGreaterThanOrEqual(28);
      }
      propertyCount += properties.length;
    }
    expect(propertyCount).toBe(255);
  });

  it("ties kit enhancements to implemented clean opt-out behavior", () => {
    const descriptions = new Map(
      families.flatMap((family) =>
        docsFor(family).props.map(
          (prop) => [`${family.id}:${prop.owner}.${prop.name}`, prop.description] as const,
        ),
      ),
    );

    expect(
      descriptions.get("admin-dashboard-shell:AdminDashboardShellProps.showChartDataTable"),
    ).toContain("removes the duplicate table semantics");
    expect(descriptions.get("ai-chat-workspace:AiChatWorkspaceProps.showToolDetails")).toContain(
      "removes detail and sensitive-value UI",
    );
    expect(
      descriptions.get("authentication-kit:AuthenticationKitProps.showRateLimitRecovery"),
    ).toContain("removes its timer");
    expect(
      descriptions.get("billing-subscription-kit:BillingSubscriptionKitProps.cancellationReview"),
    ).toContain("removes its UI, state, and request events");
    expect(descriptions.get("command-center:CommandCenterProps.globalShortcut")).toContain(
      "installs no document-level shortcut",
    );
    expect(descriptions.get("crud-data-workspace:CrudDataWorkspaceProps.enableUndo")).toContain(
      "removes undo state",
    );
    expect(descriptions.get("file-manager:FileManagerProps.virtualWindow")).toContain(
      "renders every matching file",
    );
    expect(descriptions.get("onboarding-wizard:OnboardingWizardProps.persistence")).toContain(
      "removes their UI and effects",
    );
    expect(descriptions.get("scheduler-kit:SchedulerKitProps.announceChanges")).toContain(
      "removes the live region",
    );
    expect(
      descriptions.get("settings-workspace:SettingsWorkspaceProps.protectUnsavedChanges"),
    ).toContain("removes listeners, prompt UI, and focus handling");
  });
});
