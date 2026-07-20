import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  validateStoryStateMatrix,
  type StoryStateMatrix,
} from "../../../packages/test-utils/src/index.ts";
import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import { Autocomplete } from "../../../registry/source/components/autocomplete/autocomplete.tsx";
import { CommandPalette } from "../../../registry/source/components/command-palette/command-palette.tsx";
import { CreatableSelect } from "../../../registry/source/components/creatable-select/creatable-select.tsx";
import { MentionField } from "../../../registry/source/components/mention-field/mention-field.tsx";
import { MultiSelect } from "../../../registry/source/components/multi-select/multi-select.tsx";
import { TagsInput } from "../../../registry/source/components/tags-input/tags-input.tsx";
import { TransferList } from "../../../registry/source/components/transfer-list/transfer-list.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = [
  "autocomplete",
  "command-palette",
  "creatable-select",
  "mention-field",
  "multi-select",
  "tags-input",
  "transfer-list",
] as const;
const options = [
  { id: "tokens", value: "tokens", label: "Design tokens", description: "Semantic aliases" },
  {
    id: "components",
    value: "components",
    label: "Components",
    description: "Source building blocks",
  },
] as const;

function readItem(itemId: string, filename: string): string {
  return readFileSync(resolve(componentsRoot, itemId, filename), "utf8");
}

function readJson<T>(itemId: string, filename: string): T {
  return JSON.parse(readItem(itemId, filename)) as T;
}

describe("advanced collection canonical records", () => {
  it("ships exactly twelve canonical source files per component", () => {
    for (const itemId of itemIds) {
      expect(readdirSync(resolve(componentsRoot, itemId)).sort(), itemId).toEqual(
        [
          "README.md",
          "index.ts",
          `${itemId}-css.d.ts`,
          `${itemId}.anatomy.json`,
          `${itemId}.api.json`,
          `${itemId}.contract.json`,
          `${itemId}.css`,
          `${itemId}.metadata.json`,
          `${itemId}.source.json`,
          `${itemId}.status.json`,
          `${itemId}.stories.json`,
          `${itemId}.tsx`,
        ].sort(),
      );
    }
  });

  it("validates metadata, full story-state policy, story references, and honest status", () => {
    const storySource = readFileSync(
      resolve(root, "apps/storybook/src/P5AdvancedCollections.stories.tsx"),
      "utf8",
    );
    const exports = new Set(
      [...storySource.matchAll(/^export const ([A-Za-z0-9_]+)\b/gmu)].map((match) => match[1]),
    );
    for (const itemId of itemIds) {
      const metadata = readJson<Record<string, unknown>>(itemId, `${itemId}.metadata.json`);
      const stories = readJson<StoryStateMatrix>(itemId, `${itemId}.stories.json`);
      expect(validateSchemaDocument("component-metadata", metadata), itemId).toMatchObject({
        errors: [],
        ok: true,
      });
      expect(validateStoryStateMatrix(stories), itemId).toMatchObject({ issues: [], ok: true });
      for (const state of stories.states)
        if ("story" in state) expect(exports, `${itemId}/${state.id}`).toContain(state.story);
      expect(readJson(itemId, `${itemId}.status.json`)).toMatchObject({
        distributionStatus: "not-generated",
        evidenceStatus: "incomplete",
        implementationStatus: "source-present-unreleased",
        recordedEvidence: [],
        releaseStatus: "unreleased",
      });
      const source = readJson<Record<string, unknown>>(itemId, `${itemId}.source.json`);
      expect(source).toMatchObject({ id: itemId, itemDependencies: [], outputRole: "component" });
    }
  });

  it("uses semantic tokens, logical structure, bounded corners, and preference fallbacks", () => {
    for (const itemId of itemIds) {
      const css = readItem(itemId, `${itemId}.css`);
      expect(css, itemId).not.toMatch(
        /#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(|linear-gradient|radial-gradient/iu,
      );
      expect(css, itemId).not.toMatch(/border-radius:\s*(?:1[7-9]|[2-9]\d)px/iu);
      expect(css, itemId).not.toMatch(/\b(?:margin|padding|border|inset)-(?:left|right)\s*:/iu);
      expect(css, itemId).toContain("@media (prefers-reduced-motion: reduce)");
      expect(css, itemId).toContain("@media (forced-colors: active)");
      expect(css, itemId).toContain("var(--mrg-component-focus-indicator-color)");
      expect(css, itemId).toContain("outline-color: Highlight");
      expect(css, itemId).toContain("box-shadow: none");
    }
    const tagsCss = readItem("tags-input", "tags-input.css");
    expect(tagsCss).toContain("@media (pointer: coarse)");
    expect(tagsCss).toContain("min-inline-size: var(--mrg-semantic-size-target-preferred)");
  });
});

describe("advanced collection enhancement-off contracts", () => {
  it("keeps every basic render free of enhancement UI and accessibility output", () => {
    const markup = [
      renderToStaticMarkup(<Autocomplete label="Area" options={options} />),
      renderToStaticMarkup(
        <CommandPalette
          commands={[{ id: "open", label: "Open" }]}
          defaultOpen
          label="Commands"
          onCommand={() => undefined}
        />,
      ),
      renderToStaticMarkup(
        <CreatableSelect defaultValue="tokens" label="Area" options={options} />,
      ),
      renderToStaticMarkup(
        <MentionField defaultValue="Review @Design-tokens" label="Note" options={options} />,
      ),
      renderToStaticMarkup(
        <MultiSelect defaultValue={["tokens"]} label="Areas" options={options} />,
      ),
      renderToStaticMarkup(<TagsInput defaultValue={["keyboard"]} label="Tags" />),
      renderToStaticMarkup(
        <TransferList defaultValue={["tokens"]} items={options} label="Scope" />,
      ),
    ].join("\n");
    expect(markup).not.toContain("autocomplete-match-context");
    expect(markup).not.toContain("command-palette-execution-preview");
    expect(markup).not.toContain("creatable-select-canonical-preview");
    expect(markup).not.toContain("mention-field-summary");
    expect(markup).not.toContain("multi-select-selection-summary");
    expect(markup).not.toContain("tags-input-duplicate-recovery");
    expect(markup).not.toContain("transfer-list-summary");
    expect(markup).not.toContain("Filter Available");
    expect(markup).not.toContain("Move keyboard earlier");
    expect(markup).not.toContain('aria-live="polite"');
  });

  it("renders each useful advantage only when independently enabled", () => {
    expect(
      renderToStaticMarkup(<Autocomplete label="Area" options={options} showMatchContext />),
    ).toContain("autocomplete-match-context");
    const paletteMarkup = renderToStaticMarkup(
      <CommandPalette
        commands={[{ id: "open", label: "Open", description: "Opens details" }]}
        defaultOpen
        description="Search available commands."
        label="Commands"
        onCommand={() => undefined}
        showExecutionPreview
      />,
    );
    expect(paletteMarkup).toContain("command-palette-execution-preview");
    expect(paletteMarkup).toMatch(
      /aria-describedby="[^"]+-description"[\s\S]*Search available commands\./u,
    );
    expect(
      renderToStaticMarkup(
        <CommandPalette
          commands={[{ id: "ranked", label: "Externally ranked result" }]}
          defaultOpen
          defaultQuery="different query"
          label="Commands"
          onCommand={() => undefined}
          shouldFilter={false}
        />,
      ),
    ).toContain("Externally ranked result");
    expect(
      renderToStaticMarkup(
        <CreatableSelect
          defaultValue="tokens"
          formatCanonicalValue={(input) => input.toUpperCase()}
          label="Area"
          options={options}
          showCanonicalPreview
        />,
      ),
    ).toContain("DESIGN TOKENS");
    expect(
      renderToStaticMarkup(
        <MentionField
          defaultValue="Review @Design-tokens"
          label="Note"
          options={options}
          showMentionSummary
        />,
      ),
    ).toContain("1 recognized mention");
    expect(
      renderToStaticMarkup(
        <MultiSelect
          defaultValue={["tokens"]}
          label="Areas"
          options={options}
          showSelectionSummary
        />,
      ),
    ).toContain("1 selected");
    expect(
      renderToStaticMarkup(
        <TagsInput defaultValue={["keyboard"]} label="Tags" recoverDuplicates />,
      ),
    ).toContain("tags-input-duplicate-recovery");
    expect(
      renderToStaticMarkup(
        <TransferList
          defaultValue={["tokens"]}
          items={options}
          label="Scope"
          showTransferSummary
        />,
      ),
    ).toContain("1 available · 1 included");
  });

  it("never invokes disabled enhancement callbacks or formatters", () => {
    const formatter = vi.fn((input: string) => input);
    renderToStaticMarkup(
      <CreatableSelect
        defaultValue="tokens"
        formatCanonicalValue={formatter}
        label="Area"
        options={options}
        showCanonicalPreview={false}
      />,
    );
    expect(formatter).not.toHaveBeenCalled();
  });

  it("renders the planned component-specific capabilities without coupling their opt-ins", () => {
    const commandMarkup = renderToStaticMarkup(
      <CommandPalette
        commands={[
          {
            children: [{ id: "components", label: "Components" }],
            group: "Browse",
            id: "catalog",
            label: "Catalog",
          },
        ]}
        label="Commands"
        onCommand={() => undefined}
        presentation="embedded"
      />,
    );
    expect(commandMarkup).toContain('role="region"');
    expect(commandMarkup).not.toContain('aria-modal="true"');
    expect(commandMarkup).toContain("Browse");
    expect(commandMarkup).toContain("Opens command page");

    const multiMarkup = renderToStaticMarkup(
      <MultiSelect
        defaultValue={["tokens", "components"]}
        label="Areas"
        maximum={2}
        maximumVisibleTokens={1}
        options={options}
      />,
    );
    expect(multiMarkup).toContain("1 more selected");

    const tagsMarkup = renderToStaticMarkup(
      <TagsInput defaultValue={["keyboard", "touch"]} label="Tags" reorderable />,
    );
    expect(tagsMarkup).toContain("Move keyboard later");
    expect(tagsMarkup).not.toContain("tags-input-duplicate-recovery");

    const mentionMarkup = renderToStaticMarkup(
      <MentionField
        defaultValue="Review #Accessibility"
        label="Note"
        options={[
          {
            entityType: "topic",
            id: "accessibility",
            label: "Accessibility",
            trigger: "#",
          },
        ]}
        showMentionSummary
        triggers={[{ entityType: "topic", symbol: "#" }]}
      />,
    );
    expect(mentionMarkup).toContain("1 recognized mention");

    const transferMarkup = renderToStaticMarkup(
      <TransferList filterable items={options} label="Scope" />,
    );
    expect(transferMarkup).toContain("Filter Available");
    expect(transferMarkup).toContain("2 items");
  });
});

describe("advanced collection input validation", () => {
  it("rejects duplicate or unknown external values and invalid visible contracts", () => {
    expect(() => renderToStaticMarkup(<Autocomplete label=" " options={[]} />)).toThrow(/label/u);
    expect(() =>
      renderToStaticMarkup(<MultiSelect label="Areas" options={options} value={["missing"]} />),
    ).toThrow(/does not exist/u);
    expect(() =>
      renderToStaticMarkup(<TagsInput defaultValue={["same", "SAME"]} label="Tags" />),
    ).toThrow(/duplicated/u);
    expect(() =>
      renderToStaticMarkup(
        <TransferList defaultValue={["missing"]} items={options} label="Scope" />,
      ),
    ).toThrow(/does not exist/u);
  });

  it("rejects ambiguous trigger, delimiter, child-page, and retry contracts", () => {
    expect(() =>
      renderToStaticMarkup(
        <MentionField label="Note" options={[{ id: "topic", label: "Topic", trigger: "#" }]} />,
      ),
    ).toThrow(/unknown trigger/u);
    expect(() => renderToStaticMarkup(<TagsInput delimiters={[",", ","]} label="Tags" />)).toThrow(
      /unique/u,
    );
    expect(() =>
      renderToStaticMarkup(
        <CommandPalette
          commands={[{ children: [], id: "empty", label: "Empty" }]}
          label="Commands"
          onCommand={() => undefined}
          presentation="embedded"
        />,
      ),
    ).toThrow(/must not be empty/u);
    expect(() =>
      renderToStaticMarkup(<MultiSelect label="Areas" loadError="Unavailable" options={options} />),
    ).toThrow(/requires onRetry/u);
  });
});
