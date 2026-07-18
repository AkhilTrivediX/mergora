import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("P0 workspace scaffold", () => {
  it("pins the supported toolchain", async () => {
    const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
      packageManager?: string;
      volta?: { node?: string };
    };

    expect(packageJson.packageManager).toBe("pnpm@11.14.0");
    expect(packageJson.volta?.node).toBe("24.12.0");
  });

  it.each([
    "apps/web",
    "apps/storybook",
    "apps/dogfood-next",
    "apps/dogfood-vite",
    "packages/cli",
    "packages/ui",
    "packages/tokens",
    "packages/registry",
    "packages/schema",
    "packages/contracts",
    "packages/mcp",
    "tooling/registry-builder",
    "tooling/token-compiler",
  ])("represents %s with package metadata", async (path) => {
    await expect(stat(resolve(root, path, "package.json"))).resolves.toBeDefined();
  });

  it("keeps the explicit CLI line-ending fixture in CRLF form", async () => {
    const attributes = await readFile(resolve(root, ".gitattributes"), "utf8");
    const fixture = await readFile(resolve(root, "tests/fixtures/crlf/sample.ts"), "utf8");

    expect(attributes).toContain("tests/**/crlf/** text eol=crlf");
    expect(fixture).toContain("\r\n");
    expect(fixture.replaceAll("\r\n", "")).not.toContain("\n");
  });
});
