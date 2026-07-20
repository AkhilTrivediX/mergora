import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceDirectory = resolve(packageDirectory, "../..");
const sourceDirectory = resolve(packageDirectory, "src/generated");
const assetsDirectory = resolve(workspaceDirectory, "assets/fonts");
const outputDirectory = resolve(packageDirectory, "dist");
const packagePrefix = `${packageDirectory}${sep}`;

if (!outputDirectory.startsWith(packagePrefix)) {
  throw new Error("Refusing to clean a token output directory outside the package.");
}

rmSync(outputDirectory, { force: true, recursive: true });

const tscExecutable = resolve(packageDirectory, "node_modules/typescript/bin/tsc");
const typeScript = spawnSync(process.execPath, [tscExecutable, "-p", "tsconfig.json"], {
  cwd: packageDirectory,
  encoding: "utf8",
  stdio: "inherit",
});
if (typeScript.status !== 0) {
  process.exit(typeScript.status ?? 1);
}

for (const filename of [
  "canonical.dtcg.json",
  "design-tool-interchange.dtcg.json",
  "docs.json",
  "fonts.css",
  "mergora.resolver.json",
  "primitives.tokens.json",
  "schema.json",
  "semantics.tokens.json",
  "tailwind.css",
  "tokens.css",
]) {
  copyFileSync(resolve(sourceDirectory, filename), resolve(outputDirectory, filename));
}

cpSync(resolve(sourceDirectory, "resolved"), resolve(outputDirectory, "resolved"), {
  recursive: true,
});
cpSync(resolve(sourceDirectory, "density"), resolve(outputDirectory, "density"), {
  recursive: true,
});
cpSync(resolve(sourceDirectory, "themes"), resolve(outputDirectory, "themes"), {
  recursive: true,
});
mkdirSync(resolve(outputDirectory, "fonts"), { recursive: true });
for (const filename of [
  "commit-mono-latin-greek-wght.woff2",
  "OFL-Commit-Mono.txt",
  "OFL-Schibsted-Grotesk.txt",
  "schibsted-grotesk-latin-ext-wght.woff2",
]) {
  copyFileSync(resolve(assetsDirectory, filename), resolve(outputDirectory, "fonts", filename));
}
