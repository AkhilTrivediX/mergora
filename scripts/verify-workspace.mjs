import { spawnSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

const architecturePackages = [
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
  "packages/test-utils",
  "packages/eslint-config",
  "packages/typescript-config",
  "tooling/registry-builder",
  "tooling/source-transformer",
  "tooling/package-builder",
  "tooling/docs-builder",
  "tooling/passport-builder",
  "tooling/contract-runner",
  "tooling/token-compiler",
];

const requiredRootScripts = [
  "dev",
  "build",
  "generate",
  "generated:check",
  "check",
  "lint",
  "typecheck",
  "test",
  "test:browser",
  "test:e2e",
  "test:visual",
  "test:a11y",
  "test:consumer",
  "test:compat",
  "pack:all",
  "release:verify",
];

const executableQualityGateScripts = {
  "test:e2e": "node scripts/run-quality-gate.mjs e2e",
  "test:visual": "node scripts/run-quality-gate.mjs visual",
  "test:a11y": "node scripts/run-quality-gate.mjs a11y",
  "test:compat": "node scripts/run-quality-gate.mjs compat",
  "release:verify": "node scripts/run-quality-gate.mjs release",
};

const pinnedCatalog = {
  "@changesets/cli": "2.31.1",
  "@playwright/test": "1.61.1",
  "@tanstack/react-table": "8.21.3",
  "@testing-library/dom": "10.4.1",
  "axe-core": "4.12.1",
  eslint: "10.7.0",
  next: "16.2.10",
  postcss: "8.5.19",
  prettier: "3.9.5",
  react: "19.2.7",
  "react-aria-components": "1.19.0",
  "react-dom": "19.2.7",
  storybook: "10.5.2",
  tailwindcss: "4.3.3",
  turbo: "2.10.5",
  typescript: "6.0.3",
  "typescript-eslint": "8.64.0",
  vite: "8.1.5",
  vitest: "4.1.10",
};

const publicPackageDirectories = {
  contracts: "packages/contracts",
  mcp: "packages/mcp",
  registry: "packages/registry",
  schema: "packages/schema",
  tokens: "packages/tokens",
  ui: "packages/ui",
};

const selectedPublicPackageMap = {
  cli: { package: "mergora", bin: "mergora" },
  public: {
    ui: "mergora-ui",
    tokens: "mergora-tokens",
    schema: "mergora-schema",
    registry: "mergora-registry",
    contracts: "mergora-contracts",
    mcp: "mergora-mcp",
  },
};

async function readJson(path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

async function exists(path) {
  try {
    await stat(join(root, path));
    return true;
  } catch {
    return false;
  }
}

async function filesBelow(path) {
  const absolute = join(root, path);
  if (!(await exists(path))) return [];
  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const child = join(path, entry.name);
      return entry.isDirectory() ? filesBelow(child) : [child.split(sep).join("/")];
    }),
  );
  return nested.flat();
}

function fail(message) {
  process.stderr.write(`workspace verification failed: ${message}\n`);
  process.exitCode = 1;
}

async function verifyScaffold() {
  const packageJson = await readJson("package.json");
  const publicPackages = await readJson("config/public-packages.json");
  if (packageJson.packageManager !== "pnpm@11.14.0") {
    fail("packageManager must be pinned to pnpm@11.14.0");
  }
  if (packageJson.volta?.node !== "24.12.0") {
    fail("Node policy must be pinned to 24.12.0");
  }

  for (const script of requiredRootScripts) {
    const command = packageJson.scripts?.[script];
    if (typeof command !== "string" || command.trim() === "") {
      fail(`root script ${script} is missing`);
    }
    if (/process\.exit\(0\)|echo\s+(ok|todo|pass)/iu.test(command ?? "")) {
      fail(`root script ${script} is a success stub`);
    }
  }
  for (const [script, expected] of Object.entries(executableQualityGateScripts)) {
    if (packageJson.scripts?.[script] !== expected) {
      fail(`root script ${script} must execute its concrete quality-gate runner`);
    }
  }

  const publicDirs = new Set(["packages/cli", ...Object.values(publicPackageDirectories)]);
  for (const directory of architecturePackages) {
    if (!(await exists(`${directory}/package.json`))) {
      fail(`${directory}/package.json is missing`);
      continue;
    }
    const workspacePackage = await readJson(`${directory}/package.json`);
    if (workspacePackage.private !== true && !publicDirs.has(directory)) {
      fail(`${directory} must remain private while it is a P0 scaffold`);
    }
  }

  if (publicPackages.repository !== "https://github.com/AkhilTrivediX/mergora") {
    fail("public package map repository must match the locked public monorepo");
  }
  if (publicPackages.selectionStatus !== "verified") {
    fail("public package map selectionStatus must lock the authenticated verified selection");
  }
  if (publicPackages.selectionTier !== "approved-unscoped") {
    fail("public package map must lock the approved unscoped selection tier");
  }
  if (
    JSON.stringify(publicPackages.cli) !== JSON.stringify(selectedPublicPackageMap.cli) ||
    JSON.stringify(publicPackages.public) !== JSON.stringify(selectedPublicPackageMap.public)
  ) {
    fail("public package map drifted from the verified approved unscoped tier");
  }
  if (
    publicPackages.resolvedBlockerId !== "EXT-NPM-AUTH-001" ||
    Object.hasOwn(publicPackages, "blockerId")
  ) {
    fail("public package map must record npm authentication as resolved, not active");
  }
  const availabilityEvidence = publicPackages.availabilityEvidence;
  const selectedLookups = availabilityEvidence?.selectedPackageLookups;
  const expectedLookups = [
    selectedPublicPackageMap.cli.package,
    ...Object.values(selectedPublicPackageMap.public),
  ].sort();
  if (
    availabilityEvidence?.authentication !== "authenticated-read-only-checks-completed" ||
    availabilityEvidence?.authenticatedOwner !== "redacted" ||
    availabilityEvidence?.credentialMaterialRecorded !== false ||
    availabilityEvidence?.legalClearanceClaimed !== false ||
    JSON.stringify(Object.keys(selectedLookups ?? {}).sort()) !== JSON.stringify(expectedLookups) ||
    !Object.values(selectedLookups ?? {}).every((result) => result === "e404")
  ) {
    fail("public package map must retain complete redacted authenticated selection evidence");
  }

  const cliPackage = await readJson("packages/cli/package.json");
  if (cliPackage.name !== publicPackages.cli?.package) {
    fail("CLI package name must derive from config/public-packages.json");
  }
  if (!(publicPackages.cli?.bin in (cliPackage.bin ?? {}))) {
    fail("CLI binary name must derive from config/public-packages.json");
  }

  for (const [key, directory] of Object.entries(publicPackageDirectories)) {
    const workspacePackage = await readJson(`${directory}/package.json`);
    if (workspacePackage.name !== publicPackages.public?.[key]) {
      fail(`${directory} name must derive from config/public-packages.json public.${key}`);
    }
  }

  const generatedCliPackageMap = await readFile(
    join(root, "packages/cli/src/generated-public-package-map.ts"),
    "utf8",
  );
  for (const [exportName, value] of [
    ["PUBLIC_CLI_PACKAGE", publicPackages.cli.package],
    ["PUBLIC_CLI_BIN", publicPackages.cli.bin],
    ["PUBLIC_UI_PACKAGE", publicPackages.public.ui],
  ]) {
    if (!generatedCliPackageMap.includes(`export const ${exportName} = ${JSON.stringify(value)}`)) {
      fail(`generated CLI ${exportName} must derive from config/public-packages.json`);
    }
  }

  const workspace = await readFile(join(root, "pnpm-workspace.yaml"), "utf8");
  for (const [name, version] of Object.entries(pinnedCatalog)) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const entry = new RegExp(`["']?${escapedName}["']?:\\s+${version.replaceAll(".", "\\.")}`, "u");
    if (!entry.test(workspace)) fail(`catalog pin ${name}@${version} is missing`);
  }
  for (const setting of [
    "autoInstallPeers: false",
    "blockExoticSubdeps: true",
    "engineStrict: true",
    "pmOnFail: error",
    "strictPeerDependencies: true",
  ]) {
    if (!workspace.includes(setting)) fail(`workspace security setting ${setting} is missing`);
  }

  const npmrc = await readFile(join(root, ".npmrc"), "utf8");
  if (
    !npmrc.includes("registry=https://registry.npmjs.org/") ||
    !npmrc.includes("provenance=true")
  ) {
    fail(".npmrc must pin the public registry and provenance without project credentials");
  }
  if (/(?:_auth|token|password)\s*=/iu.test(npmrc)) {
    fail(".npmrc must not contain project credentials");
  }

  const tracked = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (tracked.error !== undefined || tracked.status !== 0) {
    fail("tracked-private-data policy requires a readable Git index");
  } else {
    const privateTrackedPaths = tracked.stdout
      .split("\0")
      .filter(Boolean)
      .filter((path) => {
        const normalized = path.replaceAll("\\", "/");
        const name = normalized.split("/").at(-1) ?? "";
        return (
          normalized.startsWith("PLANS/") ||
          normalized.startsWith(".codex-runs/") ||
          normalized.startsWith(".secrets/") ||
          normalized === ".npmrc.local" ||
          (/^\.env(?:\..+)?$/u.test(normalized) && normalized !== ".env.example") ||
          /^credentials(?:\..+)?\.json$/u.test(name) ||
          /\.credentials\.json$/u.test(name)
        );
      });
    if (privateTrackedPaths.length > 0) {
      fail(`private guidance or credentials are tracked: ${privateTrackedPaths.join(", ")}`);
    }
  }

  const gitignore = await readFile(join(root, ".gitignore"), "utf8");
  for (const ignored of ["PLANS/", ".codex-runs/", "credentials.json", ".npmrc.local"]) {
    if (!gitignore.split(/\r?\n/u).includes(ignored)) {
      fail(`.gitignore must explicitly exclude ${ignored}`);
    }
  }

  const normalizedFiles = [
    "package.json",
    "pnpm-workspace.yaml",
    "turbo.json",
    "tsconfig.base.json",
    ".editorconfig",
    ".gitattributes",
  ];
  for (const path of normalizedFiles) {
    const bytes = await readFile(join(root, path));
    if (bytes.includes(13)) fail(`${path} contains CR bytes; scaffold policy requires LF`);
  }

  const workflowFiles = (await filesBelow(".github/workflows")).filter((path) =>
    /\.ya?ml$/u.test(path),
  );
  for (const path of workflowFiles) {
    const workflow = await readFile(join(root, path), "utf8");
    if (!/^permissions:/mu.test(workflow)) {
      fail(`${path} must declare workflow-level permissions`);
    }
    if (/^\s*pull_request_target:/mu.test(workflow)) {
      fail(`${path} must not execute untrusted pull requests with target-branch authority`);
    }
    if (/^\s*permissions:\s*write-all\s*$/mu.test(workflow)) {
      fail(`${path} must not request write-all permission`);
    }
    for (const match of workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gmu)) {
      const action = match[1] ?? "";
      if (!action.startsWith("./") && !/@[a-f0-9]{40}$/u.test(action)) {
        fail(`${path} action ${action} is not pinned to a full commit SHA`);
      }
    }
    if (/^\s*(?:NODE_AUTH_TOKEN|NPM_TOKEN):/gmu.test(workflow)) {
      fail(`${path} must not use a long-lived npm publish token`);
    }
  }

  if (process.exitCode) return;
  process.stdout.write(
    `workspace verification passed: ${architecturePackages.length} private packages/apps/tooling entries, ${Object.keys(pinnedCatalog).length} locked catalog versions, and ${workflowFiles.length} pinned workflows\n`,
  );
}

function runExecutableGate(name) {
  const result = spawnSync(process.execPath, ["scripts/run-quality-gate.mjs", name], {
    cwd: root,
    env: process.env,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error !== undefined) {
    fail(`gate ${name} could not start: ${result.error.message}`);
  } else if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}

async function verifyGenerateGate() {
  const required = [
    "registry/source/tokens/primitives.tokens.json",
    "packages/tokens/src/generated/canonical.dtcg.json",
    "registry/generated/catalog.json",
    "content/generated/search-index.json",
    "tooling/token-compiler/src/cli.mjs",
    "tooling/registry-builder/src/cli.ts",
  ];
  const missing = [];
  for (const path of required) {
    if (!(await exists(path))) missing.push(path);
  }
  if (missing.length > 0) {
    fail(`generate gate is missing owned artifacts: ${missing.join(", ")}`);
    return;
  }
  process.stdout.write(
    "generate gate passed: canonical tokens and deterministic registry/content outputs exist; dedicated drift checks ran before this probe\n",
  );
}

async function verifyP1PackedGate(name) {
  const required = [
    "scripts/verify-p1-consumers.mjs",
    "tests/packed-consumers/matrix.json",
    "tests/packed-consumers/evidence.json",
    "tests/packed-consumers/packed-consumer-contract.test.ts",
  ];
  const missing = [];
  for (const path of required) {
    if (!(await exists(path))) missing.push(path);
  }
  if (missing.length > 0) {
    fail(`${name} gate is missing packed-consumer artifacts: ${missing.join(", ")}`);
    return;
  }

  const matrix = await readJson("tests/packed-consumers/matrix.json");
  const evidence = await readJson("tests/packed-consumers/evidence.json");
  const packageJson = await readJson("package.json");
  const expectedConsumers = ["next-package", "next-source", "vite-package", "vite-source"];
  const publicPackages = await readJson("config/public-packages.json");
  const expectedPackages = [
    publicPackages.public.schema,
    publicPackages.public.tokens,
    publicPackages.public.ui,
    publicPackages.cli.package,
  ].sort();
  if (
    matrix.packageManager !== "pnpm@11.14.0" ||
    JSON.stringify(matrix.consumers?.map(({ id }) => id).sort()) !==
      JSON.stringify(expectedConsumers)
  ) {
    fail(`${name} gate packed-consumer matrix is incomplete or unpinned`);
    return;
  }
  if (
    evidence.artifactKind !== "p1-packed-consumer-evidence" ||
    evidence.publicationStatus !== "unreleased" ||
    JSON.stringify(evidence.artifacts?.map(({ name: packageName }) => packageName).sort()) !==
      JSON.stringify(expectedPackages) ||
    !evidence.artifacts?.every(({ sha256 }) => /^[a-f0-9]{64}$/u.test(sha256)) ||
    JSON.stringify(evidence.consumers?.map(({ id }) => id).sort()) !==
      JSON.stringify(expectedConsumers) ||
    !evidence.consumers?.every(({ result }) => result === "passed")
  ) {
    fail(`${name} gate deterministic packed-consumer evidence is incomplete`);
    return;
  }
  if (
    packageJson.scripts?.[name === "consumer" ? "test:consumer" : "pack:all"] !==
    "node scripts/verify-p1-consumers.mjs"
  ) {
    fail(`${name} gate root runner does not execute the full packed-consumer matrix`);
    return;
  }
  process.stdout.write(
    `gate ${name} passed: concrete P1 packed-consumer prerequisites and deterministic evidence exist; the root runner executes the full clean matrix\n`,
  );
}

const gateIndex = process.argv.indexOf("--gate");
if (gateIndex === -1) {
  await verifyScaffold();
} else {
  const gate = process.argv[gateIndex + 1];
  if (gate === "generate") await verifyGenerateGate();
  else if (gate === "consumer" || gate === "pack") await verifyP1PackedGate(gate);
  else if (["a11y", "compat", "e2e", "release", "visual"].includes(gate)) {
    runExecutableGate(gate);
  } else fail(`unknown gate ${String(gate)}`);
}
