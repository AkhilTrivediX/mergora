import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const root = realpathSync(resolve(import.meta.dirname, ".."));
const shadcnRoot = resolve(root, "node_modules", "shadcn", "dist");
const shadcnCli = resolve(shadcnRoot, "index.js");
const shadcnSchemas = resolve(shadcnRoot, "schema", "index.js");
const generatedDirectory = resolve(root, "registry", "generated", "shadcn");
const sourcePlanPath = resolve(root, "registry", "generated", "source-transform-plan.json");
const itemId = "center";
const clientVersion = "4.13.0";
const maxOutputBytes = 2 * 1024 * 1024;

function fail(message) {
  throw new Error(`Pinned shadcn client verification failed: ${message}`);
}

function readJson(path) {
  const bytes = readFileSync(path);
  if (bytes.byteLength > 8 * 1024 * 1024) fail(`${path} exceeds the fixture byte limit.`);
  return JSON.parse(bytes.toString("utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function runClient(arguments_, cwd) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [shadcnCli, ...arguments_], {
      cwd,
      env: { ...process.env, CI: "1", NO_COLOR: "1" },
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const collect = (target, chunk) => {
      const next = target + chunk.toString("utf8");
      if (Buffer.byteLength(next) > maxOutputBytes) {
        child.kill();
        reject(new Error("Pinned shadcn client output exceeded the byte limit."));
      }
      return next;
    };
    child.stdout.on("data", (chunk) => {
      stdout = collect(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = collect(stderr, chunk);
    });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Pinned shadcn client timed out."));
    }, 60_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (status) => {
      clearTimeout(timeout);
      if (status !== 0) {
        reject(
          new Error(
            `Pinned shadcn client ${JSON.stringify(arguments_)} exited ${String(status)}. ${stderr.trim() || stdout.trim()}`,
          ),
        );
        return;
      }
      resolveResult({ stdout, stderr });
    });
  });
}

function safeCleanup(directory) {
  const resolvedTemporaryRoot = realpathSync(tmpdir());
  const resolved = realpathSync(directory);
  if (
    resolved === resolvedTemporaryRoot ||
    !resolved.startsWith(`${resolvedTemporaryRoot}${sep}`) ||
    !resolve(resolved).includes("mergora-shadcn-client-")
  ) {
    fail("temporary cleanup target escaped its owned directory.");
  }
  rmSync(resolved, { force: true, recursive: true });
}

if (!existsSync(shadcnCli) || !existsSync(shadcnSchemas)) {
  fail("shadcn@4.13.0 is not installed at the pinned workspace path.");
}
const registry = readJson(resolve(generatedDirectory, "registry.json"));
const item = readJson(resolve(generatedDirectory, `${itemId}.json`));
const sourcePlan = readJson(sourcePlanPath);
const schemas = await import(pathToFileURL(shadcnSchemas).href);
const parsedRegistry = schemas.registrySchema.parse(registry);
const parsedItem = schemas.registryItemSchema.parse(item);
if (
  !sourcePlan ||
  typeof sourcePlan !== "object" ||
  !Array.isArray(sourcePlan.items) ||
  sourcePlan.items.some(
    (entry) =>
      !entry ||
      typeof entry !== "object" ||
      typeof entry.id !== "string" ||
      typeof entry.implementationStatus !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.id),
  )
) {
  fail("the generated canonical source inventory is malformed.");
}
const expectedItemIds = sourcePlan.items
  .filter(({ implementationStatus }) => implementationStatus === "source-present-unreleased")
  .map(({ id }) => id)
  .sort();
const parsedItemIds = parsedRegistry.items.map(({ name }) => name).sort();
if (
  new Set(expectedItemIds).size !== expectedItemIds.length ||
  JSON.stringify(parsedItemIds) !== JSON.stringify(expectedItemIds) ||
  parsedItem.name !== itemId
) {
  fail("the pinned runtime schemas returned an unexpected registry inventory.");
}

const temporaryRoot = mkdtempSync(resolve(tmpdir(), "mergora-shadcn-client-"));
try {
  const sourceRegistry = resolve(temporaryRoot, "source-registry");
  const materializedFiles = item.files.map((file) => {
    const path = resolve(sourceRegistry, ...file.path.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content);
    return Object.fromEntries(Object.entries(file).filter(([key]) => key !== "content"));
  });
  writeJson(resolve(sourceRegistry, "registry.json"), {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "mergora-pinned-client-fixture",
    homepage: "https://mergora.vercel.app/",
    items: [{ ...item, files: materializedFiles }],
  });

  const version = await runClient(["--version"], sourceRegistry);
  if (version.stdout.trim() !== clientVersion) {
    fail(`expected shadcn ${clientVersion}, received ${version.stdout.trim()}.`);
  }
  const validation = await runClient(
    ["registry", "validate", "registry.json", "--cwd", sourceRegistry],
    sourceRegistry,
  );
  const output = `${validation.stdout}\n${validation.stderr}`;
  if (!output.includes("Registry is valid") || !output.includes("1 item")) {
    fail("the pinned CLI did not report a valid materialized generated item.");
  }
  process.stdout.write(
    `shadcn compatibility passed: ${clientVersion}, ${String(parsedRegistry.items.length)} inline items schema-valid, ${itemId} accepted by the pinned CLI with ${String(materializedFiles.length)} files\n`,
  );
} finally {
  safeCleanup(temporaryRoot);
}
