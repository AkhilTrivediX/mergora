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

  it("keeps evidence explicitly unknown until browser and manual campaigns run", () => {
    const contract = JSON.parse(
      readFileSync(resolve(directory, "contract.draft.json"), "utf8"),
    ) as {
      status: string;
      evidence: Record<string, string>;
      limitations: string[];
    };
    expect(contract.status).toBe("draft-unverified");
    expect(new Set(Object.values(contract.evidence))).toEqual(
      new Set(["not-tested", "not-supplied"]),
    );
    expect(contract.limitations).not.toHaveLength(0);
  });

  it("uses semantic tokens and provides forced-color and reduced-motion branches", () => {
    const css = readFileSync(resolve(directory, "combobox.css"), "utf8");
    expect(css).toContain("var(--mrg-component-field-background)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
  });
});
