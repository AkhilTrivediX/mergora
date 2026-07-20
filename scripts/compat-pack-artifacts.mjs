import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageDirectories = [
  "packages/cli",
  "packages/contracts",
  "packages/registry",
  "packages/schema",
  "packages/ui",
];

function fail(message) {
  throw new Error(message);
}

function parseArguments(arguments_) {
  let output;
  let planOnly = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--plan") {
      planOnly = true;
      continue;
    }
    if (argument === "--output") {
      output = arguments_[index + 1];
      index += 1;
      continue;
    }
    fail(`Unknown argument: ${argument ?? "<missing>"}`);
  }
  if (!planOnly && output === undefined) fail("--output is required unless --plan is used.");
  return { output, planOnly };
}

function packageRecord(directory) {
  const absoluteDirectory = resolve(workspaceRoot, directory);
  const packageJson = JSON.parse(readFileSync(resolve(absoluteDirectory, "package.json"), "utf8"));
  if (typeof packageJson.name !== "string" || typeof packageJson.version !== "string") {
    fail(`${directory}/package.json must declare string name and version fields.`);
  }
  return {
    directory,
    absoluteDirectory,
    name: packageJson.name,
    version: packageJson.version,
  };
}

function corepackCommand(arguments_, cwd) {
  const corepack =
    process.platform === "win32"
      ? {
          command: process.execPath,
          arguments: [
            resolve(dirname(process.execPath), "node_modules", "corepack", "dist", "corepack.js"),
            ...arguments_,
          ],
        }
      : { command: "corepack", arguments: arguments_ };
  const result = spawnSync(corepack.command, corepack.arguments, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    fail(
      [
        `Command failed: corepack ${arguments_.join(" ")}`,
        result.stdout?.trim(),
        result.stderr?.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const { output, planOnly } = parseArguments(process.argv.slice(2));
const packages = packageDirectories.map(packageRecord);

if (planOnly) {
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        artifactKind: "compatibility-pack-plan",
        packageManager: "pnpm@11.14.0",
        packages: packages.map(({ directory, name, version }) => ({ directory, name, version })),
      },
      null,
      2,
    )}\n`,
  );
} else {
  const outputDirectory = resolve(workspaceRoot, output);
  const outputRelative = relative(workspaceRoot, outputDirectory);
  if (
    outputDirectory === workspaceRoot ||
    outputRelative === "" ||
    (!isAbsolute(output) && (outputRelative === ".." || outputRelative.startsWith(`..${sep}`)))
  ) {
    fail("Compatibility artifact output must be a dedicated directory, never the workspace root.");
  }
  mkdirSync(outputDirectory, { recursive: true });
  if (readdirSync(outputDirectory).length > 0) {
    fail(`Compatibility artifact output must start empty: ${outputDirectory}`);
  }

  const packed = [];
  for (const package_ of packages) {
    if (!existsSync(resolve(package_.absoluteDirectory, "dist"))) {
      fail(`${package_.directory}/dist is missing. Build compatibility packages before packing.`);
    }
    const before = new Set(readdirSync(outputDirectory));
    corepackCommand(
      ["pnpm@11.14.0", "pack", "--pack-destination", outputDirectory],
      package_.absoluteDirectory,
    );
    const created = readdirSync(outputDirectory).filter(
      (file) => file.endsWith(".tgz") && !before.has(file),
    );
    if (created.length !== 1) {
      fail(`${package_.name} pack produced ${String(created.length)} new tarballs instead of one.`);
    }
    const file = created[0];
    if (file === undefined) fail(`${package_.name} tarball name could not be resolved.`);
    packed.push({
      name: package_.name,
      version: package_.version,
      file,
      sha256: digest(resolve(outputDirectory, file)),
    });
  }

  const manifest = {
    schemaVersion: 1,
    artifactKind: "compatibility-packed-artifacts",
    packageManager: "pnpm@11.14.0",
    verificationStatus: "unverified-input",
    packages: packed.sort((left, right) => left.name.localeCompare(right.name, "en-US")),
  };
  writeFileSync(
    resolve(outputDirectory, "compat-artifacts.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(
    `Packed ${String(packed.length)} compatibility artifacts; consumer lanes remain unverified until they run.\n`,
  );
}
