import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defineContractV1, type ContractDefinitionV1 } from "../../packages/contracts/src/index.js";
import { validateSchemaDocument } from "../../registry/schemas/validators.js";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const cliPackage = resolve(workspaceRoot, "packages/cli");
let cliBin = resolve(cliPackage, "dist/bin.js");
const temporaryRoots: string[] = [];
const corepackExecutable = process.platform === "win32" ? process.execPath : "corepack";
const corepackPrefix =
  process.platform === "win32"
    ? [resolve(dirname(process.execPath), "node_modules/corepack/dist/corepack.js")]
    : [];

function pnpm(arguments_: readonly string[], cwd: string) {
  return spawnSync(corepackExecutable, [...corepackPrefix, "pnpm@11.14.0", ...arguments_], {
    cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
}

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function html(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mergora packed Contract route</title>
    <style>
      body { margin: 0; font: 16px system-ui; }
      main { box-sizing: border-box; inline-size: 100%; padding: 24px; }
      button { min-block-size: 44px; min-inline-size: 44px; }
      button:focus-visible { outline: 3px solid CanvasText; outline-offset: 2px; }
    </style>
  </head>
  <body>
    <main data-mergora-audit-root="button">
      <button type="button" aria-pressed="false">Save changes</button>
      <div data-mergora-audit-announcer="button" role="status" aria-live="polite"></div>
    </main>
    <script>
      const button = document.querySelector("button");
      const announcer = document.querySelector("[data-mergora-audit-announcer='button']");
      button.addEventListener("click", () => {
        button.setAttribute("aria-pressed", "true");
        announcer.textContent = "Saved";
      });
    </script>
  </body>
</html>
`;
}

function definition(
  payloadDigest: `sha256:${string}`,
  assertionIds: readonly string[] = [
    "a11y-name",
    "browser-state",
    "keyboard-activation",
    "responsive-reflow",
  ],
): ContractDefinitionV1 {
  const modes = {
    "a11y-name": ["a11y", "accessibility-tree"],
    "browser-state": ["browser", "browser-behavior"],
    "keyboard-activation": ["keyboard", "keyboard-behavior"],
    "responsive-reflow": ["responsive", "responsive-geometry"],
    "unsupported-runtime": ["browser", "browser-behavior"],
  } as const;
  return defineContractV1({
    schemaVersion: 1,
    contractVersion: "1.0.0",
    contractId: "button-contract",
    registryId: "official",
    itemId: "button",
    payloadDigest,
    conformanceClaim: "automated-evidence-only",
    limitations: [
      "Automated browser evidence does not replace manual assistive-technology review.",
    ],
    assertions: assertionIds.map((id) => {
      const [mode, evidenceType] = modes[id as keyof typeof modes];
      return {
        id,
        mode,
        evidenceType,
        target: { kind: "owned-file" as const, logicalPath: "ui/button.tsx" },
        expectedBehavior: `The trusted ${id} program completes against the selected route.`,
        severity: "S1" as const,
        remediationUrl: `https://example.com/contracts/button/${id}`,
        adapter: {
          kind: "harness" as const,
          version: "1.0.0" as const,
          harnessId: "official-button-playwright",
        },
      };
    }),
  });
}

function fixture(assertionIds?: readonly string[]): string {
  const root = mkdtempSync(resolve(tmpdir(), "mergora-cli-browser-audit-"));
  temporaryRoots.push(root);
  mkdirSync(resolve(root, ".mergora/contracts"), { recursive: true });
  mkdirSync(resolve(root, "src"), { recursive: true });
  mkdirSync(resolve(root, "dist"), { recursive: true });
  const source = "export const CustomizedButton = 'owned by the consumer';\n";
  const payloadDigest = sha256("packed-browser-audit-payload");
  writeFileSync(resolve(root, "package.json"), '{"name":"external-browser-audit"}\n');
  writeFileSync(resolve(root, "src/button.tsx"), source);
  writeFileSync(resolve(root, "dist/index.html"), html());
  writeFileSync(
    resolve(root, ".mergora/manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        items: {
          "official:button": {
            registry: "official",
            itemId: "button",
            contractVersion: "1.0.0",
            payload: { digest: payloadDigest },
            files: [
              {
                logicalPath: "ui/button.tsx",
                target: "src/button.tsx",
                installed: sha256(source),
              },
            ],
            registryDependencies: [],
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    resolve(root, ".mergora/contracts/official--button.json"),
    `${JSON.stringify(definition(payloadDigest, assertionIds), null, 2)}\n`,
  );
  return root;
}

function snapshot(root: string): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name, "en-US"),
    )) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else result[relative(root, path).replaceAll("\\", "/")] = sha256(readFileSync(path, "utf8"));
    }
  };
  visit(root);
  return result;
}

function command(root: string, arguments_: readonly string[]) {
  const result = spawnSync(process.execPath, [cliBin, ...arguments_], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  const envelope = JSON.parse(result.stdout) as Record<string, unknown>;
  const validation = validateSchemaDocument("result-envelope", envelope);
  expect(validation.errors, JSON.stringify(validation.errors, null, 2)).toEqual([]);
  return { ...result, envelope };
}

beforeAll(() => {
  const packages = [
    { directory: resolve(workspaceRoot, "packages/contracts"), name: "mergora-contracts" },
    { directory: resolve(workspaceRoot, "packages/registry"), name: "mergora-registry" },
    { directory: resolve(workspaceRoot, "packages/test-utils"), name: "@mergora/test-utils" },
    { directory: cliPackage, name: "mergora" },
  ] as const;
  for (const { directory } of packages) {
    const result = pnpm(["run", "build"], directory);
    if (result.status !== 0) {
      throw new Error(`Browser audit package build failed:\n${result.stdout}\n${result.stderr}`);
    }
  }

  const externalRoot = mkdtempSync(resolve(tmpdir(), "mergora-packed-browser-consumer-"));
  temporaryRoots.push(externalRoot);
  const artifacts = resolve(externalRoot, "artifacts");
  mkdirSync(artifacts);
  const tarballs = new Map<string, string>();
  for (const { directory, name } of packages) {
    const before = new Set(readdirSync(artifacts));
    const result = pnpm(["pack", "--pack-destination", artifacts], directory);
    if (result.status !== 0) {
      throw new Error(`Browser audit package pack failed:\n${result.stdout}\n${result.stderr}`);
    }
    const created = readdirSync(artifacts).filter(
      (entry) => entry.endsWith(".tgz") && !before.has(entry),
    );
    if (created.length !== 1) throw new Error(`Expected one packed artifact for ${name}.`);
    tarballs.set(name, created[0]!);
  }

  const dependencies = Object.fromEntries(
    packages.map(({ name }) => [name, `file:./artifacts/${tarballs.get(name)!}`]),
  );
  writeFileSync(
    resolve(externalRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "mergora-packed-browser-audit-consumer",
        version: "0.0.0",
        private: true,
        type: "module",
        packageManager: "pnpm@11.14.0",
        dependencies: { ...dependencies, "@playwright/test": "1.61.1" },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    resolve(externalRoot, "pnpm-workspace.yaml"),
    [
      "packages: []",
      "",
      "autoInstallPeers: false",
      "engineStrict: true",
      "strictPeerDependencies: true",
      "",
      "overrides:",
      ...[...Object.entries(dependencies)]
        .sort(([left], [right]) => left.localeCompare(right, "en-US"))
        .map(([name, value]) => `  ${JSON.stringify(name)}: ${JSON.stringify(value)}`),
      "",
    ].join("\n"),
  );
  const installed = pnpm(["install", "--offline", "--frozen-lockfile=false"], externalRoot);
  if (installed.status !== 0) {
    throw new Error(
      `Packed browser audit consumer install failed:\n${installed.stdout}\n${installed.stderr}`,
    );
  }
  cliBin = resolve(externalRoot, "node_modules/mergora/dist/bin.js");
  const installedCli = realpathSync(resolve(externalRoot, "node_modules/mergora"));
  const fromExternalRoot = relative(externalRoot, installedCli);
  if (
    fromExternalRoot === "" ||
    fromExternalRoot === ".." ||
    fromExternalRoot.startsWith(`..${sep}`)
  ) {
    throw new Error("Packed browser audit CLI resolved outside the external consumer.");
  }
}, 180_000);

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("packed CLI official browser Contract Audit", () => {
  it("documents the opt-in preview boundary and optional browser prerequisite", () => {
    const result = spawnSync(process.execPath, [cliBin, "audit", "--help"], {
      cwd: workspaceRoot,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });

    expect(result).toMatchObject({ status: 0, stderr: "" });
    expect(result.stdout).toContain("--preview-url");
    expect(result.stdout).toContain("--preview-build");
    expect(result.stdout).toContain("--preview-route");
    expect(result.stdout).toContain("--audit-timeout");
    expect(result.stdout).toContain("playwright install chromium");
    expect(result.stdout).not.toContain(workspaceRoot);
  });

  it("runs real Chromium and axe against an explicit read-only build route", () => {
    const root = fixture();
    const before = snapshot(root);
    const result = command(root, [
      "audit",
      "button",
      "--all",
      "--preview-build",
      "dist",
      "--preview-route",
      "/index.html?contract=button",
      "--audit-timeout",
      "10000",
      "--json",
    ]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.envelope).toMatchObject({
      schemaVersion: 1,
      command: "audit",
      ok: true,
      status: "pass",
      exitCode: 0,
      result: {
        state: "pass",
        networkUsed: false,
        summary: { pass: 4, fail: 0, notApplicable: 0, notRun: 0 },
      },
    });
    const report = result.envelope.result as {
      readonly results: readonly {
        readonly mode: string;
        readonly target: { readonly projectPath: string | null };
        readonly context: Record<string, unknown> | null;
      }[];
    };
    expect(report.results.find(({ mode }) => mode === "a11y")?.context).toMatchObject({
      role: "button",
      name: "Save changes",
      axe: [],
    });
    expect(report.results.find(({ mode }) => mode === "keyboard")?.context).toMatchObject({
      keyboard: [{ key: "Enter", action: "press" }],
      focus: [{ target: "Save changes", visible: true, occluded: false }],
    });
    expect(report.results.every(({ target }) => target.projectPath === "src/button.tsx")).toBe(
      true,
    );
    expect(snapshot(root)).toEqual(before);
    expect(result.stdout).not.toContain(root);
  }, 30_000);

  it("reports an unsupported compiled route as incomplete without launching an arbitrary adapter", () => {
    const root = fixture(["unsupported-runtime"]);
    const before = snapshot(root);
    const result = command(root, [
      "audit",
      "button",
      "--browser",
      "--preview-build",
      "dist",
      "--json",
    ]);

    expect(result.status).toBe(7);
    expect(result.envelope).toMatchObject({
      ok: false,
      status: "incomplete",
      exitCode: 7,
      result: { state: "incomplete", summary: { pass: 0, fail: 0, notRun: 1 } },
    });
    expect(snapshot(root)).toEqual(before);

    const unsafe = command(root, [
      "audit",
      "button",
      "--browser",
      "--preview-url",
      "http://example.com/private?token=secret",
      "--json",
    ]);
    expect(unsafe.envelope).toMatchObject({
      exitCode: 2,
      errors: [{ code: "AUDIT_PREVIEW_URL_UNSAFE" }],
    });
    expect(unsafe.stdout).not.toContain("token");
    expect(unsafe.stdout).not.toContain("secret");
  });

  it("rejects a symlink or junction preview root before opening browser content", () => {
    const root = fixture();
    const outside = mkdtempSync(resolve(tmpdir(), "mergora-cli-browser-outside-"));
    temporaryRoots.push(outside);
    writeFileSync(resolve(outside, "index.html"), html());
    symlinkSync(
      outside,
      resolve(root, "dist/linked"),
      process.platform === "win32" ? "junction" : "dir",
    );

    const result = command(root, [
      "audit",
      "button",
      "--browser",
      "--preview-build",
      "dist/linked",
      "--json",
    ]);

    expect(result.envelope).toMatchObject({
      exitCode: 5,
      errors: [{ code: "PATH_SYMLINK_REJECTED", target: "dist/linked" }],
    });
    expect(result.stdout).not.toContain(outside);
  });

  it("rejects ambiguous, unsafe, and unbounded preview flags with redacted JSON errors", () => {
    const root = fixture();
    const ambiguous = command(root, [
      "audit",
      "--browser",
      "--preview-build",
      "dist",
      "--preview-url",
      "https://example.com/private?token=secret",
      "--json",
    ]);
    const unsafe = command(root, [
      "audit",
      "--browser",
      "--preview-url",
      "http://example.com/private?token=secret",
      "--json",
    ]);
    const timeout = command(root, [
      "audit",
      "--browser",
      "--preview-build",
      "dist",
      "--audit-timeout",
      "30001",
      "--json",
    ]);

    expect(ambiguous.envelope).toMatchObject({
      exitCode: 2,
      errors: [{ code: "COMMAND_USAGE_INVALID" }],
    });
    expect(unsafe.envelope).toMatchObject({
      exitCode: 2,
      errors: [{ code: "AUDIT_PREVIEW_URL_UNSAFE" }],
    });
    expect(timeout.envelope).toMatchObject({
      exitCode: 2,
      errors: [{ code: "COMMAND_USAGE_INVALID" }],
    });
    for (const result of [ambiguous, unsafe, timeout]) {
      expect(result.stdout).not.toContain("token");
      expect(result.stdout).not.toContain("secret");
      expect(result.stdout).not.toContain(root);
    }
  }, 30_000);
});
