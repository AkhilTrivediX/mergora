import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceRoots = [".", "docs", "registry", "packages", "tooling", "apps", "content"];
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  "dist",
  "node_modules",
  "out",
  "PLANS",
  "storybook-static",
]);

async function markdownFilesBelow(path, allowRootFiles = false) {
  const absolute = resolve(root, path);
  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const child = resolve(absolute, entry.name);
      if (entry.isDirectory()) {
        return ignoredDirectories.has(entry.name) ? [] : markdownFilesBelow(child);
      }
      if (extname(entry.name).toLowerCase() !== ".md") return [];
      if (!allowRootFiles && absolute === root) return [];
      return [child];
    }),
  );
  return nested.flat();
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const rootMarkdown = (await readdir(root, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".md")
  .map((entry) => resolve(root, entry.name));
const nestedMarkdown = (
  await Promise.all(sourceRoots.slice(1).map((path) => markdownFilesBelow(path)))
).flat();
const markdownFiles = [...new Set([...rootMarkdown, ...nestedMarkdown])];
const failures = [];
let checkedLinks = 0;

for (const file of markdownFiles) {
  const contents = await readFile(file, "utf8");
  for (const match of contents.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)) {
    const rawTarget = match[1]?.trim() ?? "";
    const target = rawTarget.startsWith("<")
      ? rawTarget.slice(1, rawTarget.indexOf(">"))
      : rawTarget.split(/\s+["']/u, 1)[0];
    if (!target || target.startsWith("#") || /^(?:https?:|mailto:|app:)/iu.test(target)) {
      continue;
    }

    checkedLinks += 1;
    const pathPart = decodeURIComponent(target.split("#", 1)[0] ?? "");
    if (isAbsolute(pathPart)) {
      failures.push(`${file.slice(root.length + 1)}: absolute local link ${target}`);
      continue;
    }
    const resolved = resolve(dirname(file), pathPart);
    if (!resolved.startsWith(`${root}${sep}`) && resolved !== root) {
      failures.push(`${file.slice(root.length + 1)}: link escapes repository ${target}`);
      continue;
    }
    if (!(await exists(resolved))) {
      failures.push(`${file.slice(root.length + 1)}: missing link target ${target}`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`document link verification failed:\n${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `document link verification passed: ${checkedLinks} local links across ${markdownFiles.length} Markdown files\n`,
  );
}
