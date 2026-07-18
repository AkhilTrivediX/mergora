import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defineContractV1 } from "../../packages/contracts/src/index.ts";
import { validateSchemaDocument } from "../../registry/schemas/validators.ts";
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
  const envelope = JSON.parse(result.stdout) as Record<string, unknown>;
  const validation = validateSchemaDocument("result-envelope", envelope);
  expect(validation.errors, JSON.stringify(validation.errors, null, 2)).toEqual([]);
  return envelope;
}

function transactionIds(root: string): readonly string[] {
  const directory = resolve(root, ".mergora/transactions");
  return existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map(({ name }) => name)
        .sort((left, right) => left.localeCompare(right, "en-US"))
    : [];
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
}, 120_000);

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
    expect(help.stdout).toContain("clean");
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

    const knownButDisallowed = command(["search", "button", "--yes", "--json"]);
    expect(knownButDisallowed.status).toBe(2);
    expect(json(knownButDisallowed)).toMatchObject({
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
    const transactionsBefore = transactionIds(project.root);
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
    expect(transactionIds(project.root)).toEqual(transactionsBefore);
  });

  it("reports a missing-source adoption as a conflict even when the plan has no writes", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    const transactionsBefore = transactionIds(project.root);
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
    expect(transactionIds(project.root)).toEqual(transactionsBefore);
    expect(existsSync(resolve(project.root, ".mergora/bases"))).toBe(false);
  });

  it("plans and applies a completed transaction rollback without implicit consent", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    const added = command([
      "add",
      "button",
      "--cwd",
      project.root,
      "--no-install",
      "--yes",
      "--non-interactive",
      "--json",
    ]);
    expect(added.status).toBe(0);
    const transactionId = (json(added).result as { transaction: { transactionId: string } })
      .transaction.transactionId;
    const source = resolve(project.root, "src/components/mergora/button/button.tsx");
    expect(existsSync(source)).toBe(true);

    const planned = command([
      "rollback",
      transactionId,
      "--cwd",
      project.root,
      "--no-install",
      "--plan",
      "--json",
    ]);
    expect(planned.status).toBe(0);
    expect(json(planned)).toMatchObject({
      status: "planned",
      result: { transactionId, plan: { command: "rollback", conflicts: [] } },
    });

    const missingConsent = command([
      "rollback",
      transactionId,
      "--cwd",
      project.root,
      "--no-install",
      "--non-interactive",
      "--json",
    ]);
    expect(missingConsent.status).toBe(12);
    expect(existsSync(source)).toBe(true);

    const rolledBack = command([
      "rollback",
      transactionId,
      "--cwd",
      project.root,
      "--no-install",
      "--yes",
      "--non-interactive",
      "--json",
    ]);
    expect(rolledBack.status, `${rolledBack.stdout}\n${rolledBack.stderr}`).toBe(0);
    expect(json(rolledBack)).toMatchObject({
      status: "committed",
      result: { rollbackOf: transactionId, transaction: { state: "committed" } },
    });
    expect(existsSync(source)).toBe(false);
  });

  it("preserves Contract Audit reports while returning stable evidence exit codes", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    expect(
      command([
        "add",
        "button",
        "--cwd",
        project.root,
        "--no-install",
        "--yes",
        "--non-interactive",
      ]).status,
    ).toBe(0);
    const manifest = JSON.parse(
      readFileSync(resolve(project.root, ".mergora/manifest.json"), "utf8"),
    ) as {
      items: Record<
        string,
        {
          contractVersion: string;
          payload: { digest: `sha256:${string}` };
          files: readonly { logicalPath: string; target: string }[];
        }
      >;
    };
    const item = manifest.items["official:button"]!;
    const source = item.files.find(({ target }) => target.endsWith("button.tsx"))!;
    const definition = defineContractV1({
      schemaVersion: 1,
      contractVersion: item.contractVersion,
      contractId: "button-packed-contract",
      registryId: "official",
      itemId: "button",
      payloadDigest: item.payload.digest,
      conformanceClaim: "automated-evidence-only",
      limitations: [],
      assertions: [
        {
          id: "button-export",
          mode: "static",
          evidenceType: "static-source",
          target: { kind: "owned-file", logicalPath: source.logicalPath },
          expectedBehavior: "Button source exports the public component.",
          severity: "S1",
          remediationUrl: "https://akhiltrivedix.github.io/mergora/components/button",
          adapter: { kind: "text-includes", version: "1.0.0", value: "export const Button" },
        },
      ],
    });
    mkdirSync(resolve(project.root, ".mergora/contracts"), { recursive: true });
    writeFileSync(
      resolve(project.root, ".mergora/contracts/official--button.json"),
      `${JSON.stringify(definition, null, 2)}\n`,
    );

    const passing = command(["audit", "button", "--static", "--cwd", project.root, "--json"]);
    expect(passing.status).toBe(0);
    expect(json(passing)).toMatchObject({
      ok: true,
      status: "pass",
      exitCode: 0,
      result: { state: "pass", recommendedExitCode: 0 },
    });

    writeFileSync(resolve(project.root, source.target), "export const localReplacement = 1;\n");
    const failing = command(["audit", "button", "--static", "--cwd", project.root, "--json"]);
    expect(failing.status).toBe(10);
    expect(json(failing)).toMatchObject({
      ok: false,
      status: "fail",
      exitCode: 10,
      result: { state: "fail", recommendedExitCode: 10 },
      errors: [],
    });

    const unavailable = command(["audit", "button", "--browser", "--cwd", project.root, "--json"]);
    expect(unavailable.status).toBe(7);
    expect(json(unavailable)).toMatchObject({
      ok: false,
      status: "incomplete",
      exitCode: 7,
      result: { state: "incomplete", recommendedExitCode: 7 },
    });
  });

  it("plans, applies, and verifies a packed offline vendor snapshot", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    expect(
      command([
        "add",
        "button",
        "--cwd",
        project.root,
        "--no-install",
        "--yes",
        "--non-interactive",
      ]).status,
    ).toBe(0);

    const planned = command(["vendor", "button", "--cwd", project.root, "--plan", "--json"]);
    expect(planned.status, `${planned.stdout}\n${planned.stderr}`).toBe(0);
    expect(json(planned)).toMatchObject({
      status: "planned",
      result: {
        command: "vendor",
        vendor: { provenanceState: "unreleased-local", networkUsed: false },
      },
    });
    expect(existsSync(resolve(project.root, ".mergora/vendor"))).toBe(false);

    const missingConsent = command([
      "vendor",
      "button",
      "--cwd",
      project.root,
      "--non-interactive",
      "--json",
    ]);
    expect(missingConsent.status).toBe(12);
    expect(json(missingConsent)).toMatchObject({
      errors: [{ code: "CONSENT_REQUIRED" }],
    });

    const applied = command([
      "vendor",
      "button",
      "--cwd",
      project.root,
      "--yes",
      "--non-interactive",
      "--json",
    ]);
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0);
    expect(json(applied)).toMatchObject({
      status: "committed",
      result: {
        mode: "offline-vendor",
        items: ["official:button"],
        verification: {
          state: "valid",
          provenanceState: "unreleased-local",
          releaseClaim: "none",
          networkUsed: false,
          writePerformed: false,
        },
      },
    });

    const verified = command(["vendor", "verify", "--cwd", project.root, "--json"]);
    expect(verified.status, `${verified.stdout}\n${verified.stderr}`).toBe(0);
    expect(json(verified)).toMatchObject({
      status: "valid",
      result: { state: "valid", releaseClaim: "none", networkUsed: false },
    });
    expect(verified.stdout).not.toContain(project.root);
  }, 30_000);

  it("keeps theme, registry, migration, and cleanup inspection read-only", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    const transactionsBefore = transactionIds(project.root);

    const theme = command(["theme", "list", "--cwd", project.root, "--json"]);
    const registries = command(["registry", "list", "--cwd", project.root, "--json"]);
    const migration = command(["migrate", "config", "--cwd", project.root, "--plan", "--json"]);
    const cleanup = command(["clean", "--cwd", project.root, "--json"]);

    expect(theme.status).toBe(0);
    expect(registries.status).toBe(0);
    expect(migration.status).toBe(0);
    expect(cleanup.status).toBe(0);
    expect(json(migration)).toMatchObject({ status: "no-op", result: { command: "migrate" } });
    expect(json(cleanup)).toMatchObject({
      status: "report",
      result: { command: "clean", selectedCategories: [], writesRequired: false },
    });
    expect(transactionIds(project.root)).toEqual(transactionsBefore);
  });

  it("requires exact cleanup selection and consent before deleting a verified cache entry", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    expect(command(["init", "--cwd", project.root, "--yes", "--non-interactive"]).status).toBe(0);
    const entryDirectory = resolve(project.root, ".mergora/cache/entries/official-button");
    const artifact = Buffer.from("immutable cache artifact\n");
    const digest = `sha256:${createHash("sha256").update(artifact).digest("hex")}`;
    mkdirSync(entryDirectory, { recursive: true });
    writeFileSync(resolve(entryDirectory, "artifact"), artifact);
    writeFileSync(
      resolve(entryDirectory, "cache-entry.json"),
      `${JSON.stringify({ schemaVersion: 1, artifactKind: "mergora-verified-cache-entry", key: "official-button", artifact: "artifact", digest, bytes: artifact.byteLength })}\n`,
    );

    const planned = command(["clean", "--cache", "--cwd", project.root, "--plan", "--json"]);
    expect(planned.status).toBe(0);
    expect(json(planned)).toMatchObject({
      status: "planned",
      result: { command: "clean", selectedCategories: ["cache"], writesRequired: true },
    });
    expect(existsSync(entryDirectory)).toBe(true);

    const refused = command([
      "clean",
      "--cache",
      "--cwd",
      project.root,
      "--non-interactive",
      "--json",
    ]);
    expect(refused.status).toBe(12);
    expect(json(refused)).toMatchObject({ errors: [{ code: "CONSENT_REQUIRED" }] });
    expect(existsSync(entryDirectory)).toBe(true);

    const applied = command([
      "clean",
      "--cache",
      "--cwd",
      project.root,
      "--yes",
      "--non-interactive",
      "--json",
    ]);
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0);
    expect(json(applied)).toMatchObject({ status: "cleaned", result: { status: "cleaned" } });
    expect(existsSync(entryDirectory)).toBe(false);
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
    const transactionsBefore = transactionIds(project.root);
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
    expect(transactionIds(project.root)).toEqual(transactionsBefore);

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
