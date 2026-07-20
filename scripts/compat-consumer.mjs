import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const matrix = JSON.parse(
  readFileSync(resolve(workspaceRoot, "tests/compatibility/matrix.v1.json"), "utf8"),
);

function fail(message) {
  throw new Error(message);
}

function parseArguments(arguments_) {
  const parsed = { planOnly: false };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--plan") {
      parsed.planOnly = true;
      continue;
    }
    const key = {
      "--artifacts": "artifacts",
      "--expected-node": "expectedNode",
      "--expected-os": "expectedOs",
      "--profile": "profileId",
    }[argument];
    if (key !== undefined) {
      const value = arguments_[index + 1];
      if (value === undefined) fail(`${argument} requires a value.`);
      parsed[key] = value;
      index += 1;
      continue;
    }
    fail(`Unknown argument: ${argument ?? "<missing>"}`);
  }
  if (parsed.profileId === undefined) fail("--profile is required.");
  if (!parsed.planOnly && parsed.artifacts === undefined) {
    fail("--artifacts is required unless --plan is used.");
  }
  return parsed;
}

function resolveProfile(profileId) {
  const framework = matrix.frameworkProfiles.find(({ id }) => id === profileId);
  if (framework !== undefined) return { ...framework, kind: "framework" };
  const manager = matrix.managerProfiles.find(({ id }) => id === profileId);
  if (manager !== undefined) {
    return {
      ...matrix.nodeOsProfile,
      ...manager,
      id: manager.id,
      kind: "manager",
    };
  }
  if (matrix.nodeOsProfile.id === profileId) return { ...matrix.nodeOsProfile, kind: "node-os" };
  fail(`Unknown compatibility profile: ${profileId}`);
}

function managerInvocation(manager) {
  if (process.platform !== "win32") return { command: manager, prefix: [] };
  if (manager === "npm") {
    return {
      command: process.execPath,
      prefix: [resolve(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")],
    };
  }
  if (manager === "pnpm" || manager === "yarn") {
    return {
      command: process.execPath,
      prefix: [
        resolve(dirname(process.execPath), "node_modules", "corepack", "dist", "corepack.js"),
        manager,
      ],
    };
  }
  return { command: "bun.exe", prefix: [] };
}

function managerPlan(profile) {
  const installArguments = {
    bun: ["install", "--ignore-scripts"],
    npm: ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
    pnpm: ["install", "--ignore-scripts", "--strict-peer-dependencies"],
    yarn: ["install", "--mode=skip-builds"],
  }[profile.manager];
  if (installArguments === undefined) fail(`Unsupported package manager: ${profile.manager}`);
  return {
    command: profile.manager,
    expectedVersion: profile.managerVersion,
    installArguments,
    runArguments: [
      ["run", "typecheck"],
      ["run", "build"],
      ["run", "verify"],
      ["run", "cli:smoke"],
    ],
  };
}

function planFor(profile, expectedNode, expectedOs) {
  return {
    schemaVersion: 1,
    artifactKind: "compatibility-consumer-plan",
    verificationStatus: "scheduled",
    profile: {
      id: profile.id,
      kind: profile.kind,
      framework: profile.framework,
      frameworkVersion: profile.frameworkVersion,
      reactVersion: profile.reactVersion,
      reactTypesVersion: profile.reactTypesVersion,
      reactDomTypesVersion: profile.reactDomTypesVersion,
      typescriptVersion: profile.typescriptVersion,
    },
    runtime: {
      expectedNode: expectedNode ?? null,
      expectedOs: expectedOs ?? null,
    },
    manager: managerPlan(profile),
    checks: [
      "packed artifact digests",
      "lifecycle scripts disabled",
      "strict bundler TypeScript resolution",
      "strict NodeNext TypeScript resolution",
      "package-owned CSS export typing",
      "React ref and JSX declaration inference",
      "production framework build",
      "resolved React and TypeScript versions",
      "packed CLI startup",
      "manager lockfile creation",
    ],
  };
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function run(command, arguments_, cwd, environment = {}) {
  process.stdout.write(`\n> ${command} ${arguments_.join(" ")}\n`);
  const result = spawnSync(command, arguments_, {
    cwd,
    env: { ...process.env, ...environment },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    fail(`${command} ${arguments_.join(" ")} exited with ${String(result.status)}.`);
  }
}

function capture(command, arguments_, cwd) {
  const result = spawnSync(command, arguments_, { cwd, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    fail(
      [
        `${command} ${arguments_.join(" ")} exited with ${String(result.status)}.`,
        result.stdout?.trim(),
        result.stderr?.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout.trim();
}

function readArtifactManifest(artifactsDirectory) {
  const manifestPath = resolve(artifactsDirectory, "compat-artifacts.json");
  if (!existsSync(manifestPath)) fail("compat-artifacts.json is missing from --artifacts.");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (
    manifest.artifactKind !== "compatibility-packed-artifacts" ||
    manifest.verificationStatus !== "unverified-input"
  ) {
    fail("Compatibility artifact manifest has an unexpected identity or status.");
  }
  const expectedNames = [...matrix.artifacts].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  const actualNames = manifest.packages
    .map(({ name }) => name)
    .sort((left, right) => left.localeCompare(right, "en-US"));
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    fail("Compatibility artifacts do not match the tracked package inventory.");
  }
  for (const package_ of manifest.packages) {
    if (
      typeof package_.file !== "string" ||
      basename(package_.file) !== package_.file ||
      !package_.file.endsWith(".tgz") ||
      typeof package_.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(package_.sha256)
    ) {
      fail(`Compatibility artifact metadata is unsafe: ${String(package_.name)}`);
    }
    const tarball = resolve(artifactsDirectory, package_.file);
    if (!existsSync(tarball) || sha256(tarball) !== package_.sha256) {
      fail(`Compatibility artifact digest mismatch: ${package_.name}`);
    }
  }
  return manifest;
}

function materializeArtifacts(manifest, artifactsDirectory, fixtureDirectory) {
  const localArtifacts = resolve(fixtureDirectory, "artifacts");
  mkdirSync(localArtifacts, { recursive: true });
  const dependencies = {};
  for (const package_ of manifest.packages) {
    copyFileSync(
      resolve(artifactsDirectory, package_.file),
      resolve(localArtifacts, package_.file),
    );
    dependencies[package_.name] = `file:./artifacts/${package_.file}`;
  }
  return dependencies;
}

const typeBoundary = `import { createRef } from "react";
import { Button } from "mergora-ui/button";
import { Dialog } from "mergora-ui/dialog";

export function CompatibilitySurface() {
  const actionRef = createRef<HTMLButtonElement>();
  return (
    <section aria-labelledby="compatibility-title">
      <h1 id="compatibility-title">Mergora compatibility fixture</h1>
      <Button pending={false} ref={actionRef} type="button">
        Save changes
      </Button>
      <Dialog.Root>
        <Dialog.Trigger>Review details</Dialog.Trigger>
        <Dialog.Overlay>
          <Dialog.Content>
            <Dialog.Title>Review details</Dialog.Title>
            <Dialog.Description>Confirm the generated declarations compose.</Dialog.Description>
            <Dialog.Close>Done</Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Root>
    </section>
  );
}
`;

function compilerOptions(module, moduleResolution) {
  return {
    allowSyntheticDefaultImports: true,
    exactOptionalPropertyTypes: true,
    forceConsistentCasingInFileNames: true,
    isolatedModules: true,
    jsx: "react-jsx",
    lib: ["ES2022", "DOM", "DOM.Iterable"],
    module,
    moduleResolution,
    noEmit: true,
    noUncheckedIndexedAccess: true,
    skipLibCheck: false,
    strict: true,
    target: "ES2022",
    types: ["react", "react-dom"],
    useUnknownInCatchVariables: true,
  };
}

function writeCommonFixture(fixtureDirectory, profile, artifactDependencies, actualManagerVersion) {
  const frameworkDependencies =
    profile.framework === "next" ? { next: profile.frameworkVersion } : {};
  const frameworkDevDependencies =
    profile.framework === "vite" ? { vite: profile.frameworkVersion } : {};
  const packageJson = {
    name: `mergora-compat-${profile.id}`,
    version: "0.0.0",
    private: true,
    type: "module",
    packageManager: `${profile.manager}@${actualManagerVersion}`,
    scripts: {
      build: profile.framework === "next" ? "next build" : "vite build",
      "cli:smoke": "mergora --version",
      typecheck: "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json",
      verify: "node verify-runtime.mjs",
    },
    dependencies: {
      ...artifactDependencies,
      ...frameworkDependencies,
      "compat-lifecycle-sentinel": "file:./lifecycle-sentinel",
      react: profile.reactVersion,
      "react-dom": profile.reactVersion,
    },
    devDependencies: {
      "@types/node": "24.13.3",
      "@types/react": profile.reactTypesVersion,
      "@types/react-dom": profile.reactDomTypesVersion,
      ...frameworkDevDependencies,
      typescript: profile.typescriptVersion,
    },
  };
  write(resolve(fixtureDirectory, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  write(resolve(fixtureDirectory, "src/type-boundary.tsx"), typeBoundary);
  write(
    resolve(fixtureDirectory, "tsconfig.node.json"),
    `${JSON.stringify(
      {
        compilerOptions: compilerOptions("NodeNext", "NodeNext"),
        include: ["src/type-boundary.tsx"],
      },
      null,
      2,
    )}\n`,
  );
  write(
    resolve(fixtureDirectory, "lifecycle-sentinel/package.json"),
    `${JSON.stringify(
      {
        name: "compat-lifecycle-sentinel",
        version: "1.0.0",
        scripts: { postinstall: "node postinstall.mjs" },
      },
      null,
      2,
    )}\n`,
  );
  write(
    resolve(fixtureDirectory, "lifecycle-sentinel/postinstall.mjs"),
    'import { writeFileSync } from "node:fs";\nwriteFileSync(new URL("ran.txt", import.meta.url), "unsafe\\n");\n',
  );
  write(
    resolve(fixtureDirectory, "verify-runtime.mjs"),
    `import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const expected = ${JSON.stringify({
      react: profile.reactVersion,
      reactDom: profile.reactVersion,
      typescript: profile.typescriptVersion,
    })};
const actual = {
  react: require("react/package.json").version,
  reactDom: require("react-dom/package.json").version,
  typescript: require("typescript/package.json").version,
};
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(\`Resolved versions differ: \${JSON.stringify({ expected, actual })}\`);
}
for (const name of ["mergora", "mergora-contracts", "mergora-registry", "mergora-schema"]) {
  await import(name);
}
const uiManifest = require("mergora-ui/package.json");
if (uiManifest.version !== "0.0.0") {
  throw new Error(\`Unexpected mergora-ui version: \${uiManifest.version}\`);
}
process.stdout.write(\`resolved runtime: \${JSON.stringify(actual)}\\n\`);
`,
  );
}

function writeViteFixture(fixtureDirectory) {
  write(
    resolve(fixtureDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: compilerOptions("ESNext", "Bundler"),
        include: ["src/**/*.ts", "src/**/*.tsx"],
      },
      null,
      2,
    )}\n`,
  );
  write(
    resolve(fixtureDirectory, "index.html"),
    '<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Mergora compatibility</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
  );
  write(
    resolve(fixtureDirectory, "src/main.tsx"),
    `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "mergora-ui/button.css";
import "mergora-ui/dialog.css";
import { CompatibilitySurface } from "./type-boundary.js";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing root element.");
createRoot(root).render(
  <StrictMode>
    <CompatibilitySurface />
  </StrictMode>,
);
`,
  );
}

function writeNextFixture(fixtureDirectory) {
  const bundlerOptions = compilerOptions("ESNext", "Bundler");
  write(
    resolve(fixtureDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          ...bundlerOptions,
          allowJs: false,
          incremental: true,
          plugins: [{ name: "next" }],
        },
        include: ["next-env.d.ts", ".next/types/**/*.ts", "src/**/*.ts", "src/**/*.tsx"],
        exclude: ["node_modules"],
      },
      null,
      2,
    )}\n`,
  );
  write(
    resolve(fixtureDirectory, "next-env.d.ts"),
    '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n',
  );
  write(
    resolve(fixtureDirectory, "next.config.mjs"),
    'export default { output: "export", reactStrictMode: true };\n',
  );
  write(
    resolve(fixtureDirectory, "src/app/layout.tsx"),
    `import type { ReactNode } from "react";
import "mergora-ui/button.css";
import "mergora-ui/dialog.css";

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
`,
  );
  write(
    resolve(fixtureDirectory, "src/app/interactive.tsx"),
    `"use client";

export { CompatibilitySurface as InteractiveCompatibilitySurface } from "../type-boundary.js";
`,
  );
  write(
    resolve(fixtureDirectory, "src/app/page.tsx"),
    `import { Button } from "mergora-ui/button";
import { InteractiveCompatibilitySurface } from "./interactive.js";

export default function Page() {
  return <main><Button>Server-safe import</Button><InteractiveCompatibilitySurface /></main>;
}
`,
  );
}

function lockfileExists(manager, fixtureDirectory) {
  const candidates = {
    bun: ["bun.lock", "bun.lockb"],
    npm: ["package-lock.json"],
    pnpm: ["pnpm-lock.yaml"],
    yarn: ["yarn.lock"],
  }[manager];
  return candidates.some((file) => existsSync(resolve(fixtureDirectory, file)));
}

const parsed = parseArguments(process.argv.slice(2));
const profile = resolveProfile(parsed.profileId);
const plan = planFor(profile, parsed.expectedNode, parsed.expectedOs);

if (parsed.planOnly) {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} else {
  if (parsed.expectedNode !== undefined && process.versions.node !== parsed.expectedNode) {
    fail(`Expected Node ${parsed.expectedNode}; received ${process.versions.node}.`);
  }
  if (parsed.expectedOs !== undefined && process.platform !== parsed.expectedOs) {
    fail(`Expected operating system ${parsed.expectedOs}; received ${process.platform}.`);
  }
  const artifactsDirectory = resolve(parsed.artifacts);
  const manifest = readArtifactManifest(artifactsDirectory);
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "mergora-compat-"));
  try {
    const manager = managerInvocation(profile.manager);
    const actualManagerVersion = capture(
      manager.command,
      [...manager.prefix, "--version"],
      fixtureDirectory,
    ).replace(/^v/u, "");
    if (
      profile.managerVersion !== "host-bundled" &&
      actualManagerVersion !== profile.managerVersion
    ) {
      fail(
        `Expected ${profile.manager} ${profile.managerVersion}; received ${actualManagerVersion}.`,
      );
    }
    const artifactDependencies = materializeArtifacts(
      manifest,
      artifactsDirectory,
      fixtureDirectory,
    );
    writeCommonFixture(fixtureDirectory, profile, artifactDependencies, actualManagerVersion);
    if (profile.framework === "next") writeNextFixture(fixtureDirectory);
    else if (profile.framework === "vite") writeViteFixture(fixtureDirectory);
    else fail(`Unsupported framework: ${profile.framework}`);

    const managerSteps = managerPlan(profile);
    run(manager.command, [...manager.prefix, ...managerSteps.installArguments], fixtureDirectory);
    if (existsSync(resolve(fixtureDirectory, "lifecycle-sentinel/ran.txt"))) {
      fail(`${profile.manager} executed a lifecycle script despite the deny flag.`);
    }
    if (!lockfileExists(profile.manager, fixtureDirectory)) {
      fail(`${profile.manager} did not create its expected lockfile.`);
    }
    for (const arguments_ of managerSteps.runArguments) {
      run(manager.command, [...manager.prefix, ...arguments_], fixtureDirectory, {
        NEXT_TELEMETRY_DISABLED: "1",
      });
    }
    process.stdout.write(
      `${JSON.stringify({
        schemaVersion: 1,
        artifactKind: "compatibility-lane-result",
        profile: profile.id,
        result: "passed",
        node: process.versions.node,
        operatingSystem: process.platform,
        manager: { name: profile.manager, version: actualManagerVersion },
      })}\n`,
    );
  } finally {
    rmSync(fixtureDirectory, { force: true, recursive: true });
  }
}
