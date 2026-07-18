import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ALL_SCHEMAS,
  EVIDENCE_STATE_MAP,
  SCHEMA_REGISTRY,
  aggregateEvidenceState,
  canonicalJson,
  formatValidationErrors,
  validateSchemaDocument,
  type JsonValue,
  type SchemaKind,
} from "../../registry/schemas/index.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const schemaDirectory = join(testDirectory, "..", "..", "registry", "schemas");
const fixtureDirectory = join(testDirectory, "fixtures");

function fixture(group: "valid" | "invalid", name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDirectory, group, name), "utf8")) as unknown;
}

function codes(result: ReturnType<typeof validateSchemaDocument>): readonly string[] {
  return result.errors.map((error) => error.code);
}

function collectReferences(value: unknown, output: string[] = []): readonly string[] {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectReferences(entry, output));
  } else if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (key === "$ref" && typeof entry === "string") output.push(entry);
      collectReferences(entry, output);
    }
  }
  return output;
}

describe("the JSON Schema source", () => {
  it("contains parseable, uniquely identified draft 2020-12 documents", () => {
    const files = readdirSync(schemaDirectory).filter((name) => name.endsWith(".schema.json"));
    expect(files).toHaveLength(19);
    const documents = files.map((name) =>
      JSON.parse(readFileSync(join(schemaDirectory, name), "utf8")),
    ) as { readonly $id?: string; readonly $schema?: string }[];
    expect(new Set(documents.map((document) => document.$id)).size).toBe(19);
    expect(
      documents.every(
        (document) => document.$schema === "https://json-schema.org/draft/2020-12/schema",
      ),
    ).toBe(true);
    expect(ALL_SCHEMAS).toHaveLength(19);
  });

  it("keeps every critical document root closed to unknown fields", () => {
    for (const [kind, schema] of Object.entries(SCHEMA_REGISTRY)) {
      expect(schema, `${kind} should be an object schema`).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
    }
  });

  it("resolves every local and bundled external reference", () => {
    const byId = new Map(
      ALL_SCHEMAS.flatMap((schema) => {
        if (schema.$id === undefined) return [];
        return [
          [schema.$id, schema],
          [new URL(schema.$id).pathname.split("/").at(-1)!, schema],
        ] as const;
      }),
    );
    for (const schema of ALL_SCHEMAS) {
      for (const reference of collectReferences(schema)) {
        const [base = "", fragment = ""] = reference.split("#", 2);
        const target = base === "" ? schema : byId.get(base);
        expect(target, `unresolved ${reference}`).toBeDefined();
        if (fragment === "") continue;
        let current: unknown = target;
        for (const part of fragment
          .replace(/^\//, "")
          .split("/")
          .map((entry) => decodeURIComponent(entry).replaceAll("~1", "/").replaceAll("~0", "~"))) {
          expect(current).not.toBeNull();
          expect(typeof current).toBe("object");
          expect(Object.hasOwn(current as object, part), `unresolved ${reference}`).toBe(true);
          current = (current as Record<string, unknown>)[part];
        }
      }
    }
  });
});

describe("schema negotiation and valid documents", () => {
  const validFixtures: readonly [SchemaKind, string][] = [
    ["config", "config.json"],
    ["registry-item", "registry-item.json"],
    ["operation-plan", "operation-plan.json"],
    ["evidence", "evidence-not-tested.json"],
    ["transaction-journal", "transaction-journal.json"],
  ];

  it.each(validFixtures)("accepts the %s fixture", (kind, name) => {
    const result = validateSchemaDocument(kind, fixture("valid", name));
    expect(formatValidationErrors(result.errors)).toBe("");
    expect(result.ok).toBe(true);
  });

  it("rejects missing, unsupported, and newer versions readably", () => {
    expect(codes(validateSchemaDocument("config", {}))).toContain("SCHEMA_VERSION_MISSING");
    expect(codes(validateSchemaDocument("config", { schemaVersion: 0 }))).toContain(
      "SCHEMA_VERSION_UNSUPPORTED",
    );
    const future = validateSchemaDocument("config", { schemaVersion: 2 });
    expect(codes(future)).toContain("SCHEMA_VERSION_NEWER");
    expect(formatValidationErrors(future.errors)).toContain("Upgrade the CLI");
    expect(
      codes(validateSchemaDocument("accessibility-contract", { schemaVersion: "2.0.0" })),
    ).toContain("SCHEMA_VERSION_NEWER");
  });

  it("rejects unknown fields on a critical record", () => {
    expect(
      codes(validateSchemaDocument("config", fixture("invalid", "unknown-config.json"))),
    ).toContain("SCHEMA_ADDITIONAL_PROPERTY");
  });
});

describe("security supplements", () => {
  it("blocks traversal and non-portable path variants", () => {
    const attackPaths = [
      "ui/../../evil.ts",
      "C:/Windows/System32/payload.ts",
      "/etc/passwd",
      "ui\\evil.ts",
      "ui/%2e%2e/evil.ts",
      "ui/CON.ts",
      "ui/trailing. /file.ts",
      "ui/cafe\u0301.ts",
    ];
    const source = fixture("valid", "registry-item.json") as Record<string, unknown>;
    for (const attackPath of attackPaths) {
      const document = structuredClone(source) as { files: { logicalPath: string }[] };
      document.files[0]!.logicalPath = attackPath;
      expect(
        codes(validateSchemaDocument("registry-item", document)),
        `expected ${attackPath} to be blocked`,
      ).toContain("UNSAFE_PATH");
    }
    expect(
      codes(validateSchemaDocument("registry-item", fixture("invalid", "traversal-item.json"))),
    ).toContain("UNSAFE_PATH");
  });

  it("blocks executable payloads, unsafe dependency protocols, and secret fields", () => {
    expect(
      codes(
        validateSchemaDocument(
          "registry-item",
          fixture("invalid", "executable-migration-item.json"),
        ),
      ),
    ).toContain("EXECUTABLE_PAYLOAD");
    expect(
      codes(
        validateSchemaDocument("registry-item", fixture("invalid", "unsafe-dependency-item.json")),
      ),
    ).toContain("UNSAFE_DEPENDENCY_PROTOCOL");
    expect(
      codes(validateSchemaDocument("config", fixture("invalid", "secret-config.json"))),
    ).toContain("SECRET_FIELD");
  });

  it("detects case and Unicode canonical collisions", () => {
    const document = fixture("valid", "registry-item.json") as Record<string, unknown>;
    const files = document.files as Record<string, unknown>[];
    files.push({ ...files[0], logicalPath: "ui/Button.tsx" });
    expect(codes(validateSchemaDocument("registry-item", document))).toContain(
      "CANONICAL_COLLISION",
    );
  });
});

describe("evidence normalization and deterministic serialization", () => {
  it("maps every context-specific state to exactly one canonical aggregate", () => {
    for (const [context, states] of Object.entries(EVIDENCE_STATE_MAP)) {
      for (const [state, expected] of Object.entries(states)) {
        expect(
          aggregateEvidenceState(context as keyof typeof EVIDENCE_STATE_MAP, state as never),
        ).toBe(expected);
      }
    }
  });

  it("rejects a declared aggregate that contradicts the canonical mapping", () => {
    expect(
      codes(validateSchemaDocument("evidence", fixture("invalid", "evidence-map.json"))),
    ).toContain("EVIDENCE_AGGREGATE_MISMATCH");
  });

  it("serializes JSON with stable key ordering without inventing evidence", () => {
    const left = { z: 1, nested: { b: true, a: [3, 2, 1] }, a: "value" } satisfies JsonValue;
    const right = { a: "value", nested: { a: [3, 2, 1], b: true }, z: 1 } satisfies JsonValue;
    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(canonicalJson(left)).toBe('{"a":"value","nested":{"a":[3,2,1],"b":true},"z":1}');
  });
});
