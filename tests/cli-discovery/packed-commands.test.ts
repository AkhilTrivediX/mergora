import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const cliPackage = resolve(workspaceRoot, "packages/cli");
const cliBin = resolve(cliPackage, "dist/bin.js");
const temporaryDirectories: string[] = [];

interface CommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function command(arguments_: readonly string[], cwd = workspaceRoot): CommandResult {
  const result = spawnSync(process.execPath, [cliBin, ...arguments_], {
    cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function json(result: CommandResult): Record<string, unknown> {
  expect(result.stdout.trim()).not.toBe("");
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

beforeAll(() => {
  const result = spawnSync(process.execPath, [resolve(cliPackage, "scripts/build.mjs")], {
    cwd: cliPackage,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`Packed CLI build failed:\n${result.stdout}\n${result.stderr}`);
  }
});

afterAll(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("packed command parser and output contract", () => {
  it("keeps help and version fast, complete, and dependency-free", () => {
    const help = command(["--help"]);
    const version = command(["--version"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("init");
    expect(help.stdout).toContain("search");
    expect(help.stdout).toContain("doctor");
    expect(help.stdout).toContain("recover");
    expect(version).toMatchObject({ status: 0, stdout: "0.0.0\n", stderr: "" });
  });

  it("supports global flags before commands and emits deterministic JSON", () => {
    const first = command(["--json", "search", "button", "--limit", "2"]);
    const second = command(["search", "button", "--limit=2", "--json"]);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(first.stdout).toBe(second.stdout);
    expect(json(first)).toMatchObject({
      schemaVersion: 1,
      command: "search",
      ok: true,
      status: "success",
      exitCode: 0,
      warnings: [],
      errors: [],
    });
  });

  it("uses stable usage errors and never leaks ANSI or an absolute root", () => {
    const invalid = command(["search", "button", "--limit", "0", "--json"]);
    expect(invalid.status).toBe(2);
    const envelope = json(invalid);
    expect(envelope).toMatchObject({ ok: false, exitCode: 2, command: "search" });
    expect(invalid.stdout).not.toContain("\u001b[");
    expect(invalid.stdout).not.toContain(workspaceRoot);

    const unknown = command(["search", "--unknown", "--json"]);
    expect(unknown.status).toBe(2);
    expect(json(unknown)).toMatchObject({
      errors: [{ code: "COMMAND_USAGE_INVALID" }],
    });

    const sensitive = command(["--secret=C:\\Users\\person\\private-token", "--json"]);
    expect(sensitive.status).toBe(2);
    expect(sensitive.stdout).not.toContain("person");
    expect(sensitive.stdout).not.toContain("private-token");
  });

  it("prints explicit source only when requested", () => {
    const ordinary = command(["view", "button", "--json"]);
    const source = command(["view", "button", "--source", "button.tsx"]);
    expect(ordinary.status).toBe(0);
    expect(ordinary.stdout).not.toContain("export const Button");
    expect(source.status).toBe(0);
    expect(source.stdout).toContain("export const Button");
  });

  it("skips browser opening in non-interactive docs mode", () => {
    const result = command(["docs", "sr-only", "--open", "--non-interactive", "--format", "json"]);
    expect(result.status).toBe(0);
    expect(json(result)).toMatchObject({
      result: { canonical: "visually-hidden", opened: false },
      warnings: ["Browser opening was skipped because this invocation is non-interactive."],
    });
  });
});

describe("packed project commands", () => {
  it("plans, requires narrow consent, applies, and then no-ops in a path with spaces", () => {
    const project = createProjectFixture({ directoryPrefix: "mergora packed path with spaces " });
    temporaryDirectories.push(project.root);

    const planned = command(["init", "--cwd", project.root, "--plan", "--json"]);
    expect(planned.status).toBe(0);
    expect(planned.stdout).not.toContain(project.root);
    expect(json(planned)).toMatchObject({ status: "planned", result: { projectRoot: "." } });
    expect(existsSync(resolve(project.root, "mergora.json"))).toBe(false);

    const missingConsent = command(["init", "--cwd", project.root, "--non-interactive", "--json"]);
    expect(missingConsent.status).toBe(12);
    expect(json(missingConsent)).toMatchObject({
      exitCode: 12,
      errors: [{ code: "CONSENT_REQUIRED" }],
    });

    const applied = command([
      "init",
      "--cwd",
      project.root,
      "--yes",
      "--non-interactive",
      "--json",
    ]);
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0);
    expect(json(applied)).toMatchObject({ status: "applied" });
    expect(existsSync(resolve(project.root, "mergora.json"))).toBe(true);

    const noOp = command(["init", "--cwd", project.root, "--non-interactive", "--json"]);
    expect(noOp.status).toBe(0);
    expect(json(noOp)).toMatchObject({ status: "no-op" });
  });

  it("reports info, status, and doctor through stable local-only envelopes", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes"]).status).toBe(0);
    for (const name of ["info", "status", "doctor"] as const) {
      const result = command([name, "--cwd", project.root, "--json"]);
      expect(result.status).toBe(0);
      expect(json(result)).toMatchObject({
        schemaVersion: 1,
        command: name,
        ok: true,
        exitCode: 0,
      });
      expect(result.stdout).not.toContain(project.root);
    }
  });

  it("preserves the clean-consumer add command while supporting exact plans", () => {
    const project = createProjectFixture({ manager: "npm" });
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    const plan = command([
      "add",
      "button",
      "dialog",
      "combobox",
      "--root",
      project.root,
      "--target",
      "src/components",
      "--no-install",
      "--plan",
      "--json",
    ]);
    expect(plan.status).toBe(0);
    expect(json(plan)).toMatchObject({ status: "planned", result: { command: "add" } });
    expect(
      (json(plan).result as { items: readonly { id: string }[] }).items.map(({ id }) => id),
    ).toEqual([
      "official:button",
      "official:combobox",
      "official:dialog",
      "official:direction",
      "official:layer-manager",
      "official:provider",
      "official:slot",
    ]);
    expect(existsSync(resolve(project.root, "src/components/button/button.tsx"))).toBe(false);

    const applied = command([
      "add",
      "button",
      "dialog",
      "combobox",
      "--root",
      project.root,
      "--target",
      "src/components",
      "--no-install",
      "--yes",
      "--non-interactive",
      "--json",
    ]);
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0);
    expect(json(applied)).toMatchObject({
      result: {
        mode: "source-transaction",
        items: ["button", "combobox", "slot", "layer-manager", "direction", "provider", "dialog"],
        transaction: { state: "committed" },
      },
    });
    expect(existsSync(resolve(project.root, "src/components/dialog/dialog.tsx"))).toBe(true);
    expect(readFileSync(resolve(project.root, "package.json"), "utf8")).toContain(
      '"react-aria-components": "1.19.0"',
    );
  });

  it("does not mutate on a bare non-interactive add", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    const result = command([
      "add",
      "button",
      "--root",
      project.root,
      "--non-interactive",
      "--json",
    ]);
    expect(result.status).toBe(12);
    expect(json(result)).toMatchObject({
      exitCode: 12,
      errors: [{ code: "CONSENT_REQUIRED" }],
    });
    expect(existsSync(resolve(project.root, "src/components/button"))).toBe(false);
    expect(existsSync(resolve(project.root, ".mergora/transactions"))).toBe(false);
  });

  it("reports a missing-source adoption as a conflict even when the plan has no writes", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    const manifestPath = resolve(project.root, ".mergora/manifest.json");
    const manifestBefore = readFileSync(manifestPath);

    const planned = command(["adopt", "button", "--cwd", project.root, "--plan", "--json"]);
    expect(planned.status).toBe(0);
    expect(json(planned)).toMatchObject({ ok: true, status: "conflict" });

    const applied = command([
      "adopt",
      "button",
      "--cwd",
      project.root,
      "--yes",
      "--non-interactive",
      "--json",
    ]);
    expect(applied.status).toBe(6);
    expect(json(applied)).toMatchObject({
      ok: false,
      exitCode: 6,
      errors: [{ code: "OPERATION_CONFLICT" }],
    });
    expect(readFileSync(manifestPath)).toEqual(manifestBefore);
    expect(existsSync(resolve(project.root, ".mergora/transactions"))).toBe(false);
    expect(existsSync(resolve(project.root, ".mergora/bases"))).toBe(false);
  });

  it("rejects unsafe target and config paths before writing", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    const add = command([
      "add",
      "button",
      "--root",
      project.root,
      "--target",
      "../outside",
      "--json",
    ]);
    expect(add.status).toBe(2);
    expect(json(add)).toMatchObject({ errors: [{ code: "PATH_UNSAFE_SEGMENT" }] });
    expect(existsSync(resolve(project.root, ".mergora"))).toBe(false);

    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    const reserved = command([
      "add",
      "button",
      "--root",
      project.root,
      "--target",
      ".mergora/transactions",
      "--plan",
      "--json",
    ]);
    expect(reserved.status).toBe(5);
    expect(json(reserved)).toMatchObject({ errors: [{ code: "SOURCE_TARGET_RESERVED" }] });
    expect(existsSync(resolve(project.root, ".mergora/transactions"))).toBe(false);

    const config = command([
      "info",
      "--cwd",
      project.root,
      "--config",
      "../mergora.json",
      "--json",
    ]);
    expect(config.status).toBe(2);
    expect(config.stdout).not.toContain(project.root);
  });
});
