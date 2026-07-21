import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, parse, resolve } from "node:path";

import {
  applyInit,
  CONFIG_SCHEMA,
  createMergoraConfig,
  MANIFEST_SCHEMA,
  planInit,
} from "./configuration.js";
import {
  assertPortableRelativePath,
  canonicalJson,
  CLI_VERSION,
  CliError,
  portableSort,
  sha256,
} from "./contracts.js";
import {
  inspectProject,
  type PackageManager,
  type ProjectInspection,
} from "./project-inspector.js";
import {
  finalizeOperationPlan,
  type OperationPlan,
  type OperationPlanDependencyChange,
  type OperationPlanFile,
  type PackageManagerInvocation,
  type PackageManagerRunner,
} from "./transaction-engine.js";

export type ProjectCreateTemplate = "next" | "vite";
export type ProjectCreatePreset = "minimal" | "application" | "none";

export const PROJECT_CREATE_TEMPLATE_VERSION = "1.0.0" as const;
export const PROJECT_CREATE_PUBLICATION_STATUS = "unreleased" as const;
export const PROJECT_CREATE_IGNORED_OS_METADATA = [
  ".DS_Store",
  "desktop.ini",
  "Thumbs.db",
] as const;

export type ProjectCreateFaultPoint =
  | "stage-created"
  | "template-written"
  | "initialized"
  | "validated"
  | "package-manager-complete"
  | "before-commit"
  | "target-moved"
  | "committed";

export interface ProjectCreateOptions {
  /** Absolute or cwd-relative destination. Relative segments must be portable. */
  readonly directory: string;
  /** Required by the non-interactive backend; prompting belongs to the command adapter. */
  readonly template: ProjectCreateTemplate;
  /** Required by the non-interactive backend; prompting belongs to the command adapter. */
  readonly packageManager: PackageManager;
  /** Required by the non-interactive backend; prompting belongs to the command adapter. */
  readonly preset: ProjectCreatePreset;
  readonly noInstall?: boolean | undefined;
  readonly cwd?: string | undefined;
  readonly packageManagerRunner?: PackageManagerRunner | undefined;
  /** Deterministic failure testing only; it is not represented in or persisted by the plan. */
  readonly faultInjector?: ((point: ProjectCreateFaultPoint) => void) | undefined;
}

interface ProjectCreatePlannedFile {
  readonly target: string;
  readonly digest: `sha256:${string}`;
  readonly byteLength: number;
  readonly mediaType:
    | "application/json"
    | "text/css"
    | "text/html"
    | "text/plain"
    | "text/typescript"
    | "text/typescript-jsx";
  readonly source: "template" | "foundation" | "initialization" | "preserved-os-metadata";
}

export type ProjectCreatePlan = OperationPlan;

export interface ProjectCreateResult {
  readonly state: "created";
  readonly projectRoot: ".";
  readonly directoryName: string;
  readonly template: ProjectCreateTemplate;
  readonly templateVersion: typeof PROJECT_CREATE_TEMPLATE_VERSION;
  readonly publicationStatus: typeof PROJECT_CREATE_PUBLICATION_STATUS;
  readonly preset: ProjectCreatePreset;
  readonly packageManager: PackageManager;
  readonly installInvoked: boolean;
  readonly files: readonly string[];
  readonly planDigest: `sha256:${string}`;
}

interface AuthoredFile extends ProjectCreatePlannedFile {
  readonly content: Buffer;
}

interface FileIdentity {
  readonly dev: number;
  readonly ino: number;
}

interface TargetSnapshot {
  readonly state: "absent" | "empty" | "os-metadata-only";
  readonly identity: FileIdentity | null;
  readonly metadata: readonly AuthoredFile[];
  readonly preconditionDigest: `sha256:${string}`;
}

interface InternalProjectCreatePlan {
  readonly plan: OperationPlan;
  readonly parent: string;
  readonly target: string;
  readonly targetName: string;
  readonly files: readonly AuthoredFile[];
  readonly snapshot: TargetSnapshot;
}

const TEMPLATE_IDS = new Set<ProjectCreateTemplate>(["next", "vite"]);
const PRESET_IDS = new Set<ProjectCreatePreset>(["minimal", "application", "none"]);
const PACKAGE_MANAGERS = new Set<PackageManager>(["npm", "pnpm", "yarn", "bun"]);
const METADATA_NAMES = new Set<string>(PROJECT_CREATE_IGNORED_OS_METADATA);
const MANAGER_VERSIONS: Readonly<Record<PackageManager, string>> = {
  npm: "11.4.2",
  pnpm: "11.14.0",
  yarn: "4.12.0",
  bun: "1.3.5",
};

const TEMPLATE_GITIGNORE = `node_modules/
.next/
dist/
*.local

# Mergora local-only state
.mergora/cache/
.mergora/transactions/
.mergora/tmp/
.mergora/.lock
`;

const FOUNDATION_TOKENS = `/* Mergora workbench foundation 1.0.0 (unreleased). */
:root {
  color-scheme: light;
  --mrg-semantic-color-background-canvas: oklch(100% 0 0);
  --mrg-semantic-color-background-surface: oklch(97% 0.006 150);
  --mrg-semantic-color-background-surface-raised: oklch(98.5% 0.002 150);
  --mrg-semantic-color-foreground-primary: oklch(18% 0.018 150);
  --mrg-semantic-color-foreground-muted: oklch(47% 0.018 150);
  --mrg-semantic-color-border-default: oklch(87.5% 0.01 150);
  --mrg-semantic-color-border-strong: oklch(62% 0.018 150);
  --mrg-semantic-color-action-background: oklch(42% 0.13 150);
  --mrg-semantic-color-action-background-hover: oklch(34% 0.11 150);
  --mrg-semantic-color-action-foreground: oklch(100% 0 0);
  --mrg-semantic-color-focus-ring: oklch(33% 0.135 292);
  --mrg-semantic-font-family-prose: Arial, sans-serif;
  --mrg-semantic-font-family-machine: ui-monospace, SFMono-Regular, Consolas, monospace;
  --mrg-semantic-font-size-display: 2.5rem;
  --mrg-semantic-font-size-body: 0.9375rem;
  --mrg-semantic-font-line-height-body: 1.55;
  --mrg-semantic-font-weight-heading: 650;
  --mrg-semantic-radius-control: 0.375rem;
  --mrg-semantic-radius-panel: 0.5rem;
  --mrg-semantic-space-stack-xs: 0.5rem;
  --mrg-semantic-space-stack-sm: 0.75rem;
  --mrg-semantic-space-stack-md: 1rem;
  --mrg-semantic-space-stack-lg: 1.5rem;
  --mrg-semantic-space-page: clamp(1.25rem, 5vw, 4rem);
  --mrg-semantic-size-content-default: 70rem;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    color-scheme: dark;
    --mrg-semantic-color-background-canvas: oklch(12% 0.018 150);
    --mrg-semantic-color-background-surface: oklch(18% 0.018 150);
    --mrg-semantic-color-background-surface-raised: oklch(27% 0.018 150);
    --mrg-semantic-color-foreground-primary: oklch(97% 0.006 150);
    --mrg-semantic-color-foreground-muted: oklch(78% 0.014 150);
    --mrg-semantic-color-border-default: oklch(36% 0.018 150);
    --mrg-semantic-color-border-strong: oklch(62% 0.018 150);
    --mrg-semantic-color-action-background: oklch(84% 0.1 150);
    --mrg-semantic-color-action-background-hover: oklch(92% 0.06 150);
    --mrg-semantic-color-action-foreground: oklch(12% 0.018 150);
    --mrg-semantic-color-focus-ring: oklch(75% 0.14 150);
  }
}

@media (forced-colors: active) {
  :root {
    --mrg-semantic-color-background-canvas: Canvas;
    --mrg-semantic-color-background-surface: Canvas;
    --mrg-semantic-color-background-surface-raised: Canvas;
    --mrg-semantic-color-foreground-primary: CanvasText;
    --mrg-semantic-color-foreground-muted: CanvasText;
    --mrg-semantic-color-border-default: CanvasText;
    --mrg-semantic-color-border-strong: CanvasText;
    --mrg-semantic-color-action-background: ButtonFace;
    --mrg-semantic-color-action-background-hover: Highlight;
    --mrg-semantic-color-action-foreground: ButtonText;
    --mrg-semantic-color-focus-ring: Highlight;
  }
}
`;

const FOUNDATION_STYLES = `@import "./tokens/workbench.css";

* {
  box-sizing: border-box;
}

html {
  background: var(--mrg-semantic-color-background-canvas);
  color: var(--mrg-semantic-color-foreground-primary);
  font-family: var(--mrg-semantic-font-family-prose);
  line-height: var(--mrg-semantic-font-line-height-body);
}

body {
  margin: 0;
  min-inline-size: 20rem;
}

a {
  color: inherit;
}

:focus-visible {
  outline: 2px solid var(--mrg-semantic-color-focus-ring);
  outline-offset: 3px;
}

.mrg-create-shell {
  display: grid;
  gap: clamp(2rem, 7vw, 5rem);
  margin-inline: auto;
  max-inline-size: var(--mrg-semantic-size-content-default);
  min-block-size: 100dvh;
  padding: var(--mrg-semantic-space-page);
}

.mrg-create-hero {
  align-content: center;
  display: grid;
  gap: var(--mrg-semantic-space-stack-md);
  max-inline-size: 46rem;
}

.mrg-create-hero h1 {
  font-size: clamp(2.25rem, 8vw, var(--mrg-semantic-font-size-display));
  letter-spacing: -0.035em;
  line-height: 1.05;
  margin: 0;
}

.mrg-create-hero p {
  color: var(--mrg-semantic-color-foreground-muted);
  font-size: 1.0625rem;
  margin: 0;
  max-inline-size: 40rem;
}

.mrg-create-action {
  align-items: center;
  background: var(--mrg-semantic-color-action-background);
  border: 1px solid var(--mrg-semantic-color-border-strong);
  border-radius: var(--mrg-semantic-radius-control);
  color: var(--mrg-semantic-color-action-foreground);
  display: inline-flex;
  font-weight: 650;
  inline-size: fit-content;
  min-block-size: 2.75rem;
  padding-inline: 1rem;
  text-decoration: none;
}

.mrg-create-action:hover {
  background: var(--mrg-semantic-color-action-background-hover);
}

.mrg-create-grid {
  display: grid;
  gap: var(--mrg-semantic-space-stack-md);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
}

.mrg-create-panel {
  background: var(--mrg-semantic-color-background-surface-raised);
  border: 1px solid var(--mrg-semantic-color-border-default);
  border-radius: var(--mrg-semantic-radius-panel);
  padding: var(--mrg-semantic-space-stack-lg);
}

.mrg-create-panel > :first-child {
  margin-block-start: 0;
}

.mrg-create-panel > :last-child {
  margin-block-end: 0;
}
`;

function packageJsonText(
  template: ProjectCreateTemplate,
  packageManager: PackageManager,
  projectName: string,
): string {
  const commonDependencies = { react: "19.2.7", "react-dom": "19.2.7" };
  const commonDevelopment = {
    "@types/node": "24.13.3",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    tailwindcss: "4.3.3",
    typescript: "6.0.3",
  };
  const document =
    template === "next"
      ? {
          name: projectName,
          version: "1.0.0",
          private: true,
          packageManager: `${packageManager}@${MANAGER_VERSIONS[packageManager]}`,
          engines: { node: ">=24.12.0 <25" },
          scripts: {
            dev: "next dev",
            build: "next build",
            start: "next start",
            typecheck: "tsc --noEmit",
          },
          dependencies: { next: "16.2.10", ...commonDependencies },
          devDependencies: commonDevelopment,
        }
      : {
          name: projectName,
          version: "1.0.0",
          private: true,
          type: "module",
          packageManager: `${packageManager}@${MANAGER_VERSIONS[packageManager]}`,
          engines: { node: ">=24.12.0 <25" },
          scripts: {
            dev: "vite",
            build: "vite build",
            preview: "vite preview",
            typecheck: "tsc --noEmit",
          },
          dependencies: commonDependencies,
          devDependencies: { "@vitejs/plugin-react": "6.0.3", ...commonDevelopment, vite: "8.1.5" },
        };
  return `${JSON.stringify(document, null, 2)}\n`;
}

function presetMain(preset: ProjectCreatePreset): string {
  if (preset === "application") {
    return `<main className="mrg-create-shell">
      <section className="mrg-create-hero" aria-labelledby="page-title">
        <p>Mergora application preset</p>
        <h1 id="page-title">A clear foundation for real product work.</h1>
        <p>
          This starter keeps navigation, status, and primary work visible without inventing your
          application model.
        </p>
        <a className="mrg-create-action" href="#workspace">Open workspace</a>
      </section>
      <section aria-labelledby="workspace-title" className="mrg-create-grid" id="workspace">
        <article className="mrg-create-panel">
          <h2 id="workspace-title">Workspace</h2>
          <p>Connect your routes and data while preserving the semantic page structure.</p>
        </article>
        <aside className="mrg-create-panel" aria-labelledby="status-title">
          <h2 id="status-title">System status</h2>
          <p>Ready for your application adapters.</p>
        </aside>
      </section>
    </main>`;
  }
  if (preset === "minimal") {
    return `<main className="mrg-create-shell">
      <section className="mrg-create-hero">
        <p>Mergora minimal preset</p>
        <h1>Build the interface your product actually needs.</h1>
        <p>A small, typed starting point with explicit styling and accessibility foundations.</p>
        <a className="mrg-create-action" href="https://akhiltrivedix.github.io/mergora/">
          Read the documentation
        </a>
      </section>
    </main>`;
  }
  return `<main className="mrg-create-shell">
      <section className="mrg-create-hero">
        <p>Mergora configured</p>
        <h1>Your empty project is ready.</h1>
        <p>No starter preset was installed. Add only the components your product needs.</p>
      </section>
    </main>`;
}

function nextTemplate(preset: ProjectCreatePreset): Readonly<Record<string, string>> {
  return {
    "next-env.d.ts": `/// <reference types="next" />
/// <reference types="next/image-types/global" />

// Generated by the Mergora Next template. Next.js may maintain this file.
`,
    "next.config.ts": `import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
`,
    "src/app/globals.css": `@import "tailwindcss";
@import "../styles/mergora/foundations.css";
`,
    "src/app/layout.tsx": `import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Mergora application",
  description: "Created from the Mergora 1.0.0 unreleased minimal template.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
    "src/app/page.tsx": `export default function Page() {
  return (
    ${presetMain(preset)}
  );
}
`,
    "tsconfig.json": `${JSON.stringify(
      {
        compilerOptions: {
          allowJs: false,
          esModuleInterop: true,
          forceConsistentCasingInFileNames: true,
          incremental: true,
          isolatedModules: true,
          jsx: "preserve",
          lib: ["dom", "dom.iterable", "es2024"],
          module: "esnext",
          moduleResolution: "bundler",
          noEmit: true,
          paths: { "@/*": ["./src/*"] },
          plugins: [{ name: "next" }],
          resolveJsonModule: true,
          skipLibCheck: false,
          strict: true,
          target: "ES2024",
          types: ["node", "react", "react-dom"],
        },
        include: ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"],
        exclude: ["node_modules"],
      },
      null,
      2,
    )}\n`,
  };
}

function viteTemplate(preset: ProjectCreatePreset): Readonly<Record<string, string>> {
  return {
    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Created from the Mergora 1.0.0 unreleased minimal template." />
    <title>Mergora application</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    "src/App.tsx": `export function App() {
  return (
    ${presetMain(preset)}
  );
}
`,
    "src/index.css": `@import "tailwindcss";
@import "./styles/mergora/foundations.css";
`,
    "src/main.tsx": `import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

const root = document.querySelector<HTMLDivElement>("#root");
if (root === null) throw new Error("The Mergora template root is missing.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
    "src/vite-env.d.ts": `/// <reference types="vite/client" />
`,
    "tsconfig.json": `${JSON.stringify(
      {
        compilerOptions: {
          allowImportingTsExtensions: true,
          esModuleInterop: true,
          forceConsistentCasingInFileNames: true,
          isolatedModules: true,
          jsx: "react-jsx",
          lib: ["ES2024", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "Bundler",
          noEmit: true,
          noUncheckedIndexedAccess: true,
          paths: { "@/*": ["./src/*"] },
          resolveJsonModule: true,
          skipLibCheck: false,
          strict: true,
          target: "ES2024",
          types: ["node", "vite/client"],
        },
        include: ["src", "vite.config.ts"],
      },
      null,
      2,
    )}\n`,
    "vite.config.ts": `import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
});
`,
  };
}

function mediaType(target: string): ProjectCreatePlannedFile["mediaType"] {
  if (target.endsWith(".json")) return "application/json";
  if (target.endsWith(".css")) return "text/css";
  if (target.endsWith(".html")) return "text/html";
  if (target.endsWith(".tsx")) return "text/typescript-jsx";
  if (target.endsWith(".ts")) return "text/typescript";
  return "text/plain";
}

function authoredFile(
  target: string,
  value: string | Buffer,
  source: ProjectCreatePlannedFile["source"],
): AuthoredFile {
  if (!METADATA_NAMES.has(target)) assertPortableRelativePath(target, "Project template target");
  const content = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value, "utf8");
  return {
    target,
    content,
    digest: sha256(content),
    byteLength: content.byteLength,
    mediaType: mediaType(target),
    source,
  };
}

function projectPackageName(directoryName: string): string {
  const name = directoryName.toLocaleLowerCase("en-US");
  if (name.length > 214 || !/^[a-z0-9][a-z0-9._-]*$/u.test(name)) {
    throw new CliError("The creation directory does not map to a portable npm package name.", {
      code: "CREATE_PACKAGE_NAME_INVALID",
      exitCode: 2,
    });
  }
  return name;
}

function initFiles(
  template: ProjectCreateTemplate,
  packageManager: PackageManager,
): readonly AuthoredFile[] {
  const framework = template === "next" ? "next-app" : "vite-react";
  const globalCss = template === "next" ? "src/app/globals.css" : "src/index.css";
  const inspection: ProjectInspection = {
    root: ".",
    framework,
    frameworkEvidence: [`--framework=${framework}`],
    sourceRoot: "src",
    tsconfig: "tsconfig.json",
    aliasPrefix: "@",
    aliasEvidence: ["tsconfig.json:paths"],
    globalCss,
    stylingEngine: "tailwind-v4",
    packageManager,
    packageManagerEvidence: [`--package-manager=${packageManager}`],
    packageName: "mergora-create-plan",
    hasMergoraConfig: false,
    hasManifest: false,
    warnings: [],
  };
  const configText = `${JSON.stringify(createMergoraConfig(inspection), null, 2)}\n`;
  const manifestText = `${JSON.stringify(
    {
      $schema: MANIFEST_SCHEMA,
      schemaVersion: 1,
      projectId: sha256(configText),
      toolchain: {
        cli: CLI_VERSION,
        schema: "1.0.0",
        transformer: "1.0.0",
        formatter: "mergora@1",
      },
      items: {},
      sharedTargets: {},
      dependencyOwners: {},
    },
    null,
    2,
  )}\n`;
  return [
    authoredFile(".mergora/manifest.json", manifestText, "initialization"),
    authoredFile("mergora.json", configText, "initialization"),
  ];
}

function templateFiles(
  template: ProjectCreateTemplate,
  packageManager: PackageManager,
  preset: ProjectCreatePreset,
  projectName: string,
): readonly AuthoredFile[] {
  const frameworkFiles = template === "next" ? nextTemplate(preset) : viteTemplate(preset);
  const texts: Readonly<Record<string, string>> = {
    ...frameworkFiles,
    ".gitignore": TEMPLATE_GITIGNORE,
    "package.json": packageJsonText(template, packageManager, projectName),
    "src/styles/mergora/foundations.css": FOUNDATION_STYLES,
    "src/styles/mergora/tokens/workbench.css": FOUNDATION_TOKENS,
  };
  const files = portableSort(Object.keys(texts)).map((target) =>
    authoredFile(
      target,
      texts[target]!,
      target.includes("/styles/mergora/") ? "foundation" : "template",
    ),
  );
  const keys = files.map(({ target }) => target.normalize("NFC").toLocaleLowerCase("en-US"));
  if (new Set(keys).size !== keys.length) {
    throw new CliError("The bundled project template contains a portable path collision.", {
      code: "CREATE_TEMPLATE_COLLISION",
      exitCode: 5,
    });
  }
  return files;
}

function validateSelections(options: ProjectCreateOptions): void {
  if (!TEMPLATE_IDS.has(options.template)) {
    throw new CliError("Non-interactive create requires --template next or vite.", {
      code: "CREATE_TEMPLATE_REQUIRED",
      exitCode: 2,
    });
  }
  if (!PACKAGE_MANAGERS.has(options.packageManager)) {
    throw new CliError("Non-interactive create requires an explicit supported package manager.", {
      code: "CREATE_PACKAGE_MANAGER_REQUIRED",
      exitCode: 2,
    });
  }
  if (!PRESET_IDS.has(options.preset)) {
    throw new CliError("Non-interactive create requires --preset minimal, application, or none.", {
      code: "CREATE_PRESET_REQUIRED",
      exitCode: 2,
    });
  }
}

function hasSymbolicLinkAncestor(path: string): boolean {
  let current = path;
  while (true) {
    if (lstatSync(current).isSymbolicLink()) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function destination(options: ProjectCreateOptions): {
  readonly parent: string;
  readonly target: string;
  readonly targetName: string;
} {
  if (typeof options.directory !== "string" || options.directory.trim() === "") {
    throw new CliError("Create requires one destination directory.", {
      code: "CREATE_DIRECTORY_REQUIRED",
      exitCode: 2,
    });
  }
  const native = options.directory;
  const portableInput = native.replaceAll("\\", "/");
  if (
    /(?:^|\/)\.\.?(?:\/|$)/u.test(portableInput) ||
    [...native].some((character) => {
      const code = character.codePointAt(0)!;
      return code <= 31 || code === 127;
    }) ||
    /[\\/]$/u.test(native)
  ) {
    throw new CliError("Creation directory spelling contains unsafe path segments.", {
      code: "CREATE_PATH_UNSAFE",
      exitCode: 2,
    });
  }
  if (!isAbsolute(native)) assertPortableRelativePath(portableInput, "Creation directory");
  const unresolved = resolve(options.cwd ?? process.cwd(), native);
  if (unresolved === parse(unresolved).root) {
    throw new CliError("The filesystem root cannot be used as a creation directory.", {
      code: "CREATE_PATH_UNSAFE",
      exitCode: 2,
    });
  }
  const targetName = basename(unresolved);
  assertPortableRelativePath(targetName, "Creation directory name");
  projectPackageName(targetName);
  const unresolvedParent = dirname(unresolved);
  let metadata;
  try {
    metadata = lstatSync(unresolvedParent);
  } catch {
    throw new CliError("The destination parent must already exist.", {
      code: "CREATE_PARENT_INVALID",
      exitCode: 3,
    });
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new CliError("The destination parent must be a real directory, not a symbolic link.", {
      code: "CREATE_PARENT_UNSAFE",
      exitCode: 5,
    });
  }
  if (hasSymbolicLinkAncestor(unresolvedParent)) {
    throw new CliError("Creation refuses a destination reached through symbolic-link ancestors.", {
      code: "CREATE_PARENT_UNSAFE",
      exitCode: 5,
    });
  }
  const parent = realpathSync.native(unresolvedParent);
  return { parent, target: resolve(parent, targetName), targetName };
}

function identity(metadata: { readonly dev: number; readonly ino: number }): FileIdentity {
  return { dev: metadata.dev, ino: metadata.ino };
}

function sameIdentity(
  metadata: { readonly dev: number; readonly ino: number },
  expected: FileIdentity,
): boolean {
  return metadata.dev === expected.dev && metadata.ino === expected.ino;
}

function safeLstat(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function readRegularFileNoFollow(
  path: string,
  label: string,
): { content: Buffer; identity: FileIdentity } {
  const before = lstatSync(path);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new CliError(`${label} must be a regular file.`, {
      code: "CREATE_TARGET_UNSAFE",
      exitCode: 5,
      target: label,
    });
  }
  let descriptor: number | null = null;
  try {
    const flags =
      process.platform === "win32" ? constants.O_RDONLY : constants.O_RDONLY | constants.O_NOFOLLOW;
    descriptor = openSync(path, flags);
    const opened = fstatSync(descriptor);
    const current = lstatSync(path);
    if (
      !opened.isFile() ||
      current.isSymbolicLink() ||
      !current.isFile() ||
      !sameIdentity(current, identity(before)) ||
      !sameIdentity(opened, identity(before))
    ) {
      throw new CliError(`${label} changed during no-follow inspection.`, {
        code: "CREATE_TARGET_UNSAFE",
        exitCode: 5,
        target: label,
      });
    }
    return { content: readFileSync(descriptor), identity: identity(before) };
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function assertNoPortableSiblingCollision(parent: string, targetName: string): void {
  const key = targetName.normalize("NFC").toLocaleLowerCase("en-US");
  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    if (entry.name === targetName) continue;
    if (entry.name.normalize("NFC").toLocaleLowerCase("en-US") === key) {
      throw new CliError(
        `Creation directory collides portably with existing sibling ${JSON.stringify(entry.name)}.`,
        { code: "CREATE_PORTABLE_COLLISION", exitCode: 6, target: targetName },
      );
    }
  }
}

function targetSnapshot(parent: string, target: string, targetName: string): TargetSnapshot {
  assertNoPortableSiblingCollision(parent, targetName);
  const destinationBindingDigest = sha256(
    process.platform === "win32" ? target.toLocaleLowerCase("en-US") : target,
  );
  const metadata = safeLstat(target);
  if (metadata === null) {
    const preconditionDigest = sha256(
      canonicalJson({
        destinationBindingDigest,
        directoryName: targetName,
        initialState: "absent",
        metadata: [],
      }),
    );
    return { state: "absent", identity: null, metadata: [], preconditionDigest };
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new CliError("Creation target must be absent or a real empty directory.", {
      code: "CREATE_TARGET_UNSAFE",
      exitCode: 5,
      target: targetName,
    });
  }
  const entries = portableSort(readdirSync(target));
  const unexpected = entries.filter((entry) => !METADATA_NAMES.has(entry));
  if (unexpected.length > 0) {
    throw new CliError(
      `Creation target is not empty; refusing to overwrite ${JSON.stringify(unexpected[0])}.`,
      { code: "CREATE_TARGET_NOT_EMPTY", exitCode: 6, target: targetName },
    );
  }
  const preserved = entries.map((entry) => {
    const read = readRegularFileNoFollow(resolve(target, entry), entry);
    return authoredFile(entry, read.content, "preserved-os-metadata");
  });
  const state = entries.length === 0 ? "empty" : "os-metadata-only";
  const preconditionDigest = sha256(
    canonicalJson({
      destinationBindingDigest,
      directoryName: targetName,
      initialState: state,
      metadata: preserved.map(({ target: path, digest, byteLength }) => ({
        target: path,
        digest,
        byteLength,
      })),
    }),
  );
  return { state, identity: identity(metadata), metadata: preserved, preconditionDigest };
}

function installationInvocation(manager: PackageManager, cwd: string): PackageManagerInvocation {
  if (manager === "pnpm") {
    return {
      executable: "pnpm",
      arguments: ["install", "--ignore-scripts", "--no-frozen-lockfile"],
      cwd,
    };
  }
  if (manager === "npm") {
    return { executable: "npm", arguments: ["install", "--ignore-scripts"], cwd };
  }
  if (manager === "yarn") {
    return { executable: "yarn", arguments: ["install", "--mode=skip-builds"], cwd };
  }
  return { executable: "bun", arguments: ["install", "--ignore-scripts"], cwd };
}

function planFile(file: AuthoredFile): ProjectCreatePlannedFile {
  const { content: _content, ...planned } = file;
  return planned;
}

function internalProjectCreatePlan(options: ProjectCreateOptions): InternalProjectCreatePlan {
  validateSelections(options);
  const resolved = destination(options);
  const snapshot = targetSnapshot(resolved.parent, resolved.target, resolved.targetName);
  const projectName = projectPackageName(resolved.targetName);
  const authored = templateFiles(
    options.template,
    options.packageManager,
    options.preset,
    projectName,
  );
  const initialized = initFiles(options.template, options.packageManager);
  const files = [...authored, ...initialized, ...snapshot.metadata].sort((left, right) =>
    left.target.localeCompare(right.target, "en-US"),
  );
  const keys = files.map(({ target }) => target.normalize("NFC").toLocaleLowerCase("en-US"));
  if (new Set(keys).size !== keys.length) {
    throw new CliError("The create plan contains a portable target collision.", {
      code: "CREATE_PLAN_COLLISION",
      exitCode: 6,
    });
  }
  const deterministicFiles = files.map(planFile);
  const templateDigest = sha256(
    canonicalJson({
      id: options.template,
      version: PROJECT_CREATE_TEMPLATE_VERSION,
      preset: options.preset,
      files: deterministicFiles.filter(({ source }) => source !== "preserved-os-metadata"),
    }),
  );
  const configFile = files.find(({ target }) => target === "mergora.json");
  const packageFile = files.find(({ target }) => target === "package.json");
  if (configFile === undefined || packageFile === undefined) {
    throw new CliError("The create template omitted required project metadata.", {
      code: "CREATE_TEMPLATE_INVALID",
      exitCode: 8,
    });
  }
  const packageDocument = JSON.parse(packageFile.content.toString("utf8")) as {
    readonly dependencies?: Readonly<Record<string, string>> | undefined;
    readonly devDependencies?: Readonly<Record<string, string>> | undefined;
  };
  const dependencyChanges: OperationPlanDependencyChange[] = [
    ...Object.entries(packageDocument.dependencies ?? {}).map(([name, version]) => ({
      scope: "runtime" as const,
      package: name,
      operation: "add" as const,
      from: null,
      to: version,
      owners: ["official:create"],
    })),
    ...Object.entries(packageDocument.devDependencies ?? {}).map(([name, version]) => ({
      scope: "development" as const,
      package: name,
      operation: "add" as const,
      from: null,
      to: version,
      owners: ["official:create"],
    })),
  ].sort(
    (left, right) =>
      left.package.localeCompare(right.package, "en-US") || left.scope.localeCompare(right.scope),
  );
  const fileOperations: OperationPlanFile[] = files.map((file) => {
    const preserved = file.source === "preserved-os-metadata";
    return {
      operation: preserved ? "no-op" : "add",
      target: file.target,
      owner: "official:create",
      base: preserved ? file.digest : null,
      local: preserved ? file.digest : null,
      remote: file.digest,
      proposed: file.digest,
      mediaType: file.mediaType,
      risk: "ordinary",
      reason: preserved
        ? "Preserve allowlisted operating-system metadata byte-for-byte."
        : `Create deterministic ${file.source} bytes from the reviewed project template.`,
    };
  });
  const install = installationInvocation(options.packageManager, ".");
  const plan = finalizeOperationPlan({
    schemaVersion: 1,
    command: "create",
    cliVersion: CLI_VERSION,
    projectRoot: ".",
    configDigest: sha256(canonicalJson(JSON.parse(configFile.content.toString("utf8")) as unknown)),
    manifestPreconditionDigest: null,
    registries: [],
    items: [],
    fileOperations,
    dependencyChanges,
    structuredPatches: [],
    migrations: [],
    contractChanges: [],
    warnings: [
      `Destination ${resolved.targetName} begins ${snapshot.state}; precondition ${snapshot.preconditionDigest}; ignored metadata ${PROJECT_CREATE_IGNORED_OS_METADATA.join(", ")}.`,
      `Template ${options.template}@${PROJECT_CREATE_TEMPLATE_VERSION} (${PROJECT_CREATE_PUBLICATION_STATUS}) digest ${templateDigest}; preset ${options.preset}.`,
      `Package manager ${options.packageManager}@${MANAGER_VERSIONS[options.packageManager]}${options.noInstall === true ? "; install skipped" : `; fixed install ${install.executable} ${install.arguments.join(" ")}; cwd .; shell false`}.`,
      "The bundled template and Mergora packages are 1.0.0/unreleased; this is not release evidence.",
      ...(options.noInstall === true
        ? [
            "Dependency installation was explicitly disabled; no lockfile or dependency tree is claimed.",
          ]
        : [
            "The selected package manager owns its generated lockfile and dependency tree; deterministic authored-file digests remain separately verified.",
          ]),
    ],
    consentRequirements: [
      {
        id: "create-project",
        flag: "--yes",
        reason: "Create the reviewed project directory and deterministic authored files.",
      },
    ],
    conflicts: [],
    estimatedBytes: {
      download: 0,
      write: files.reduce(
        (total, file) => total + (file.source === "preserved-os-metadata" ? 0 : file.byteLength),
        0,
      ),
    },
    validationSuite: ["schema", "digest", "path", "collision", "project-configured"],
    rollbackAvailable: false,
  });
  return {
    plan,
    parent: resolved.parent,
    target: resolved.target,
    targetName: resolved.targetName,
    files,
    snapshot,
  };
}

export function planProjectCreate(options: ProjectCreateOptions): ProjectCreatePlan {
  return internalProjectCreatePlan(options).plan;
}

function ensureStageDirectory(parent: string): { path: string; identity: FileIdentity } {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const path = resolve(parent, `.mergora-create-${randomBytes(16).toString("hex")}.stage`);
    try {
      mkdirSync(path, { mode: 0o700 });
      return { path, identity: identity(lstatSync(path)) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt === 7) throw error;
    }
  }
  throw new Error("Unable to allocate an exclusive create staging directory.");
}

function ensureDirectoryTree(root: string, target: string): void {
  const segments = assertPortableRelativePath(target, "Project template target");
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    current = resolve(current, segment);
    const metadata = safeLstat(current);
    if (metadata === null) mkdirSync(current, { mode: 0o700 });
    else if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new CliError("The private create staging tree became unsafe.", {
        code: "CREATE_STAGE_UNSAFE",
        exitCode: 8,
      });
    }
  }
}

function writeExclusive(root: string, file: AuthoredFile): void {
  if (!METADATA_NAMES.has(file.target)) ensureDirectoryTree(root, file.target);
  const path = resolve(root, ...file.target.split("/"));
  let descriptor: number | null = null;
  try {
    descriptor = openSync(path, "wx", 0o600);
    writeFileSync(descriptor, file.content);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function assertDirectoryIdentity(path: string, expected: FileIdentity, label: string): void {
  const metadata = safeLstat(path);
  if (
    metadata === null ||
    metadata.isSymbolicLink() ||
    !metadata.isDirectory() ||
    !sameIdentity(metadata, expected)
  ) {
    throw new CliError(`${label} changed during creation.`, {
      code: "CREATE_STAGE_UNSAFE",
      exitCode: 8,
    });
  }
}

function verifyPlannedFiles(root: string, files: readonly AuthoredFile[]): void {
  for (const file of files) {
    const path = resolve(root, ...file.target.split("/"));
    const read = readRegularFileNoFollow(path, file.target);
    if (sha256(read.content) !== file.digest || read.content.byteLength !== file.byteLength) {
      throw new CliError(`Created file ${file.target} does not match its reviewed digest.`, {
        code: "CREATE_DIGEST_MISMATCH",
        exitCode: 8,
        target: file.target,
      });
    }
  }
}

function validateCreatedProject(
  root: string,
  options: ProjectCreateOptions,
  files: readonly AuthoredFile[],
): void {
  verifyPlannedFiles(root, files);
  const framework = options.template === "next" ? "next-app" : "vite-react";
  const globalCss = options.template === "next" ? "src/app/globals.css" : "src/index.css";
  const inspected = inspectProject(root, {
    framework,
    sourceRoot: "src",
    globalCss,
    aliasPrefix: "@",
    packageManager: options.packageManager,
  });
  if (!inspected.hasMergoraConfig || !inspected.hasManifest) {
    throw new CliError("The staged project did not reach the initialized Mergora state.", {
      code: "CREATE_INITIALIZATION_FAILED",
      exitCode: 8,
    });
  }
  if (existsSync(resolve(root, ".git"))) {
    throw new CliError("Project creation must not initialize Git.", {
      code: "CREATE_GIT_FORBIDDEN",
      exitCode: 8,
      target: ".git",
    });
  }
  const config = JSON.parse(readFileSync(resolve(root, "mergora.json"), "utf8")) as {
    readonly $schema?: unknown;
  };
  if (config.$schema !== CONFIG_SCHEMA) {
    throw new CliError("The staged Mergora configuration identity is invalid.", {
      code: "CREATE_INITIALIZATION_FAILED",
      exitCode: 8,
      target: "mergora.json",
    });
  }
}

function defaultPackageManagerRunner(invocation: PackageManagerInvocation) {
  let executable = invocation.executable;
  let arguments_ = [...invocation.arguments];
  if (process.platform === "win32" && ["npm", "pnpm", "yarn"].includes(executable)) {
    const corepack = resolve(
      dirname(process.execPath),
      "node_modules",
      "corepack",
      "dist",
      "corepack.js",
    );
    if (!existsSync(corepack)) {
      return {
        status: null,
        error: new Error("The trusted Corepack executable is unavailable."),
      };
    }
    executable = process.execPath;
    arguments_ = [corepack, invocation.executable, ...arguments_];
  }
  const result = spawnSync(executable, arguments_, {
    cwd: invocation.cwd,
    shell: false,
    stdio: "inherit",
  });
  return { status: result.status, ...(result.error === undefined ? {} : { error: result.error }) };
}

function invokePackageManager(options: ProjectCreateOptions, stage: string): void {
  const invocation = installationInvocation(options.packageManager, stage);
  const runner = options.packageManagerRunner ?? defaultPackageManagerRunner;
  let result: ReturnType<PackageManagerRunner>;
  try {
    result = runner(invocation);
  } catch (error) {
    result = {
      status: null,
      error: error instanceof Error ? error : new Error("Package-manager runner failed."),
    };
  }
  if (
    result.status !== null &&
    (!Number.isInteger(result.status) || result.status < 0 || result.status > 255)
  ) {
    result = { status: null, error: new Error("Package-manager runner returned invalid status.") };
  }
  if (result.error !== undefined || result.status !== 0) {
    throw new CliError(
      `The ${options.packageManager} install failed; project creation will roll back.`,
      { code: "CREATE_PACKAGE_MANAGER_FAILED", exitCode: 9, target: "package.json" },
    );
  }
}

function assertSnapshotUnchanged(plan: InternalProjectCreatePlan): void {
  const current = targetSnapshot(plan.parent, plan.target, plan.targetName);
  if (
    current.preconditionDigest !== plan.snapshot.preconditionDigest ||
    current.state !== plan.snapshot.state ||
    (plan.snapshot.identity !== null &&
      (current.identity === null ||
        current.identity.dev !== plan.snapshot.identity.dev ||
        current.identity.ino !== plan.snapshot.identity.ino))
  ) {
    throw new CliError("The creation target changed after planning.", {
      code: "PLAN_TARGET_STALE",
      exitCode: 8,
      target: plan.targetName,
    });
  }
}

function assertOriginalBackupUnchanged(path: string, snapshot: TargetSnapshot): void {
  if (snapshot.identity === null) {
    throw new CliError("An absent creation target cannot have an original backup.", {
      code: "CREATE_RECOVERY_REQUIRED",
      exitCode: 8,
    });
  }
  assertDirectoryIdentity(path, snapshot.identity, "Original creation target");
  const entries = portableSort(readdirSync(path));
  const expected = snapshot.metadata.map(({ target }) => target);
  if (canonicalJson(entries) !== canonicalJson(expected)) {
    throw new CliError("The original creation target changed during the reversible swap.", {
      code: "PLAN_TARGET_STALE",
      exitCode: 8,
    });
  }
  for (const file of snapshot.metadata) {
    const read = readRegularFileNoFollow(resolve(path, file.target), file.target);
    if (sha256(read.content) !== file.digest || read.content.byteLength !== file.byteLength) {
      throw new CliError("The original creation target changed during the reversible swap.", {
        code: "PLAN_TARGET_STALE",
        exitCode: 8,
        target: file.target,
      });
    }
  }
}

function renameWithRetry(from: string, to: string): void {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") throw error;
      if (attempt < 5) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5 * (attempt + 1));
      }
    }
  }
  throw lastError;
}

function unusedSiblingPath(parent: string, suffix: string): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = resolve(
      parent,
      `.mergora-create-${randomBytes(16).toString("hex")}.${suffix}`,
    );
    if (safeLstat(candidate) === null) return candidate;
  }
  throw new Error("Unable to allocate an exclusive create recovery path.");
}

function fsyncDirectory(path: string): void {
  let descriptor: number | null = null;
  try {
    descriptor = openSync(path, "r");
    fsyncSync(descriptor);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EINVAL" && code !== "EPERM" && code !== "EISDIR") throw error;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function removeOwnedDirectory(path: string, expected: FileIdentity): void {
  assertDirectoryIdentity(path, expected, "Mergora-owned create directory");
  rmSync(path, { recursive: true, force: true, maxRetries: 4, retryDelay: 20 });
}

function restoreAfterFailure(options: {
  readonly target: string;
  readonly stage: string;
  readonly stageIdentity: FileIdentity;
  readonly stageMoved: boolean;
  readonly backup: string | null;
  readonly originalMoved: boolean;
}): void {
  if (options.stageMoved) removeOwnedDirectory(options.target, options.stageIdentity);
  else if (safeLstat(options.stage) !== null)
    removeOwnedDirectory(options.stage, options.stageIdentity);
  if (options.originalMoved && options.backup !== null) {
    if (safeLstat(options.target) !== null) {
      throw new Error("The original target cannot be restored because its path is occupied.");
    }
    renameWithRetry(options.backup, options.target);
  }
}

/**
 * Applies exactly one reviewed create plan. The digest is mandatory: command adapters must plan,
 * display/record consent, then pass the reviewed digest back to this function.
 */
export function applyProjectCreate(
  options: ProjectCreateOptions,
  expectedPlanDigest: string,
): ProjectCreateResult {
  if (typeof expectedPlanDigest !== "string" || expectedPlanDigest === "") {
    throw new CliError("Create apply requires the reviewed plan digest.", {
      code: "PLAN_DIGEST_REQUIRED",
      exitCode: 2,
    });
  }
  const plan = internalProjectCreatePlan(options);
  if (expectedPlanDigest !== plan.plan.planDigest) {
    throw new CliError("Create plan changed before apply; review a fresh plan.", {
      code: "PLAN_PRECONDITION_STALE",
      exitCode: 8,
    });
  }

  const allocated = ensureStageDirectory(plan.parent);
  const stage = allocated.path;
  const stageIdentity = allocated.identity;
  let backup: string | null = null;
  let originalMoved = false;
  let stageMoved = false;
  try {
    options.faultInjector?.("stage-created");
    for (const file of plan.files.filter(({ source }) => source !== "initialization")) {
      writeExclusive(stage, file);
    }
    assertDirectoryIdentity(stage, stageIdentity, "Create staging directory");
    options.faultInjector?.("template-written");

    const initOptions = {
      projectRoot: stage,
      framework: options.template === "next" ? ("next-app" as const) : ("vite-react" as const),
      sourceRoot: "src",
      globalCss: options.template === "next" ? "src/app/globals.css" : "src/index.css",
      aliasPrefix: "@",
      packageManager: options.packageManager,
    };
    const initPlan = planInit(initOptions);
    applyInit(initOptions, initPlan.planDigest);
    options.faultInjector?.("initialized");
    validateCreatedProject(stage, options, plan.files);
    options.faultInjector?.("validated");

    assertSnapshotUnchanged(plan);
    options.faultInjector?.("before-commit");
    if (plan.snapshot.identity !== null) {
      backup = unusedSiblingPath(plan.parent, "original");
      renameWithRetry(plan.target, backup);
      originalMoved = true;
      assertOriginalBackupUnchanged(backup, plan.snapshot);
      options.faultInjector?.("target-moved");
    }
    if (safeLstat(plan.target) !== null) {
      throw new CliError("The creation target was occupied during atomic commit.", {
        code: "PLAN_TARGET_STALE",
        exitCode: 8,
        target: plan.targetName,
      });
    }
    renameWithRetry(stage, plan.target);
    stageMoved = true;
    fsyncDirectory(plan.parent);
    options.faultInjector?.("committed");
    assertDirectoryIdentity(plan.target, stageIdentity, "Created project directory");
    validateCreatedProject(plan.target, options, plan.files);

    // Package-manager trees can contain absolute junctions or path-bound shims on Windows.
    // Install only after the atomic rename, but before discarding the reversible original-target
    // backup. A failed install therefore still rolls back the complete create operation.
    if (options.noInstall !== true) {
      invokePackageManager(options, plan.target);
      assertDirectoryIdentity(plan.target, stageIdentity, "Created project directory");
      validateCreatedProject(plan.target, options, plan.files);
      options.faultInjector?.("package-manager-complete");
    }

    if (backup !== null && plan.snapshot.identity !== null) {
      assertOriginalBackupUnchanged(backup, plan.snapshot);
      removeOwnedDirectory(backup, plan.snapshot.identity);
      backup = null;
      originalMoved = false;
      fsyncDirectory(plan.parent);
    }
    return {
      state: "created",
      projectRoot: ".",
      directoryName: plan.targetName,
      template: options.template,
      templateVersion: PROJECT_CREATE_TEMPLATE_VERSION,
      publicationStatus: PROJECT_CREATE_PUBLICATION_STATUS,
      preset: options.preset,
      packageManager: options.packageManager,
      installInvoked: options.noInstall !== true,
      files: plan.files.map(({ target }) => target),
      planDigest: plan.plan.planDigest,
    };
  } catch (error) {
    try {
      restoreAfterFailure({
        target: plan.target,
        stage,
        stageIdentity,
        stageMoved,
        backup,
        originalMoved,
      });
    } catch {
      throw new CliError(
        "Create failed and automatic restoration could not prove ownership; preserve the sibling recovery directory and inspect the parent manually.",
        { code: "CREATE_RECOVERY_REQUIRED", exitCode: 8, target: plan.targetName },
      );
    }
    throw error;
  }
}
