import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defineContractV1 } from "../../packages/contracts/src/index.ts";
import { canonicalJson } from "../../packages/cli/src/contracts.ts";
import { OFFICIAL_REGISTRY_ORIGIN } from "../../packages/cli/src/registry-data.ts";
import { validateSchemaDocument } from "../../registry/schemas/validators.ts";
import {
  seedPackedCompleteNativeReleaseCache,
  seedPackedNativeRelease,
  seedPackedStableVendorRelease,
} from "../cli-acquisition/packed-release-fixture.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const cliPackage = resolve(workspaceRoot, "packages/cli");
let cliBin = resolve(cliPackage, "dist/bin.js");
const temporaryDirectories: string[] = [];

interface CommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function command(
  arguments_: readonly string[],
  cwd = workspaceRoot,
  environment: Readonly<Record<string, string>> = {},
): CommandResult {
  const result = spawnSync(process.execPath, [cliBin, ...arguments_], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    shell: false,
    windowsHide: true,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function json(result: CommandResult): Record<string, unknown> {
  expect(result.stdout.trim()).not.toBe("");
  const envelope = JSON.parse(result.stdout) as Record<string, unknown>;
  const validation = validateSchemaDocument("result-envelope", envelope);
  expect(validation.errors, JSON.stringify(validation.errors, null, 2)).toEqual([]);
  return envelope;
}

function transactionIds(root: string): readonly string[] {
  const directory = resolve(root, ".mergora/transactions");
  return existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map(({ name }) => name)
        .sort((left, right) => left.localeCompare(right, "en-US"))
    : [];
}

function digest(value: string | Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function rewriteCachedNpmInventory(
  projectRoot: string,
  referencePath: string,
  inventory: unknown | undefined,
): { readonly manifestDigest: `sha256:${string}` } {
  const absoluteReference = resolve(projectRoot, referencePath);
  const reference = JSON.parse(readFileSync(absoluteReference, "utf8")) as {
    manifest: { bytes: number; digest: `sha256:${string}` };
  };
  const currentKey = reference.manifest.digest.slice("sha256:".length);
  const currentManifestPath = resolve(
    projectRoot,
    ".mergora/cache/entries",
    currentKey,
    "artifact",
  );
  const manifest = JSON.parse(readFileSync(currentManifestPath, "utf8")) as Record<string, unknown>;
  if (inventory === undefined) delete manifest.npmPackageInventory;
  else manifest.npmPackageInventory = inventory;
  const { manifestDigest: _oldManifestDigest, ...unsigned } = manifest;
  manifest.manifestDigest = digest(canonicalJson(unsigned));
  const content = Buffer.from(`${canonicalJson(manifest)}\n`, "utf8");
  const manifestDigest = digest(content);
  const key = manifestDigest.slice("sha256:".length);
  const directory = resolve(projectRoot, ".mergora/cache/entries", key);
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "artifact"), content);
  writeFileSync(
    resolve(directory, "cache-entry.json"),
    `${canonicalJson({
      schemaVersion: 1,
      artifactKind: "mergora-verified-cache-entry",
      key,
      artifact: "artifact",
      digest: manifestDigest,
      bytes: content.byteLength,
    })}\n`,
    "utf8",
  );
  reference.manifest = { digest: manifestDigest, bytes: content.byteLength };
  writeFileSync(absoluteReference, `${canonicalJson(reference)}\n`, "utf8");
  return { manifestDigest };
}

function tarString(header: Buffer, offset: number, length: number, value: string): void {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength > length) throw new Error("test tar field is too long");
  bytes.copy(header, offset);
}

function tarOctal(header: Buffer, offset: number, length: number, value: number): void {
  tarString(header, offset, length, `${value.toString(8).padStart(length - 1, "0")}\0`);
}

function tarEntry(path: string, content: Buffer): Buffer {
  const header = Buffer.alloc(512);
  tarString(header, 0, 100, path);
  tarOctal(header, 100, 8, 0o644);
  tarOctal(header, 108, 8, 0);
  tarOctal(header, 116, 8, 0);
  tarOctal(header, 124, 12, content.byteLength);
  tarOctal(header, 136, 12, 0);
  header.fill(32, 148, 156);
  header[156] = "0".charCodeAt(0);
  tarString(header, 257, 6, "ustar\0");
  tarString(header, 263, 2, "00");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  tarString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return Buffer.concat([
    header,
    content,
    Buffer.alloc(Math.ceil(content.byteLength / 512) * 512 - content.byteLength),
  ]);
}

function packedNpmTarball(packageName: string, version: string): Buffer {
  return gzipSync(
    Buffer.concat([
      tarEntry(
        "package/package.json",
        Buffer.from(`${JSON.stringify({ name: packageName, version, license: "MIT" })}\n`, "utf8"),
      ),
      tarEntry("package/index.js", Buffer.from("export const packed = true;\n", "utf8")),
      Buffer.alloc(1024),
    ]),
    { level: 9 },
  );
}

function writeFetchPreload(
  projectRoot: string,
  bytes: Buffer,
  expectedUrl: string,
): { readonly environment: Readonly<Record<string, string>>; readonly logPath: string } {
  const directory = resolve(projectRoot, ".mergora/test-fetch");
  const bytesPath = resolve(directory, "archive.tgz");
  const logPath = resolve(directory, "request.json");
  const preloadPath = resolve(directory, "preload.mjs");
  mkdirSync(directory, { recursive: true });
  writeFileSync(bytesPath, bytes);
  writeFileSync(
    preloadPath,
    `import { readFileSync, writeFileSync } from "node:fs";
const bytes = readFileSync(process.env.MERGORA_TEST_FETCH_BYTES);
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  const headers = new Headers(init.headers);
  writeFileSync(process.env.MERGORA_TEST_FETCH_LOG, JSON.stringify({
    url,
    method: init.method,
    redirect: init.redirect,
    credentials: init.credentials,
    referrerPolicy: init.referrerPolicy,
    accept: headers.get("accept"),
    acceptEncoding: headers.get("accept-encoding"),
    hasSignal: init.signal instanceof AbortSignal,
  }));
  if (url !== process.env.MERGORA_TEST_FETCH_URL) throw new Error("unexpected URL");
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "application/gzip; charset=binary",
      "content-length": String(bytes.byteLength),
    },
  });
};
`,
    "utf8",
  );
  return {
    environment: {
      NODE_OPTIONS: `--import=${pathToFileURL(preloadPath).href}`,
      MERGORA_TEST_FETCH_BYTES: bytesPath,
      MERGORA_TEST_FETCH_LOG: logPath,
      MERGORA_TEST_FETCH_URL: expectedUrl,
    },
    logPath,
  };
}

function writeFailingFetchPreload(
  projectRoot: string,
  behavior: "http" | "redirect" | "reject",
): Readonly<Record<string, string>> {
  const directory = resolve(projectRoot, `.mergora/test-fetch-${behavior}`);
  const preloadPath = resolve(directory, "preload.mjs");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    preloadPath,
    `const behavior = ${JSON.stringify(behavior)};
globalThis.fetch = async () => {
  if (behavior === "reject") throw new TypeError("synthetic network failure");
  if (behavior === "redirect") {
    return new Response(null, {
      status: 302,
      headers: { location: "https://cdn.example.invalid/archive.tgz" },
    });
  }
  return new Response("unavailable", {
    status: 503,
    headers: { "content-type": "text/plain" },
  });
};
`,
    "utf8",
  );
  return { NODE_OPTIONS: `--import=${pathToFileURL(preloadPath).href}` };
}

beforeAll(() => {
  const typeScript = resolve(cliPackage, "node_modules/typescript/bin/tsc");
  const cacheDirectory = resolve(cliPackage, "node_modules/.cache");
  mkdirSync(cacheDirectory, { recursive: true });
  const isolatedRoot = mkdtempSync(resolve(cacheDirectory, "mergora-packed-cli-"));
  temporaryDirectories.push(isolatedRoot);
  for (const { directory, name } of [
    { directory: resolve(workspaceRoot, "packages/contracts"), name: "mergora-contracts" },
    { directory: resolve(workspaceRoot, "packages/registry"), name: "mergora-registry" },
    { directory: resolve(workspaceRoot, "packages/schema"), name: "mergora-schema" },
  ]) {
    const isolatedPackage = resolve(isolatedRoot, "node_modules", name);
    mkdirSync(isolatedPackage, { recursive: true });
    copyFileSync(resolve(directory, "package.json"), resolve(isolatedPackage, "package.json"));
    const result = spawnSync(
      process.execPath,
      [typeScript, "-p", "tsconfig.json", "--outDir", resolve(isolatedPackage, "dist")],
      {
        cwd: directory,
        encoding: "utf8",
        shell: false,
        windowsHide: true,
      },
    );
    if (result.status !== 0) {
      throw new Error(`Packed CLI dependency build failed:\n${result.stdout}\n${result.stderr}`);
    }
  }

  const isolatedDist = resolve(isolatedRoot, "dist");
  const result = spawnSync(
    process.execPath,
    [typeScript, "-p", "tsconfig.json", "--outDir", isolatedDist],
    {
      cwd: cliPackage,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    },
  );
  if (result.status !== 0) {
    throw new Error(`Packed CLI isolated build failed:\n${result.stdout}\n${result.stderr}`);
  }
  const registry = resolve(isolatedDist, "registry");
  mkdirSync(registry);
  cpSync(
    resolve(workspaceRoot, "registry/generated/native-source-items"),
    resolve(registry, "items"),
    { recursive: true },
  );
  copyFileSync(
    resolve(workspaceRoot, "registry/generated/catalog.json"),
    resolve(registry, "catalog.json"),
  );
  cpSync(resolve(workspaceRoot, "registry/schemas"), resolve(isolatedDist, "schemas"), {
    recursive: true,
    filter: (source) => !source.endsWith("validators.ts"),
  });
  cpSync(resolve(workspaceRoot, "registry/source/tokens/themes"), resolve(isolatedDist, "themes"), {
    recursive: true,
  });
  copyFileSync(
    resolve(workspaceRoot, "packages/tokens/src/generated/canonical.dtcg.json"),
    resolve(isolatedDist, "themes/canonical.dtcg.json"),
  );
  cliBin = resolve(isolatedDist, "bin.js");
}, 120_000);

afterAll(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("packed command parser and output contract", () => {
  it("keeps help and version fast, complete, and dependency-free", () => {
    const help = command(["--help"]);
    const version = command(["--version"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("init");
    expect(help.stdout).toContain("search");
    expect(help.stdout).toContain("doctor");
    expect(help.stdout).toContain("recover");
    expect(help.stdout).toContain("clean");
    expect(version).toMatchObject({ status: 0, stdout: "0.0.0\n", stderr: "" });
  });

  it("supports global flags before commands and emits deterministic JSON", () => {
    const first = command(["--json", "search", "button", "--limit", "2"]);
    const second = command(["search", "button", "--limit=2", "--json"]);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(first.stdout).toBe(second.stdout);
    expect(json(first)).toMatchObject({
      schemaVersion: 1,
      command: "search",
      ok: true,
      status: "success",
      exitCode: 0,
      warnings: [],
      errors: [],
    });
  });

  it("persists an explicit initialization distribution mode", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);

    const initialized = command([
      "init",
      "--cwd",
      project.root,
      "--mode",
      "package",
      "--yes",
      "--non-interactive",
      "--json",
    ]);
    expect(initialized.status).toBe(0);
    expect(json(initialized)).toMatchObject({ command: "init", status: "applied" });
    expect(
      JSON.parse(readFileSync(resolve(project.root, "mergora.json"), "utf8")) as {
        distribution: { defaultMode: string };
      },
    ).toMatchObject({ distribution: { defaultMode: "package" } });

    const invalid = command(["init", "--cwd", project.root, "--mode", "managed", "--json"]);
    expect(invalid.status).toBe(2);
    expect(json(invalid)).toMatchObject({ errors: [{ code: "COMMAND_USAGE_INVALID" }] });
  });

  it("uses stable usage errors and never leaks ANSI or an absolute root", () => {
    const invalid = command(["search", "button", "--limit", "0", "--json"]);
    expect(invalid.status).toBe(2);
    const envelope = json(invalid);
    expect(envelope).toMatchObject({ ok: false, exitCode: 2, command: "search" });
    expect(invalid.stdout).not.toContain("\u001b[");
    expect(invalid.stdout).not.toContain(workspaceRoot);

    const unknown = command(["search", "--unknown", "--json"]);
    expect(unknown.status).toBe(2);
    expect(json(unknown)).toMatchObject({
      errors: [{ code: "COMMAND_USAGE_INVALID" }],
    });

    const knownButDisallowed = command(["search", "button", "--yes", "--json"]);
    expect(knownButDisallowed.status).toBe(2);
    expect(json(knownButDisallowed)).toMatchObject({
      errors: [{ code: "COMMAND_USAGE_INVALID" }],
    });

    const sensitive = command(["--secret=C:\\Users\\person\\private-token", "--json"]);
    expect(sensitive.status).toBe(2);
    expect(sensitive.stdout).not.toContain("person");
    expect(sensitive.stdout).not.toContain("private-token");
  });

  it("restricts npm tarball inclusion to formal Stable vendor creation", () => {
    const help = command(["vendor", "--help"]);
    expect(help).toMatchObject({ status: 0, stderr: "" });
    expect(help.stdout).toContain("--include-npm-tarballs");

    const unreleased = command(["vendor", "button", "--include-npm-tarballs", "--plan", "--json"]);
    expect(unreleased.status).toBe(2);
    expect(json(unreleased)).toMatchObject({
      errors: [{ code: "COMMAND_USAGE_INVALID" }],
    });

    const verify = command(["vendor", "verify", "--include-npm-tarballs", "--json"]);
    expect(verify.status).toBe(2);
    expect(json(verify)).toMatchObject({
      errors: [{ code: "COMMAND_USAGE_INVALID" }],
    });
  });

  it("prints explicit source only when requested", () => {
    const ordinary = command(["view", "button", "--json"]);
    const source = command(["view", "button", "--source", "button.tsx"]);
    expect(ordinary.status).toBe(0);
    expect(ordinary.stdout).not.toContain("export const Button");
    expect(source.status).toBe(0);
    expect(source.stdout).toContain("export const Button");
  });

  it("skips browser opening in non-interactive docs mode", () => {
    const result = command(["docs", "sr-only", "--open", "--non-interactive", "--format", "json"]);
    expect(result.status).toBe(0);
    expect(json(result)).toMatchObject({
      result: { canonical: "visually-hidden", opened: false },
      warnings: ["Browser opening was skipped because this invocation is non-interactive."],
    });
  });
});

describe("packed project commands", () => {
  it("routes exact official native references through offline search, view, add, and update", async () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    const first = await seedPackedNativeRelease(
      project.root,
      "1.0.0",
      'export const button = "first";\n',
    );
    const second = await seedPackedNativeRelease(
      project.root,
      "1.1.0",
      'export const button = "second";\n',
    );
    expect(first.requestedUrls).toEqual([
      `${OFFICIAL_REGISTRY_ORIGIN}/catalog.json`,
      `${OFFICIAL_REGISTRY_ORIGIN}/releases/1.0.0/manifest.json`,
      `${OFFICIAL_REGISTRY_ORIGIN}/releases/1.0.0/items/button.json`,
    ]);
    expect(second.requestedUrls).toEqual([
      `${OFFICIAL_REGISTRY_ORIGIN}/catalog.json`,
      `${OFFICIAL_REGISTRY_ORIGIN}/releases/1.1.0/manifest.json`,
      `${OFFICIAL_REGISTRY_ORIGIN}/releases/1.1.0/items/button.json`,
    ]);
    expect([...first.requestedUrls, ...second.requestedUrls]).not.toEqual(
      expect.arrayContaining([expect.stringContaining("/r/v1/r/v1/")]),
    );
    expect(command(["init", "--yes", "--non-interactive"], project.root).status).toBe(0);

    const searched = command([
      "search",
      "pressable",
      "--cwd",
      project.root,
      "--release-file",
      first.referencePath,
      "--offline",
      "--json",
    ]);
    expect(searched.status, `${searched.stdout}\n${searched.stderr}`).toBe(0);
    expect(json(searched)).toMatchObject({
      result: {
        items: [
          {
            id: "button",
            implementationStatus: "released",
            latestStableVersion: "1.0.0",
          },
        ],
      },
    });
    expect(searched.stdout).not.toContain(project.root);

    const viewed = command(
      [
        "view",
        "official:button",
        "--release-file",
        first.referencePath,
        "--offline",
        "--source",
        "ui/button/button.tsx",
      ],
      project.root,
    );
    expect(viewed).toMatchObject({ status: 0, stderr: "", stdout: first.source });

    const addPlan = command(
      [
        "add",
        "pressable",
        "--release-file",
        first.referencePath,
        "--offline",
        "--no-install",
        "--plan",
        "--json",
      ],
      project.root,
    );
    expect(addPlan.status, `${addPlan.stdout}\n${addPlan.stderr}`).toBe(0);
    expect(json(addPlan)).toMatchObject({
      status: "planned",
      result: {
        registries: [
          {
            id: "official",
            release: "1.0.0",
            manifestDigest: first.manifestDigest,
            source: "verified-cache",
          },
        ],
      },
    });
    const added = command(
      [
        "add",
        "pressable",
        "--release-file",
        first.referencePath,
        "--offline",
        "--no-install",
        "--yes",
        "--non-interactive",
        "--json",
      ],
      project.root,
    );
    expect(added.status, `${added.stdout}\n${added.stderr}`).toBe(0);
    expect(json(added)).toMatchObject({
      status: "committed",
      result: { items: ["button"], transaction: { state: "committed" } },
    });

    const updatePlan = command(
      [
        "update",
        "button",
        "--release-file",
        second.referencePath,
        "--offline",
        "--no-install",
        "--plan",
        "--json",
      ],
      project.root,
    );
    expect(updatePlan.status, `${updatePlan.stdout}\n${updatePlan.stderr}`).toBe(0);
    expect(json(updatePlan)).toMatchObject({
      status: "planned",
      result: {
        registries: [
          {
            id: "official",
            release: "1.1.0",
            manifestDigest: second.manifestDigest,
            source: "verified-cache",
          },
        ],
      },
    });
    const updated = command(
      [
        "update",
        "button",
        "--release-file",
        second.referencePath,
        "--offline",
        "--no-install",
        "--yes",
        "--non-interactive",
        "--json",
      ],
      project.root,
    );
    expect(updated.status, `${updated.stdout}\n${updated.stderr}`).toBe(0);
    expect(json(updated)).toMatchObject({ status: "committed", result: { release: "1.1.0" } });
    const manifest = JSON.parse(
      readFileSync(resolve(project.root, ".mergora/manifest.json"), "utf8"),
    ) as {
      items: Record<
        string,
        {
          resolved: string;
          payload: { digest: string; url: string };
          files: readonly { target: string }[];
        }
      >;
    };
    const installed = manifest.items["official:button"]!;
    expect(installed).toMatchObject({
      resolved: "1.1.0",
      payload: {
        digest: second.payloadDigest,
        url: `${OFFICIAL_REGISTRY_ORIGIN}/releases/1.1.0/items/button.json`,
      },
    });
    expect(installed.payload.url).not.toContain("/r/v1/r/v1/");
    expect(readFileSync(resolve(project.root, installed.files[0]!.target), "utf8")).toBe(
      second.source,
    );
  }, 30_000);

  it("runs exact offline search, view, add, and update from a Stable vendor without cache", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    const first = seedPackedStableVendorRelease(
      project.root,
      "1.0.0",
      'export const button = "vendor first";\n',
    );
    expect(first.requestedUrls).toEqual([]);
    expect(command(["init", "--yes", "--non-interactive"], project.root).status).toBe(0);

    const searched = command(
      [
        "search",
        "pressable",
        "--release-file",
        first.referencePath,
        "--ui-version",
        "^1.0.0",
        "--offline",
        "--json",
      ],
      project.root,
    );
    expect(searched.status, `${searched.stdout}\n${searched.stderr}`).toBe(0);
    expect(json(searched)).toMatchObject({
      result: { items: [{ id: "button", latestStableVersion: "1.0.0" }] },
    });

    const viewed = command(
      [
        "view",
        "button",
        "--release-file",
        first.referencePath,
        "--offline",
        "--source",
        "ui/button/button.tsx",
      ],
      project.root,
    );
    expect(viewed).toMatchObject({ status: 0, stderr: "", stdout: first.source });

    const addPlan = command(
      [
        "add",
        "button",
        "--release-file",
        first.referencePath,
        "--offline",
        "--no-install",
        "--plan",
        "--json",
      ],
      project.root,
    );
    expect(addPlan.status, `${addPlan.stdout}\n${addPlan.stderr}`).toBe(0);
    expect(json(addPlan)).toMatchObject({
      result: { registries: [{ id: "official", release: "1.0.0", source: "vendor" }] },
    });
    const added = command(
      [
        "add",
        "button",
        "--release-file",
        first.referencePath,
        "--offline",
        "--no-install",
        "--yes",
        "--non-interactive",
        "--json",
      ],
      project.root,
    );
    expect(added.status, `${added.stdout}\n${added.stderr}`).toBe(0);
    expect(existsSync(resolve(project.root, ".mergora/cache/entries"))).toBe(false);

    const second = seedPackedStableVendorRelease(
      project.root,
      "1.1.0",
      'export const button = "vendor second";\n',
    );
    const updatePlan = command(
      [
        "update",
        "button",
        "--release-file",
        second.referencePath,
        "--offline",
        "--no-install",
        "--plan",
        "--json",
      ],
      project.root,
    );
    expect(updatePlan.status, `${updatePlan.stdout}\n${updatePlan.stderr}`).toBe(0);
    expect(json(updatePlan)).toMatchObject({
      result: { registries: [{ id: "official", release: "1.1.0", source: "vendor" }] },
    });
    const updated = command(
      [
        "update",
        "button",
        "--release-file",
        second.referencePath,
        "--offline",
        "--no-install",
        "--yes",
        "--non-interactive",
        "--json",
      ],
      project.root,
    );
    expect(updated.status, `${updated.stdout}\n${updated.stderr}`).toBe(0);
    expect(
      readFileSync(resolve(project.root, "src/components/mergora/button/button.tsx"), "utf8"),
    ).toBe(second.source);
    expect(existsSync(resolve(project.root, ".mergora/cache/entries"))).toBe(false);
  }, 30_000);

  it("fails closed for ambiguous native references, non-official selection, and cache misses", async () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    const release = await seedPackedNativeRelease(
      project.root,
      "1.0.0",
      'export const button = "safe";\n',
    );
    expect(command(["init", "--yes", "--non-interactive"], project.root).status).toBe(0);
    const maliciousPath = ".mergora/release-malicious.json";
    writeFileSync(
      resolve(project.root, maliciousPath),
      `${canonicalJson({ ...release.reference, origin: "https://attacker.invalid/r/v1" })}\n`,
    );
    const malicious = command(
      ["search", "button", "--release-file", maliciousPath, "--offline", "--json"],
      project.root,
    );
    expect(malicious.status).toBe(5);
    expect(json(malicious)).toMatchObject({
      errors: [{ code: "REGISTRY_RELEASE_REFERENCE_INVALID" }],
    });

    const partner = command(
      [
        "search",
        "button",
        "--registry",
        "partner",
        "--release-file",
        release.referencePath,
        "--offline",
        "--json",
      ],
      project.root,
    );
    expect(partner.status).toBe(2);
    expect(json(partner)).toMatchObject({ errors: [{ code: "COMMAND_USAGE_INVALID" }] });

    const unavailableVersion = command(
      [
        "search",
        "button",
        "--release-file",
        release.referencePath,
        "--ui-version",
        "^2.0.0",
        "--offline",
        "--json",
      ],
      project.root,
    );
    expect(unavailableVersion.status).toBe(4);
    expect(json(unavailableVersion)).toMatchObject({
      errors: [{ code: "REGISTRY_RELEASE_NOT_FOUND" }],
    });

    const legacyPath = ".mergora/legacy-update-snapshot.json";
    writeFileSync(
      resolve(project.root, legacyPath),
      `${canonicalJson({ schemaVersion: 0, release: "1.0.0" })}\n`,
    );
    const legacy = command(
      ["update", "button", "--release-file", legacyPath, "--plan", "--json"],
      project.root,
    );
    expect(legacy.status).toBe(5);
    expect(json(legacy)).toMatchObject({ errors: [{ code: "REGISTRY_RELEASE_INVALID" }] });

    const missingPath = ".mergora/release-missing-cache.json";
    writeFileSync(
      resolve(project.root, missingPath),
      `${canonicalJson({
        ...release.reference,
        catalog: { ...release.reference.catalog, digest: `sha256:${"0".repeat(64)}` },
      })}\n`,
    );
    const missing = command(
      ["search", "button", "--release-file", missingPath, "--offline", "--json"],
      project.root,
    );
    expect(missing.status).toBe(4);
    expect(json(missing)).toMatchObject({ errors: [{ code: "REGISTRY_EVIDENCE_MISSING" }] });
    expect(missing.stdout).not.toContain("0.0.0-unreleased");
  });

  it("plans, requires narrow consent, applies, and then no-ops in a path with spaces", () => {
    const project = createProjectFixture({ directoryPrefix: "mergora packed path with spaces " });
    temporaryDirectories.push(project.root);

    const planned = command(["init", "--cwd", project.root, "--plan", "--json"]);
    expect(planned.status).toBe(0);
    expect(planned.stdout).not.toContain(project.root);
    expect(json(planned)).toMatchObject({ status: "planned", result: { projectRoot: "." } });
    expect(existsSync(resolve(project.root, "mergora.json"))).toBe(false);

    const missingConsent = command(["init", "--cwd", project.root, "--non-interactive", "--json"]);
    expect(missingConsent.status).toBe(12);
    expect(json(missingConsent)).toMatchObject({
      exitCode: 12,
      errors: [{ code: "CONSENT_REQUIRED" }],
    });

    const applied = command([
      "init",
      "--cwd",
      project.root,
      "--yes",
      "--non-interactive",
      "--json",
    ]);
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0);
    expect(json(applied)).toMatchObject({ status: "applied" });
    expect(existsSync(resolve(project.root, "mergora.json"))).toBe(true);

    const noOp = command(["init", "--cwd", project.root, "--non-interactive", "--json"]);
    expect(noOp.status).toBe(0);
    expect(json(noOp)).toMatchObject({ status: "no-op" });
  });

  it("reports info, status, and doctor through stable local-only envelopes", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes"]).status).toBe(0);
    for (const name of ["info", "status", "doctor"] as const) {
      const result = command([name, "--cwd", project.root, "--json"]);
      expect(result.status).toBe(0);
      expect(json(result)).toMatchObject({
        schemaVersion: 1,
        command: name,
        ok: true,
        exitCode: 0,
      });
      expect(result.stdout).not.toContain(project.root);
    }
  });

  it("preserves the clean-consumer add command while supporting exact plans", () => {
    const project = createProjectFixture({ manager: "npm" });
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    const plan = command([
      "add",
      "button",
      "dialog",
      "combobox",
      "--root",
      project.root,
      "--target",
      "src/components",
      "--no-install",
      "--plan",
      "--json",
    ]);
    expect(plan.status).toBe(0);
    expect(json(plan)).toMatchObject({ status: "planned", result: { command: "add" } });
    expect(
      (json(plan).result as { items: readonly { id: string }[] }).items.map(({ id }) => id),
    ).toEqual([
      "official:button",
      "official:combobox",
      "official:dialog",
      "official:direction",
      "official:layer-manager",
      "official:provider",
      "official:slot",
    ]);
    expect(existsSync(resolve(project.root, "src/components/button/button.tsx"))).toBe(false);

    const applied = command([
      "add",
      "button",
      "dialog",
      "combobox",
      "--root",
      project.root,
      "--target",
      "src/components",
      "--no-install",
      "--yes",
      "--non-interactive",
      "--json",
    ]);
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0);
    expect(json(applied)).toMatchObject({
      result: {
        mode: "source-transaction",
        items: ["button", "combobox", "slot", "layer-manager", "direction", "provider", "dialog"],
        transaction: { state: "committed" },
      },
    });
    expect(existsSync(resolve(project.root, "src/components/dialog/dialog.tsx"))).toBe(true);
    expect(readFileSync(resolve(project.root, "package.json"), "utf8")).toContain(
      '"react-aria-components": "1.19.0"',
    );
  });

  it("does not mutate on a bare non-interactive add", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    const transactionsBefore = transactionIds(project.root);
    const result = command([
      "add",
      "button",
      "--root",
      project.root,
      "--non-interactive",
      "--json",
    ]);
    expect(result.status).toBe(12);
    expect(json(result)).toMatchObject({
      exitCode: 12,
      errors: [{ code: "CONSENT_REQUIRED" }],
    });
    expect(existsSync(resolve(project.root, "src/components/button"))).toBe(false);
    expect(transactionIds(project.root)).toEqual(transactionsBefore);
  });

  it("reports a missing-source adoption as a conflict even when the plan has no writes", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    const transactionsBefore = transactionIds(project.root);
    const manifestPath = resolve(project.root, ".mergora/manifest.json");
    const manifestBefore = readFileSync(manifestPath);

    const planned = command(["adopt", "button", "--cwd", project.root, "--plan", "--json"]);
    expect(planned.status).toBe(0);
    expect(json(planned)).toMatchObject({ ok: true, status: "conflict" });

    const applied = command([
      "adopt",
      "button",
      "--cwd",
      project.root,
      "--yes",
      "--non-interactive",
      "--json",
    ]);
    expect(applied.status).toBe(6);
    expect(json(applied)).toMatchObject({
      ok: false,
      exitCode: 6,
      errors: [{ code: "OPERATION_CONFLICT" }],
    });
    expect(readFileSync(manifestPath)).toEqual(manifestBefore);
    expect(transactionIds(project.root)).toEqual(transactionsBefore);
    expect(existsSync(resolve(project.root, ".mergora/bases"))).toBe(false);
  });

  it("plans and applies a completed transaction rollback without implicit consent", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    const added = command([
      "add",
      "button",
      "--cwd",
      project.root,
      "--no-install",
      "--yes",
      "--non-interactive",
      "--json",
    ]);
    expect(added.status).toBe(0);
    const transactionId = (json(added).result as { transaction: { transactionId: string } })
      .transaction.transactionId;
    const source = resolve(project.root, "src/components/mergora/button/button.tsx");
    expect(existsSync(source)).toBe(true);

    const planned = command([
      "rollback",
      transactionId,
      "--cwd",
      project.root,
      "--no-install",
      "--plan",
      "--json",
    ]);
    expect(planned.status).toBe(0);
    expect(json(planned)).toMatchObject({
      status: "planned",
      result: { transactionId, plan: { command: "rollback", conflicts: [] } },
    });

    const missingConsent = command([
      "rollback",
      transactionId,
      "--cwd",
      project.root,
      "--no-install",
      "--non-interactive",
      "--json",
    ]);
    expect(missingConsent.status).toBe(12);
    expect(existsSync(source)).toBe(true);

    const rolledBack = command([
      "rollback",
      transactionId,
      "--cwd",
      project.root,
      "--no-install",
      "--yes",
      "--non-interactive",
      "--json",
    ]);
    expect(rolledBack.status, `${rolledBack.stdout}\n${rolledBack.stderr}`).toBe(0);
    expect(json(rolledBack)).toMatchObject({
      status: "committed",
      result: { rollbackOf: transactionId, transaction: { state: "committed" } },
    });
    expect(existsSync(source)).toBe(false);
  }, 10_000);

  it("preserves Contract Audit reports while returning stable evidence exit codes", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    expect(
      command([
        "add",
        "button",
        "--cwd",
        project.root,
        "--no-install",
        "--yes",
        "--non-interactive",
      ]).status,
    ).toBe(0);
    const manifest = JSON.parse(
      readFileSync(resolve(project.root, ".mergora/manifest.json"), "utf8"),
    ) as {
      items: Record<
        string,
        {
          contractVersion: string;
          payload: { digest: `sha256:${string}` };
          files: readonly { logicalPath: string; target: string }[];
        }
      >;
    };
    const item = manifest.items["official:button"]!;
    const source = item.files.find(({ target }) => target.endsWith("button.tsx"))!;
    const definition = defineContractV1({
      schemaVersion: 1,
      contractVersion: item.contractVersion,
      contractId: "button-packed-contract",
      registryId: "official",
      itemId: "button",
      payloadDigest: item.payload.digest,
      conformanceClaim: "automated-evidence-only",
      limitations: [],
      assertions: [
        {
          id: "button-export",
          mode: "static",
          evidenceType: "static-source",
          target: { kind: "owned-file", logicalPath: source.logicalPath },
          expectedBehavior: "Button source exports the public component.",
          severity: "S1",
          remediationUrl: "https://akhiltrivedix.github.io/mergora/components/button",
          adapter: { kind: "text-includes", version: "1.0.0", value: "export const Button" },
        },
      ],
    });
    mkdirSync(resolve(project.root, ".mergora/contracts"), { recursive: true });
    writeFileSync(
      resolve(project.root, ".mergora/contracts/official--button.json"),
      `${JSON.stringify(definition, null, 2)}\n`,
    );

    const passing = command(["audit", "button", "--static", "--cwd", project.root, "--json"]);
    expect(passing.status).toBe(0);
    expect(json(passing)).toMatchObject({
      ok: true,
      status: "pass",
      exitCode: 0,
      result: { state: "pass", recommendedExitCode: 0 },
    });

    writeFileSync(resolve(project.root, source.target), "export const localReplacement = 1;\n");
    const failing = command(["audit", "button", "--static", "--cwd", project.root, "--json"]);
    expect(failing.status).toBe(10);
    expect(json(failing)).toMatchObject({
      ok: false,
      status: "fail",
      exitCode: 10,
      result: { state: "fail", recommendedExitCode: 10 },
      errors: [],
    });

    const unavailable = command(["audit", "button", "--browser", "--cwd", project.root, "--json"]);
    expect(unavailable.status).toBe(7);
    expect(json(unavailable)).toMatchObject({
      ok: false,
      status: "incomplete",
      exitCode: 7,
      result: { state: "incomplete", recommendedExitCode: 7 },
    });
  });

  it("plans, applies, and verifies a packed offline vendor snapshot", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    expect(
      command([
        "add",
        "button",
        "--cwd",
        project.root,
        "--no-install",
        "--yes",
        "--non-interactive",
      ]).status,
    ).toBe(0);

    const planned = command(["vendor", "button", "--cwd", project.root, "--plan", "--json"]);
    expect(planned.status, `${planned.stdout}\n${planned.stderr}`).toBe(0);
    expect(json(planned)).toMatchObject({
      status: "planned",
      result: {
        command: "vendor",
        registries: [],
        items: expect.arrayContaining([
          expect.objectContaining({ id: "official:button", mode: "source" }),
        ]),
        warnings: expect.arrayContaining([
          expect.stringContaining("unreleased-local offline snapshot"),
          expect.stringContaining("No network source"),
        ]),
      },
    });
    expect(existsSync(resolve(project.root, ".mergora/vendor"))).toBe(false);

    const missingConsent = command([
      "vendor",
      "button",
      "--cwd",
      project.root,
      "--non-interactive",
      "--json",
    ]);
    expect(missingConsent.status).toBe(12);
    expect(json(missingConsent)).toMatchObject({
      errors: [{ code: "CONSENT_REQUIRED" }],
    });

    const applied = command([
      "vendor",
      "button",
      "--cwd",
      project.root,
      "--yes",
      "--non-interactive",
      "--json",
    ]);
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0);
    expect(json(applied)).toMatchObject({
      status: "committed",
      result: {
        mode: "offline-vendor",
        items: ["official:button"],
        verification: {
          state: "valid",
          provenanceState: "unreleased-local",
          releaseClaim: "none",
          networkUsed: false,
          writePerformed: false,
        },
      },
    });

    const verified = command(["vendor", "verify", "--cwd", project.root, "--json"]);
    expect(verified.status, `${verified.stdout}\n${verified.stderr}`).toBe(0);
    expect(json(verified)).toMatchObject({
      status: "valid",
      result: { state: "valid", releaseClaim: "none", networkUsed: false },
    });
    expect(verified.stdout).not.toContain(project.root);
  }, 30_000);

  it("creates a formal Stable vendor from verified cache and consumes it fully offline", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    const seeded = seedPackedCompleteNativeReleaseCache(
      project.root,
      "1.0.0",
      'export const button = "formal stable vendor";\n',
    );
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);

    const planned = command(
      [
        "vendor",
        "--all",
        "--cwd",
        project.root,
        "--release-file",
        seeded.referencePath,
        "--offline",
        "--plan",
        "--json",
      ],
      project.root,
    );
    expect(planned.status, `${planned.stdout}\n${planned.stderr}`).toBe(0);
    expect(json(planned)).toMatchObject({
      status: "planned",
      result: {
        command: "vendor",
        registries: [
          {
            id: "official",
            release: "1.0.0",
            manifestDigest: seeded.manifestDigest,
            source: "verified-cache",
            trust: "official",
          },
        ],
        items: expect.arrayContaining([
          expect.objectContaining({ id: "official:button", direct: true }),
        ]),
        warnings: expect.arrayContaining([
          expect.stringContaining("official Stable release 1.0.0"),
        ]),
      },
    });
    expect(existsSync(resolve(project.root, ".mergora/vendor"))).toBe(false);

    const missingConsent = command(
      [
        "vendor",
        "button",
        "--cwd",
        project.root,
        "--release-file",
        seeded.referencePath,
        "--offline",
        "--non-interactive",
        "--json",
      ],
      project.root,
    );
    expect(missingConsent.status).toBe(12);
    expect(json(missingConsent)).toMatchObject({ errors: [{ code: "CONSENT_REQUIRED" }] });
    expect(existsSync(resolve(project.root, ".mergora/vendor"))).toBe(false);

    const applied = command(
      [
        "vendor",
        "button",
        "--cwd",
        project.root,
        "--release-file",
        seeded.referencePath,
        "--offline",
        "--yes",
        "--non-interactive",
        "--json",
      ],
      project.root,
    );
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0);
    expect(json(applied)).toMatchObject({
      status: "committed",
      result: {
        mode: "offline-vendor",
        release: "1.0.0",
        items: ["official:button"],
        transaction: { state: "committed" },
        verification: {
          state: "valid",
          provenanceState: "stable-release",
          releaseClaim: "exact",
          release: "1.0.0",
          items: ["button"],
          networkUsed: false,
          writePerformed: false,
        },
      },
    });
    const formalManifestPath = resolve(project.root, ".mergora/vendor/v1/vendor-manifest.json");
    const formalManifest = readFileSync(formalManifestPath, "utf8");
    expect(formalManifest).not.toContain("cache-entry");
    expect(formalManifest).not.toContain(project.root);
    expect(formalManifest).not.toContain("/r/v1/r/v1/");

    rmSync(resolve(project.root, ".mergora/cache"), { recursive: true, force: true });
    const verified = command(
      ["vendor", "verify", "--cwd", project.root, "--offline", "--json"],
      project.root,
    );
    expect(verified.status, `${verified.stdout}\n${verified.stderr}`).toBe(0);
    expect(json(verified)).toMatchObject({
      status: "valid",
      result: {
        state: "valid",
        provenanceState: "stable-release",
        releaseClaim: "exact",
        release: "1.0.0",
        items: ["button"],
        networkUsed: false,
        writePerformed: false,
      },
    });

    const viewed = command(
      [
        "view",
        "button",
        "--cwd",
        project.root,
        "--release-file",
        seeded.referencePath,
        "--offline",
        "--source",
        "ui/button/button.tsx",
      ],
      project.root,
    );
    expect(viewed).toMatchObject({ status: 0, stderr: "", stdout: seeded.source });
    const added = command(
      [
        "add",
        "button",
        "--cwd",
        project.root,
        "--release-file",
        seeded.referencePath,
        "--offline",
        "--no-install",
        "--yes",
        "--non-interactive",
        "--json",
      ],
      project.root,
    );
    expect(added.status, `${added.stdout}\n${added.stderr}`).toBe(0);
    expect(json(added)).toMatchObject({
      status: "committed",
      result: { items: ["button"], transaction: { state: "committed" } },
    });
    expect(existsSync(resolve(project.root, ".mergora/cache/entries"))).toBe(false);

    const replacement = seedPackedCompleteNativeReleaseCache(
      project.root,
      "1.1.0",
      'export const button = "replacement refused";\n',
    );
    const refused = command(
      [
        "vendor",
        "button",
        "--cwd",
        project.root,
        "--release-file",
        replacement.referencePath,
        "--offline",
        "--plan",
        "--json",
      ],
      project.root,
    );
    expect(refused.status, `${refused.stdout}\n${refused.stderr}`).toBe(5);
    expect(json(refused)).toMatchObject({
      errors: [{ code: "VENDOR_REPLACEMENT_REQUIRES_CLEAN" }],
    });
    expect(readFileSync(formalManifestPath, "utf8")).toBe(formalManifest);
  }, 30_000);

  it("fails closed for a legacy npm inventory and accepts a verified empty inventory offline", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    const seeded = seedPackedCompleteNativeReleaseCache(
      project.root,
      "1.0.0",
      'export const button = "npm inventory boundary";\n',
    );
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);

    rewriteCachedNpmInventory(project.root, seeded.referencePath, undefined);
    const legacy = command(
      [
        "vendor",
        "button",
        "--cwd",
        project.root,
        "--release-file",
        seeded.referencePath,
        "--include-npm-tarballs",
        "--offline",
        "--plan",
        "--json",
      ],
      project.root,
    );
    expect(legacy.status, `${legacy.stdout}\n${legacy.stderr}`).toBe(5);
    expect(json(legacy)).toMatchObject({
      errors: [{ code: "VENDOR_STABLE_NPM_INVENTORY_MISSING" }],
    });
    expect(existsSync(resolve(project.root, ".mergora/vendor"))).toBe(false);

    rewriteCachedNpmInventory(project.root, seeded.referencePath, {
      allowedLicenses: [],
      entries: [],
    });
    const empty = command(
      [
        "vendor",
        "button",
        "--cwd",
        project.root,
        "--release-file",
        seeded.referencePath,
        "--include-npm-tarballs",
        "--offline",
        "--plan",
        "--json",
      ],
      project.root,
    );
    expect(empty.status, `${empty.stdout}\n${empty.stderr}`).toBe(0);
    expect(json(empty)).toMatchObject({ status: "planned" });
    expect(existsSync(resolve(project.root, ".mergora/vendor"))).toBe(false);
  }, 30_000);

  it("fetches an opted-in exact npm tarball directly and preserves it in the Stable vendor", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    const seeded = seedPackedCompleteNativeReleaseCache(
      project.root,
      "1.0.0",
      'export const button = "npm tarball vendor";\n',
    );
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);

    const tarball = packedNpmTarball("mergora-ui", "1.0.0");
    const url = "https://registry.npmjs.org/mergora-ui/-/mergora-ui-1.0.0.tgz";
    const exact = {
      package: "mergora-ui",
      version: "1.0.0",
      url,
      bytes: tarball.byteLength,
      digest: digest(tarball),
      integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
      license: "MIT",
      disposition: "include",
    } as const;
    rewriteCachedNpmInventory(project.root, seeded.referencePath, {
      allowedLicenses: ["MIT"],
      entries: [exact],
    });

    const offline = command(
      [
        "vendor",
        "button",
        "--cwd",
        project.root,
        "--release-file",
        seeded.referencePath,
        "--include-npm-tarballs",
        "--offline",
        "--plan",
        "--json",
      ],
      project.root,
    );
    expect(offline.status, `${offline.stdout}\n${offline.stderr}`).toBe(5);
    expect(json(offline)).toMatchObject({
      errors: [{ code: "VENDOR_STABLE_NPM_OFFLINE" }],
    });
    expect(existsSync(resolve(project.root, ".mergora/vendor"))).toBe(false);

    const preload = writeFetchPreload(project.root, tarball, url);
    const applied = command(
      [
        "vendor",
        "button",
        "--cwd",
        project.root,
        "--release-file",
        seeded.referencePath,
        "--include-npm-tarballs",
        "--yes",
        "--non-interactive",
        "--json",
      ],
      project.root,
      preload.environment,
    );
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0);
    expect(json(applied)).toMatchObject({
      status: "committed",
      result: { verification: { state: "valid", npmTarballs: 1 } },
    });
    expect(JSON.parse(readFileSync(preload.logPath, "utf8"))).toEqual({
      url,
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      accept: "application/gzip, application/octet-stream, application/x-gzip",
      acceptEncoding: "identity",
      hasSignal: true,
    });
    const manifest = JSON.parse(
      readFileSync(resolve(project.root, ".mergora/vendor/v1/vendor-manifest.json"), "utf8"),
    ) as { npmTarballs: unknown[] };
    expect(manifest.npmTarballs).toEqual([
      {
        package: exact.package,
        version: exact.version,
        url: exact.url,
        bytes: exact.bytes,
        digest: exact.digest,
        integrity: exact.integrity,
        license: exact.license,
      },
    ]);
    const verified = command(["vendor", "verify", "--cwd", project.root, "--json"], project.root);
    expect(verified.status, `${verified.stdout}\n${verified.stderr}`).toBe(0);
    expect(json(verified)).toMatchObject({
      status: "valid",
      result: { state: "valid", npmTarballs: 1 },
    });
  }, 30_000);

  it("classifies direct npm transport and HTTP failures separately from redirects", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    const seeded = seedPackedCompleteNativeReleaseCache(
      project.root,
      "1.0.0",
      'export const button = "npm fetch failures";\n',
    );
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    const tarball = packedNpmTarball("mergora-ui", "1.0.0");
    const url = "https://registry.npmjs.org/mergora-ui/-/mergora-ui-1.0.0.tgz";
    rewriteCachedNpmInventory(project.root, seeded.referencePath, {
      allowedLicenses: ["MIT"],
      entries: [
        {
          package: "mergora-ui",
          version: "1.0.0",
          url,
          bytes: tarball.byteLength,
          digest: digest(tarball),
          integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
          license: "MIT",
          disposition: "include",
        },
      ],
    });

    for (const [behavior, expectedStatus, expectedCode] of [
      ["reject", 4, "VENDOR_STABLE_NPM_FETCH_FAILED"],
      ["http", 4, "VENDOR_STABLE_NPM_FETCH_FAILED"],
      ["redirect", 5, "VENDOR_STABLE_NPM_REDIRECT_REJECTED"],
    ] as const) {
      const result = command(
        [
          "vendor",
          "button",
          "--cwd",
          project.root,
          "--release-file",
          seeded.referencePath,
          "--include-npm-tarballs",
          "--plan",
          "--json",
        ],
        project.root,
        writeFailingFetchPreload(project.root, behavior),
      );
      expect(result.status, `${behavior}: ${result.stdout}\n${result.stderr}`).toBe(expectedStatus);
      expect(json(result)).toMatchObject({ errors: [{ code: expectedCode }] });
    }
    expect(existsSync(resolve(project.root, ".mergora/vendor"))).toBe(false);
  }, 30_000);

  it("keeps theme, registry, migration, and cleanup inspection read-only", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    const transactionsBefore = transactionIds(project.root);

    const theme = command(["theme", "list", "--cwd", project.root, "--json"]);
    const registries = command(["registry", "list", "--cwd", project.root, "--json"]);
    const migration = command(["migrate", "config", "--cwd", project.root, "--plan", "--json"]);
    const cleanup = command(["clean", "--cwd", project.root, "--json"]);

    expect(theme.status).toBe(0);
    expect(registries.status).toBe(0);
    expect(migration.status).toBe(0);
    expect(cleanup.status).toBe(0);
    expect(json(migration)).toMatchObject({ status: "no-op", result: { command: "migrate" } });
    expect(json(cleanup)).toMatchObject({
      status: "report",
      result: {
        command: "clean",
        estimatedBytes: { write: 0 },
        consentRequirements: [],
      },
    });
    expect(transactionIds(project.root)).toEqual(transactionsBefore);
  });

  it("requires exact cleanup selection and consent before deleting a verified cache entry", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    const entryDirectory = resolve(project.root, ".mergora/cache/entries/official-button");
    const artifact = Buffer.from("immutable cache artifact\n");
    const digest = `sha256:${createHash("sha256").update(artifact).digest("hex")}`;
    mkdirSync(entryDirectory, { recursive: true });
    writeFileSync(resolve(entryDirectory, "artifact"), artifact);
    writeFileSync(
      resolve(entryDirectory, "cache-entry.json"),
      `${JSON.stringify({ schemaVersion: 1, artifactKind: "mergora-verified-cache-entry", key: "official-button", artifact: "artifact", digest, bytes: artifact.byteLength })}\n`,
    );

    const planned = command(["clean", "--cache", "--cwd", project.root, "--plan", "--json"]);
    expect(planned.status).toBe(0);
    expect(json(planned)).toMatchObject({
      status: "planned",
      result: {
        command: "clean",
        fileOperations: [
          expect.objectContaining({
            operation: "delete",
            owner: "official:clean-cache",
            target: ".mergora/cache/entries/official-button",
          }),
        ],
        consentRequirements: [expect.objectContaining({ id: "clean-local-artifacts" })],
      },
    });
    expect(existsSync(entryDirectory)).toBe(true);

    const refused = command([
      "clean",
      "--cache",
      "--cwd",
      project.root,
      "--non-interactive",
      "--json",
    ]);
    expect(refused.status).toBe(12);
    expect(json(refused)).toMatchObject({ errors: [{ code: "CONSENT_REQUIRED" }] });
    expect(existsSync(entryDirectory)).toBe(true);

    const applied = command([
      "clean",
      "--cache",
      "--cwd",
      project.root,
      "--yes",
      "--non-interactive",
      "--json",
    ]);
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0);
    expect(json(applied)).toMatchObject({ status: "cleaned", result: { status: "cleaned" } });
    expect(existsSync(entryDirectory)).toBe(false);
  });

  it("rejects unsafe target and config paths before writing", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    const add = command([
      "add",
      "button",
      "--root",
      project.root,
      "--target",
      "../outside",
      "--json",
    ]);
    expect(add.status).toBe(2);
    expect(json(add)).toMatchObject({ errors: [{ code: "PATH_UNSAFE_SEGMENT" }] });
    expect(existsSync(resolve(project.root, ".mergora"))).toBe(false);

    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    const transactionsBefore = transactionIds(project.root);
    const reserved = command([
      "add",
      "button",
      "--root",
      project.root,
      "--target",
      ".mergora/transactions",
      "--plan",
      "--json",
    ]);
    expect(reserved.status).toBe(5);
    expect(json(reserved)).toMatchObject({ errors: [{ code: "SOURCE_TARGET_RESERVED" }] });
    expect(transactionIds(project.root)).toEqual(transactionsBefore);

    const config = command([
      "info",
      "--cwd",
      project.root,
      "--config",
      "../mergora.json",
      "--json",
    ]);
    expect(config.status).toBe(2);
    expect(config.stdout).not.toContain(project.root);
  });
});
