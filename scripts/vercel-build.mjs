import { execSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack";
const storybookRoot = resolve(workspaceRoot, "apps/storybook/storybook-static");
const targetRoot = resolve(workspaceRoot, "apps/web/public/quality-lab");

// Vercel deploys at root, so no base path needed
process.env.MERGORA_BASE_PATH = "";

console.log("Installing dependencies...");
execSync(`${corepack} pnpm@11.14.0 install --frozen-lockfile`, { cwd: workspaceRoot, stdio: "inherit" });

console.log("Building all workspace packages...");
execSync(`${corepack} pnpm@11.14.0 -r build`, { cwd: workspaceRoot, stdio: "inherit" });

console.log("Assembling Quality Lab into public directory...");
await rm(targetRoot, { force: true, recursive: true });
await mkdir(targetRoot, { recursive: true });
await cp(storybookRoot, targetRoot, { force: true, recursive: true });

console.log("Rebuilding Next.js with Quality Lab included...");
execSync(`${corepack} pnpm@11.14.0 --filter @mergora/web build`, { cwd: workspaceRoot, stdio: "inherit" });

console.log("✅ Vercel build complete!");
