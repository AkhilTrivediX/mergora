import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import { Combobox } from "../../../registry/source/components/combobox/index.ts";

const directory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../registry/source/components/combobox",
);

describe("Combobox canonical source", () => {
  it("composes an optional clear action without changing the basic anatomy", () => {
    const plain = renderToStaticMarkup(
      <Combobox.Root defaultInputValue="India">
        <Combobox.Label>Country</Combobox.Label>
        <Combobox.Input />
        <Combobox.Trigger />
      </Combobox.Root>,
    );
    const enhanced = renderToStaticMarkup(
      <Combobox.Root defaultInputValue="India">
        <Combobox.Label>Country</Combobox.Label>
        <Combobox.Input />
        <Combobox.Clear label="Clear country" />
        <Combobox.Trigger />
      </Combobox.Root>,
    );
    expect(plain).not.toContain("combobox-clear");
    expect(enhanced).toContain('data-slot="combobox-clear"');
    expect(enhanced).toContain('aria-label="Clear country"');
    expect(enhanced).toContain('type="button"');
  });

  it("keeps the optional clear action inert in disabled and read-only roots", () => {
    for (const rootProps of [{ isDisabled: true }, { isReadOnly: true }] as const) {
      const markup = renderToStaticMarkup(
        <Combobox.Root {...rootProps} defaultInputValue="India">
          <Combobox.Label>Country</Combobox.Label>
          <Combobox.Input />
          <Combobox.Clear label="Clear country" />
        </Combobox.Root>,
      );
      expect(markup).toContain('data-slot="combobox-clear"');
      expect(markup).toContain("disabled");
    }
  });

  it("renders a labelled editable native input through the Mergora anatomy", () => {
    const html = renderToStaticMarkup(
      <Combobox.Root name="country" defaultValue="in">
        <Combobox.Label>Country</Combobox.Label>
        <Combobox.Input placeholder="Choose a country" />
        <Combobox.Trigger label="Show countries" />
        <Combobox.Description>Type to filter.</Combobox.Description>
        <Combobox.Popover>
          <Combobox.ListBox>
            <Combobox.Item id="in">India</Combobox.Item>
          </Combobox.ListBox>
        </Combobox.Popover>
      </Combobox.Root>,
    );

    expect(html).toContain('data-slot="combobox-root"');
    expect(html).toContain('data-slot="combobox-label"');
    expect(html).toContain('data-slot="combobox-input"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-label="Show countries"');
    expect(html).toContain('name="country"');
  });

  it("publishes component metadata that validates against the canonical schema", () => {
    const metadata = JSON.parse(readFileSync(resolve(directory, "component.json"), "utf8"));
    const result = validateSchemaDocument("component-metadata", metadata);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("records current automation without converting absent manual evidence into a pass", () => {
    const contract = JSON.parse(
      readFileSync(resolve(directory, "contract.draft.json"), "utf8"),
    ) as {
      status: string;
      evidence: Record<string, string>;
      limitations: string[];
    };
    expect(contract.status).toBe("draft-unverified");
    expect(contract.evidence).toEqual({
      automated: "pass",
      browser: "pass",
      manualAssistiveTechnology: "not-supplied",
      packageSourceParity: "not-tested",
    });
    expect(contract.limitations).not.toHaveLength(0);
  });

  it("uses semantic tokens and provides forced-color and reduced-motion branches", () => {
    const css = readFileSync(resolve(directory, "combobox.css"), "utf8");
    expect(css).toContain("var(--mrg-component-field-background)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("var(--mrg-component-focus-indicator-contrast-background)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
  });

  it("ships operative basic and recommended Storybook controls", () => {
    const source = readFileSync(
      resolve(directory, "../../../../apps/storybook/src/P4Combobox.stories.tsx"),
      "utf8",
    );
    expect(source).toContain("export const BasicDefaults");
    expect(source).toContain("export const RecommendedMergora");
    expect(source).toContain("clearAction: {");
    expect(source).toContain("clearAction ? <Combobox.Clear");
  });
});
