import { cp, mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "..");
const storybookRoot = resolve(workspaceRoot, "apps/storybook/storybook-static");
const targetRoot = resolve(workspaceRoot, "apps/web/out/quality-lab");

async function requireFile(path) {
  const details = await stat(path).catch(() => null);
  if (details?.isFile() !== true) {
    throw new Error(`Quality Lab assembly requires ${path.slice(workspaceRoot.length + 1)}.`);
  }
}

await Promise.all([
  requireFile(resolve(storybookRoot, "iframe.html")),
  requireFile(resolve(storybookRoot, "index.html")),
  requireFile(resolve(storybookRoot, "index.json")),
  requireFile(resolve(workspaceRoot, "apps/web/out/index.html")),
]);
await mkdir(targetRoot, { recursive: true });
await cp(storybookRoot, targetRoot, { force: true, recursive: true });
process.stdout.write("Quality Lab assembled into the static documentation artifact.\n");
