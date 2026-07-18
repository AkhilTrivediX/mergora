import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CLI_COMMAND_CONTRACTS,
  CLI_FLAG_KINDS,
  JSON_RESULT_STATUSES,
  STABLE_EXIT_CODES,
  allowedCliFlags,
  type CliCommandCategory,
  type CliFlag,
} from "../../packages/cli/src/command-contract.ts";
import { CliError, errorEnvelope, successEnvelope } from "../../packages/cli/src/contracts.ts";
import { validateSchemaDocument } from "../../registry/schemas/validators.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const resultEnvelopeSchema = JSON.parse(
  readFileSync(resolve(workspaceRoot, "registry/schemas/result-envelope-v1.schema.json"), "utf8"),
) as { readonly properties: { readonly status: { readonly enum: readonly string[] } } };

function expectValid(value: unknown): void {
  const validation = validateSchemaDocument("result-envelope", value);
  expect(validation.errors, JSON.stringify(validation.errors, null, 2)).toEqual([]);
  expect(validation.ok).toBe(true);
}

interface CommandContractView {
  readonly category: CliCommandCategory;
  readonly flags?: readonly CliFlag[];
  readonly statuses: readonly string[];
  readonly subcommands?: Readonly<Record<string, readonly CliFlag[]>>;
}

describe("table-driven CLI contract", () => {
  it("covers the complete top-level command surface and stable exit range", () => {
    expect(Object.keys(CLI_COMMAND_CONTRACTS).sort()).toEqual(
      [
        "add",
        "adopt",
        "audit",
        "clean",
        "create",
        "diff",
        "docs",
        "doctor",
        "info",
        "init",
        "migrate",
        "recover",
        "registry",
        "remove",
        "resolve",
        "rollback",
        "search",
        "status",
        "theme",
        "update",
        "vendor",
        "view",
      ].sort(),
    );
    expect(Object.keys(STABLE_EXIT_CODES).map(Number)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("keeps every command flag and status bound to the shared registries", () => {
    const knownFlags = new Set(Object.keys(CLI_FLAG_KINDS));
    const knownStatuses = new Set<string>(JSON_RESULT_STATUSES);
    const categories = new Set<CliCommandCategory>();
    for (const [command, rawContract] of Object.entries(CLI_COMMAND_CONTRACTS)) {
      const contract: CommandContractView = rawContract;
      categories.add(contract.category);
      for (const status of contract.statuses) expect(knownStatuses.has(status)).toBe(true);
      for (const flag of contract.flags ?? []) expect(knownFlags.has(flag)).toBe(true);
      for (const [subcommand, flags] of Object.entries(contract.subcommands ?? {})) {
        expect(allowedCliFlags(command as keyof typeof CLI_COMMAND_CONTRACTS, subcommand)).toEqual(
          flags,
        );
        expect(new Set(flags).size).toBe(flags.length);
        for (const flag of flags) expect(knownFlags.has(flag)).toBe(true);
      }
    }
    expect([...categories].sort()).toEqual(
      ["bootstrap", "discovery", "health", "maintenance", "source"].sort(),
    );
  });

  it("keeps the published status enum synchronized with runtime status metadata", () => {
    expect(resultEnvelopeSchema.properties.status.enum).toEqual(JSON_RESULT_STATUSES);
  });
});

describe("JSON result envelope v1", () => {
  it("schema-validates representative success and failure output for every command", () => {
    for (const [command, contract] of Object.entries(CLI_COMMAND_CONTRACTS)) {
      expectValid(
        successEnvelope(
          command,
          { category: contract.category, command, structured: [1, true, null] },
          { status: contract.statuses[0], warnings: [`${command} warning`] },
        ),
      );
      expectValid(
        errorEnvelope(
          command,
          new CliError(`${command} requires explicit consent.`, {
            code: "CONSENT_REQUIRED",
            exitCode: 12,
            target: "mergora.json",
          }),
        ),
      );
    }
  });

  it("accepts structured array results, string warnings, and evidence failures without fake errors", () => {
    expectValid(
      successEnvelope("view", [{ id: "button" }, { id: "dialog" }], {
        warnings: ["Registry evidence is unreleased."],
      }),
    );
    expectValid({
      schemaVersion: 1,
      command: "audit",
      ok: false,
      status: "fail",
      exitCode: 10,
      result: { state: "fail", summary: { fail: 1, pass: 2 } },
      warnings: ["One Contract assertion failed."],
      errors: [],
    });
  });

  it("maps network and authentication failures to their stable exit codes", () => {
    const timeout = errorEnvelope(
      "registry",
      new CliError("Registry request exceeded its total timeout.", {
        code: "REGISTRY_TIMEOUT",
        exitCode: 7,
      }),
    );
    const authentication = errorEnvelope(
      "registry",
      new CliError("Registry returned HTTP status 401.", {
        code: "REGISTRY_HTTP_FAILURE",
        exitCode: 7,
      }),
    );
    const unavailable = errorEnvelope(
      "registry",
      new CliError("Registry returned HTTP status 503.", {
        code: "REGISTRY_HTTP_FAILURE",
        exitCode: 7,
      }),
    );

    expect(timeout.exitCode).toBe(4);
    expect(authentication.exitCode).toBe(11);
    expect(unavailable.exitCode).toBe(4);
    expect(authentication.errors[0]?.recovery).toContain("environment variable");
    expectValid(timeout);
    expectValid(authentication);
    expectValid(unavailable);
  });

  it("uses a data-independent report ID and generic message for internal failures", () => {
    const envelope = errorEnvelope(
      "search",
      new TypeError("C:\\Users\\person\\private\\unexpected-source.ts"),
    );
    expect(envelope).toMatchObject({
      command: "search",
      ok: false,
      status: "error",
      exitCode: 1,
      errors: [
        {
          code: "INTERNAL_FAILURE",
          message: "Unexpected CLI failure.",
          reportId: expect.stringMatching(/^report-[0-9a-f]{16}$/u),
        },
      ],
    });
    expect(JSON.stringify(envelope)).not.toContain("person");
    expect(JSON.stringify(envelope)).not.toContain("unexpected-source");
    expectValid(envelope);
  });

  it("rejects status, warning, and ok/exit combinations outside the v1 contract", () => {
    const invalidStatus = validateSchemaDocument("result-envelope", {
      ...successEnvelope("search", {}),
      status: "future-state",
    });
    const objectWarning = validateSchemaDocument("result-envelope", {
      ...successEnvelope("search", {}),
      warnings: [{ code: "OLD_WARNING", message: "legacy shape" }],
    });
    const mismatchedExit = validateSchemaDocument("result-envelope", {
      ...successEnvelope("search", {}),
      exitCode: 4,
    });
    expect(invalidStatus.ok).toBe(false);
    expect(objectWarning.ok).toBe(false);
    expect(mismatchedExit.ok).toBe(false);
  });
});
