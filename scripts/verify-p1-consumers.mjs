import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

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

const requiredUiExports = [
  ".",
  "./button",
  "./button.css",
  "./combobox",
  "./combobox.css",
  "./dialog",
  "./dialog.css",
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
const packedSourceRequestIds = ["button", "dialog", "combobox"];

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

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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

function run(label, command, arguments_, cwd, temporaryRoot) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "1",
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
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
      manifest.version === "0.0.0",
      `${definition.name} must use the bounded P1 version 0.0.0.`,
    );
    assert(
      manifest.private === true,
      `${definition.name} must remain visibly unreleased during P1.`,
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
      sha256: sha256(bytes),
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
  run(
    "packed CLI initialization",
    process.execPath,
    [packedCli, "init", "--cwd", ".", "--yes", "--non-interactive", "--json"],
    consumerDirectory,
    temporaryRoot,
  );
  const output = run(
    "packed CLI source add",
    process.execPath,
    [
      packedCli,
      "add",
      ...packedSourceRequestIds,
      "--root",
      ".",
      "--target",
      "src/components",
      "--yes",
      "--non-interactive",
      "--json",
    ],
    consumerDirectory,
    temporaryRoot,
  );
  const envelopes = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const value = JSON.parse(line);
        return value?.schemaVersion === 1 && value?.command === "add" ? [value] : [];
      } catch {
        return [];
      }
    });
  assert(envelopes.length > 0, "Packed CLI add did not emit JSON.");
  assert(
    envelopes.length === 1,
    `Packed CLI add emitted ${String(envelopes.length)} result envelopes: ${JSON.stringify(envelopes.map(({ status, result }) => ({ mode: result?.mode, status })))}`,
  );
  const envelope = envelopes[0];
  assert(envelope.ok === true && envelope.exitCode === 0, "Packed CLI add envelope failed.");
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
  assert(
    readJson(join(consumerDirectory, "package.json")).dependencies?.["react-aria-components"] ===
      "1.19.0",
    "Packed CLI add did not patch the exact React Aria dependency.",
  );
  assert(
    result.manifest === ".mergora/manifest.json",
    "Packed CLI add manifest path is incorrect.",
  );
  return result;
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

function verifyProductionOutput(consumer, consumerDirectory) {
  const outputDirectory = join(consumerDirectory, consumer.framework === "next" ? "out" : "dist");
  assert(existsSync(outputDirectory), `${consumer.id} production output is missing.`);
  const indexPath = join(outputDirectory, "index.html");
  assert(existsSync(indexPath), `${consumer.id} production index.html is missing.`);
  const files = walkFiles(outputDirectory).filter((file) => textExtensions.has(extname(file)));
  const output = files.map((file) => readFileSync(file, "utf8")).join("\n");
  for (const marker of ["mrg-button", "mrg-combobox", "mrg-dialog"]) {
    assert(output.includes(marker), `${consumer.id} production bundle omits ${marker}.`);
  }
  assert(
    output.includes("--mrg-semantic-color-background-canvas"),
    `${consumer.id} production bundle omits semantic token CSS.`,
  );
  assert(
    output.includes("/mergora-p1/"),
    `${consumer.id} does not preserve the non-root base path.`,
  );
  const workspaceMarkers = [workspaceRoot, workspaceRoot.replaceAll("\\", "/")];
  for (const marker of workspaceMarkers) {
    assert(!output.includes(marker), `${consumer.id} production output embeds the monorepo path.`);
  }
}

function verifyConsumer(consumer, matrix, artifacts, consumersDirectory, temporaryRoot) {
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
  if (consumer.mode === "source") {
    installSource(consumerDirectory, temporaryRoot);
    pnpm(
      `${consumer.id} source dependency lock`,
      ["install", "--frozen-lockfile=false"],
      consumerDirectory,
      temporaryRoot,
    );
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

  return {
    assertions: [
      "all-mergora-inputs-are-exact-tarballs",
      "frozen-offline-reinstall",
      "no-workspace-resolution",
      "packed-cli-executed",
      "packed-mcp-read-plan-only",
      "production-base-path",
      "production-build",
      "public-subpaths-and-types",
    ],
    basePath: matrix.basePath,
    framework: consumer.framework,
    id: consumer.id,
    mode: consumer.mode,
    result: "passed",
    sourceInstall,
  };
}

function evidenceFor(matrix, artifacts, consumers) {
  return {
    schemaVersion: 1,
    artifactKind: "p1-packed-consumer-evidence",
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
      "This P1 tracer proves fresh installation, package/source compilation, and production builds only.",
      "Browser interaction, assistive-technology review, Semantic Sync updates, and public npm provenance remain separate gates.",
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
  const consumers = matrix.consumers.map((consumer) =>
    verifyConsumer(consumer, matrix, artifacts, consumersDirectory, temporaryRoot),
  );
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
  if (
    temporaryRoot !== undefined &&
    existsSync(temporaryRoot) &&
    lstatSync(temporaryRoot).isDirectory()
  ) {
    removeTemporaryRoot(temporaryRoot);
  }
}
