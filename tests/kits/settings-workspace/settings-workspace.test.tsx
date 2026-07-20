import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SettingsWorkspace } from "../../../registry/source/kits/settings-workspace/settings-workspace.tsx";
import {
  assertImplementationProfileShard,
  loadMergoraSignaturePolicy,
} from "../../../tooling/registry-builder/src/index.ts";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const id = "settings-workspace";
const sections = [
  { id: "profile" as const, label: "Profile" },
  { id: "preferences" as const, label: "Preferences" },
  { id: "notifications" as const, label: "Notifications" },
  { id: "security" as const, label: "Security" },
];

describe("settings workspace canonical source", () => {
  it("keeps the baseline direct and removes protective enhancements", () => {
    const basic = renderToStaticMarkup(
      <SettingsWorkspace
        renderSection={({ section }) => <p>{section.label}</p>}
        sections={sections}
      />,
    );
    expect(basic).toContain('data-slot="settings-workspace"');
    expect(basic).toContain('aria-current="page"');
    expect(basic).not.toContain("settings-unsaved-prompt");
    expect(basic).not.toContain("settings-destructive");

    const enhanced = renderToStaticMarkup(
      <SettingsWorkspace
        defaultDirty
        destructiveAction={{
          confirmationText: "REMOVE",
          consequences: ["Access changes."],
          description: "Review the account action.",
          label: "account removal",
          onConfirm: () => undefined,
        }}
        protectUnsavedChanges
        renderSection={({ section }) => <p>{section.label}</p>}
        sections={sections}
      />,
    );
    expect(enhanced).toContain('data-dirty="true"');
    expect(enhanced).toContain("settings-destructive");
    expect(enhanced).not.toContain("settings-unsaved-prompt");
  });

  it("requires the complete unique section family", () => {
    expect(() =>
      renderToStaticMarkup(
        <SettingsWorkspace renderSection={() => null} sections={sections.slice(0, 3)} />,
      ),
    ).toThrow(/requires unique profile/u);
    expect(() =>
      renderToStaticMarkup(
        <SettingsWorkspace
          renderSection={() => null}
          sections={[...sections, { id: "profile", label: "Duplicate" }]}
        />,
      ),
    ).toThrow(/requires unique profile/u);
  });

  it("owns the exact companion set, matching API exports, and a valid profile", () => {
    const directory = resolve(workspaceRoot, `registry/source/kits/${id}`);
    expect(readdirSync(directory).sort()).toEqual(
      [
        "README.md",
        "index.ts",
        `${id}-css.d.ts`,
        `${id}.anatomy.json`,
        `${id}.api.json`,
        `${id}.contract.json`,
        `${id}.css`,
        `${id}.metadata.json`,
        `${id}.source.json`,
        `${id}.status.json`,
        `${id}.stories.json`,
        `${id}.tsx`,
      ].sort(),
    );
    const runtime = readFileSync(resolve(directory, `${id}.tsx`), "utf8");
    const api = JSON.parse(readFileSync(resolve(directory, `${id}.api.json`), "utf8"));
    const source = JSON.parse(readFileSync(resolve(directory, `${id}.source.json`), "utf8")) as {
      declaredImports: string[];
      id: string;
      outputRole: string;
    };
    const runtimeExports = [
      ...runtime.matchAll(
        /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|const|enum|function|interface|let|namespace|type|var)\s+([A-Za-z_$][\w$]*)/gmu,
      ),
    ]
      .map((match) => match[1]!)
      .sort((left, right) => left.localeCompare(right, "en-US"));
    expect(api.exports.map((entry: { readonly name: string }) => entry.name).sort()).toEqual(
      runtimeExports,
    );
    expect(source).toMatchObject({ id, outputRole: "kit" });
    const runtimeImports = [
      ...runtime.matchAll(/^import\s+(?:["']([^"']+)["']|[\s\S]*?\sfrom\s+["']([^"']+)["']);/gmu),
    ]
      .map((match) => (match[1] ?? match[2])!)
      .sort((left, right) => left.localeCompare(right, "en-US"));
    expect([...source.declaredImports].sort()).toEqual(runtimeImports);
    expect(source.declaredImports.every((specifier) => !specifier.endsWith("/index.js"))).toBe(
      true,
    );
    const profile = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, "registry/quality/implementation-profiles/settings.v1.json"),
        "utf8",
      ),
    );
    expect(() =>
      assertImplementationProfileShard(
        profile,
        loadMergoraSignaturePolicy(workspaceRoot),
        workspaceRoot,
      ),
    ).not.toThrow();
    expect(profile.auditPendingIds).toEqual([]);
  });

  it("uses semantic tokens and required preference fallbacks without banned styling", () => {
    const css = readFileSync(
      resolve(workspaceRoot, `registry/source/kits/${id}/${id}.css`),
      "utf8",
    );
    const tokenCss = readFileSync(
      resolve(workspaceRoot, "packages/tokens/src/generated/tokens.css"),
      "utf8",
    );
    const references = [...css.matchAll(/var\((--mrg-semantic-[a-z0-9-]+)/gu)].map(
      (match) => match[1]!,
    );
    expect(references.length).toBeGreaterThan(20);
    expect(references.every((reference) => tokenCss.includes(`${reference}:`))).toBe(true);
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).not.toMatch(
      /(?:gradient\(|backdrop-filter|border-radius:\s*(?:2[0-9]|[3-9][0-9])px)/u,
    );
  });
});
