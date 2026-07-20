import { readdirSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const publicCopyRoots = [
  resolve(workspaceRoot, "apps/storybook/src"),
  resolve(workspaceRoot, "apps/web/src/app"),
] as const;
const inspectedExtensions = new Set([".css", ".ts", ".tsx"]);
const projectSpecificCopy = /\b(?:salary|compensation|recruit(?:er|ing|ment)?)\b/iu;

function filesBelow(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

describe("domain-neutral public examples", () => {
  it("keeps Storybook and site copy free of unrelated employment examples", () => {
    const violations = publicCopyRoots.flatMap((directory) =>
      filesBelow(directory)
        .filter((path) => inspectedExtensions.has(extname(path)))
        .filter((path) => projectSpecificCopy.test(readFileSync(path, "utf8")))
        .map((path) => relative(workspaceRoot, path).replaceAll("\\", "/")),
    );

    expect(violations).toEqual([]);
  });
});
