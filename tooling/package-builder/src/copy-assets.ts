import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const packageRoot = resolve(process.argv[2] ?? ".");
const sourceRoot = resolve(packageRoot, "src", "generated");
const outputRoot = resolve(packageRoot, "dist", "generated");
const COPY_EXTENSIONS = new Set([".css", ".svg", ".woff2"]);

function extension(path: string): string {
  const name = path.split(/[\\/]/u).at(-1)!;
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index);
}

function walk(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en-US"))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Generated package assets may not contain symlinks: ${path}`);
      }
      return entry.isDirectory() ? walk(path) : [path];
    });
}

if (!existsSync(sourceRoot)) {
  throw new Error(`Generated UI source root is missing: ${sourceRoot}`);
}

let copied = 0;
for (const source of walk(sourceRoot)) {
  if (!COPY_EXTENSIONS.has(extension(source))) continue;
  const relativePath = relative(sourceRoot, source);
  if (relativePath.startsWith("..") || relativePath.split(sep).includes("..")) {
    throw new Error(`Refusing asset path outside generated source: ${source}`);
  }
  const target = resolve(outputRoot, relativePath);
  if (!target.startsWith(`${outputRoot}${sep}`)) {
    throw new Error(`Refusing asset target outside generated output: ${target}`);
  }
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  copied += 1;
}

console.log(`Copied ${copied} generated UI package assets.`);
