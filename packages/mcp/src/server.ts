import {
  CliError,
  canonicalJson,
  diffSemanticSource,
  doctorProject,
  exportTheme,
  inspectRegistry,
  listProjectThemes,
  listRegistries,
  listThemes,
  loadThemePreset,
  planInit,
  planProjectCreate,
  planRegistryEnrollment,
  planRegistryRemoval,
  planSourceAdd,
  planSourceAdopt,
  planSourceRemove,
  planVendor,
  projectInfo,
  projectStatus,
  redactMessage,
  resolveDocumentation,
  searchRegistry,
  verifyRegistry,
  viewRegistryItems,
  type Framework,
  type PackageManager,
  type ProjectCreatePreset,
  type ProjectCreateTemplate,
  type RegistryProtocol,
  type ThemeExportFormat,
} from "mergora";

import type {
  JsonObject,
  JsonValue,
  McpInputSchema,
  MergoraMcpCoreResponse,
  MergoraMcpFailure,
  MergoraMcpResource,
  MergoraMcpResourceResult,
  MergoraMcpServer,
  MergoraMcpSuccess,
  MergoraMcpTool,
} from "./contracts.js";

export const MERGORA_MCP_MAX_INPUT_BYTES = 65_536 as const;
export const MERGORA_MCP_MAX_RESULT_BYTES = 4_194_304 as const;
export const MERGORA_MCP_MAX_WIRE_BYTES = 8_388_608 as const;

const ITEM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ENVIRONMENT_VARIABLE = /^[A-Z_][A-Z0-9_]*$/u;
const DOCUMENTATION_REFERENCE = /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/u;
const encoder = new TextEncoder();

function schema(
  properties: Readonly<Record<string, JsonObject>>,
  required: readonly string[] = [],
): McpInputSchema {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    ...(required.length === 0 ? {} : { required }),
  };
}

const STRING = { type: "string" } as const;
const BOOLEAN = { type: "boolean" } as const;
const CWD = { type: "string", minLength: 1, maxLength: 2048 } as const;
const ITEM = { type: "string", pattern: ITEM_ID.source, minLength: 1, maxLength: 128 } as const;
const ITEMS = { type: "array", items: ITEM, minItems: 1, maxItems: 64, uniqueItems: true } as const;
const OFFLINE = {
  type: "boolean",
  default: true,
  description: "Defaults to true; false explicitly permits bounded registry reads.",
} as const;
const PACKAGE_MANAGER = { type: "string", enum: ["npm", "pnpm", "yarn", "bun"] } as const;

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const NETWORK_READ_ONLY = { ...READ_ONLY, openWorldHint: true } as const;

const TOOL_DEFINITIONS: readonly MergoraMcpTool[] = [
  {
    name: "mergora.search",
    title: "Search Mergora catalog",
    description: "Search the bundled verified catalog without mutating a project.",
    inputSchema: schema({
      query: { type: "string", maxLength: 128, default: "" },
      kind: { ...STRING, maxLength: 128 },
      category: { ...STRING, maxLength: 128 },
      maturity: { ...STRING, maxLength: 32 },
      tag: { ...STRING, maxLength: 128 },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    }),
    annotations: READ_ONLY,
  },
  {
    name: "mergora.view",
    title: "View Mergora items",
    description:
      "Inspect bounded item metadata; source-file contents are intentionally unavailable.",
    inputSchema: schema({ items: ITEMS, files: BOOLEAN }, ["items"]),
    annotations: READ_ONLY,
  },
  {
    name: "mergora.docs",
    title: "Resolve Mergora documentation",
    description: "Resolve one item or documentation topic without opening a browser.",
    inputSchema: schema(
      {
        reference: {
          type: "string",
          pattern: DOCUMENTATION_REFERENCE.source,
          minLength: 1,
          maxLength: 128,
        },
      },
      ["reference"],
    ),
    annotations: READ_ONLY,
  },
  {
    name: "mergora.project.info",
    title: "Inspect project information",
    description: "Return portable project and compatibility information.",
    inputSchema: schema({ cwd: CWD }, ["cwd"]),
    annotations: READ_ONLY,
  },
  {
    name: "mergora.project.status",
    title: "Inspect project status",
    description: "Inspect provenance and local ownership without writing.",
    inputSchema: schema({ cwd: CWD }, ["cwd"]),
    annotations: READ_ONLY,
  },
  {
    name: "mergora.project.doctor",
    title: "Diagnose a Mergora project",
    description: "Run read-only project diagnostics; no fix mode is exposed.",
    inputSchema: schema({ cwd: CWD }, ["cwd"]),
    annotations: READ_ONLY,
  },
  {
    name: "mergora.project.diff",
    title: "Inspect semantic source differences",
    description: "Return a read-only B-to-L semantic diff without source contents or writes.",
    inputSchema: schema({ cwd: CWD, items: ITEMS }, ["cwd"]),
    annotations: READ_ONLY,
  },
  {
    name: "mergora.theme.list",
    title: "List Mergora themes",
    description: "List official themes and, when cwd is supplied, the installed custom receipt.",
    inputSchema: schema({ cwd: CWD }),
    annotations: READ_ONLY,
  },
  {
    name: "mergora.theme.export",
    title: "Export a Mergora theme",
    description: "Export a bundled ID or project-relative theme file without writing the result.",
    inputSchema: schema(
      {
        cwd: CWD,
        theme: { type: "string", minLength: 1, maxLength: 1024 },
        format: { type: "string", enum: ["dtcg", "css", "tailwind"] },
      },
      ["cwd", "theme", "format"],
    ),
    annotations: READ_ONLY,
  },
  {
    name: "mergora.registry.list",
    title: "List enrolled registries",
    description:
      "List registry protocol, trust, identity, policy evidence, and auth ENV name only.",
    inputSchema: schema({ cwd: CWD }, ["cwd"]),
    annotations: READ_ONLY,
  },
  {
    name: "mergora.registry.inspect",
    title: "Inspect an enrolled registry",
    description:
      "Inspect an enrolled registry; offline is the default and performs no network access.",
    inputSchema: schema({ cwd: CWD, id: ITEM, offline: OFFLINE }, ["cwd", "id"]),
    annotations: NETWORK_READ_ONLY,
  },
  {
    name: "mergora.registry.verify",
    title: "Verify an enrolled registry",
    description:
      "Verify config and, when online is explicitly selected, bounded identity and immutable evidence.",
    inputSchema: schema({ cwd: CWD, id: ITEM, offline: OFFLINE }, ["cwd", "id"]),
    annotations: NETWORK_READ_ONLY,
  },
  {
    name: "mergora.plan.create",
    title: "Plan project creation",
    description: "Return the exact shared CLI create plan; never creates the destination.",
    inputSchema: schema(
      {
        directory: CWD,
        cwd: CWD,
        template: { type: "string", enum: ["next", "vite"] },
        packageManager: PACKAGE_MANAGER,
        preset: { type: "string", enum: ["minimal", "application", "none"] },
        noInstall: BOOLEAN,
      },
      ["directory", "template", "packageManager", "preset"],
    ),
    annotations: READ_ONLY,
  },
  {
    name: "mergora.plan.init",
    title: "Plan project initialization",
    description: "Return the exact shared CLI initialization plan; never applies it.",
    inputSchema: schema(
      {
        cwd: CWD,
        framework: { type: "string", enum: ["next-app", "next-pages", "vite-react", "react"] },
        sourceRoot: { ...STRING, maxLength: 1024 },
        globalCss: { ...STRING, maxLength: 1024 },
        aliasPrefix: { ...STRING, maxLength: 256 },
        packageManager: PACKAGE_MANAGER,
      },
      ["cwd"],
    ),
    annotations: READ_ONLY,
  },
  {
    name: "mergora.plan.add",
    title: "Plan source additions",
    description: "Return the exact shared CLI add plan, including conflicts; never applies it.",
    inputSchema: schema(
      {
        cwd: CWD,
        items: ITEMS,
        targetDirectory: { ...STRING, maxLength: 1024 },
        noInstall: BOOLEAN,
        offline: BOOLEAN,
        packageManager: PACKAGE_MANAGER,
      },
      ["cwd", "items"],
    ),
    annotations: READ_ONLY,
  },
  {
    name: "mergora.plan.remove",
    title: "Plan source removal",
    description: "Return the exact shared CLI removal plan; never applies or force-removes files.",
    inputSchema: schema(
      {
        cwd: CWD,
        items: ITEMS,
        keepFiles: BOOLEAN,
        noInstall: BOOLEAN,
        offline: BOOLEAN,
        packageManager: PACKAGE_MANAGER,
      },
      ["cwd", "items"],
    ),
    annotations: READ_ONLY,
  },
  {
    name: "mergora.plan.adopt",
    title: "Plan source adoption",
    description: "Return the exact shared CLI adoption plan; never replaces local source.",
    inputSchema: schema(
      { cwd: CWD, items: ITEMS, targetDirectory: { ...STRING, maxLength: 1024 } },
      ["cwd", "items"],
    ),
    annotations: READ_ONLY,
  },
  {
    name: "mergora.plan.vendor",
    title: "Plan an offline vendor bundle",
    description: "Return the exact shared CLI vendor plan; never creates vendor files.",
    inputSchema: schema({ cwd: CWD, items: ITEMS, allInstalled: BOOLEAN }, ["cwd"]),
    annotations: READ_ONLY,
  },
  {
    name: "mergora.plan.registry.enroll",
    title: "Plan registry enrollment",
    description:
      "Retrieve bounded metadata and return only the exact identity-bound CLI enrollment plan.",
    inputSchema: schema(
      {
        cwd: CWD,
        id: ITEM,
        origin: { type: "string", minLength: 1, maxLength: 2048 },
        protocol: { type: "string", enum: ["mergora-v1", "shadcn-v1"] },
        authEnvironmentVariable: {
          type: "string",
          pattern: ENVIRONMENT_VARIABLE.source,
          maxLength: 128,
        },
        allowInsecureLocalhost: BOOLEAN,
      },
      ["cwd", "id", "origin"],
    ),
    annotations: NETWORK_READ_ONLY,
  },
  {
    name: "mergora.plan.registry.remove",
    title: "Plan registry removal",
    description: "Return the exact shared CLI registry-removal plan; never applies it.",
    inputSchema: schema({ cwd: CWD, id: ITEM }, ["cwd", "id"]),
    annotations: READ_ONLY,
  },
];

const RESOURCE_DEFINITIONS: readonly MergoraMcpResource[] = [
  {
    uri: "mergora://server/capabilities",
    name: "mergora-capabilities",
    title: "Mergora MCP capabilities",
    description: "Stable read-only and plan-only capability inventory.",
    mimeType: "application/json",
  },
  {
    uri: "mergora://server/security",
    name: "mergora-security",
    title: "Mergora MCP security boundary",
    description: "Consent, mutation, credential, conflict, and result-bound guarantees.",
    mimeType: "application/json",
  },
  {
    uri: "mergora://registry/catalog",
    name: "mergora-catalog",
    title: "Bundled Mergora catalog",
    description: "Bounded source-available catalog summary from the shared CLI.",
    mimeType: "application/json",
  },
];

class McpCoreError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "McpCoreError";
    this.code = code;
  }
}

function bytes(value: string): number {
  return encoder.encode(value).byteLength;
}

function plainObject(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (
    value === null ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw new McpCoreError("MCP_INPUT_INVALID", `${label} must be one plain object.`);
  }
  return value as Record<string, unknown>;
}

function exactInput(
  value: unknown,
  allowed: readonly string[],
  required: readonly string[] = [],
): Record<string, unknown> {
  const input = plainObject(value, "Tool input");
  const allowedSet = new Set(allowed);
  if (
    Object.keys(input).some((key) => !allowedSet.has(key)) ||
    required.some((key) => !Object.hasOwn(input, key))
  ) {
    throw new McpCoreError(
      "MCP_INPUT_FIELDS_INVALID",
      "Tool input has missing or unknown fields; force and generic bypass fields are never accepted.",
    );
  }
  let encoded: string;
  try {
    encoded = canonicalJson(input);
  } catch {
    throw new McpCoreError(
      "MCP_INPUT_INVALID",
      "Tool input must contain only canonical JSON values.",
    );
  }
  if (bytes(encoded) > MERGORA_MCP_MAX_INPUT_BYTES) {
    throw new McpCoreError("MCP_INPUT_TOO_LARGE", "Tool input exceeds the 64 KiB bound.");
  }
  return input;
}

function stringInput(
  input: Record<string, unknown>,
  key: string,
  options: {
    readonly required?: boolean | undefined;
    readonly maximum?: number | undefined;
    readonly pattern?: RegExp | undefined;
    readonly allowed?: readonly string[] | undefined;
  } = {},
): string | undefined {
  const value = input[key];
  if (value === undefined && options.required !== true) return undefined;
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > (options.maximum ?? 2048) ||
    value !== value.normalize("NFC") ||
    (options.pattern !== undefined && !options.pattern.test(value)) ||
    (options.allowed !== undefined && !options.allowed.includes(value)) ||
    [...value].some((character) => {
      const code = character.codePointAt(0)!;
      return code <= 31 || code === 127;
    })
  ) {
    throw new McpCoreError("MCP_INPUT_STRING_INVALID", `Tool input field ${key} is invalid.`);
  }
  return value;
}

function booleanInput(
  input: Record<string, unknown>,
  key: string,
  defaultValue?: boolean,
): boolean | undefined {
  const value = input[key];
  if (value === undefined) return defaultValue;
  if (typeof value !== "boolean") {
    throw new McpCoreError("MCP_INPUT_BOOLEAN_INVALID", `Tool input field ${key} must be boolean.`);
  }
  return value;
}

function integerInput(
  input: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
  defaultValue?: number,
): number | undefined {
  const value = input[key];
  if (value === undefined) return defaultValue;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new McpCoreError("MCP_INPUT_INTEGER_INVALID", `Tool input field ${key} is out of range.`);
  }
  return value as number;
}

function itemsInput(
  input: Record<string, unknown>,
  required = true,
): readonly string[] | undefined {
  const value = input.items;
  if (value === undefined && !required) return undefined;
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 64 ||
    value.some((entry) => typeof entry !== "string" || !ITEM_ID.test(entry) || entry.length > 128)
  ) {
    throw new McpCoreError(
      "MCP_INPUT_ITEMS_INVALID",
      "Tool input items must contain 1-64 portable item IDs.",
    );
  }
  if (new Set(value).size !== value.length) {
    throw new McpCoreError("MCP_INPUT_ITEMS_INVALID", "Tool input items must be unique.");
  }
  return value as readonly string[];
}

function optional<T>(key: string, value: T | undefined): { readonly [key: string]: T } | object {
  return value === undefined ? {} : { [key]: value };
}

function sourceOptions(input: Record<string, unknown>) {
  return {
    projectRoot: stringInput(input, "cwd", { required: true })!,
    itemIds: itemsInput(input)!,
    ...optional("targetDirectory", stringInput(input, "targetDirectory", { maximum: 1024 })),
    ...optional("noInstall", booleanInput(input, "noInstall")),
    ...optional("offline", booleanInput(input, "offline")),
    ...optional(
      "packageManager",
      stringInput(input, "packageManager", {
        allowed: ["npm", "pnpm", "yarn", "bun"],
      }) as PackageManager | undefined,
    ),
  };
}

function safeError(error: unknown): MergoraMcpFailure {
  const code =
    error instanceof CliError || error instanceof McpCoreError
      ? error.code
      : "MCP_INTERNAL_FAILURE";
  const rawMessage = error instanceof Error ? error.message : "Unexpected Mergora MCP failure.";
  const message = redactMessage(rawMessage).slice(0, 1024);
  const rawTarget = error instanceof CliError ? error.target : undefined;
  const target = rawTarget === undefined ? undefined : redactMessage(rawTarget).slice(0, 256);
  const structuredContent: MergoraMcpFailure["structuredContent"] = {
    schemaVersion: 1,
    ok: false,
    error: { code, message, ...(target === undefined ? {} : { target }) },
  };
  return {
    isError: true,
    content: [{ type: "text", text: canonicalJson(structuredContent) }],
    structuredContent,
  };
}

function success(value: unknown): MergoraMcpSuccess {
  let text: string;
  try {
    text = canonicalJson(value);
  } catch {
    throw new McpCoreError(
      "MCP_RESULT_INVALID",
      "Shared CLI result is not representable as canonical JSON.",
    );
  }
  if (bytes(text) > MERGORA_MCP_MAX_RESULT_BYTES) {
    throw new McpCoreError(
      "MCP_RESULT_TOO_LARGE",
      "Shared CLI result exceeds the 4 MiB MCP result bound; narrow the request.",
    );
  }
  return { isError: false, content: [{ type: "text", text }], structuredContent: value };
}

async function toolValue(name: string, rawInput: unknown): Promise<unknown> {
  switch (name) {
    case "mergora.search": {
      const input = exactInput(rawInput, ["query", "kind", "category", "maturity", "tag", "limit"]);
      return searchRegistry(stringInput(input, "query", { maximum: 128 }) ?? "", {
        ...optional("kind", stringInput(input, "kind", { maximum: 128 })),
        ...optional("category", stringInput(input, "category", { maximum: 128 })),
        ...optional("maturity", stringInput(input, "maturity", { maximum: 32 })),
        ...optional("tag", stringInput(input, "tag", { maximum: 128 })),
        limit: integerInput(input, "limit", 1, 100, 20),
      });
    }
    case "mergora.view": {
      const input = exactInput(rawInput, ["items", "files"], ["items"]);
      return viewRegistryItems(itemsInput(input)!, {
        ...optional("files", booleanInput(input, "files")),
      });
    }
    case "mergora.docs": {
      const input = exactInput(rawInput, ["reference"], ["reference"]);
      return resolveDocumentation(
        stringInput(input, "reference", {
          required: true,
          maximum: 128,
          pattern: DOCUMENTATION_REFERENCE,
        })!,
        { open: false, nonInteractive: true },
      );
    }
    case "mergora.project.info": {
      const input = exactInput(rawInput, ["cwd"], ["cwd"]);
      return projectInfo(stringInput(input, "cwd", { required: true })!);
    }
    case "mergora.project.status": {
      const input = exactInput(rawInput, ["cwd"], ["cwd"]);
      return projectStatus(stringInput(input, "cwd", { required: true })!);
    }
    case "mergora.project.doctor": {
      const input = exactInput(rawInput, ["cwd"], ["cwd"]);
      return doctorProject(stringInput(input, "cwd", { required: true })!);
    }
    case "mergora.project.diff": {
      const input = exactInput(rawInput, ["cwd", "items"], ["cwd"]);
      return diffSemanticSource({
        projectRoot: stringInput(input, "cwd", { required: true })!,
        ...optional("itemIds", itemsInput(input, false)),
      });
    }
    case "mergora.theme.list": {
      const input = exactInput(rawInput, ["cwd"]);
      const cwd = stringInput(input, "cwd");
      return cwd === undefined ? listThemes() : listProjectThemes(cwd);
    }
    case "mergora.theme.export": {
      const input = exactInput(rawInput, ["cwd", "theme", "format"], ["cwd", "theme", "format"]);
      const cwd = stringInput(input, "cwd", { required: true })!;
      const preset = loadThemePreset(
        cwd,
        stringInput(input, "theme", { required: true, maximum: 1024 })!,
      );
      return exportTheme(
        preset,
        stringInput(input, "format", {
          required: true,
          allowed: ["dtcg", "css", "tailwind"],
        }) as ThemeExportFormat,
      );
    }
    case "mergora.registry.list": {
      const input = exactInput(rawInput, ["cwd"], ["cwd"]);
      return listRegistries(stringInput(input, "cwd", { required: true })!);
    }
    case "mergora.registry.inspect": {
      const input = exactInput(rawInput, ["cwd", "id", "offline"], ["cwd", "id"]);
      return inspectRegistry({
        projectRoot: stringInput(input, "cwd", { required: true })!,
        id: stringInput(input, "id", { required: true, maximum: 128, pattern: ITEM_ID })!,
        offline: booleanInput(input, "offline", true),
      });
    }
    case "mergora.registry.verify": {
      const input = exactInput(rawInput, ["cwd", "id", "offline"], ["cwd", "id"]);
      return verifyRegistry({
        projectRoot: stringInput(input, "cwd", { required: true })!,
        id: stringInput(input, "id", { required: true, maximum: 128, pattern: ITEM_ID })!,
        offline: booleanInput(input, "offline", true),
      });
    }
    case "mergora.plan.create": {
      const input = exactInput(
        rawInput,
        ["directory", "cwd", "template", "packageManager", "preset", "noInstall"],
        ["directory", "template", "packageManager", "preset"],
      );
      return planProjectCreate({
        directory: stringInput(input, "directory", { required: true })!,
        ...optional("cwd", stringInput(input, "cwd")),
        template: stringInput(input, "template", {
          required: true,
          allowed: ["next", "vite"],
        }) as ProjectCreateTemplate,
        packageManager: stringInput(input, "packageManager", {
          required: true,
          allowed: ["npm", "pnpm", "yarn", "bun"],
        }) as PackageManager,
        preset: stringInput(input, "preset", {
          required: true,
          allowed: ["minimal", "application", "none"],
        }) as ProjectCreatePreset,
        ...optional("noInstall", booleanInput(input, "noInstall")),
      });
    }
    case "mergora.plan.init": {
      const input = exactInput(
        rawInput,
        ["cwd", "framework", "sourceRoot", "globalCss", "aliasPrefix", "packageManager"],
        ["cwd"],
      );
      return planInit({
        projectRoot: stringInput(input, "cwd", { required: true })!,
        ...optional(
          "framework",
          stringInput(input, "framework", {
            allowed: ["next-app", "next-pages", "vite-react", "react"],
          }) as Framework | undefined,
        ),
        ...optional("sourceRoot", stringInput(input, "sourceRoot", { maximum: 1024 })),
        ...optional("globalCss", stringInput(input, "globalCss", { maximum: 1024 })),
        ...optional("aliasPrefix", stringInput(input, "aliasPrefix", { maximum: 256 })),
        ...optional(
          "packageManager",
          stringInput(input, "packageManager", {
            allowed: ["npm", "pnpm", "yarn", "bun"],
          }) as PackageManager | undefined,
        ),
      });
    }
    case "mergora.plan.add": {
      const input = exactInput(
        rawInput,
        ["cwd", "items", "targetDirectory", "noInstall", "offline", "packageManager"],
        ["cwd", "items"],
      );
      return planSourceAdd(sourceOptions(input));
    }
    case "mergora.plan.remove": {
      const input = exactInput(
        rawInput,
        ["cwd", "items", "keepFiles", "noInstall", "offline", "packageManager"],
        ["cwd", "items"],
      );
      return planSourceRemove({
        ...sourceOptions(input),
        ...optional("keepFiles", booleanInput(input, "keepFiles")),
      });
    }
    case "mergora.plan.adopt": {
      const input = exactInput(rawInput, ["cwd", "items", "targetDirectory"], ["cwd", "items"]);
      return planSourceAdopt(sourceOptions(input));
    }
    case "mergora.plan.vendor": {
      const input = exactInput(rawInput, ["cwd", "items", "allInstalled"], ["cwd"]);
      return planVendor({
        projectRoot: stringInput(input, "cwd", { required: true })!,
        ...optional("itemIds", itemsInput(input, false)),
        ...optional("allInstalled", booleanInput(input, "allInstalled")),
      });
    }
    case "mergora.plan.registry.enroll": {
      const input = exactInput(
        rawInput,
        ["cwd", "id", "origin", "protocol", "authEnvironmentVariable", "allowInsecureLocalhost"],
        ["cwd", "id", "origin"],
      );
      const result = await planRegistryEnrollment({
        projectRoot: stringInput(input, "cwd", { required: true })!,
        id: stringInput(input, "id", { required: true, maximum: 128, pattern: ITEM_ID })!,
        origin: stringInput(input, "origin", { required: true })!,
        ...optional(
          "protocol",
          stringInput(input, "protocol", { allowed: ["mergora-v1", "shadcn-v1"] }) as
            RegistryProtocol | undefined,
        ),
        ...optional(
          "authEnvironmentVariable",
          stringInput(input, "authEnvironmentVariable", {
            maximum: 128,
            pattern: ENVIRONMENT_VARIABLE,
          }),
        ),
        ...optional("allowInsecureLocalhost", booleanInput(input, "allowInsecureLocalhost")),
      });
      return result.plan;
    }
    case "mergora.plan.registry.remove": {
      const input = exactInput(rawInput, ["cwd", "id"], ["cwd", "id"]);
      return planRegistryRemoval({
        projectRoot: stringInput(input, "cwd", { required: true })!,
        id: stringInput(input, "id", { required: true, maximum: 128, pattern: ITEM_ID })!,
      }).plan;
    }
    default:
      throw new McpCoreError("MCP_TOOL_NOT_FOUND", "Unknown Mergora MCP tool name.");
  }
}

function capabilityResource(): JsonObject {
  return {
    schemaVersion: 1,
    id: "mergora.mcp.core.v1",
    defaultCapability: "read-or-plan-only",
    applyCapability: false,
    tools: TOOL_DEFINITIONS.map(({ name }) => name),
    unsupported: ["apply", "auto-consent", "force", "conflict-bypass", "live-registry-resolution"],
  };
}

function securityResource(): JsonObject {
  return {
    schemaVersion: 1,
    mutation: "never",
    planning: "exact-shared-cli-plan",
    consent: "never-accepted-by-server",
    conflicts: "preserved-in-plan",
    credentials: "environment-variable-name-only",
    paths: "redacted-from-errors-and-omitted-from-portable-results",
    inputBytes: MERGORA_MCP_MAX_INPUT_BYTES,
    resultBytes: MERGORA_MCP_MAX_RESULT_BYTES,
    wireBytes: MERGORA_MCP_MAX_WIRE_BYTES,
  };
}

async function resourceValue(uri: string): Promise<JsonValue> {
  switch (uri) {
    case "mergora://server/capabilities":
      return capabilityResource();
    case "mergora://server/security":
      return securityResource();
    case "mergora://registry/catalog":
      return searchRegistry("", { limit: 100 }) as unknown as JsonValue;
    default:
      throw new McpCoreError("MCP_RESOURCE_NOT_FOUND", "Unknown Mergora MCP resource URI.");
  }
}

function requestObject(value: unknown): Record<string, unknown> {
  const request = plainObject(value, "MCP core request");
  if (
    !Object.hasOwn(request, "id") ||
    typeof request.method !== "string" ||
    !(request.id === null || typeof request.id === "number" || typeof request.id === "string")
  ) {
    throw new McpCoreError(
      "MCP_REQUEST_INVALID",
      "MCP core request identity or method is invalid.",
    );
  }
  return request;
}

export function createMergoraMcpServer(): MergoraMcpServer {
  const server: MergoraMcpServer = {
    id: "mergora.mcp.core.v1",
    defaultCapability: "read-or-plan-only",
    applyCapability: false,
    listTools: () => structuredClone(TOOL_DEFINITIONS),
    callTool: async (name, input) => {
      try {
        if (typeof name !== "string" || name.length > 128) {
          throw new McpCoreError("MCP_TOOL_NAME_INVALID", "Mergora MCP tool name is invalid.");
        }
        return success(await toolValue(name, input));
      } catch (error) {
        return safeError(error);
      }
    },
    listResources: () => structuredClone(RESOURCE_DEFINITIONS),
    readResource: async (uri): Promise<MergoraMcpResourceResult> => {
      if (typeof uri !== "string" || uri.length > 256) {
        throw new McpCoreError("MCP_RESOURCE_URI_INVALID", "Mergora MCP resource URI is invalid.");
      }
      const value = await resourceValue(uri);
      const text = canonicalJson(value);
      if (bytes(text) > MERGORA_MCP_MAX_RESULT_BYTES) {
        throw new McpCoreError("MCP_RESULT_TOO_LARGE", "Mergora MCP resource exceeds its bound.");
      }
      return { contents: [{ uri, mimeType: "application/json", text }] };
    },
    handleRequest: async (rawRequest): Promise<MergoraMcpCoreResponse> => {
      let id: number | string | null = null;
      try {
        const request = requestObject(rawRequest);
        id = request.id as number | string | null;
        switch (request.method) {
          case "ping":
            return { id, ok: true, result: { id: server.id, status: "ready" } };
          case "tools/list":
            return { id, ok: true, result: { tools: server.listTools() } };
          case "resources/list":
            return { id, ok: true, result: { resources: server.listResources() } };
          case "tools/call": {
            const params = exactInput(request.params, ["name", "arguments"], ["name"]);
            const name = stringInput(params, "name", { required: true, maximum: 128 })!;
            return {
              id,
              ok: true,
              result: await server.callTool(name, params.arguments),
            };
          }
          case "resources/read": {
            const params = exactInput(request.params, ["uri"], ["uri"]);
            const uri = stringInput(params, "uri", { required: true, maximum: 256 })!;
            return { id, ok: true, result: await server.readResource(uri) };
          }
          default:
            throw new McpCoreError("MCP_METHOD_NOT_FOUND", "Unknown Mergora MCP core method.");
        }
      } catch (error) {
        const failure = safeError(error).structuredContent.error;
        return { id, ok: false, error: { code: failure.code, message: failure.message } };
      }
    },
    handleLine: async (line): Promise<string> => {
      if (typeof line !== "string" || bytes(line) > MERGORA_MCP_MAX_INPUT_BYTES) {
        return `${canonicalJson({
          id: null,
          ok: false,
          error: { code: "MCP_REQUEST_TOO_LARGE", message: "MCP request exceeds 64 KiB." },
        })}\n`;
      }
      let request: unknown;
      try {
        request = JSON.parse(line) as unknown;
      } catch {
        request = null;
      }
      const response = await server.handleRequest(request);
      const output = canonicalJson(response);
      if (bytes(output) > MERGORA_MCP_MAX_WIRE_BYTES) {
        return `${canonicalJson({
          id: response.id,
          ok: false,
          error: { code: "MCP_WIRE_RESULT_TOO_LARGE", message: "MCP response exceeds 8 MiB." },
        })}\n`;
      }
      return `${output}\n`;
    },
  };
  return server;
}
