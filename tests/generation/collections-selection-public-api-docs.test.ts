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
  {
    id: "autocomplete",
    publicExports: ["AutocompleteProps"],
    props: [
      "AutocompleteProps.defaultValue",
      "AutocompleteProps.description",
      "AutocompleteProps.emptyMessage",
      "AutocompleteProps.errorMessage",
      "AutocompleteProps.hasMore",
      "AutocompleteProps.invalid",
      "AutocompleteProps.label",
      "AutocompleteProps.loadError",
      "AutocompleteProps.loading",
      "AutocompleteProps.loadingMessage",
      "AutocompleteProps.onLoadMore",
      "AutocompleteProps.onOptionSelect",
      "AutocompleteProps.onRetry",
      "AutocompleteProps.onValueChange",
      "AutocompleteProps.options",
      "AutocompleteProps.showMatchContext",
      "AutocompleteProps.value",
    ],
  },
  {
    id: "combobox",
    publicExports: [
      "ComboboxClearProps",
      "ComboboxDescriptionProps",
      "ComboboxErrorMessageProps",
      "ComboboxInputProps",
      "ComboboxItemProps",
      "ComboboxLabelProps",
      "ComboboxListBoxProps",
      "ComboboxPopoverProps",
      "ComboboxRootProps",
      "ComboboxSectionProps",
      "ComboboxTriggerProps",
    ],
    props: [
      "ComboboxClearProps.className",
      "ComboboxClearProps.label",
      "ComboboxDescriptionProps.className",
      "ComboboxErrorMessageProps.className",
      "ComboboxInputProps.className",
      "ComboboxItemProps.aria-label",
      "ComboboxItemProps.children",
      "ComboboxItemProps.className",
      "ComboboxItemProps.id",
      "ComboboxItemProps.isDisabled",
      "ComboboxItemProps.textValue",
      "ComboboxItemProps.value",
      "ComboboxLabelProps.className",
      "ComboboxListBoxProps.aria-label",
      "ComboboxListBoxProps.children",
      "ComboboxListBoxProps.className",
      "ComboboxListBoxProps.emptyContent",
      "ComboboxListBoxProps.items",
      "ComboboxPopoverProps.className",
      "ComboboxPopoverProps.offset",
      "ComboboxPopoverProps.placement",
      "ComboboxRootProps.allowsCustomValue",
      "ComboboxRootProps.allowsEmptyCollection",
      "ComboboxRootProps.aria-label",
      "ComboboxRootProps.aria-labelledby",
      "ComboboxRootProps.children",
      "ComboboxRootProps.className",
      "ComboboxRootProps.defaultInputValue",
      "ComboboxRootProps.defaultValue",
      "ComboboxRootProps.disabledKeys",
      "ComboboxRootProps.formValue",
      "ComboboxRootProps.inputValue",
      "ComboboxRootProps.isDisabled",
      "ComboboxRootProps.isInvalid",
      "ComboboxRootProps.isReadOnly",
      "ComboboxRootProps.isRequired",
      "ComboboxRootProps.menuTrigger",
      "ComboboxRootProps.name",
      "ComboboxRootProps.onInputValueChange",
      "ComboboxRootProps.onOpenChange",
      "ComboboxRootProps.onValueChange",
      "ComboboxRootProps.validationBehavior",
      "ComboboxRootProps.value",
      "ComboboxSectionProps.children",
      "ComboboxSectionProps.className",
      "ComboboxSectionProps.id",
      "ComboboxSectionProps.title",
      "ComboboxTriggerProps.className",
      "ComboboxTriggerProps.label",
    ],
  },
  {
    id: "command-palette",
    publicExports: ["CommandPaletteProps"],
    props: [
      "CommandPaletteProps.commands",
      "CommandPaletteProps.defaultOpen",
      "CommandPaletteProps.defaultQuery",
      "CommandPaletteProps.description",
      "CommandPaletteProps.emptyMessage",
      "CommandPaletteProps.label",
      "CommandPaletteProps.loadError",
      "CommandPaletteProps.loading",
      "CommandPaletteProps.navigationAdapter",
      "CommandPaletteProps.onCommand",
      "CommandPaletteProps.onOpenChange",
      "CommandPaletteProps.onQueryChange",
      "CommandPaletteProps.onRetry",
      "CommandPaletteProps.open",
      "CommandPaletteProps.placeholder",
      "CommandPaletteProps.presentation",
      "CommandPaletteProps.query",
      "CommandPaletteProps.shouldFilter",
      "CommandPaletteProps.showExecutionPreview",
    ],
  },
  {
    id: "creatable-select",
    publicExports: ["CreatableSelectProps"],
    props: [
      "CreatableSelectProps.creating",
      "CreatableSelectProps.defaultValue",
      "CreatableSelectProps.description",
      "CreatableSelectProps.emptyMessage",
      "CreatableSelectProps.errorMessage",
      "CreatableSelectProps.form",
      "CreatableSelectProps.formatCanonicalValue",
      "CreatableSelectProps.invalid",
      "CreatableSelectProps.label",
      "CreatableSelectProps.name",
      "CreatableSelectProps.onCancelCreate",
      "CreatableSelectProps.onCreate",
      "CreatableSelectProps.onValueChange",
      "CreatableSelectProps.options",
      "CreatableSelectProps.showCanonicalPreview",
      "CreatableSelectProps.validateCreate",
      "CreatableSelectProps.value",
    ],
  },
  {
    id: "mention-field",
    publicExports: ["MentionFieldProps"],
    props: [
      "MentionFieldProps.defaultValue",
      "MentionFieldProps.description",
      "MentionFieldProps.emptyMessage",
      "MentionFieldProps.errorMessage",
      "MentionFieldProps.invalid",
      "MentionFieldProps.label",
      "MentionFieldProps.loadError",
      "MentionFieldProps.loading",
      "MentionFieldProps.loadingMessage",
      "MentionFieldProps.onQueryChange",
      "MentionFieldProps.onRetry",
      "MentionFieldProps.onValueChange",
      "MentionFieldProps.options",
      "MentionFieldProps.showMentionSummary",
      "MentionFieldProps.triggers",
      "MentionFieldProps.value",
    ],
  },
  {
    id: "multi-select",
    publicExports: ["MultiSelectProps"],
    props: [
      "MultiSelectProps.defaultValue",
      "MultiSelectProps.description",
      "MultiSelectProps.disabled",
      "MultiSelectProps.emptyMessage",
      "MultiSelectProps.errorMessage",
      "MultiSelectProps.form",
      "MultiSelectProps.hasMore",
      "MultiSelectProps.invalid",
      "MultiSelectProps.label",
      "MultiSelectProps.loadError",
      "MultiSelectProps.loading",
      "MultiSelectProps.loadingMessage",
      "MultiSelectProps.maximum",
      "MultiSelectProps.maximumVisibleTokens",
      "MultiSelectProps.name",
      "MultiSelectProps.onLoadMore",
      "MultiSelectProps.onRetry",
      "MultiSelectProps.onValueChange",
      "MultiSelectProps.options",
      "MultiSelectProps.placeholder",
      "MultiSelectProps.readOnly",
      "MultiSelectProps.required",
      "MultiSelectProps.showSelectionSummary",
      "MultiSelectProps.value",
    ],
  },
  {
    id: "select",
    publicExports: ["SelectProps"],
    props: [
      "SelectProps.aria-describedby",
      "SelectProps.aria-errormessage",
      "SelectProps.aria-invalid",
      "SelectProps.asyncState",
      "SelectProps.autoComplete",
      "SelectProps.className",
      "SelectProps.defaultOpen",
      "SelectProps.defaultValue",
      "SelectProps.description",
      "SelectProps.disabled",
      "SelectProps.entries",
      "SelectProps.errorMessage",
      "SelectProps.form",
      "SelectProps.formatSelectionSummary",
      "SelectProps.id",
      "SelectProps.invalid",
      "SelectProps.label",
      "SelectProps.listboxClassName",
      "SelectProps.messages",
      "SelectProps.name",
      "SelectProps.onOpenChange",
      "SelectProps.onValueChange",
      "SelectProps.open",
      "SelectProps.placeholder",
      "SelectProps.placement",
      "SelectProps.popoverClassName",
      "SelectProps.presentation",
      "SelectProps.required",
      "SelectProps.style",
      "SelectProps.validationBehavior",
      "SelectProps.value",
      "SelectProps.virtualization",
    ],
  },
  {
    id: "tags-input",
    publicExports: ["TagsInputProps"],
    props: [
      "TagsInputProps.defaultValue",
      "TagsInputProps.delimiters",
      "TagsInputProps.description",
      "TagsInputProps.disabled",
      "TagsInputProps.errorMessage",
      "TagsInputProps.form",
      "TagsInputProps.invalid",
      "TagsInputProps.label",
      "TagsInputProps.maximum",
      "TagsInputProps.name",
      "TagsInputProps.onDuplicateTag",
      "TagsInputProps.onValueChange",
      "TagsInputProps.placeholder",
      "TagsInputProps.readOnly",
      "TagsInputProps.recoverDuplicates",
      "TagsInputProps.reorderable",
      "TagsInputProps.required",
      "TagsInputProps.validateTag",
      "TagsInputProps.value",
    ],
  },
  {
    id: "transfer-list",
    publicExports: ["TransferListProps"],
    props: [
      "TransferListProps.defaultValue",
      "TransferListProps.description",
      "TransferListProps.destinationLabel",
      "TransferListProps.disabled",
      "TransferListProps.errorMessage",
      "TransferListProps.filterable",
      "TransferListProps.form",
      "TransferListProps.invalid",
      "TransferListProps.items",
      "TransferListProps.label",
      "TransferListProps.name",
      "TransferListProps.onValueChange",
      "TransferListProps.readOnly",
      "TransferListProps.required",
      "TransferListProps.showTransferSummary",
      "TransferListProps.sourceLabel",
      "TransferListProps.value",
    ],
  },
] as const;

const supportingModels = {
  autocomplete: { AutocompleteOption: 5 },
  combobox: {
    ComboboxInputChangeDetail: 1,
    ComboboxItemState: 6,
    ComboboxOpenChangeDetail: 1,
    ComboboxRootContextValue: 2,
    ComboboxValueChangeDetail: 1,
  },
  "command-palette": { CommandPaletteItem: 9, CommandPaletteNavigationAdapter: 1 },
  "creatable-select": { CreatableSelectOption: 4 },
  "mention-field": { MentionOption: 7, MentionQuery: 5, MentionTrigger: 3 },
  "multi-select": { MultiSelectOption: 5 },
  "transfer-list": { TransferListItem: 4 },
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

describe("collection selection public API descriptions", () => {
  it("describes every recursive extractor-visible prop without review placeholders", () => {
    let props = 0;
    let describedProps = 0;

    for (const family of families) {
      const docs = docsFor(family);
      expect(
        docs.props.map((prop) => `${prop.owner}.${prop.name}`),
        family.id,
      ).toEqual(family.props);
      expect(docs.summary.describedProps, family.id).toBe(docs.summary.props);
      for (const prop of docs.props) {
        const key = `${family.id}:${prop.owner}.${prop.name}`;
        expect(prop.description?.length, key).toBeGreaterThanOrEqual(28);
        expect(prop.localizationBehavior, key).not.toBe("review-required");
        expect(prop.semanticContract, key).not.toBe("review-required");
      }
      props += docs.summary.props;
      describedProps += docs.summary.describedProps;
    }

    expect({ describedProps, props }).toEqual({ describedProps: 210, props: 210 });
  });

  it("documents exported and local structured models outside Props extraction", () => {
    for (const [id, declarations] of Object.entries(supportingModels)) {
      const source = sourceFor(id);
      const sourceFile = ts.createSourceFile(
        source.sourcePath,
        source.text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      for (const [name, expectedCount] of Object.entries(declarations)) {
        const declaration = sourceFile.statements.find(
          (statement) =>
            (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
            statement.name.text === name,
        );
        expect(declaration, `${id}:${name}`).toBeDefined();
        const members = propertySignatures(declaration!);
        expect(members, `${id}:${name}`).toHaveLength(expectedCount);
        for (const member of members) {
          const description = descriptionFor(sourceFile, member);
          expect(
            description?.length,
            `${id}:${name}:${member.name.getText(sourceFile)}`,
          ).toBeGreaterThanOrEqual(28);
        }
      }
    }
  });

  it("records independent search, preview, summary, virtualization, and form semantics", () => {
    const descriptions = new Map(
      families.flatMap((family) =>
        docsFor(family).props.map(
          (prop) => [`${family.id}:${prop.owner}.${prop.name}`, prop.description] as const,
        ),
      ),
    );

    expect(descriptions.get("autocomplete:AutocompleteProps.showMatchContext")).toContain(
      "removes",
    );
    expect(descriptions.get("combobox:ComboboxRootProps.formValue")).toContain("serialization");
    expect(descriptions.get("command-palette:CommandPaletteProps.shouldFilter")).toContain(
      "remote-filtered",
    );
    expect(
      descriptions.get("creatable-select:CreatableSelectProps.showCanonicalPreview"),
    ).toContain("description id");
    expect(descriptions.get("mention-field:MentionFieldProps.showMentionSummary")).toContain(
      "removes",
    );
    expect(descriptions.get("multi-select:MultiSelectProps.name")).toContain("hidden input");
    expect(descriptions.get("select:SelectProps.virtualization")).toContain("omitting");
    expect(descriptions.get("tags-input:TagsInputProps.recoverDuplicates")).toContain(
      "live output",
    );
    expect(descriptions.get("transfer-list:TransferListProps.filterable")).toContain(
      "removes both filters",
    );
  });
});
