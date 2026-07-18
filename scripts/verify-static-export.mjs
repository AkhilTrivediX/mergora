import { readdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const outputRoot = resolve("apps/web/out");
const expectedBasePath = process.env.MERGORA_BASE_PATH ?? "/mergora";
const textExtensions = new Set([".css", ".html", ".js", ".json", ".map", ".txt", ".xml"]);

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(path) : [path];
    }),
  );
  return nested.flat();
}

function fail(message) {
  process.stderr.write(`static export verification failed: ${message}\n`);
  process.exitCode = 1;
}

const index = await readFile(join(outputRoot, "index.html"), "utf8");
if (!index.includes(`${expectedBasePath}/_next/`)) {
  fail(`index.html does not reference assets through ${expectedBasePath}/_next/`);
}
if (/\b(?:href|src)=["']\/_next\//u.test(index)) {
  fail("index.html leaks a root-relative /_next asset outside the configured base path");
}

const files = (await filesBelow(outputRoot)).filter((path) => textExtensions.has(extname(path)));
for (const path of files) {
  const value = await readFile(path, "utf8");
  if (/file:\/\//iu.test(value) || /(?:[A-Z]:\\Users\\|\/Users\/|\/home\/)/u.test(value)) {
    fail(`${path.slice(outputRoot.length + 1)} contains a local absolute path`);
  }
}

if (!process.exitCode) {
  process.stdout.write(
    `static export verification passed: ${files.length} text artifacts use base path ${expectedBasePath}\n`,
  );
}
