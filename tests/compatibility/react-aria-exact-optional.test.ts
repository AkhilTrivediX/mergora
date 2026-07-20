import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(import.meta.dirname, "../..");

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("React Aria exact-optional declaration boundary", () => {
  it("keeps a narrow, self-expiring external declaration workaround", () => {
    const rootConfig = readJson(resolve(workspaceRoot, "tsconfig.json"));
    const uiConfig = readJson(resolve(workspaceRoot, "packages/ui/tsconfig.json"));
    const baseConfig = readJson(resolve(workspaceRoot, "tsconfig.base.json"));
    expect(baseConfig.compilerOptions).toMatchObject({
      exactOptionalPropertyTypes: true,
      skipLibCheck: false,
      strict: true,
    });
    expect(rootConfig.compilerOptions).toMatchObject({ skipLibCheck: true });
    expect(uiConfig.compilerOptions).toMatchObject({ skipLibCheck: true });

    const workspaceRequire = createRequire(import.meta.url);
    const reactAriaRoot = dirname(workspaceRequire.resolve("react-aria-components/package.json"));
    const dependencyRequire = createRequire(resolve(reactAriaRoot, "package.json"));
    const sharedRoot = dirname(dependencyRequire.resolve("@react-types/shared/package.json"));
    const overlayArrow = readFileSync(
      resolve(reactAriaRoot, "dist/types/src/OverlayArrow.d.ts"),
      "utf8",
    );
    const sharedDom = readFileSync(resolve(sharedRoot, "src/dom.d.ts"), "utf8");

    expect(overlayArrow).toMatch(
      /OverlayArrowProps extends Omit<HTMLAttributes<HTMLDivElement>[\s\S]*DOMProps/u,
    );
    expect(sharedDom).toMatch(/interface DOMProps\s*\{[\s\S]*?\bid\?: string;/u);
  });
});
