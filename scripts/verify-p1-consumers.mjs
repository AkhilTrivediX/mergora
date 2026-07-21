import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

import { canonicalPackedContentDigest } from "./lib/packed-content-digest.mjs";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = join(workspaceRoot, "tests", "packed-consumers", "fixtures");
const matrixPath = join(workspaceRoot, "tests", "packed-consumers", "matrix.json");
const evidencePath = join(workspaceRoot, "tests", "packed-consumers", "evidence.json");
const corepackExecutable = process.platform === "win32" ? process.execPath : "corepack";
const corepackArguments =
  process.platform === "win32"
    ? [join(dirname(process.execPath), "node_modules", "corepack", "dist", "corepack.js")]
    : [];
const temporaryPrefix = "mergora-p1-consumers-";
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const sharedRepresentativeIds = [
  "button",
  "dialog",
  "combobox",
  "date-picker",
  "file-upload",
  "data-grid",
];
const sourceOnlyWorkflowKitId = "admin-dashboard-shell";
const requiredUiExports = [
  ".",
  ...sharedRepresentativeIds.flatMap((id) => [`./${id}`, `./${id}.css`]),
  "./package.json",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const publicPackages = readJson(join(workspaceRoot, "config", "public-packages.json"));
const selectedPackages = {
  cli: publicPackages.cli.package,
  contracts: publicPackages.public.contracts,
  mcp: publicPackages.public.mcp,
  registry: publicPackages.public.registry,
  schema: publicPackages.public.schema,
  tokens: publicPackages.public.tokens,
  ui: publicPackages.public.ui,
};
const packageDefinitions = [
  { directory: "packages/contracts", name: selectedPackages.contracts, role: "contracts" },
  { directory: "packages/mcp", name: selectedPackages.mcp, role: "mcp" },
  { directory: "packages/registry", name: selectedPackages.registry, role: "registry" },
  { directory: "packages/cli", name: selectedPackages.cli, role: "cli" },
  { directory: "packages/schema", name: selectedPackages.schema, role: "schema" },
  { directory: "packages/tokens", name: selectedPackages.tokens, role: "tokens" },
  { directory: "packages/ui", name: selectedPackages.ui, role: "ui" },
];
const generatedNativeSourceDirectory = join(
  workspaceRoot,
  "registry",
  "generated",
  "native-source-items",
);
const expectedCliTemplateIds = readdirSync(generatedNativeSourceDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(entry.name))
  .map((entry) => entry.name.slice(0, -5))
  .sort((left, right) => left.localeCompare(right, "en-US"));
const generatedSourcePayloads = new Map(
  expectedCliTemplateIds.map((id) => [
    id,
    readJson(join(generatedNativeSourceDirectory, `${id}.json`)),
  ]),
);
const packedSourceRequestIds = [...sharedRepresentativeIds, sourceOnlyWorkflowKitId];

function expectedSourceClosure(requested) {
  const visited = new Set();
  const visiting = new Set();
  const result = [];
  const visit = (id) => {
    if (visited.has(id)) return;
    assert(!visiting.has(id), `Generated source dependency cycle includes ${id}.`);
    const payload = generatedSourcePayloads.get(id);
    assert(payload !== undefined, `Generated source dependency ${id} is missing.`);
    visiting.add(id);
    for (const dependency of [...payload.registryDependencies].sort((left, right) =>
      left.localeCompare(right, "en-US"),
    )) {
      visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
    result.push(id);
  };
  for (const id of [...new Set(requested)].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  )) {
    visit(id);
  }
  return result;
}

const expectedPackedSourceIds = expectedSourceClosure(packedSourceRequestIds);
const expectedPackedSourceFileCount = expectedPackedSourceIds.reduce(
  (count, id) => count + generatedSourcePayloads.get(id).files.length,
  0,
);

function canonicalJson(value) {
  const normalize = (entry) => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry === null || typeof entry !== "object") return entry;
    return Object.fromEntries(
      Object.entries(entry)
        .sort(([left], [right]) => left.localeCompare(right, "en-US"))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  };
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

function compactCanonicalJson(value) {
  const normalize = (entry) => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry === null || typeof entry !== "object") return entry;
    return Object.fromEntries(
      Object.entries(entry)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  };
  return JSON.stringify(normalize(value));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function semanticDigest(value) {
  return `sha256:${sha256(compactCanonicalJson(value))}`;
}

function bytesDigest(bytes) {
  return `sha256:${sha256(bytes)}`;
}

function isInside(root, candidate) {
  const path = relative(root, candidate);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function sanitize(value, temporaryRoot) {
  let sanitized = String(value);
  for (const path of [workspaceRoot, temporaryRoot].filter(Boolean)) {
    sanitized = sanitized.replaceAll(path, path === workspaceRoot ? "<workspace>" : "<temporary>");
    sanitized = sanitized.replaceAll(
      path.replaceAll("\\", "/"),
      path === workspaceRoot ? "<workspace>" : "<temporary>",
    );
  }
  return sanitized;
}

function run(label, command, arguments_, cwd, temporaryRoot, environment = {}) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "1",
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      ...environment,
    },
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error !== undefined || result.status !== 0) {
    const detail = [result.stdout, result.stderr, result.error?.message]
      .filter((part) => typeof part === "string" && part.trim() !== "")
      .join("\n");
    throw new Error(
      `${label} failed with status ${String(result.status)}.\n${sanitize(detail, temporaryRoot)}`,
    );
  }
  process.stdout.write(`p1 packed consumers: ${label} passed\n`);
  return result.stdout;
}

function runWithExpectedStatus(
  label,
  command,
  arguments_,
  cwd,
  temporaryRoot,
  expectedStatus,
  environment = {},
) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "1",
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      ...environment,
    },
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
  const detail = [result.stdout, result.stderr, result.error?.message]
    .filter((part) => typeof part === "string" && part.trim() !== "")
    .join("\n");
  assert(
    result.error === undefined && result.status === expectedStatus,
    `${label} exited ${String(result.status)} instead of ${String(expectedStatus)}.\n${sanitize(detail, temporaryRoot)}`,
  );
  process.stdout.write(`p1 packed consumers: ${label} returned ${String(expectedStatus)} safely\n`);
  return result.stdout;
}

function runRejected(label, command, arguments_, cwd, temporaryRoot, expectedPattern) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "1",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  const detail = [result.stdout, result.stderr, result.error?.message]
    .filter((part) => typeof part === "string" && part.trim() !== "")
    .join("\n");
  assert(
    result.error === undefined && result.status !== null && result.status !== 0,
    `${label} unexpectedly succeeded.\n${sanitize(detail, temporaryRoot)}`,
  );
  assert(
    expectedPattern.test(detail),
    `${label} failed without the expected rejection.\n${sanitize(detail, temporaryRoot)}`,
  );
  process.stdout.write(`p1 packed consumers: ${label} rejected safely\n`);
}

function resultEnvelope(output, command) {
  const envelopes = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const value = JSON.parse(line);
        return value?.schemaVersion === 1 && value?.command === command ? [value] : [];
      } catch {
        return [];
      }
    });
  assert(
    envelopes.length === 1,
    `Packed CLI ${command} emitted ${String(envelopes.length)} result envelopes.`,
  );
  return envelopes[0];
}

function runCliJson(
  label,
  packedCli,
  arguments_,
  consumerDirectory,
  temporaryRoot,
  environment = {},
) {
  const output = run(
    label,
    process.execPath,
    [packedCli, ...arguments_, "--json"],
    consumerDirectory,
    temporaryRoot,
    environment,
  );
  const envelope = resultEnvelope(output, arguments_[0]);
  assert(
    envelope.ok === true && envelope.exitCode === 0,
    `Packed CLI ${arguments_[0]} envelope failed.`,
  );
  return envelope;
}

function runCliJsonWithStatus(
  label,
  packedCli,
  arguments_,
  consumerDirectory,
  temporaryRoot,
  expectedStatus,
  environment = {},
) {
  const output = runWithExpectedStatus(
    label,
    process.execPath,
    [packedCli, ...arguments_, "--json"],
    consumerDirectory,
    temporaryRoot,
    expectedStatus,
    environment,
  );
  const envelope = resultEnvelope(output, arguments_[0]);
  assert(
    envelope.exitCode === expectedStatus,
    `Packed CLI ${arguments_[0]} envelope exit code did not match the process.`,
  );
  return envelope;
}

function pnpm(label, arguments_, cwd, temporaryRoot) {
  return run(
    label,
    corepackExecutable,
    [...corepackArguments, "pnpm@11.14.0", ...arguments_],
    cwd,
    temporaryRoot,
  );
}

function walkFiles(root) {
  const entries = readdirSync(root, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name, "en-US"),
  );
  return entries.flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

function removeInside(root, target) {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  assert(
    isInside(resolvedRoot, resolvedTarget),
    `Refusing to remove path outside temporary root: ${target}`,
  );
  rmSync(resolvedTarget, { force: true, recursive: true });
}

function removeTemporaryRoot(path) {
  const resolvedTemporaryDirectory = realpathSync(tmpdir());
  const resolvedPath = resolve(path);
  assert(
    dirname(resolvedPath) === resolvedTemporaryDirectory &&
      basename(resolvedPath).startsWith(temporaryPrefix),
    `Refusing to remove unexpected temporary root: ${path}`,
  );
  rmSync(resolvedPath, { force: true, recursive: true });
}

function validateMatrix(matrix) {
  assert(matrix.schemaVersion === 1, "Packed consumer matrix schemaVersion must be 1.");
  assert(
    matrix.artifactKind === "p1-packed-consumer-matrix",
    "Packed consumer matrix kind is invalid.",
  );
  assert(matrix.packageManager === "pnpm@11.14.0", "Packed consumers must pin pnpm@11.14.0.");
  assert(matrix.basePath === "/mergora-p1", "Packed consumers must exercise a non-root base path.");
  assert(Array.isArray(matrix.consumers), "Packed consumer matrix consumers must be an array.");
  const identities = matrix.consumers.map(({ id }) => id).sort();
  assert(
    JSON.stringify(identities) ===
      JSON.stringify(["next-package", "next-source", "vite-package", "vite-source"]),
    "Packed consumer matrix must contain exact Next/Vite source/package coverage.",
  );
  for (const consumer of matrix.consumers) {
    assert(
      ["next", "vite"].includes(consumer.framework),
      `${consumer.id} has an invalid framework.`,
    );
    assert(["package", "source"].includes(consumer.mode), `${consumer.id} has an invalid mode.`);
    assert(
      consumer.id === `${consumer.framework}-${consumer.mode}`,
      `${consumer.id} identity is inconsistent.`,
    );
  }
  for (const [name, version] of Object.entries({
    "@types/node": "24.13.3",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.3",
    next: "16.2.10",
    react: "19.2.7",
    "react-aria-components": "1.19.0",
    "react-dom": "19.2.7",
    tailwindcss: "4.3.3",
    typescript: "6.0.3",
    vite: "8.1.5",
  })) {
    assert(
      matrix.versions?.[name] === version,
      `Packed consumer version ${name}@${version} is not pinned.`,
    );
  }
}

function validatePackageSources() {
  assert(
    publicPackages.selectionStatus === "verified" &&
      publicPackages.selectionTier === "approved-unscoped" &&
      selectedPackages.cli === "mergora" &&
      selectedPackages.contracts === "mergora-contracts" &&
      selectedPackages.mcp === "mergora-mcp" &&
      selectedPackages.registry === "mergora-registry" &&
      selectedPackages.ui === "mergora-ui" &&
      selectedPackages.tokens === "mergora-tokens" &&
      selectedPackages.schema === "mergora-schema",
    "Packed package identities must derive from the verified approved unscoped map.",
  );

  for (const definition of packageDefinitions) {
    const manifest = readJson(join(workspaceRoot, definition.directory, "package.json"));
    assert(
      manifest.name === definition.name,
      `${definition.directory} has an unexpected package name.`,
    );
    assert(
      manifest.version === "1.0.0",
      `${definition.name} must use the bounded version 1.0.0.`,
    );
    assert(
      manifest.private === false,
      `${definition.name} must be public for the 1.0.0 release.`,
    );
    for (const lifecycle of ["preinstall", "install", "postinstall"]) {
      assert(
        manifest.scripts?.[lifecycle] === undefined,
        `${definition.name} may not ship ${lifecycle}.`,
      );
    }
  }

  const cliManifest = readJson(join(workspaceRoot, "packages", "cli", "package.json"));
  assert(cliManifest.bin?.mergora === "./dist/bin.js", "Packed CLI binary contract is missing.");
  const uiManifest = readJson(join(workspaceRoot, "packages", "ui", "package.json"));
  for (const subpath of requiredUiExports) {
    assert(uiManifest.exports?.[subpath] !== undefined, `Packed UI export ${subpath} is missing.`);
  }
  assert(
    uiManifest.exports?.[`./${sourceOnlyWorkflowKitId}`] === undefined &&
      uiManifest.exports?.[`./${sourceOnlyWorkflowKitId}.css`] === undefined &&
      !existsSync(
        join(workspaceRoot, "packages", "ui", "src", "generated", sourceOnlyWorkflowKitId),
      ),
    `${sourceOnlyWorkflowKitId} must remain source-only in the package build.`,
  );
}

function buildAndPack(artifactDirectory, temporaryRoot) {
  pnpm("generated artifact drift", ["generated:check"], workspaceRoot, temporaryRoot);
  validatePackageSources();
  pnpm(
    "CLI/contracts/MCP/registry/UI/tokens/schema build",
    [...packageDefinitions.flatMap(({ name }) => ["--filter", name]), "build"],
    workspaceRoot,
    temporaryRoot,
  );

  const artifacts = [];
  for (const definition of packageDefinitions) {
    const before = new Set(readdirSync(artifactDirectory));
    pnpm(
      `${definition.name} tarball`,
      ["pack", "--pack-destination", artifactDirectory],
      join(workspaceRoot, definition.directory),
      temporaryRoot,
    );
    const created = readdirSync(artifactDirectory).filter(
      (filename) => filename.endsWith(".tgz") && !before.has(filename),
    );
    assert(created.length === 1, `${definition.name} pack must create exactly one tarball.`);
    const file = created[0];
    const path = join(artifactDirectory, file);
    const bytes = readFileSync(path);
    assert(bytes.byteLength > 0, `${definition.name} tarball is empty.`);
    const sourceManifest = readJson(join(workspaceRoot, definition.directory, "package.json"));
    artifacts.push({
      file,
      name: definition.name,
      path,
      role: definition.role,
      sha256: canonicalPackedContentDigest(bytes),
      version: sourceManifest.version,
    });
  }
  return artifacts.sort((left, right) => left.name.localeCompare(right.name, "en-US"));
}

function artifactFor(artifacts, packageName) {
  const artifact = artifacts.find(({ name }) => name === packageName);
  assert(artifact !== undefined, `Packed artifact ${packageName} is missing.`);
  return artifact;
}

function exactTarballDependencies(artifacts) {
  return Object.fromEntries(
    packageDefinitions.map(({ name }) => [
      name,
      `file:../../artifacts/${artifactFor(artifacts, name).file}`,
    ]),
  );
}

function consumerPackageJson(consumer, matrix, artifacts) {
  const exactTarballs = exactTarballDependencies(artifacts);
  const dependencies = {
    ...exactTarballs,
    react: matrix.versions.react,
    "react-dom": matrix.versions["react-dom"],
    tailwindcss: matrix.versions.tailwindcss,
  };
  const devDependencies = {
    "@types/node": matrix.versions["@types/node"],
    "@types/react": matrix.versions["@types/react"],
    "@types/react-dom": matrix.versions["@types/react-dom"],
    typescript: matrix.versions.typescript,
  };
  if (consumer.framework === "next") {
    dependencies.next = matrix.versions.next;
  } else {
    devDependencies["@vitejs/plugin-react"] = matrix.versions["@vitejs/plugin-react"];
    devDependencies.vite = matrix.versions.vite;
  }
  return {
    name: `mergora-p1-${consumer.id}`,
    version: "0.0.0",
    private: true,
    type: "module",
    packageManager: matrix.packageManager,
    engines: { node: ">=24.12.0 <25" },
    scripts: {
      build: consumer.framework === "next" ? "next build" : "vite build",
      typecheck: "tsc --noEmit",
    },
    dependencies,
    devDependencies,
  };
}

function createConsumer(consumer, matrix, artifacts, consumersDirectory) {
  const consumerDirectory = join(consumersDirectory, consumer.id);
  mkdirSync(consumerDirectory, { recursive: true });
  cpSync(join(fixtureRoot, consumer.framework, "common"), consumerDirectory, { recursive: true });
  cpSync(join(fixtureRoot, consumer.framework, consumer.mode), consumerDirectory, {
    recursive: true,
  });
  writeFileSync(
    join(consumerDirectory, "package.json"),
    canonicalJson(consumerPackageJson(consumer, matrix, artifacts)),
    "utf8",
  );
  const overrides = exactTarballDependencies(artifacts);
  writeFileSync(
    join(consumerDirectory, ".npmrc"),
    [
      "auto-install-peers=false",
      "engine-strict=true",
      "registry=https://registry.npmjs.org/",
      "strict-peer-dependencies=true",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(consumerDirectory, "pnpm-workspace.yaml"),
    [
      "packages: []",
      "",
      "autoInstallPeers: false",
      "blockExoticSubdeps: true",
      "engineStrict: true",
      "pmOnFail: error",
      "strictPeerDependencies: true",
      "",
      "allowBuilds:",
      "  esbuild: true",
      "  sharp: true",
      "",
      "overrides:",
      ...Object.entries(overrides)
        .sort(([left], [right]) => left.localeCompare(right, "en-US"))
        .map(([name, value]) => `  ${JSON.stringify(name)}: ${JSON.stringify(value)}`),
      "",
    ].join("\n"),
    "utf8",
  );
  return consumerDirectory;
}

function installSource(consumerDirectory, temporaryRoot) {
  const packedCli = join(
    consumerDirectory,
    "node_modules",
    ...selectedPackages.cli.split("/"),
    "dist",
    "bin.js",
  );
  runCliJson(
    "packed CLI initialization",
    packedCli,
    ["init", "--cwd", ".", "--yes", "--non-interactive"],
    consumerDirectory,
    temporaryRoot,
  );
  const envelope = runCliJson(
    "packed CLI source add",
    packedCli,
    [
      "add",
      ...packedSourceRequestIds,
      "--root",
      ".",
      "--target",
      "src/components",
      "--yes",
      "--non-interactive",
    ],
    consumerDirectory,
    temporaryRoot,
  );
  const result = envelope.result;
  assert(
    result.mode === "source-transaction",
    `Packed CLI add mode is incorrect: ${JSON.stringify({ mode: result.mode, status: envelope.status, result })}`,
  );
  assert(
    JSON.stringify(result.items) === JSON.stringify(expectedPackedSourceIds),
    "Packed CLI add did not install the exact generated dependency closure.",
  );
  assert(result.transaction?.state === "committed", "Packed CLI add did not commit a transaction.");
  const installedDependencies = readJson(join(consumerDirectory, "package.json")).dependencies;
  assert(
    installedDependencies?.["react-aria-components"] === "1.19.0",
    "Packed CLI add did not patch the exact React Aria dependency.",
  );
  assert(
    installedDependencies?.["@tanstack/react-table"] === "8.21.3",
    "Packed CLI add did not patch the exact Data Grid dependency.",
  );
  assert(
    result.manifest === ".mergora/manifest.json",
    "Packed CLI add manifest path is incorrect.",
  );
  return { packedCli, result };
}

function assertPackedDependencyValues(manifest, packageName) {
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    const dependencies = manifest[field] ?? {};
    for (const [name, value] of Object.entries(dependencies)) {
      assert(typeof value === "string", `${packageName} ${field}.${name} must be a string.`);
      assert(
        !/^(?:catalog|file|link|portal|workspace):/u.test(value),
        `${packageName} leaks private protocol ${field}.${name}=${value}.`,
      );
    }
  }
}

function auditInstalledPackages(consumerDirectory, temporaryRoot) {
  const nodeModules = join(consumerDirectory, "node_modules");
  const workspaceMarkers = [workspaceRoot, workspaceRoot.replaceAll("\\", "/")];
  const temporaryMarkers = [temporaryRoot, temporaryRoot.replaceAll("\\", "/")];
  const expectedPackagePaths = Object.fromEntries(
    packageDefinitions.map(({ name }) => [name, join(nodeModules, ...name.split("/"))]),
  );

  for (const [packageName, packagePath] of Object.entries(expectedPackagePaths)) {
    assert(existsSync(packagePath), `${packageName} is not installed.`);
    const realPackagePath = realpathSync(packagePath);
    assert(
      isInside(nodeModules, realPackagePath),
      `${packageName} resolves outside consumer node_modules.`,
    );
    const manifest = readJson(join(packagePath, "package.json"));
    assert(
      manifest.name === packageName,
      `${packageName} installed manifest identity is incorrect.`,
    );
    assertPackedDependencyValues(manifest, packageName);
    for (const lifecycle of ["preinstall", "install", "postinstall"]) {
      assert(
        manifest.scripts?.[lifecycle] === undefined,
        `${packageName} ships forbidden ${lifecycle}.`,
      );
    }
    for (const file of walkFiles(realPackagePath)) {
      if (!textExtensions.has(extname(file))) continue;
      const content = readFileSync(file, "utf8");
      for (const marker of [...workspaceMarkers, ...temporaryMarkers]) {
        assert(
          !content.includes(marker),
          `${packageName} embeds a private absolute path in ${relative(realPackagePath, file)}.`,
        );
      }
    }
  }

  const uiManifest = readJson(join(expectedPackagePaths[selectedPackages.ui], "package.json"));
  for (const subpath of requiredUiExports) {
    assert(
      uiManifest.exports?.[subpath] !== undefined,
      `Installed UI export ${subpath} is missing.`,
    );
  }
  const cliTemplates = readJson(
    join(expectedPackagePaths[selectedPackages.cli], "dist", "templates", "manifest.json"),
  );
  assert(
    JSON.stringify(Object.keys(cliTemplates.items).sort()) ===
      JSON.stringify(expectedCliTemplateIds),
    "Packed CLI template inventory is incomplete.",
  );
  assert(
    existsSync(join(expectedPackagePaths[selectedPackages.tokens], "dist", "tokens.css")),
    "Packed token CSS is missing.",
  );
  assert(
    existsSync(join(expectedPackagePaths[selectedPackages.contracts], "dist", "index.js")) &&
      existsSync(join(expectedPackagePaths[selectedPackages.contracts], "dist", "index.d.ts")) &&
      existsSync(
        join(
          expectedPackagePaths[selectedPackages.contracts],
          "schemas",
          "executable-contract-v1.schema.json",
        ),
      ) &&
      existsSync(
        join(
          expectedPackagePaths[selectedPackages.contracts],
          "schemas",
          "audit-report-v1.schema.json",
        ),
      ),
    "Packed executable-contract runtime or schemas are missing.",
  );
  assert(
    existsSync(join(expectedPackagePaths[selectedPackages.registry], "dist", "index.js")) &&
      existsSync(join(expectedPackagePaths[selectedPackages.registry], "dist", "index.d.ts")),
    "Packed Semantic Sync registry runtime or declarations are missing.",
  );
  assert(
    existsSync(join(expectedPackagePaths[selectedPackages.mcp], "dist", "index.js")) &&
      existsSync(join(expectedPackagePaths[selectedPackages.mcp], "dist", "index.d.ts")),
    "Packed MCP runtime or declarations are missing.",
  );
  assert(
    existsSync(
      join(
        expectedPackagePaths[selectedPackages.schema],
        "dist",
        "registry",
        "schemas",
        "config-v1.schema.json",
      ),
    ),
    "Packed config schema is missing.",
  );

  const lockfile = readFileSync(join(consumerDirectory, "pnpm-lock.yaml"), "utf8");
  assert(
    !/(?:catalog|link|workspace):/u.test(lockfile),
    "Consumer lockfile contains a workspace-only protocol.",
  );
  for (const marker of workspaceMarkers) {
    assert(!lockfile.includes(marker), "Consumer lockfile contains the monorepo path.");
  }
  const packageJson = readJson(join(consumerDirectory, "package.json"));
  const workspaceSettings = readFileSync(join(consumerDirectory, "pnpm-workspace.yaml"), "utf8");
  for (const { name } of packageDefinitions) {
    assert(
      packageJson.dependencies[name].startsWith("file:../../artifacts/") &&
        packageJson.dependencies[name].endsWith(".tgz"),
      `Consumer ${name} dependency is not the relative packed tarball.`,
    );
    assert(
      workspaceSettings.includes(
        `  ${JSON.stringify(name)}: ${JSON.stringify(packageJson.dependencies[name])}`,
      ),
      `Consumer ${name} transitive override is not the same exact tarball.`,
    );
  }
  const reactManifest = readJson(join(nodeModules, "react", "package.json"));
  assert(
    reactManifest.version === "19.2.7",
    "Consumer React version is not the exact declared pin.",
  );

  const dependencyTree = pnpm(
    "installed dependency tree audit",
    ["list", "--depth", "Infinity", "--json"],
    consumerDirectory,
    temporaryRoot,
  );
  for (const marker of workspaceMarkers) {
    assert(
      !dependencyTree.includes(marker),
      "Installed dependency tree resolves into the monorepo.",
    );
  }
}

function sourceTreeDigest(consumerDirectory) {
  const manifest = readJson(join(consumerDirectory, ".mergora", "manifest.json"));
  assert(manifest.schemaVersion === 1, "CLI source manifest schemaVersion is invalid.");
  const files = Object.values(manifest.items).flatMap((item) =>
    item.files.map(({ target }) => target),
  );
  assert(
    files.length === expectedPackedSourceFileCount,
    "CLI source manifest does not own the exact generated dependency-closure files.",
  );
  const digest = createHash("sha256");
  for (const path of [...files].sort()) {
    assert(
      !path.includes("\\") && !path.includes(".."),
      `CLI source manifest path ${path} is unsafe.`,
    );
    const absolutePath = resolve(consumerDirectory, ...path.split("/"));
    assert(isInside(consumerDirectory, absolutePath), `CLI source manifest path ${path} escapes.`);
    digest.update(path);
    digest.update("\0");
    digest.update(readFileSync(absolutePath));
    digest.update("\0");
  }
  return digest.digest("hex");
}

function lifecycleStateDigest(consumerDirectory) {
  const roots = ["package.json", "pnpm-lock.yaml", "mergora.json", "src", ".mergora"];
  const files = roots.flatMap((target) => {
    const path = join(consumerDirectory, target);
    if (!existsSync(path)) return [];
    return statSync(path).isDirectory() ? walkFiles(path) : [path];
  });
  const digest = createHash("sha256");
  for (const path of files
    .filter((path) => {
      const target = relative(consumerDirectory, path).replaceAll("\\", "/");
      return target !== ".mergora/transactions" && !target.startsWith(".mergora/transactions/");
    })
    .sort((left, right) => left.localeCompare(right, "en-US"))) {
    const target = relative(consumerDirectory, path).replaceAll("\\", "/");
    digest.update(target);
    digest.update("\0");
    digest.update(readFileSync(path));
    digest.update("\0");
  }
  return digest.digest("hex");
}

function itemManifestEntry(manifest, itemId) {
  const match = Object.entries(manifest.items).find(
    ([qualifiedId]) => qualifiedId === itemId || qualifiedId.endsWith(`:${itemId}`),
  );
  assert(match !== undefined, `CLI source manifest omits ${itemId}.`);
  return match[1];
}

function immutableBasePath(consumerDirectory, digest) {
  assert(/^sha256:[a-f0-9]{64}$/u.test(digest), "Manifest base digest is invalid.");
  const value = digest.slice("sha256:".length);
  return join(
    consumerDirectory,
    ".mergora",
    "bases",
    "sha256",
    value.slice(0, 2),
    `${value.slice(2)}.blob`,
  );
}

function writePackedUpdateFixture(consumerDirectory, manifest, itemId, variant = "disjoint") {
  assert(
    variant === "disjoint" || variant === "overlapping",
    `Unsupported packed update fixture variant ${variant}.`,
  );
  const installed = itemManifestEntry(manifest, itemId);
  const files = installed.files.map((file) => {
    const bytes = readFileSync(immutableBasePath(consumerDirectory, file.base));
    const binary = !(file.mediaType.startsWith("text/") || file.mediaType.includes("json"));
    return {
      content: bytes.toString(binary ? "base64" : "utf8"),
      digest: bytesDigest(bytes),
      encoding: binary ? "base64" : "utf8",
      executable: false,
      logicalPath: file.logicalPath,
      mediaType: file.mediaType,
      role: file.role,
    };
  });
  const upstreamFile = files.find(({ logicalPath }) =>
    logicalPath.endsWith(variant === "disjoint" ? "data-grid-css.d.ts" : "data-grid.css"),
  );
  assert(
    upstreamFile !== undefined && upstreamFile.encoding === "utf8",
    "Data Grid update fixture cannot find its selected text file.",
  );
  const version = variant === "disjoint" ? "0.0.1" : "0.0.2";
  const marker = variant === "disjoint" ? "*.packed-update.css" : "align-items: flex-end;";
  if (variant === "disjoint") {
    upstreamFile.content += 'declare module "*.packed-update.css";\n';
  } else {
    const next = upstreamFile.content.replace("align-items: center;", marker);
    assert(
      next !== upstreamFile.content,
      "Data Grid overlap fixture found no shared CSS declaration.",
    );
    upstreamFile.content = next;
  }
  upstreamFile.digest = bytesDigest(Buffer.from(upstreamFile.content, "utf8"));

  const itemWithoutDigest = {
    contractVersion: version,
    dependencies: installed.dependencies,
    files,
    itemId,
    kind: installed.kind,
    lastMigration: null,
    payloadUrl: `https://fixture.invalid/releases/${version}/items/${itemId}.json`,
    registryDependencies: installed.registryDependencies,
    renderedWithTransformContextDigest: installed.transformContextDigest,
    resolved: version,
  };
  const item = {
    ...itemWithoutDigest,
    payloadDigest: semanticDigest(itemWithoutDigest),
  };
  const identity = {
    id: "official",
    origin: "https://fixture.invalid/registry/v1",
    protocol: "mergora-v1",
    trust: "local-development",
  };
  const registry = {
    ...identity,
    evidenceTier: "not-supplied",
    identityDigest: semanticDigest(identity),
    source: "verified-cache",
  };
  const releaseWithoutDigest = {
    items: [item],
    registry,
    release: version,
    schemaVersion: 1,
  };
  const manifestPayload = {
    items: [{ itemId, payloadDigest: item.payloadDigest, resolved: item.resolved }],
    registry,
    release: releaseWithoutDigest.release,
    schemaVersion: releaseWithoutDigest.schemaVersion,
  };
  const release = {
    ...releaseWithoutDigest,
    manifestDigest: semanticDigest(manifestPayload),
  };
  const releaseFile = `mergora-packed-${variant}-update.json`;
  writeFileSync(join(consumerDirectory, releaseFile), canonicalJson(release), "utf8");
  const upstreamTarget = installed.files.find(
    ({ logicalPath }) => logicalPath === upstreamFile.logicalPath,
  )?.target;
  assert(upstreamTarget !== undefined, "Data Grid update fixture target is missing.");
  return {
    releaseFile,
    upstreamContent: upstreamFile.content,
    upstreamMarker: marker,
    upstreamTarget,
    version,
  };
}

function verifyCustomizedSourceLifecycle(consumerDirectory, packedCli, temporaryRoot) {
  const itemId = "data-grid";
  const manifest = readJson(join(consumerDirectory, ".mergora", "manifest.json"));
  const item = itemManifestEntry(manifest, itemId);
  const ownedFile = item.files.find(({ target }) => target.endsWith("/data-grid.tsx"));
  assert(ownedFile !== undefined, "Data Grid source ownership omits its implementation file.");
  const targetPath = resolve(consumerDirectory, ...ownedFile.target.split("/"));
  assert(isInside(consumerDirectory, targetPath), "Data Grid customization target escapes.");
  const original = readFileSync(targetPath);
  const customized = Buffer.concat([
    original,
    Buffer.from("\n// Consumer-owned packed-fixture customization.\n", "utf8"),
  ]);
  writeFileSync(targetPath, customized);

  const statusEnvelope = runCliJson(
    "packed CLI customized-source status",
    packedCli,
    ["status", "--cwd", "."],
    consumerDirectory,
    temporaryRoot,
  );
  const statusItem = statusEnvelope.result.items.find(
    ({ id }) => id === itemId || id.endsWith(`:${itemId}`),
  );
  assert(
    statusItem?.status === "locally-modified" &&
      statusItem.files.some(
        ({ status, target }) => status === "locally-modified" && target === ownedFile.target,
      ),
    "Packed CLI status did not classify the consumer customization.",
  );

  const diffEnvelope = runCliJson(
    "packed CLI customized-source diff",
    packedCli,
    ["diff", itemId, "--cwd", ".", "--local", "--format", "json"],
    consumerDirectory,
    temporaryRoot,
  );
  assert(
    diffEnvelope.status === "differences" &&
      diffEnvelope.result.hasDifferences === true &&
      diffEnvelope.result.nameOnly.includes(ownedFile.target),
    "Packed CLI diff did not expose the consumer customization.",
  );

  const updateFixture = writePackedUpdateFixture(consumerDirectory, manifest, itemId);
  const upstreamDiffEnvelope = runCliJson(
    "packed CLI customized-source upstream diff",
    packedCli,
    [
      "diff",
      itemId,
      "--cwd",
      ".",
      "--upstream",
      "--release-file",
      updateFixture.releaseFile,
      "--format",
      "json",
    ],
    consumerDirectory,
    temporaryRoot,
  );
  const upstreamDiff = upstreamDiffEnvelope.result.files.find(
    ({ target }) => target === updateFixture.upstreamTarget,
  );
  assert(
    upstreamDiffEnvelope.status === "differences" &&
      upstreamDiff?.planned !== null &&
      upstreamDiff?.planned !== undefined &&
      upstreamDiff.planned.remoteDigest !== upstreamDiff.baseDigest &&
      upstreamDiff.planned.conflicts.length === 0,
    "Packed CLI upstream diff did not plan the independent Data Grid change.",
  );

  const updateEnvelope = runCliJson(
    "packed CLI customized-source update",
    packedCli,
    [
      "update",
      itemId,
      "--cwd",
      ".",
      "--release-file",
      updateFixture.releaseFile,
      "--no-install",
      "--yes",
      "--non-interactive",
    ],
    consumerDirectory,
    temporaryRoot,
  );
  assert(
    updateEnvelope.status === "committed" &&
      updateEnvelope.result.mode === "semantic-update" &&
      updateEnvelope.result.release === "0.0.1",
    "Packed CLI did not commit the independent Data Grid update.",
  );
  assert(
    readFileSync(targetPath).equals(customized),
    "Semantic Sync discarded the independent consumer customization.",
  );
  assert(
    readFileSync(
      resolve(consumerDirectory, ...updateFixture.upstreamTarget.split("/")),
      "utf8",
    ).includes(updateFixture.upstreamMarker),
    "Semantic Sync omitted the independent upstream change.",
  );
  const updatedManifest = readJson(join(consumerDirectory, ".mergora", "manifest.json"));
  assert(
    itemManifestEntry(updatedManifest, itemId).resolved === "0.0.1",
    "Semantic Sync did not advance exact release provenance.",
  );

  const removalEnvelope = runCliJson(
    "packed CLI customized-source guarded removal",
    packedCli,
    ["remove", itemId, "--cwd", ".", "--plan"],
    consumerDirectory,
    temporaryRoot,
  );
  assert(
    removalEnvelope.status === "conflict" &&
      Array.isArray(removalEnvelope.result.conflicts) &&
      removalEnvelope.result.conflicts.length > 0,
    "Packed CLI removal did not refuse locally customized owned source.",
  );
  assert(
    readFileSync(targetPath).equals(customized),
    "Guarded removal changed locally customized source.",
  );

  const doctorEnvelope = runCliJson(
    "packed CLI customized-source doctor",
    packedCli,
    ["doctor", "--cwd", "."],
    consumerDirectory,
    temporaryRoot,
  );
  assert(
    doctorEnvelope.result.healthy === true && doctorEnvelope.result.counts.error === 0,
    "Packed CLI doctor found an integrity error after a valid local customization.",
  );

  return {
    diff: "reported",
    doctor: "healthy",
    guardedRemoval: "conflict-preserved-live-source",
    itemId,
    status: "locally-modified",
    target: ownedFile.target,
    update: "disjoint-upstream-change-merged-local-customization-preserved",
  };
}

function verifyOverlappingUpdateAndResolution(consumerDirectory, packedCli, temporaryRoot) {
  const itemId = "data-grid";
  const manifestPath = join(consumerDirectory, ".mergora", "manifest.json");
  const manifest = readJson(manifestPath);
  const item = itemManifestEntry(manifest, itemId);
  const ownedFile = item.files.find(({ target }) => target.endsWith("/data-grid.css"));
  assert(ownedFile !== undefined, "Data Grid source ownership omits its CSS file.");
  const targetPath = resolve(consumerDirectory, ...ownedFile.target.split("/"));
  const baseText = readFileSync(targetPath, "utf8");
  const localText = baseText.replace("align-items: center;", "align-items: flex-start;");
  assert(localText !== baseText, "Data Grid overlap fixture found no local CSS declaration.");
  writeFileSync(targetPath, localText, "utf8");
  const localBytes = Buffer.from(localText, "utf8");

  const updateFixture = writePackedUpdateFixture(
    consumerDirectory,
    manifest,
    itemId,
    "overlapping",
  );
  const manifestBefore = readFileSync(manifestPath);
  const packageBefore = readFileSync(join(consumerDirectory, "package.json"));
  const sourceBefore = sourceTreeDigest(consumerDirectory);
  const conflictEnvelope = runCliJsonWithStatus(
    "packed CLI overlapping source update",
    packedCli,
    [
      "update",
      itemId,
      "--cwd",
      ".",
      "--release-file",
      updateFixture.releaseFile,
      "--no-install",
      "--yes",
      "--non-interactive",
    ],
    consumerDirectory,
    temporaryRoot,
    6,
  );
  const conflict = conflictEnvelope.result;
  assert(
    conflictEnvelope.status === "conflicted" &&
      conflict.status === "conflicted" &&
      conflict.liveProjectChanged === false &&
      conflict.conflicts.some(({ target }) => target === ownedFile.target),
    "Packed CLI overlapping update did not stage an explicit conflict.",
  );
  assert(
    readFileSync(manifestPath).equals(manifestBefore) &&
      readFileSync(join(consumerDirectory, "package.json")).equals(packageBefore) &&
      readFileSync(targetPath).equals(localBytes) &&
      sourceTreeDigest(consumerDirectory) === sourceBefore,
    "Packed CLI overlapping update changed live source, package metadata, or provenance.",
  );

  const transactionId = conflict.conflictTransactionId;
  assert(
    typeof transactionId === "string" &&
      /^[0-9]{8}T[0-9]{6}(?:\.[0-9]{3})?Z-[0-9a-f]{32}$/u.test(transactionId),
    "Packed CLI overlapping update omitted its conflict transaction ID.",
  );
  const packetRoot = join(consumerDirectory, ".mergora", "transactions", transactionId);
  const conflictsRoot = join(packetRoot, "conflicts");
  assert(
    existsSync(join(packetRoot, "README.md")) && existsSync(conflictsRoot),
    "Packed CLI overlapping update omitted its local conflict packet.",
  );
  const packetEntries = readdirSync(conflictsRoot, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );
  const packet = packetEntries
    .map((entry) => ({
      directory: join(conflictsRoot, entry.name),
      record: readJson(join(conflictsRoot, entry.name, "conflict.json")),
    }))
    .find(({ record }) => record.target === ownedFile.target);
  assert(
    packet !== undefined,
    "Packed CLI conflict packet omits the overlapping Data Grid target.",
  );
  for (const name of ["base", "local", "remote", "proposed", "conflict.json"]) {
    assert(existsSync(join(packet.directory, name)), `Packed CLI conflict packet omits ${name}.`);
  }
  assert(
    packet.record.originalLivePreconditionDigest === bytesDigest(localBytes) &&
      JSON.stringify(packet.record.safeResolutionChoices) ===
        JSON.stringify(["keep-local", "take-upstream", "manual"]),
    "Packed CLI conflict packet has incorrect live preconditions or safe choices.",
  );

  const listed = runCliJson(
    "packed CLI conflict packet list",
    packedCli,
    ["resolve", transactionId, "--cwd", ".", "--list"],
    consumerDirectory,
    temporaryRoot,
  );
  assert(
    listed.result.unresolved.some(({ target }) => target === ownedFile.target),
    "Packed CLI resolve list omitted the unresolved Data Grid target.",
  );
  const choicePlan = runCliJson(
    "packed CLI conflict choice plan",
    packedCli,
    ["resolve", transactionId, "--cwd", ".", "--take-local", ownedFile.target, "--plan"],
    consumerDirectory,
    temporaryRoot,
  );
  assert(
    choicePlan.status === "planned" && choicePlan.result.command === "resolve",
    "Packed CLI did not plan the explicit local resolution.",
  );
  const choice = runCliJson(
    "packed CLI conflict choice",
    packedCli,
    [
      "resolve",
      transactionId,
      "--cwd",
      ".",
      "--take-local",
      ownedFile.target,
      "--yes",
      "--non-interactive",
    ],
    consumerDirectory,
    temporaryRoot,
  );
  assert(choice.status === "recorded", "Packed CLI did not record the explicit local choice.");

  const applyPlan = runCliJson(
    "packed CLI conflict apply plan",
    packedCli,
    ["resolve", transactionId, "--cwd", ".", "--apply", "--no-install", "--plan"],
    consumerDirectory,
    temporaryRoot,
  );
  assert(
    applyPlan.status === "planned" && applyPlan.result.conflicts.length === 0,
    "Packed CLI did not plan the reviewed conflict application.",
  );
  const applied = runCliJson(
    "packed CLI conflict apply",
    packedCli,
    [
      "resolve",
      transactionId,
      "--cwd",
      ".",
      "--apply",
      "--no-install",
      "--yes",
      "--non-interactive",
    ],
    consumerDirectory,
    temporaryRoot,
  );
  const updatedManifest = readJson(manifestPath);
  assert(
    applied.status === "committed" &&
      applied.result.transaction?.state === "committed" &&
      itemManifestEntry(updatedManifest, itemId).resolved === updateFixture.version &&
      readFileSync(targetPath).equals(localBytes),
    "Packed CLI explicit conflict resolution did not preserve local bytes and advance provenance.",
  );

  return {
    conflictPacket: "complete-local-only",
    liveProjectDuringConflict: "byte-identical",
    release: updateFixture.version,
    resolution: "explicit-take-local-committed",
    target: ownedFile.target,
  };
}

function verifyOfflineVendor(consumerDirectory, packedCli, temporaryRoot) {
  const planned = runCliJson(
    "packed CLI offline vendor plan",
    packedCli,
    ["vendor", "button", "--cwd", ".", "--plan"],
    consumerDirectory,
    temporaryRoot,
  );
  assert(
    planned.status === "planned" && planned.result.items.some(({ id }) => id === "official:button"),
    "Packed CLI did not plan the installed Button vendor snapshot.",
  );
  const applied = runCliJson(
    "packed CLI offline vendor apply",
    packedCli,
    ["vendor", "button", "--cwd", ".", "--yes", "--non-interactive"],
    consumerDirectory,
    temporaryRoot,
  );
  assert(
    applied.status === "committed" &&
      applied.result.verification?.state === "valid" &&
      applied.result.verification?.provenanceState === "unreleased-local" &&
      applied.result.verification?.networkUsed === false,
    "Packed CLI did not create a valid network-free local vendor snapshot.",
  );
  const verified = runCliJson(
    "packed CLI offline vendor verify",
    packedCli,
    ["vendor", "verify", "--cwd", ".", "--offline"],
    consumerDirectory,
    temporaryRoot,
  );
  assert(
    verified.status === "valid" &&
      verified.result.state === "valid" &&
      verified.result.networkUsed === false,
    "Packed CLI did not verify the local vendor fully offline.",
  );
  return {
    networkUsed: false,
    provenance: "unreleased-local",
    verification: "valid-offline",
  };
}

function verifyStaticContractAudit(consumerDirectory, packedCli, temporaryRoot) {
  const manifest = readJson(join(consumerDirectory, ".mergora", "manifest.json"));
  const item = itemManifestEntry(manifest, "button");
  const source = item.files.find(({ target }) => target.endsWith("/button.tsx"));
  assert(source !== undefined, "Button source ownership omits its implementation file.");
  const contract = {
    schemaVersion: 1,
    contractVersion: item.contractVersion,
    contractId: "button-packed-consumer-contract",
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
  };
  const directory = join(consumerDirectory, ".mergora", "contracts");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "official--button.json"), canonicalJson(contract), "utf8");
  const audited = runCliJson(
    "packed CLI static Contract Audit",
    packedCli,
    ["audit", "button", "--static", "--cwd", "."],
    consumerDirectory,
    temporaryRoot,
  );
  assert(
    audited.status === "pass" &&
      audited.result.state === "pass" &&
      audited.result.recommendedExitCode === 0 &&
      audited.result.networkUsed === false &&
      audited.result.summary?.pass === 1,
    "Packed CLI static Contract Audit did not produce one passing offline assertion.",
  );
  return { assertions: 1, mode: "static", networkUsed: false, state: "pass" };
}

function verifyOwnershipRemoveAndRollback(consumerDirectory, packedCli, temporaryRoot) {
  const manifestPath = join(consumerDirectory, ".mergora", "manifest.json");
  const manifestBefore = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBefore.toString("utf8"));
  const button = itemManifestEntry(manifest, "button");
  const buttonFiles = button.files.map(({ target }) => ({
    bytes: readFileSync(resolve(consumerDirectory, ...target.split("/"))),
    target,
  }));
  const dataGrid = itemManifestEntry(manifest, "data-grid");
  const unrelated = dataGrid.files.find(({ target }) => target.endsWith("/data-grid.tsx"));
  assert(unrelated !== undefined, "Ownership removal fixture omits unrelated Data Grid source.");
  const unrelatedPath = resolve(consumerDirectory, ...unrelated.target.split("/"));
  const unrelatedBefore = readFileSync(unrelatedPath);

  const planned = runCliJson(
    "packed CLI ownership-aware remove plan",
    packedCli,
    ["remove", "button", "--cwd", ".", "--no-install", "--plan"],
    consumerDirectory,
    temporaryRoot,
  );
  assert(
    planned.status === "planned" &&
      planned.result.conflicts.length === 0 &&
      planned.result.items.some(({ id }) => id === "official:button"),
    "Packed CLI did not plan a conflict-free owned Button removal.",
  );
  const removed = runCliJson(
    "packed CLI ownership-aware remove",
    packedCli,
    ["remove", "button", "--cwd", ".", "--no-install", "--yes", "--non-interactive"],
    consumerDirectory,
    temporaryRoot,
  );
  const removedManifest = readJson(manifestPath);
  const retainedButton = itemManifestEntry(removedManifest, "button");
  assert(
    removed.status === "committed" &&
      removed.result.transaction?.state === "committed" &&
      button.direct === true &&
      retainedButton.direct === false &&
      buttonFiles.every(({ bytes, target }) =>
        readFileSync(resolve(consumerDirectory, ...target.split("/"))).equals(bytes),
      ) &&
      readFileSync(unrelatedPath).equals(unrelatedBefore),
    "Packed CLI ownership-aware removal did not detach direct Button ownership while retaining its dependent-owned bytes.",
  );
  const transactionId = removed.result.transaction.transactionId;
  assert(typeof transactionId === "string", "Packed CLI removal omitted its transaction ID.");

  const rollbackPlan = runCliJson(
    "packed CLI removal rollback plan",
    packedCli,
    ["rollback", transactionId, "--cwd", ".", "--no-install", "--plan"],
    consumerDirectory,
    temporaryRoot,
  );
  assert(
    rollbackPlan.status === "planned" && rollbackPlan.result.plan.conflicts.length === 0,
    "Packed CLI did not plan the completed removal rollback.",
  );
  const rollback = runCliJson(
    "packed CLI removal rollback",
    packedCli,
    ["rollback", transactionId, "--cwd", ".", "--no-install", "--yes", "--non-interactive"],
    consumerDirectory,
    temporaryRoot,
  );
  assert(
    rollback.status === "committed" &&
      rollback.result.rollbackOf === transactionId &&
      rollback.result.transaction?.state === "committed" &&
      readFileSync(manifestPath).equals(manifestBefore) &&
      buttonFiles.every(({ bytes, target }) =>
        readFileSync(resolve(consumerDirectory, ...target.split("/"))).equals(bytes),
      ) &&
      readFileSync(unrelatedPath).equals(unrelatedBefore),
    "Packed CLI rollback did not restore the removal byte-identically.",
  );
  return {
    removal: "direct-ownership-detached-dependent-owned-files-retained",
    rollback: "byte-identical-restore",
  };
}

function verifyInterruptedRecovery(consumerDirectory, packedCli, temporaryRoot) {
  const manifestPath = join(consumerDirectory, ".mergora", "manifest.json");
  const manifestBefore = readFileSync(manifestPath);
  const sourceBefore = sourceTreeDigest(consumerDirectory);
  const lifecycleBefore = lifecycleStateDigest(consumerDirectory);
  const installedIds = new Set(
    Object.keys(JSON.parse(manifestBefore.toString("utf8")).items).map((id) =>
      id.includes(":") ? id.slice(id.lastIndexOf(":") + 1) : id,
    ),
  );
  const itemId = expectedCliTemplateIds.find((id) => !installedIds.has(id));
  assert(itemId !== undefined, "Packed recovery proof cannot find an uninstalled source item.");
  const program = `
import {
  TransactionInterruption,
  applySourceAdd,
  listIncompleteTransactions,
  planSourceAdd,
} from ${JSON.stringify(selectedPackages.cli)};

const root = process.cwd();
let interrupted = false;
const options = {
  projectRoot: root,
  itemIds: [${JSON.stringify(itemId)}],
  noInstall: true,
  faultInjector(point) {
    if (!interrupted && point === "commit-file") {
      interrupted = true;
      throw new TransactionInterruption("packed consumer injected interruption");
    }
  },
};
const plan = planSourceAdd(options);
try {
  applySourceAdd(options, plan.planDigest);
  throw new Error("packed source add unexpectedly completed");
} catch (error) {
  if (!(error instanceof TransactionInterruption)) throw error;
}
const transactions = listIncompleteTransactions(root);
if (transactions.length !== 1) {
  throw new Error(\`expected one interrupted transaction, received \${transactions.length}\`);
}
process.stdout.write(JSON.stringify({ itemId: ${JSON.stringify(itemId)}, transactionId: transactions[0] }));
`;
  const output = run(
    "packed public API injected transaction interruption",
    process.execPath,
    ["--input-type=module", "--eval", program],
    consumerDirectory,
    temporaryRoot,
  );
  const interrupted = JSON.parse(output);
  assert(
    interrupted.itemId === itemId && typeof interrupted.transactionId === "string",
    "Packed public API interruption did not report its recoverable transaction.",
  );
  assert(
    readFileSync(manifestPath).equals(manifestBefore),
    "Interrupted packed source add advanced the manifest before recovery.",
  );
  const recoveryPlan = runCliJson(
    "packed CLI interrupted transaction recovery plan",
    packedCli,
    [
      "recover",
      "--cwd",
      ".",
      "--transaction",
      interrupted.transactionId,
      "--strategy",
      "rollback",
      "--offline",
      "--plan",
    ],
    consumerDirectory,
    temporaryRoot,
  );
  assert(
    recoveryPlan.status === "rollback-planned" && recoveryPlan.result.command === "recover",
    "Packed CLI did not plan rollback recovery for the injected interruption.",
  );
  const recovered = runCliJson(
    "packed CLI interrupted transaction recovery",
    packedCli,
    [
      "recover",
      "--cwd",
      ".",
      "--transaction",
      interrupted.transactionId,
      "--strategy",
      "rollback",
      "--offline",
      "--yes",
      "--non-interactive",
    ],
    consumerDirectory,
    temporaryRoot,
  );
  assert(
    recovered.status === "rolled-back" &&
      recovered.result.action === "rollback" &&
      recovered.result.state === "rolled-back" &&
      readFileSync(manifestPath).equals(manifestBefore) &&
      sourceTreeDigest(consumerDirectory) === sourceBefore &&
      lifecycleStateDigest(consumerDirectory) === lifecycleBefore &&
      !existsSync(join(consumerDirectory, ".mergora", ".lock")),
    "Packed CLI recovery did not restore the interrupted source add byte-identically.",
  );
  return {
    injectedAt: "commit-file",
    itemId,
    recovery: "rollback-byte-identical",
  };
}

function writeJsonFetchPreload(projectRoot, value, expectedUrl) {
  const directory = join(projectRoot, ".mergora", "packed-shadcn-fetch");
  const bytesPath = join(directory, "registry.json");
  const preloadPath = join(directory, "preload.mjs");
  mkdirSync(directory, { recursive: true });
  writeFileSync(bytesPath, canonicalJson(value), "utf8");
  writeFileSync(
    preloadPath,
    `import { readFileSync } from "node:fs";
const bytes = readFileSync(process.env.MERGORA_PACKED_SHADCN_BYTES);
globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input.url;
  if (url !== process.env.MERGORA_PACKED_SHADCN_URL) throw new Error("unexpected shadcn URL");
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-length": String(bytes.byteLength),
    },
  });
};
`,
    "utf8",
  );
  return {
    NODE_OPTIONS: `--import=${pathToFileURL(preloadPath).href}`,
    MERGORA_PACKED_SHADCN_BYTES: bytesPath,
    MERGORA_PACKED_SHADCN_URL: expectedUrl,
  };
}

function verifyMigrationAndShadcnAdoption(consumerDirectory, packedCli, temporaryRoot) {
  const projectRoot = join(consumerDirectory, ".packed-cli-lifecycle");
  mkdirSync(join(projectRoot, "src", "components", "ui"), { recursive: true });
  writeFileSync(
    join(projectRoot, "package.json"),
    canonicalJson({
      name: "mergora-packed-cli-lifecycle",
      version: "0.0.0",
      private: true,
      type: "module",
      dependencies: { react: "19.2.7", "react-dom": "19.2.7" },
      devDependencies: { vite: "8.1.5" },
    }),
    "utf8",
  );
  writeFileSync(
    join(projectRoot, "tsconfig.json"),
    canonicalJson({
      compilerOptions: {
        baseUrl: ".",
        jsx: "react-jsx",
        paths: { "@/*": ["./src/*"], "~/*": ["./src/*"] },
      },
      include: ["src"],
    }),
    "utf8",
  );
  writeFileSync(join(projectRoot, "src", "index.css"), '@import "tailwindcss";\n', "utf8");
  writeFileSync(join(projectRoot, "vite.config.ts"), "export default {};\n", "utf8");
  runCliJson(
    "packed CLI migration fixture initialization",
    packedCli,
    [
      "init",
      "--cwd",
      ".",
      "--framework",
      "vite-react",
      "--source-root",
      "src",
      "--global-css",
      "src/index.css",
      "--alias-prefix",
      "@",
      "--package-manager",
      "pnpm",
      "--yes",
      "--non-interactive",
    ],
    projectRoot,
    temporaryRoot,
  );

  const components = {
    $schema: "https://ui.shadcn.com/schema.json",
    style: "new-york",
    rsc: false,
    tsx: true,
    tailwind: {
      config: "",
      css: "src/index.css",
      baseColor: "neutral",
      cssVariables: true,
      prefix: "",
    },
    iconLibrary: "lucide",
    aliases: {
      components: "~/components",
      utils: "~/lib/utils",
      ui: "~/components/ui",
      lib: "~/lib",
      hooks: "~/hooks",
    },
    registries: {},
  };
  const componentsPath = join(projectRoot, "components.json");
  writeFileSync(componentsPath, canonicalJson(components), "utf8");
  const componentsBefore = readFileSync(componentsPath);
  const migrationPlan = runCliJson(
    "packed CLI shadcn settings migration plan",
    packedCli,
    ["migrate", "shadcn", "--cwd", ".", "--plan"],
    projectRoot,
    temporaryRoot,
  );
  assert(
    migrationPlan.status === "planned" &&
      migrationPlan.result.migrations.some(
        ({ id, adapter }) => id === "shadcn-components-v1-to-mergora-v1" && adapter === "config-v1",
      ),
    "Packed CLI did not plan its built-in shadcn settings migration.",
  );
  const migrated = runCliJson(
    "packed CLI shadcn settings migration",
    packedCli,
    ["migrate", "shadcn", "--cwd", ".", "--yes", "--non-interactive"],
    projectRoot,
    temporaryRoot,
  );
  assert(
    migrated.status === "committed" &&
      migrated.result.transaction?.state === "committed" &&
      readFileSync(componentsPath).equals(componentsBefore),
    "Packed CLI shadcn settings migration did not retain components.json.",
  );
  writeFileSync(
    join(projectRoot, "tsconfig.json"),
    canonicalJson({
      compilerOptions: {
        baseUrl: ".",
        jsx: "react-jsx",
        paths: { "~/*": ["./src/*"] },
      },
      include: ["src"],
    }),
    "utf8",
  );

  const origin = "https://registry.example.test/r/v1";
  const source = 'export const Demo = "packed shadcn adoption";\n';
  const registry = {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "partner",
    homepage: "https://registry.example.test",
    items: [
      {
        $schema: "https://ui.shadcn.com/schema/registry-item.json",
        name: "demo",
        type: "registry:ui",
        title: "Demo",
        description: "A neutral packed-consumer adoption fixture.",
        dependencies: ["react"],
        devDependencies: [],
        registryDependencies: [],
        files: [
          {
            path: "components/ui/demo.tsx",
            type: "registry:ui",
            target: "@ui/demo.tsx",
            content: source,
          },
        ],
        docs: "Compatibility source; native evidence is not supplied.",
      },
    ],
  };
  const declaredIdentityDigest = semanticDigest({
    homepage: registry.homepage,
    id: registry.name,
    origin,
    protocol: "shadcn-v1",
  });
  const identityDigest = semanticDigest({
    protocol: "shadcn-v1",
    resolvedOrigin: origin,
    declaredRegistry: { id: "partner", identityDigest: declaredIdentityDigest },
    licensePolicy: { status: "not-supplied", licenses: [] },
    keyPolicy: {
      digest: "not-supplied",
      immutableReleaseManifests: false,
      signatures: "not-supplied",
    },
  });
  const environment = writeJsonFetchPreload(projectRoot, registry, `${origin}/registry.json`);
  const enrolled = runCliJson(
    "packed CLI shadcn registry enrollment",
    packedCli,
    [
      "registry",
      "enroll",
      "partner",
      origin,
      "--protocol",
      "shadcn-v1",
      "--accept-registry-identity",
      identityDigest,
    ],
    projectRoot,
    temporaryRoot,
    environment,
  );
  assert(enrolled.status === "committed", "Packed CLI did not enroll the exact shadcn registry.");
  const sourcePath = join(projectRoot, "src", "components", "ui", "demo.tsx");
  writeFileSync(sourcePath, source, "utf8");
  const sourceBefore = readFileSync(sourcePath);
  const adoptionPlan = runCliJson(
    "packed CLI shadcn adoption plan",
    packedCli,
    ["adopt", "--from", "shadcn", "demo", "--registry", "partner", "--cwd", ".", "--plan"],
    projectRoot,
    temporaryRoot,
    environment,
  );
  assert(
    adoptionPlan.status === "planned" && adoptionPlan.result.conflicts.length === 0,
    "Packed CLI did not plan exact shadcn source adoption.",
  );
  const adopted = runCliJson(
    "packed CLI shadcn adoption",
    packedCli,
    [
      "adopt",
      "--from",
      "shadcn",
      "demo",
      "--registry",
      "partner",
      "--cwd",
      ".",
      "--yes",
      "--non-interactive",
    ],
    projectRoot,
    temporaryRoot,
    environment,
  );
  const adoptedManifest = readJson(join(projectRoot, ".mergora", "manifest.json"));
  assert(
    adopted.status === "committed" &&
      adopted.result.transaction?.state === "committed" &&
      readFileSync(sourcePath).equals(sourceBefore) &&
      readFileSync(componentsPath).equals(componentsBefore) &&
      adoptedManifest.items["partner:demo"]?.lastMigration === "shadcn-v1-adapter",
    "Packed CLI shadcn adoption replaced consumer source or lost adapter provenance.",
  );
  return {
    adoption: "exact-shadcn-v1-source-preserved",
    migration: "built-in-settings-transaction",
    networkFixture: "bounded-preloaded-json",
  };
}

function verifyAdvancedPublicCliLifecycle(consumerDirectory, packedCli, temporaryRoot, vendor) {
  return {
    overlappingUpdate: verifyOverlappingUpdateAndResolution(
      consumerDirectory,
      packedCli,
      temporaryRoot,
    ),
    vendor,
    contractAudit: verifyStaticContractAudit(consumerDirectory, packedCli, temporaryRoot),
    ownershipAndRollback: verifyOwnershipRemoveAndRollback(
      consumerDirectory,
      packedCli,
      temporaryRoot,
    ),
    interruptedRecovery: verifyInterruptedRecovery(consumerDirectory, packedCli, temporaryRoot),
    migrationAndAdoption: verifyMigrationAndShadcnAdoption(
      consumerDirectory,
      packedCli,
      temporaryRoot,
    ),
  };
}

function verifySourceOnlyPackageRejection(consumerDirectory, temporaryRoot) {
  const uiPackage = join(consumerDirectory, "node_modules", ...selectedPackages.ui.split("/"));
  const manifest = readJson(join(uiPackage, "package.json"));
  assert(
    manifest.exports?.[`./${sourceOnlyWorkflowKitId}`] === undefined &&
      manifest.exports?.[`./${sourceOnlyWorkflowKitId}.css`] === undefined,
    "The source-only workflow kit leaked into the packed UI export map.",
  );
  assert(
    !existsSync(join(uiPackage, "dist", "generated", sourceOnlyWorkflowKitId)),
    "The source-only workflow kit leaked into packed UI files.",
  );
  runRejected(
    "source-only workflow-kit package import",
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `await import(${JSON.stringify(`${selectedPackages.ui}/${sourceOnlyWorkflowKitId}`)});`,
    ],
    consumerDirectory,
    temporaryRoot,
    /ERR_PACKAGE_PATH_NOT_EXPORTED|Package subpath .* is not defined by "exports"/u,
  );
  return {
    import: "rejected-not-exported",
    itemId: sourceOnlyWorkflowKitId,
    packageFiles: "absent",
  };
}

function verifyProductionOutput(consumer, consumerDirectory) {
  const outputDirectory = join(consumerDirectory, consumer.framework === "next" ? "out" : "dist");
  assert(existsSync(outputDirectory), `${consumer.id} production output is missing.`);
  const indexPath = join(outputDirectory, "index.html");
  assert(existsSync(indexPath), `${consumer.id} production index.html is missing.`);
  const files = walkFiles(outputDirectory).filter((file) => textExtensions.has(extname(file)));
  const output = files.map((file) => readFileSync(file, "utf8")).join("\n");
  for (const marker of [
    "mrg-button",
    "mrg-combobox",
    "mrg-dialog",
    "mrg-date-picker",
    "mrg-file-upload",
    "mrg-data-grid",
    ...(consumer.mode === "source" ? ["mrg-admin-dashboard-shell"] : []),
  ]) {
    assert(output.includes(marker), `${consumer.id} production bundle omits ${marker}.`);
  }
  if (consumer.mode === "package") {
    assert(
      !output.includes("mrg-admin-dashboard-shell"),
      `${consumer.id} production bundle includes the source-only workflow kit.`,
    );
  }
  assert(
    output.includes("--mrg-semantic-color-background-canvas"),
    `${consumer.id} production bundle omits semantic token CSS.`,
  );
  assert(
    output.includes("/mergora-p1/"),
    `${consumer.id} does not preserve the non-root base path.`,
  );
  for (const cliMarker of ["Transactional source commands:", 'Run "mergora <command> --help"']) {
    assert(
      !output.includes(cliMarker),
      `${consumer.id} production output bundled packed CLI implementation text.`,
    );
  }
  const workspaceMarkers = [workspaceRoot, workspaceRoot.replaceAll("\\", "/")];
  for (const marker of workspaceMarkers) {
    assert(!output.includes(marker), `${consumer.id} production output embeds the monorepo path.`);
  }
}

function contentType(path) {
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".map": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
    }[extname(path)] ?? "application/octet-stream"
  );
}

async function withProductionServer(consumer, consumerDirectory, callback) {
  const outputDirectory = join(consumerDirectory, consumer.framework === "next" ? "out" : "dist");
  const server = createServer((request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (
        pathname !== "/mergora-p1" &&
        pathname !== "/mergora-p1/" &&
        !pathname.startsWith("/mergora-p1/")
      ) {
        response.writeHead(404).end("Not found");
        return;
      }
      const encodedRelative = pathname.slice("/mergora-p1".length).replace(/^\/+/, "");
      const portableRelative = decodeURIComponent(encodedRelative) || "index.html";
      let target = resolve(outputDirectory, ...portableRelative.split("/"));
      assert(isInside(outputDirectory, target), "Production request escaped its output root.");
      if (existsSync(target) && statSync(target).isDirectory()) target = join(target, "index.html");
      if (!existsSync(target) || !statSync(target).isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": contentType(target),
      });
      response.end(readFileSync(target));
    } catch {
      response.writeHead(400).end("Bad request");
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  try {
    const address = server.address();
    assert(address !== null && typeof address === "object", "Production server has no address.");
    await callback(`http://127.0.0.1:${String(address.port)}/mergora-p1/`);
  } finally {
    await new Promise((resolvePromise, reject) => {
      // Playwright may keep an HTTP connection alive until its context closes,
      // while server.close waits for that same connection to finish. Close it
      // explicitly so source-consumer runtime evidence cannot deadlock in CI.
      server.closeAllConnections();
      server.close((error) => (error === undefined ? resolvePromise() : reject(error)));
    });
  }
}

async function verifyProductionRuntime(consumer, consumerDirectory, browser) {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => runtimeErrors.push(`page: ${error.message}`));
  try {
    await withProductionServer(consumer, consumerDirectory, async (url) => {
      const response = await page.goto(url, { waitUntil: "networkidle" });
      assert(response?.ok() === true, `${consumer.id} production route did not return success.`);
      await page.locator(`[data-consumer-mode="${consumer.mode}"]`).waitFor();
      for (const selector of [
        ".mrg-button",
        ".mrg-combobox",
        ".mrg-date-picker",
        ".mrg-file-upload",
        ".mrg-data-grid",
      ]) {
        assert(
          (await page.locator(selector).count()) > 0,
          `${consumer.id} runtime omitted ${selector}.`,
        );
      }
      assert(
        (await page.locator('input[type="date"]').count()) > 0 &&
          (await page.locator('input[type="file"]').count()) > 0,
        `${consumer.id} runtime omitted native date or file form controls.`,
      );

      const label = consumer.mode === "package" ? "packed" : "source";
      await page.getByRole("button", { name: `Open ${label} Dialog`, exact: true }).click();
      await page.getByRole("dialog").waitFor();
      await page.getByRole("button", { name: "Close", exact: true }).click();
      assert(
        (await page.getByRole("dialog").count()) === 0,
        `${consumer.id} Dialog did not close at runtime.`,
      );

      const sortableHeader = page.locator('[data-slot="data-grid-column-header"] button').first();
      await sortableHeader.click();
      assert(
        (await sortableHeader.locator("..").getAttribute("aria-sort")) === "ascending",
        `${consumer.id} Data Grid did not sort at runtime.`,
      );

      const workflowKit = page.locator(".mrg-admin-dashboard-shell");
      if (consumer.mode === "source") {
        await workflowKit.locator('[data-slot="admin-dashboard-layout"]').waitFor();
        assert(
          (await workflowKit.getByRole("heading", { name: "Operations overview" }).count()) === 1,
          `${consumer.id} source-only workflow kit did not load at runtime.`,
        );
      } else {
        assert(
          (await workflowKit.count()) === 0,
          `${consumer.id} package runtime unexpectedly includes the source-only workflow kit.`,
        );
      }
    });
    assert(
      runtimeErrors.length === 0,
      `${consumer.id} production runtime reported errors:\n${runtimeErrors.join("\n")}`,
    );
  } finally {
    await context.close();
  }
  process.stdout.write(`p1 packed consumers: ${consumer.id} production runtime passed\n`);
  return {
    hydrated: true,
    interactions: ["dialog-open-close", "data-grid-sort"],
    sourceOnlyWorkflowKit: consumer.mode === "source" ? "rendered" : "absent",
  };
}

async function verifyConsumer(
  consumer,
  matrix,
  artifacts,
  consumersDirectory,
  temporaryRoot,
  browser,
) {
  const consumerDirectory = createConsumer(consumer, matrix, artifacts, consumersDirectory);
  pnpm(
    `${consumer.id} dependency seed`,
    ["install", "--frozen-lockfile=false"],
    consumerDirectory,
    temporaryRoot,
  );
  const cliVersion = pnpm(
    `${consumer.id} packed CLI version`,
    ["exec", "mergora", "--version"],
    consumerDirectory,
    temporaryRoot,
  ).trim();
  assert(cliVersion === "0.0.0", `${consumer.id} did not execute the packed P1 CLI.`);

  let sourceInstall = null;
  let sourceLifecycle = null;
  let publicCliLifecycle = null;
  if (consumer.mode === "source") {
    const installedSource = installSource(consumerDirectory, temporaryRoot);
    pnpm(
      `${consumer.id} source dependency lock`,
      ["install", "--frozen-lockfile=false"],
      consumerDirectory,
      temporaryRoot,
    );
    const vendor =
      consumer.id === "next-source"
        ? verifyOfflineVendor(consumerDirectory, installedSource.packedCli, temporaryRoot)
        : null;
    sourceLifecycle = verifyCustomizedSourceLifecycle(
      consumerDirectory,
      installedSource.packedCli,
      temporaryRoot,
    );
    if (consumer.id === "next-source") {
      publicCliLifecycle = verifyAdvancedPublicCliLifecycle(
        consumerDirectory,
        installedSource.packedCli,
        temporaryRoot,
        vendor,
      );
    }
    sourceInstall = {
      command: `node node_modules/${selectedPackages.cli}/dist/bin.js init --cwd . --yes --non-interactive --json && node node_modules/${selectedPackages.cli}/dist/bin.js add ${packedSourceRequestIds.join(" ")} --root . --target src/components --yes --non-interactive --json`,
      files: Object.values(
        readJson(join(consumerDirectory, ".mergora", "manifest.json")).items,
      ).flatMap((item) => item.files).length,
      sourceTreeSha256: sourceTreeDigest(consumerDirectory),
    };
  }

  removeInside(temporaryRoot, join(consumerDirectory, "node_modules"));
  pnpm(
    `${consumer.id} frozen offline install`,
    ["install", "--offline", "--frozen-lockfile"],
    consumerDirectory,
    temporaryRoot,
  );
  auditInstalledPackages(consumerDirectory, temporaryRoot);
  const sourceOnlyPackageRejection =
    consumer.mode === "package"
      ? verifySourceOnlyPackageRejection(consumerDirectory, temporaryRoot)
      : null;
  const mcpSmoke = pnpm(
    `${consumer.id} packed MCP smoke`,
    [
      "exec",
      "node",
      "--input-type=module",
      "--eval",
      'import { createMergoraMcpServer } from "mergora-mcp"; const server = createMergoraMcpServer(); process.stdout.write(`${server.listTools().length}/${server.listResources().length}/${String(server.applyCapability)}`);',
    ],
    consumerDirectory,
    temporaryRoot,
  ).trim();
  assert(mcpSmoke === "20/3/false", `${consumer.id} packed MCP capability surface drifted.`);
  pnpm(`${consumer.id} typecheck`, ["run", "typecheck"], consumerDirectory, temporaryRoot);
  pnpm(`${consumer.id} production build`, ["run", "build"], consumerDirectory, temporaryRoot);
  verifyProductionOutput(consumer, consumerDirectory);
  const runtime = await verifyProductionRuntime(consumer, consumerDirectory, browser);

  return {
    assertions: [
      "all-mergora-inputs-are-exact-tarballs",
      ...(consumer.mode === "source"
        ? ["customized-source-update-and-lifecycle"]
        : ["source-only-workflow-kit-not-package-exported"]),
      ...(publicCliLifecycle === null ? [] : ["packed-public-cli-lifecycle"]),
      "frozen-offline-reinstall",
      "no-workspace-resolution",
      "packed-cli-executed",
      "packed-mcp-read-plan-only",
      "production-base-path",
      "production-build",
      "production-hydration-and-interaction",
      "public-subpaths-and-types",
      "representative-primitive-composite-date-file-grid-workflow-coverage",
    ],
    basePath: matrix.basePath,
    framework: consumer.framework,
    id: consumer.id,
    mode: consumer.mode,
    result: "passed",
    runtime,
    publicCliLifecycle,
    sourceInstall,
    sourceLifecycle,
    sourceOnlyPackageRejection,
  };
}

function evidenceFor(matrix, artifacts, consumers) {
  return {
    schemaVersion: 1,
    artifactKind: "p1-packed-consumer-evidence",
    artifactDigestAlgorithm: "sha256-canonical-tar-content-v1",
    publicationStatus: "unreleased",
    runtime: {
      node: process.version.slice(1),
      packageManager: matrix.packageManager,
    },
    artifacts: artifacts.map(({ file, name, role, sha256: digest, version }) => ({
      file,
      name,
      role,
      sha256: digest,
      version,
    })),
    consumers: [...consumers].sort((left, right) => left.id.localeCompare(right.id, "en-US")),
    limitations: [
      "This unreleased exact-tarball matrix proves fresh package/source installation, representative compilation, production builds, and headless Chromium hydration in Next.js and Vite.",
      "The source lifecycle proof covers local customization classification, upstream diff, disjoint and overlapping Semantic Sync updates, local-only conflict packets, explicit resolution, ownership-aware removal and rollback, injected-interruption recovery, static Contract Audit, offline local-vendor verification, built-in shadcn settings migration, and exact shadcn-v1 adoption.",
      "The shadcn-v1 adoption uses a bounded deterministic JSON fetch preload, and the offline vendor is honestly labeled unreleased-local; public registry networking and formal Stable-release vendor provenance remain separate gates.",
      "Public npm provenance, non-Chromium runtime coverage, and manual assistive-technology review remain separate gates.",
    ],
  };
}

function parseArguments(arguments_) {
  if (arguments_.length === 0) return { writeEvidence: false };
  if (arguments_.length === 1 && arguments_[0] === "--write-evidence") {
    return { writeEvidence: true };
  }
  if (arguments_.length === 1 && ["--help", "-h"].includes(arguments_[0])) {
    process.stdout.write(
      "Usage: node scripts/verify-p1-consumers.mjs [--write-evidence]\n\n" +
        "Runs the exact packed Next/Vite source/package matrix. The default compares\n" +
        "the deterministic result with tracked evidence; --write-evidence refreshes it.\n",
    );
    process.exit(0);
  }
  throw new Error(`Unknown packed consumer argument: ${arguments_.join(" ")}`);
}

let temporaryRoot;
let browser;
try {
  const options = parseArguments(process.argv.slice(2));
  const expectedNode = readFileSync(join(workspaceRoot, ".node-version"), "utf8").trim();
  assert(process.version === `v${expectedNode}`, `Packed consumers require Node ${expectedNode}.`);
  const matrix = readJson(matrixPath);
  validateMatrix(matrix);

  temporaryRoot = mkdtempSync(join(realpathSync(tmpdir()), temporaryPrefix));
  assert(
    !isInside(workspaceRoot, temporaryRoot),
    "Packed consumer root must be outside the monorepo.",
  );
  const artifactDirectory = join(temporaryRoot, "artifacts");
  const consumersDirectory = join(temporaryRoot, "consumers");
  mkdirSync(artifactDirectory);
  mkdirSync(consumersDirectory);

  const artifacts = buildAndPack(artifactDirectory, temporaryRoot);
  browser = await chromium.launch({ headless: true });
  const consumers = [];
  for (const consumer of matrix.consumers) {
    consumers.push(
      await verifyConsumer(consumer, matrix, artifacts, consumersDirectory, temporaryRoot, browser),
    );
  }
  const evidence = canonicalJson(evidenceFor(matrix, artifacts, consumers));
  if (options.writeEvidence) {
    writeFileSync(evidencePath, evidence, "utf8");
    process.stdout.write("p1 packed consumers: deterministic evidence updated\n");
  } else {
    assert(
      existsSync(evidencePath),
      "Packed consumer evidence is missing; run with --write-evidence after review.",
    );
    assert(
      readFileSync(evidencePath, "utf8") === evidence,
      "Packed consumer evidence drifted; inspect the suite and refresh it intentionally with --write-evidence.",
    );
    process.stdout.write("p1 packed consumers: deterministic evidence matches\n");
  }
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(
    `p1 packed consumer verification failed: ${sanitize(message, temporaryRoot)}\n`,
  );
  process.exitCode = 1;
} finally {
  if (browser !== undefined) await browser.close();
  if (
    temporaryRoot !== undefined &&
    existsSync(temporaryRoot) &&
    lstatSync(temporaryRoot).isDirectory()
  ) {
    removeTemporaryRoot(temporaryRoot);
  }
}
