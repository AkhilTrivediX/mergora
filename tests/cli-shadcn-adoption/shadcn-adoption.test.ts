import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyInit,
  applyRegistryConfigPlan,
  applyShadcnAdoption,
  canonicalJson,
  planInit,
  planRegistryEnrollment,
  planShadcnAdoption,
  sha256,
} from "../../packages/cli/src/index.ts";
import { validateSchemaDocument } from "../../registry/schemas/index.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const roots: string[] = [];
const origin = "https://registry.example.test/r/v1";

function catalog(content = 'export const Demo = "demo";\n') {
  return {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "partner",
    homepage: "https://registry.example.test",
    items: [
      {
        $schema: "https://ui.shadcn.com/schema/registry-item.json",
        name: "demo",
        type: "registry:ui",
        title: "Demo",
        description: "A neutral demo component.",
        dependencies: ["react"],
        devDependencies: [],
        registryDependencies: [],
        files: [
          {
            path: "components/ui/demo.tsx",
            type: "registry:ui",
            target: "@ui/demo.tsx",
            content,
          },
        ],
        docs: "Compatibility source; native evidence is not supplied.",
      },
    ],
  };
}

function response(value: unknown): Response {
  return new Response(`${canonicalJson(value)}\n`, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function project(local: string, registry = catalog()) {
  const fixture = createProjectFixture({ directoryPrefix: "mergora-shadcn-adoption-" });
  roots.push(fixture.root);
  applyInit({ projectRoot: fixture.root }, planInit({ projectRoot: fixture.root }).planDigest);
  const components = {
    $schema: "https://ui.shadcn.com/schema.json",
    style: "new-york",
    rsc: true,
    tsx: true,
    tailwind: { css: fixture.globalCss, baseColor: "neutral", cssVariables: true, prefix: "" },
    iconLibrary: "lucide",
    aliases: {
      components: "@/components",
      ui: "@/components/ui",
      lib: "@/lib",
      utils: "@/lib/utils",
      hooks: "@/hooks",
    },
    registries: {},
  };
  writeFileSync(
    resolve(fixture.root, "components.json"),
    `${JSON.stringify(components, null, 2)}\n`,
  );
  mkdirSync(resolve(fixture.root, "src/components/ui"), { recursive: true });
  writeFileSync(resolve(fixture.root, "src/components/ui/demo.tsx"), local);
  const fetchImplementation = vi.fn<typeof fetch>(async () => response(registry));
  const enrollment = await planRegistryEnrollment({
    projectRoot: fixture.root,
    id: "partner",
    origin,
    protocol: "shadcn-v1",
    fetchImplementation,
  });
  applyRegistryConfigPlan(enrollment, fixture.root, {
    expectedPlanDigest: enrollment.plan.planDigest,
    acceptRegistryIdentity: enrollment.metadata?.identityDigest,
  });
  return { ...fixture, components, fetchImplementation };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("enrolled shadcn-v1 adoption", () => {
  it("records exact transformed ancestry without changing source or components.json", async () => {
    const source = 'export const Demo = "demo";\n';
    const fixture = await project(source);
    const sourcePath = resolve(fixture.root, "src/components/ui/demo.tsx");
    const componentsPath = resolve(fixture.root, "components.json");
    const componentsBefore = readFileSync(componentsPath);
    const options = {
      projectRoot: fixture.root,
      itemIds: ["demo"],
      registryId: "partner",
      fetchImplementation: fixture.fetchImplementation,
    };

    const plan = await planShadcnAdoption(options);
    expect(plan).toMatchObject({
      command: "adopt",
      registries: [
        expect.objectContaining({
          id: "partner",
          release: "1.0.0",
          evidenceTier: "not-supplied",
        }),
      ],
      conflicts: [],
    });
    expect(plan.fileOperations).toContainEqual(
      expect.objectContaining({
        operation: "no-op",
        target: "src/components/ui/demo.tsx",
        base: sha256(source),
        local: sha256(source),
      }),
    );
    expect(plan.warnings.join(" ")).toContain("Contracts, Passports");

    const result = await applyShadcnAdoption(options, plan.planDigest);
    expect(result.transaction.state).toBe("committed");
    expect(readFileSync(sourcePath, "utf8")).toBe(source);
    expect(readFileSync(componentsPath)).toEqual(componentsBefore);

    const manifest = JSON.parse(
      readFileSync(resolve(fixture.root, ".mergora/manifest.json"), "utf8"),
    ) as {
      items: Record<
        string,
        {
          payload: { url: string; digest: string };
          contractVersion: string;
          lastMigration: string;
          files: { base: string; installed: string; target: string }[];
        }
      >;
    };
    const adopted = manifest.items["partner:demo"]!;
    expect(validateSchemaDocument("manifest", manifest).errors).toEqual([]);
    expect(adopted).toMatchObject({
      payload: { url: `${origin}/registry.json` },
      contractVersion: "1.0.0-not-supplied",
      lastMigration: "shadcn-v1-adapter",
    });
    expect(adopted.files[0]).toMatchObject({
      target: "src/components/ui/demo.tsx",
      base: sha256(source),
      installed: sha256(source),
    });
    const hexadecimal = sha256(source).slice("sha256:".length);
    expect(
      readFileSync(
        resolve(
          fixture.root,
          `.mergora/bases/sha256/${hexadecimal.slice(0, 2)}/${hexadecimal.slice(2)}.blob`,
        ),
        "utf8",
      ),
    ).toBe(source);
  });

  it("fails closed by default and explicitly records local divergence without replacement", async () => {
    const upstream = 'export const Demo = "demo";\n';
    const local = 'export const Demo = "locally-adjusted";\n';
    const fixture = await project(local, catalog(upstream));
    const componentsBefore = readFileSync(resolve(fixture.root, "components.json"));
    const sourcePath = resolve(fixture.root, "src/components/ui/demo.tsx");
    const common = {
      projectRoot: fixture.root,
      itemIds: ["demo"],
      registryId: "partner",
      fetchImplementation: fixture.fetchImplementation,
    };

    const refused = await planShadcnAdoption(common);
    expect(refused.conflicts).toContainEqual(
      expect.objectContaining({ target: "src/components/ui/demo.tsx", kind: "ownership" }),
    );
    expect(existsSync(resolve(fixture.root, ".mergora/bases/sha256"))).toBe(false);
    expect(readFileSync(sourcePath, "utf8")).toBe(local);

    const options = { ...common, allowLocalDivergence: true };
    const plan = await planShadcnAdoption(options);
    expect(plan.conflicts).toEqual([]);
    expect(plan.consentRequirements).toContainEqual(
      expect.objectContaining({ flag: "--allow-local-divergence" }),
    );
    expect(plan.fileOperations).toContainEqual(
      expect.objectContaining({
        operation: "keep-local",
        base: sha256(upstream),
        local: sha256(local),
        proposed: sha256(local),
      }),
    );

    await applyShadcnAdoption(options, plan.planDigest);
    expect(readFileSync(sourcePath, "utf8")).toBe(local);
    expect(readFileSync(resolve(fixture.root, "components.json"))).toEqual(componentsBefore);
    const manifest = JSON.parse(
      readFileSync(resolve(fixture.root, ".mergora/manifest.json"), "utf8"),
    ) as { items: Record<string, { files: { base: string; installed: string }[] }> };
    expect(manifest.items["partner:demo"]!.files[0]).toMatchObject({
      base: sha256(upstream),
      installed: sha256(local),
    });
  });

  it("rejects executable schema extensions and unsafe targets before provenance writes", async () => {
    const hostile = {
      ...catalog(),
      items: [
        {
          ...catalog().items[0],
          scripts: { postinstall: "exfiltrate" },
          files: [
            {
              ...catalog().items[0]!.files[0],
              target: "../../outside.tsx",
            },
          ],
        },
      ],
    };
    const fixture = await project('export const Demo = "demo";\n');
    const manifestBefore = readFileSync(resolve(fixture.root, ".mergora/manifest.json"));
    const fetchImplementation = vi.fn<typeof fetch>(async () => response(hostile));

    await expect(
      planShadcnAdoption({
        projectRoot: fixture.root,
        itemIds: ["demo"],
        registryId: "partner",
        fetchImplementation,
      }),
    ).rejects.toMatchObject({ code: "REGISTRY_METADATA_SCHEMA_INVALID", exitCode: 5 });
    expect(readFileSync(resolve(fixture.root, ".mergora/manifest.json"))).toEqual(manifestBefore);
    expect(existsSync(resolve(fixture.root, "outside.tsx"))).toBe(false);
  });
});
