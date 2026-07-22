import { execSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function log(message) {
  process.stdout.write(`${message}\n`);
}

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const storybookRoot = resolve(workspaceRoot, "apps/storybook/storybook-static");
const webPublicQualityLab = resolve(workspaceRoot, "apps/web/public/quality-lab");
const webOutQualityLab = resolve(workspaceRoot, "apps/web/out/quality-lab");

// No base path for Vercel (deployed at root)
process.env.MERGORA_BASE_PATH = "";
process.env.MERGORA_SITE_ORIGIN = "https://mergora.vercel.app";

log("Building all workspace packages...");
execSync("pnpm -r build", { cwd: workspaceRoot, stdio: "inherit" });

log("Assembling Quality Lab (Storybook) into Next.js output...");
await rm(webPublicQualityLab, { force: true, recursive: true });
await mkdir(webOutQualityLab, { recursive: true });
await cp(storybookRoot, webOutQualityLab, { force: true, recursive: true });

log("Vercel build complete!");
