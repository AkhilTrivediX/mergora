import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const corepack =
  process.platform === "win32"
    ? {
        tool: process.execPath,
        prefix: [
          resolve(dirname(process.execPath), "node_modules", "corepack", "dist", "corepack.js"),
        ],
      }
    : { tool: "corepack", prefix: [] };

const node = (label, ...args) => ({ label, runner: "node", args });
const pnpm = (label, ...args) => ({ label, runner: "pnpm", args });

const unitSteps = [
  pnpm(
    "component, contract, harness, kit, MCP, scaffold, and token unit suites",
    "exec",
    "vitest",
    "run",
    "tests/components",
    "tests/contracts",
    "tests/harness",
    "tests/kits",
    "tests/mcp",
    "tests/scaffold",
    "tests/tokens",
  ),
];

const storySteps = [
  pnpm(
    "Storybook inventory, environment, semantic-token controls, and maturity truth",
    "exec",
    "vitest",
    "run",
    "tests/storybook",
    "tests/generation/implementation-matrix.test.ts",
  ),
  pnpm(
    "generated token prerequisite for the isolated Storybook build",
    "--filter",
    "mergora-tokens",
    "build",
  ),
  pnpm(
    "production Storybook build with every catalog story",
    "--filter",
    "@mergora/storybook",
    "build",
  ),
];

const cliSteps = [
  pnpm(
    "CLI planning, acquisition, lifecycle, security, and transaction suites",
    "exec",
    "vitest",
    "run",
    "tests/cli-",
    "--exclude",
    "tests/cli-browser-audit/official-browser-cli.test.ts",
    "--maxWorkers",
    "4",
  ),
  pnpm(
    "packed CLI official-browser audit suite with exclusive shared output",
    "exec",
    "vitest",
    "run",
    "tests/cli-browser-audit/official-browser-cli.test.ts",
  ),
];

const registrySteps = [
  node("canonical catalog contract", "--test", "registry/definitions/catalog.test.ts"),
  pnpm(
    "registry acquisition, enrollment, trust-boundary, generation, and schema suites",
    "exec",
    "vitest",
    "run",
    "tests/cli-acquisition",
    "tests/cli-registry-management",
    "tests/cli-security/registry-metadata-security.test.ts",
    "tests/generation",
    "tests/schemas",
  ),
];

const mergeSteps = [
  pnpm(
    "semantic merge fixtures, update behavior, and overlap safety",
    "exec",
    "vitest",
    "run",
    "tests/merge-fixtures",
    "tests/cli-semantic-sync",
    "tests/cli-security/update-merge-security.test.ts",
  ),
];

const siteSteps = [
  pnpm(
    "site search, Studio, Quality Lens, and install-basket models",
    "exec",
    "vitest",
    "run",
    "tests/web",
  ),
  node("documentation link integrity", "scripts/verify-document-links.mjs"),
];

const manualPreparationSteps = [
  node(
    "blank manual accessibility and real-device evidence workspace",
    "scripts/prepare-manual-evidence.mjs",
  ),
];

const evidenceSteps = [
  pnpm(
    "evidence vocabulary, maturity, environment, parity, matrix, visual, and packed-record policy",
    "exec",
    "vitest",
    "run",
    "tests/harness/evidence-runtime.test.ts",
    "tests/harness/maturity.test.ts",
    "tests/harness/package-source-parity.test.ts",
    "tests/harness/state-environment.test.ts",
    "tests/generation/implementation-matrix.test.ts",
    "tests/visual/visual-baseline-policy.test.ts",
    "tests/packed-consumers/packed-consumer-contract.test.ts",
  ),
];

const apiValidationSteps = [
  pnpm(
    "canonical exports, generated API inventory, package identity, and source parity",
    "exec",
    "vitest",
    "run",
    "tests/generation/generation.test.ts",
    "tests/generation/public-package-identity.test.ts",
    "tests/harness/package-source-parity.test.ts",
    "tests/compatibility/react-aria-exact-optional.test.ts",
  ),
];

const registryValidationSteps = [
  pnpm("deterministic registry and token artifact drift", "run", "generated:check"),
  node("canonical catalog schema and inventory", "--test", "registry/definitions/catalog.test.ts"),
  pnpm(
    "registry document schemas and immutable release references",
    "exec",
    "vitest",
    "run",
    "tests/schemas/schema-source.test.ts",
    "tests/generation/release-protocol.test.ts",
  ),
];

const docsValidationSteps = [
  node("documentation link integrity", "scripts/verify-document-links.mjs"),
  pnpm(
    "generated documentation navigation, search, and route data",
    "exec",
    "vitest",
    "run",
    "tests/web/site-search-index.test.ts",
    "tests/web/site-search-model.test.ts",
    "tests/web/quality-lens-model.test.ts",
    "tests/storybook/storybook-globals.test.ts",
  ),
];

const licenseValidationSteps = [
  node(
    "release-package metadata, production dependency licenses, and bundled font notices",
    "scripts/validate-licenses.mjs",
  ),
];

const gateDefinitions = {
  unit: unitSteps,
  stories: storySteps,
  cli: cliSteps,
  registry: registrySteps,
  merge: mergeSteps,
  site: siteSteps,
  "manual-prepare": manualPreparationSteps,
  evidence: evidenceSteps,
  api: apiValidationSteps,
  "registry-validate": registryValidationSteps,
  "docs-validate": docsValidationSteps,
  licenses: licenseValidationSteps,
  e2e: [
    pnpm(
      "production static-site end-to-end flows",
      "exec",
      "playwright",
      "test",
      "--config",
      "tests/web/playwright.config.ts",
    ),
  ],
  visual: [
    node(
      "cross-browser cross-commit visual comparison and rendered diff evidence",
      "scripts/run-visual-regression.mjs",
    ),
  ],
  a11y: [
    pnpm(
      "cross-browser axe, semantic, keyboard, focus, RTL, motion, and forced-color checks",
      "exec",
      "playwright",
      "test",
      "--config",
      "playwright.config.ts",
      "--grep",
      "@a11y",
    ),
  ],
  performance: [
    node(
      "production route JavaScript and Lighthouse mobile budgets",
      "scripts/verify-site-performance.mjs",
    ),
  ],
  compat: [
    node("pinned workspace and supply-chain policy", "scripts/verify-workspace.mjs"),
    pnpm(
      "TypeScript and dependency compatibility sentinels",
      "exec",
      "vitest",
      "run",
      "tests/compatibility",
    ),
    node("pinned shadcn schema and CLI compatibility", "scripts/verify-shadcn-client.mjs"),
  ],
  release: [
    node("pinned workspace, workflow, and tracked-privacy policy", "scripts/verify-workspace.mjs"),
    pnpm("production dependency moderate-or-higher audit", "run", "audit:production"),
    pnpm("all dependency high-or-critical audit", "run", "audit:high"),
    ...licenseValidationSteps,
    ...registryValidationSteps,
    ...apiValidationSteps,
    ...docsValidationSteps,
    ...evidenceSteps,
    node("pinned shadcn schema and CLI compatibility", "scripts/verify-shadcn-client.mjs"),
    pnpm("format policy", "run", "format:check"),
    pnpm("lint policy", "run", "lint"),
    pnpm("root and workspace type safety", "run", "typecheck"),
    pnpm("unit, schema, registry, CLI, transaction, and security suites", "run", "test"),
    pnpm("production workspace build", "run", "build", {
      MERGORA_SITE_ORIGIN: "https://mergora.vercel.app",
    }),
    node("Quality Lab assembly into the static site artifact", "scripts/assemble-quality-lab.mjs"),
    node("Vercel static export integrity", "scripts/verify-static-export.mjs", {
      MERGORA_SITE_ORIGIN: "https://mergora.vercel.app",
    }),
    pnpm("production route and Lighthouse performance budgets", "run", "test:performance"),
    pnpm(
      "browser, component, accessibility, visual, and production web matrix",
      "run",
      "test:browser",
    ),
    pnpm("immutable cross-commit visual baseline and rendered diff matrix", "run", "test:visual"),
    pnpm("exact-tarball package/source Next.js and Vite consumers", "run", "test:consumer"),
    pnpm("workspace, dependency, and pinned shadcn compatibility", "run", "test:compat"),
  ],
};

function splitStep(step) {
  const values = [...step.args];
  const final = values.at(-1);
  const env =
    typeof final === "object" && final !== null && !Array.isArray(final) ? values.pop() : {};
  return { args: values, env };
}

function commandFor(step) {
  const { args, env } = splitStep(step);
  if (step.runner === "node") return { command: process.execPath, args, env };
  return {
    command: corepack.tool,
    args: [...corepack.prefix, "pnpm@11.14.0", ...args],
    env,
  };
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${String(result.status)}: ${(result.stderr || result.stdout).trim()}`,
    );
  }
  return result.stdout.trim();
}

function trackedStatus() {
  return runCapture("git", ["status", "--porcelain=v1", "--untracked-files=all"]);
}

function requireCleanReleaseCheckout() {
  const status = trackedStatus();
  if (status !== "") {
    throw new Error(
      "release verification requires a clean checkout so evidence cannot combine committed and local source",
    );
  }
}

function runStep(step, index, count) {
  const { command, args, env } = commandFor(step);
  process.stdout.write(`\n[quality gate ${String(index + 1)}/${String(count)}] ${step.label}\n`);
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      CI: process.env.CI ?? "1",
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
      ...env,
    },
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${step.label} failed with exit status ${String(result.status)}`);
  }
}

function writeReleaseSummary(steps) {
  const commit = runCapture("git", ["rev-parse", "HEAD"]);
  const pnpmVersion = runCapture(corepack.tool, [...corepack.prefix, "pnpm@11.14.0", "--version"]);
  const workspaceManifest = JSON.parse(
    readFileSync(resolve(workspaceRoot, "package.json"), "utf8"),
  );
  if (typeof workspaceManifest.version !== "string" || workspaceManifest.version === "") {
    throw new Error("release verification requires a concrete workspace version");
  }
  const packedEvidencePath = resolve(workspaceRoot, "tests/packed-consumers/evidence.json");
  const packedEvidenceBytes = readFileSync(packedEvidencePath);
  const packedEvidence = JSON.parse(packedEvidenceBytes.toString("utf8"));
  if (
    packedEvidence.artifactKind !== "p1-packed-consumer-evidence" ||
    !Array.isArray(packedEvidence.artifacts) ||
    packedEvidence.artifacts.length === 0 ||
    !Array.isArray(packedEvidence.consumers) ||
    packedEvidence.consumers.length === 0 ||
    packedEvidence.consumers.some(({ result }) => result !== "passed")
  ) {
    throw new Error("release verification cannot summarize incomplete packed-consumer evidence");
  }
  const relativeDirectory = `artifacts/release-evidence/${workspaceManifest.version}`;
  const directory = resolve(workspaceRoot, relativeDirectory);
  mkdirSync(directory, { recursive: true });
  const summary = {
    schemaVersion: 1,
    kind: "mergora-automated-release-prerequisite-evidence",
    productVersion: workspaceManifest.version,
    commit,
    result: "passed",
    publicationStatus: "not-authorized",
    toolchain: { node: process.version.slice(1), pnpm: pnpmVersion },
    artifacts: packedEvidence.artifacts,
    consumers: packedEvidence.consumers.map(({ id, framework, mode, result }) => ({
      id,
      framework,
      mode,
      result,
    })),
    packedConsumerEvidence: {
      path: "tests/packed-consumers/evidence.json",
      sha256: createHash("sha256").update(packedEvidenceBytes).digest("hex"),
      artifactDigestAlgorithm: packedEvidence.artifactDigestAlgorithm,
    },
    steps: steps.map(({ label }) => ({ label, result: "passed" })),
    limitations: [
      "This record covers automated prerequisites only and does not authorize npm publication.",
      "Manual assistive-technology, real-device, independent review, and protected-environment evidence remain separate release requirements.",
      "Successful automated checks do not establish complete WCAG conformance.",
    ],
  };
  writeFileSync(
    resolve(directory, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    resolve(directory, "summary.md"),
    [
      "# Automated release prerequisite evidence",
      "",
      `- Commit: \`${commit}\``,
      `- Product version: \`${summary.productVersion}\``,
      "- Result: passed",
      "- Publication: not authorized",
      `- Toolchain: Node ${summary.toolchain.node}, pnpm ${summary.toolchain.pnpm}`,
      "",
      "## Executed checks",
      "",
      ...summary.steps.map(({ label }) => `- [x] ${label}`),
      "",
      "## Packed artifacts",
      "",
      ...summary.artifacts.map(
        ({ name, file, sha256 }) => `- \`${name}\`: \`${file}\` — SHA-256 \`${sha256}\``,
      ),
      "",
      "## Packed consumers",
      "",
      ...summary.consumers.map(
        ({ id, framework, mode, result }) => `- \`${id}\` (${framework}, ${mode}): ${result}`,
      ),
      "",
      "## Limitations",
      "",
      ...summary.limitations.map((limitation) => `- ${limitation}`),
      "",
    ].join("\n"),
    "utf8",
  );
  process.stdout.write(`\nrelease prerequisite evidence: ${relativeDirectory}/summary.json\n`);
}

function planFor(gate, steps) {
  return {
    schemaVersion: 1,
    gate,
    steps: steps.map((step) => {
      const { args, env } = splitStep(step);
      return { label: step.label, runner: step.runner, args, env };
    }),
  };
}

function usage() {
  return `Usage: node scripts/run-quality-gate.mjs [--plan] <${Object.keys(gateDefinitions).join("|")}>\n`;
}

const arguments_ = process.argv.slice(2);
const planOnly = arguments_[0] === "--plan";
const gate = planOnly ? arguments_[1] : arguments_[0];
const steps = gateDefinitions[gate];

if (arguments_.length !== (planOnly ? 2 : 1) || steps === undefined) {
  process.stderr.write(usage());
  process.exitCode = 2;
} else if (planOnly) {
  process.stdout.write(`${JSON.stringify(planFor(gate, steps), null, 2)}\n`);
} else {
  try {
    if (gate === "release") requireCleanReleaseCheckout();
    for (const [index, step] of steps.entries()) runStep(step, index, steps.length);
    if (gate === "release") {
      if (trackedStatus() !== "") {
        throw new Error("release verification changed tracked source or generated artifacts");
      }
      writeReleaseSummary(steps);
    }
    process.stdout.write(
      `\nquality gate ${gate} passed (${String(steps.length)} executable checks)\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`quality gate ${gate} failed: ${message}\n`);
    process.exitCode = 1;
  }
}
