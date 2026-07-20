import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const forbiddenPackagePrefixes = [
  "@base-ui/",
  "@radix-ui/",
  "@ark-ui/",
  "@zag-js/",
  "@headlessui/",
];

function filesBelow(directory: string, predicate: (name: string) => boolean): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path, predicate) : predicate(entry.name) ? [path] : [];
  });
}

function importedSpecifiers(source: string): readonly string[] {
  return [...source.matchAll(/\b(?:from\s+|import\s*)["']([^"']+)["']/gu)].map(
    (match) => match[1]!,
  );
}

describe("P1 behavior-engine boundary", () => {
  it("has no second focus, overlay, or composite behavior engine in direct dependencies", () => {
    const manifests = [
      resolve(workspaceRoot, "package.json"),
      ...["apps", "packages", "tooling"].flatMap((directory) =>
        filesBelow(resolve(workspaceRoot, directory), (name) => name === "package.json"),
      ),
    ];
    const violations: string[] = [];
    for (const path of new Set(manifests)) {
      const document = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      for (const field of ["dependencies", "devDependencies", "peerDependencies"] as const) {
        const dependencies = document[field] as Record<string, unknown> | undefined;
        for (const name of Object.keys(dependencies ?? {})) {
          if (forbiddenPackagePrefixes.some((prefix) => name.startsWith(prefix))) {
            violations.push(`${path}:${field}:${name}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps canonical component imports on native HTML, React Aria, and the approved data model", () => {
    const sources = filesBelow(resolve(workspaceRoot, "registry/source"), (name) =>
      /\.(?:ts|tsx)$/u.test(name),
    );
    const violations = sources.flatMap((path) =>
      importedSpecifiers(readFileSync(path, "utf8"))
        .filter((specifier) =>
          forbiddenPackagePrefixes.some((prefix) => specifier.startsWith(prefix)),
        )
        .map((specifier) => `${path}:${specifier}`),
    );
    expect(violations).toEqual([]);

    expect(
      importedSpecifiers(
        readFileSync(
          resolve(workspaceRoot, "registry/source/components/dialog/dialog.tsx"),
          "utf8",
        ),
      ),
    ).toContain("react-aria-components/Modal");
    expect(
      importedSpecifiers(
        readFileSync(
          resolve(workspaceRoot, "registry/source/components/combobox/combobox.tsx"),
          "utf8",
        ),
      ),
    ).toContain("react-aria-components/ComboBox");
    expect(
      importedSpecifiers(
        readFileSync(
          resolve(workspaceRoot, "registry/source/systems/data-grid/data-grid.tsx"),
          "utf8",
        ),
      ),
    ).toContain("@tanstack/react-table");
  });
});
