import { describe, expect, it } from "vitest";

import { CONFIG_SCHEMA, validateMergoraConfig } from "../../packages/cli/src/configuration.js";
import { OFFICIAL_REGISTRY_ORIGIN } from "../../packages/cli/src/registry-data.js";

function config(): Record<string, unknown> {
  return {
    $schema: CONFIG_SCHEMA,
    schemaVersion: 1,
    project: {
      framework: "next-app",
      language: "typescript",
      sourceRoot: "src",
      packageJson: "package.json",
      tsconfig: "tsconfig.json",
    },
    distribution: { defaultMode: "source", packageName: "mergora-ui" },
    targets: {
      components: "src/components/mergora",
      hooks: "src/hooks/mergora",
      lib: "src/lib/mergora",
      systems: "src/components/mergora-systems",
      kits: "src/features/mergora-kits",
      styles: "src/styles/mergora",
      tokens: "src/styles/mergora/tokens",
    },
    aliases: {
      components: "@/components/mergora",
      hooks: "@/hooks/mergora",
      lib: "@/lib/mergora",
      systems: "@/components/mergora-systems",
      kits: "@/features/mergora-kits",
      styles: "@/styles/mergora",
      tokens: "@/styles/mergora/tokens",
    },
    styling: {
      engine: "tailwind-v4",
      globalCss: "src/app/globals.css",
      tokenPreset: "workbench",
      colorMode: "system",
      density: "comfortable",
      direction: "auto",
      packageCssStrategy: "source-directive",
    },
    registries: {
      official: { protocol: "mergora-v1", origin: OFFICIAL_REGISTRY_ORIGIN, trust: "official" },
    },
    policy: {
      allowExternalRegistries: false,
      allowPrereleases: false,
      dependencyProtocols: ["registry-semver"],
      requireLicenses: true,
      retainSuccessfulTransactions: 10,
      maxRegistryItemBytes: 2_097_152,
      maxOperationBytes: 52_428_800,
    },
    formatting: {
      strategy: "project",
      fallback: "mergora",
      lineEndings: "preserve-existing",
    },
  };
}

describe("mergora.json v1 option profile", () => {
  it("accepts only the exact package-root source sentinel", () => {
    const packageRoot = config();
    (packageRoot.project as Record<string, unknown>).sourceRoot = ".";

    expect(validateMergoraConfig(packageRoot).project.sourceRoot).toBe(".");

    for (const unsafe of ["./", "./src", "..", "src/.", "src/../other"]) {
      const value = config();
      (value.project as Record<string, unknown>).sourceRoot = unsafe;
      expect(() => validateMergoraConfig(value), unsafe).toThrow(/unsafe path segment/u);
    }

    const targetRoot = config();
    (targetRoot.targets as Record<string, unknown>).components = ".";
    expect(() => validateMergoraConfig(targetRoot)).toThrow(/unsafe path segment/u);
  });

  it("accepts every schema-declared distribution, theme, and formatting option", () => {
    const value = config();
    value.distribution = { defaultMode: "hybrid", packageName: "@example/mergora-ui" };
    value.styling = {
      ...(value.styling as Record<string, unknown>),
      tokenPreset: "project-brand",
      colorMode: "dark",
      density: "touch",
      direction: "rtl",
      packageCssStrategy: "precompiled",
    };
    value.formatting = { strategy: "none", fallback: "none", lineEndings: "lf" };

    const parsed = validateMergoraConfig(value);

    expect(parsed.distribution.defaultMode).toBe("hybrid");
    expect(parsed.styling).toMatchObject({
      tokenPreset: "project-brand",
      colorMode: "dark",
      density: "touch",
      direction: "rtl",
      packageCssStrategy: "precompiled",
    });
    expect(parsed.formatting).toEqual({ strategy: "none", fallback: "none", lineEndings: "lf" });
  });

  it("accepts a digest-pinned enrolled registry without storing credentials", () => {
    const value = config();
    value.registries = {
      ...(value.registries as Record<string, unknown>),
      partner: {
        protocol: "mergora-v1",
        origin: "https://registry.example.test/r/v1",
        trust: "enrolled",
        authEnvironmentVariable: "PARTNER_REGISTRY_TOKEN",
        identityDigest: `sha256:${"a".repeat(64)}`,
      },
    };
    value.policy = {
      ...(value.policy as Record<string, unknown>),
      allowExternalRegistries: true,
      allowPrereleases: true,
      requireLicenses: false,
      retainSuccessfulTransactions: 25,
    };

    const parsed = validateMergoraConfig(value);

    expect(parsed.registries.partner).toMatchObject({
      trust: "enrolled",
      authEnvironmentVariable: "PARTNER_REGISTRY_TOKEN",
    });
    expect(JSON.stringify(parsed)).not.toContain("secret");
  });

  it("fails closed on unknown fields, unpinned registries, and credential-bearing origins", () => {
    const unknown = config();
    unknown.extra = true;
    expect(() => validateMergoraConfig(unknown)).toThrow(/missing or unknown fields/u);

    const unpinned = config();
    unpinned.registries = {
      ...(unpinned.registries as Record<string, unknown>),
      partner: {
        protocol: "mergora-v1",
        origin: "https://registry.example.test/r/v1",
        trust: "enrolled",
      },
    };
    unpinned.policy = {
      ...(unpinned.policy as Record<string, unknown>),
      allowExternalRegistries: true,
    };
    expect(() => validateMergoraConfig(unpinned)).toThrow(/pin its accepted identity digest/u);

    const credentials = config();
    credentials.registries = {
      ...(credentials.registries as Record<string, unknown>),
      partner: {
        protocol: "mergora-v1",
        origin: "https://user:password@registry.example.test/r/v1",
        trust: "enrolled",
        identityDigest: `sha256:${"b".repeat(64)}`,
      },
    };
    credentials.policy = {
      ...(credentials.policy as Record<string, unknown>),
      allowExternalRegistries: true,
    };
    expect(() => validateMergoraConfig(credentials)).toThrow(/credential policy/u);
  });
});
