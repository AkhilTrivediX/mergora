import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceDirectory = resolve(packageDirectory, "../..");
const outputDirectory = resolve(packageDirectory, "dist");
if (!outputDirectory.startsWith(`${packageDirectory}${sep}`)) {
  throw new Error("Refusing to clean a CLI output directory outside the package.");
}
rmSync(outputDirectory, { recursive: true, force: true });

const tscExecutable = resolve(packageDirectory, "node_modules/typescript/bin/tsc");
const typeScript = spawnSync(process.execPath, [tscExecutable, "-p", "tsconfig.json"], {
  cwd: packageDirectory,
  encoding: "utf8",
  stdio: "inherit",
  shell: false,
});
if (typeScript.status !== 0) process.exit(typeScript.status ?? 1);

const generatedDirectory = resolve(workspaceDirectory, "registry/generated");
const sourceItemsDirectory = resolve(generatedDirectory, "native-source-items");
const itemEntries = readdirSync(sourceItemsDirectory, { withFileTypes: true });
if (
  itemEntries.some(
    (entry) =>
      !entry.isFile() ||
      entry.isSymbolicLink() ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(entry.name),
  )
) {
  throw new Error("Generated native source item directory contains an unsafe entry.");
}
const itemNames = itemEntries
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, "en-US"));
if (itemNames.length === 0) throw new Error("No generated native source items were found.");

const payloads = new Map();
let totalBytes = 0;
for (const name of itemNames) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(name)) {
    throw new Error(`Generated native source item filename ${JSON.stringify(name)} is unsafe.`);
  }
  const path = resolve(sourceItemsDirectory, name);
  if (lstatSync(path).isSymbolicLink() || statSync(path).size > 4 * 1024 * 1024) {
    throw new Error(`Generated native source item ${name} is unsafe or oversized.`);
  }
  const raw = readFileSync(path, "utf8");
  const payload = JSON.parse(raw);
  const itemId = name.slice(0, -5);
  if (
    payload.artifactKind !== "unreleased-native-source-item" ||
    payload.itemId !== itemId ||
    payload.publicationStatus !== "unreleased" ||
    !Array.isArray(payload.files) ||
    !Array.isArray(payload.registryDependencies) ||
    !Array.isArray(payload.runtimeDependencies) ||
    !Array.isArray(payload.blockers) ||
    typeof payload.title !== "string" ||
    typeof payload.description !== "string" ||
    typeof payload.kind !== "string" ||
    typeof payload.visibleStatus !== "string"
  ) {
    throw new Error(`Generated native source payload for ${itemId} is invalid.`);
  }
  for (const forbidden of [
    "command",
    "commands",
    "hook",
    "hooks",
    "postinstall",
    "preinstall",
    "scripts",
  ]) {
    if (Object.hasOwn(payload, forbidden)) {
      throw new Error(
        `Generated native source payload for ${itemId} contains forbidden ${forbidden}.`,
      );
    }
  }
  const targetKeys = new Set();
  const filenames = [];
  for (const file of payload.files) {
    const prefix = `components/ui/mergora/${itemId}/`;
    if (
      typeof file.targetPath !== "string" ||
      !file.targetPath.startsWith(prefix) ||
      file.targetPath.slice(prefix.length).includes("/") ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(file.targetPath.slice(prefix.length)) ||
      typeof file.logicalPath !== "string" ||
      file.logicalPath.includes("\\") ||
      file.logicalPath.split("/").includes("..") ||
      typeof file.content !== "string" ||
      Buffer.byteLength(file.content) > 2 * 1024 * 1024 ||
      file.executable !== false ||
      typeof file.mediaType !== "string" ||
      typeof file.targetRole !== "string"
    ) {
      throw new Error(`Generated native source payload for ${itemId} contains an unsafe file.`);
    }
    const key = file.targetPath.normalize("NFC").toLocaleLowerCase("en-US");
    if (targetKeys.has(key)) {
      throw new Error(`Generated native source payload for ${itemId} repeats ${file.targetPath}.`);
    }
    targetKeys.add(key);
    filenames.push(file.targetPath.slice(prefix.length));
    totalBytes += Buffer.byteLength(file.content);
  }
  if (
    payload.registryDependencies.some(
      (dependency) =>
        typeof dependency !== "string" ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(dependency) ||
        dependency === itemId,
    ) ||
    payload.runtimeDependencies.some(
      (dependency) =>
        typeof dependency !== "string" || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u.test(dependency),
    )
  ) {
    throw new Error(`Generated native source payload for ${itemId} has unsafe dependencies.`);
  }
  payloads.set(itemId, { payload, raw, filenames: filenames.sort() });
}
if (totalBytes > 50 * 1024 * 1024) {
  throw new Error("Generated native source bundle exceeds the 50 MiB operation limit.");
}

const graphState = new Map();
const visit = (itemId) => {
  const state = graphState.get(itemId);
  if (state === "visited") return;
  if (state === "visiting")
    throw new Error(`Generated source dependency cycle includes ${itemId}.`);
  const record = payloads.get(itemId);
  if (record === undefined) throw new Error(`Generated source dependency ${itemId} is missing.`);
  graphState.set(itemId, "visiting");
  for (const dependency of [...record.payload.registryDependencies].sort()) visit(dependency);
  graphState.set(itemId, "visited");
};
for (const itemId of [...payloads.keys()].sort()) visit(itemId);

const registryOutput = resolve(outputDirectory, "registry");
const itemOutput = resolve(registryOutput, "items");
const templateOutput = resolve(outputDirectory, "templates");
mkdirSync(itemOutput, { recursive: true });
mkdirSync(templateOutput, { recursive: true });
const manifestItems = {};
for (const [itemId, record] of [...payloads.entries()].sort(([left], [right]) =>
  left.localeCompare(right, "en-US"),
)) {
  writeFileSync(resolve(itemOutput, `${itemId}.json`), record.raw, "utf8");
  const targetDirectory = resolve(templateOutput, itemId);
  mkdirSync(targetDirectory, { recursive: true });
  for (const file of record.payload.files) {
    const filename = file.targetPath.slice(`components/ui/mergora/${itemId}/`.length);
    writeFileSync(resolve(targetDirectory, filename), file.content, "utf8");
  }
  manifestItems[itemId] = {
    files: record.filenames,
    registryDependencies: [...record.payload.registryDependencies].sort(),
    runtimeDependencies: [...record.payload.runtimeDependencies].sort(),
  };
}
writeFileSync(
  resolve(templateOutput, "manifest.json"),
  `${JSON.stringify({ schemaVersion: 1, items: manifestItems }, null, 2)}\n`,
  "utf8",
);

const catalogPath = resolve(generatedDirectory, "catalog.json");
if (lstatSync(catalogPath).isSymbolicLink() || statSync(catalogPath).size > 4 * 1024 * 1024) {
  throw new Error("Generated registry catalog is unsafe or oversized.");
}
const catalogRaw = readFileSync(catalogPath, "utf8");
const catalog = JSON.parse(catalogRaw);
if (
  catalog.artifactKind !== "registry-catalog-plan" ||
  catalog.schemaVersion !== 1 ||
  !Array.isArray(catalog.items)
) {
  throw new Error("Generated registry catalog failed identity validation.");
}
const catalogIds = new Set();
const catalogSourceIds = new Set();
for (const item of catalog.items) {
  if (
    item === null ||
    Array.isArray(item) ||
    typeof item !== "object" ||
    typeof item.id !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(item.id) ||
    typeof item.sourceAvailable !== "boolean"
  ) {
    throw new Error("Generated registry catalog contains an invalid item identity.");
  }
  if (catalogIds.has(item.id)) {
    throw new Error(`Generated registry catalog repeats item ${item.id}.`);
  }
  catalogIds.add(item.id);
  if (item.sourceAvailable) catalogSourceIds.add(item.id);
}
const payloadIds = [...payloads.keys()].sort();
const advertisedSourceIds = [...catalogSourceIds].sort();
if (JSON.stringify(payloadIds) !== JSON.stringify(advertisedSourceIds)) {
  throw new Error(
    "Generated registry catalog source availability does not match native source payloads.",
  );
}
writeFileSync(resolve(registryOutput, "catalog.json"), catalogRaw, "utf8");
