import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

export interface ProjectFixtureOptions {
  readonly framework?: "next-app" | "next-pages" | "vite-react" | "react";
  readonly manager?: "pnpm" | "npm" | "yarn" | "bun";
  readonly newline?: "\n" | "\r\n";
  readonly directoryPrefix?: string;
  readonly packageText?: string;
  readonly tsconfigText?: string;
  readonly cssText?: string;
  readonly parentDirectory?: string;
}

export interface ProjectFixture {
  readonly root: string;
  readonly packageText: string;
  readonly tsconfigText: string;
  readonly cssText: string;
  readonly globalCss: string;
}

export function createProjectFixture(options: ProjectFixtureOptions = {}): ProjectFixture {
  const framework = options.framework ?? "next-app";
  const manager = options.manager ?? "pnpm";
  const newline = options.newline ?? "\n";
  const root =
    options.parentDirectory === undefined
      ? mkdtempSync(resolve(tmpdir(), options.directoryPrefix ?? "mergora-cli-fixture-"))
      : resolve(options.parentDirectory, options.directoryPrefix ?? "application");
  mkdirSync(root, { recursive: true });
  const dependencies: Record<string, string> = {
    react: "19.2.7",
    tailwindcss: "4.3.3",
  };
  if (framework === "next-app" || framework === "next-pages") dependencies.next = "16.2.10";
  if (framework === "vite-react") dependencies.vite = "8.1.5";
  const packageManager = `${manager}@${manager === "pnpm" ? "11.14.0" : manager === "npm" ? "11.4.2" : manager === "yarn" ? "4.12.0" : "1.3.5"}`;
  const packageText =
    options.packageText ??
    `${JSON.stringify({ name: "cli-fixture", private: true, packageManager, dependencies }, null, 2).replaceAll("\n", newline)}${newline}`;
  const tsconfigText =
    options.tsconfigText ??
    `${JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          baseUrl: ".",
          paths: { "@/*": ["src/*"] },
        },
        include: ["src"],
      },
      null,
      2,
    ).replaceAll("\n", newline)}${newline}`;
  const cssText =
    options.cssText ??
    `@import "tailwindcss";${newline}${newline}:root { color: black; }${newline}`;
  const globalCss = framework === "next-app" ? "src/app/globals.css" : "src/index.css";
  mkdirSync(resolve(root, "src"), { recursive: true });
  if (framework === "next-app") mkdirSync(resolve(root, "src/app"), { recursive: true });
  if (framework === "next-pages") mkdirSync(resolve(root, "src/pages"), { recursive: true });
  writeFileSync(resolve(root, "package.json"), packageText, "utf8");
  writeFileSync(resolve(root, "tsconfig.json"), tsconfigText, "utf8");
  writeFileSync(resolve(root, globalCss), cssText, "utf8");
  const lockfile =
    manager === "pnpm"
      ? "pnpm-lock.yaml"
      : manager === "npm"
        ? "package-lock.json"
        : manager === "yarn"
          ? "yarn.lock"
          : "bun.lock";
  writeFileSync(resolve(root, lockfile), `${manager}-fixture${newline}`, "utf8");
  return { root, packageText, tsconfigText, cssText, globalCss };
}
