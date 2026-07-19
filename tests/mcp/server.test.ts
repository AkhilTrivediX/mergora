import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyInit,
  planInit,
  planSourceAdd,
  type OperationPlan,
} from "../../packages/cli/src/index.js";
import {
  createMergoraMcpServer,
  runMergoraMcpLineTransport,
  type MergoraMcpToolResult,
} from "../../packages/mcp/src/index.js";
import { createProjectFixture } from "../cli-fixtures/project-fixture.js";

const temporaryDirectories: string[] = [];

function fixture() {
  const project = createProjectFixture({ framework: "vite-react" });
  temporaryDirectories.push(project.root);
  applyInit({ projectRoot: project.root }, planInit({ projectRoot: project.root }).planDigest);
  return project;
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

function fileSnapshot(root: string): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort((left, right) => left.localeCompare(right))) {
      const absolute = resolve(directory, name);
      const relative = absolute.slice(root.length + 1).replaceAll("\\", "/");
      const metadata = statSync(absolute);
      if (metadata.isDirectory()) visit(absolute);
      else result[relative] = readFileSync(absolute).toString("base64");
    }
  };
  visit(root);
  return result;
}

function successful(result: MergoraMcpToolResult): unknown {
  expect(result.isError).toBe(false);
  if (result.isError) throw new Error("Expected successful MCP tool result.");
  expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
  return result.structuredContent;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("Mergora MCP capability boundary", () => {
  it("returns deterministic stable tool/resource lists with no apply or bypass capability", () => {
    const server = createMergoraMcpServer();
    const tools = server.listTools();
    const resources = server.listResources();

    expect(server).toMatchObject({
      id: "mergora.mcp.core.v1",
      defaultCapability: "read-or-plan-only",
      applyCapability: false,
    });
    expect(server.listTools()).toEqual(tools);
    expect(server.listResources()).toEqual(resources);
    expect(tools.map(({ name }) => name)).toEqual([
      "mergora.search",
      "mergora.view",
      "mergora.docs",
      "mergora.project.info",
      "mergora.project.status",
      "mergora.project.doctor",
      "mergora.project.diff",
      "mergora.theme.list",
      "mergora.theme.export",
      "mergora.registry.list",
      "mergora.registry.inspect",
      "mergora.registry.verify",
      "mergora.plan.create",
      "mergora.plan.init",
      "mergora.plan.add",
      "mergora.plan.remove",
      "mergora.plan.adopt",
      "mergora.plan.vendor",
      "mergora.plan.registry.enroll",
      "mergora.plan.registry.remove",
    ]);
    expect(tools.every(({ annotations }) => annotations.readOnlyHint)).toBe(true);
    expect(tools.every(({ annotations }) => annotations.destructiveHint === false)).toBe(true);
    expect(tools.some(({ name }) => /apply|force|resolve/u.test(name))).toBe(false);
    expect(resources.map(({ uri }) => uri)).toEqual([
      "mergora://server/capabilities",
      "mergora://server/security",
      "mergora://registry/catalog",
    ]);
  });

  it("documents unsupported shared surfaces instead of claiming implementations", async () => {
    const server = createMergoraMcpServer();
    const resource = await server.readResource("mergora://server/capabilities");
    const value = JSON.parse(resource.contents[0]!.text) as {
      readonly applyCapability: boolean;
      readonly unsupported: readonly string[];
    };

    expect(value.applyCapability).toBe(false);
    expect(value.unsupported).toEqual([
      "apply",
      "auto-consent",
      "force",
      "conflict-bypass",
      "live-registry-resolution",
    ]);
  });
});

describe("Mergora MCP read and plan tools", () => {
  it("keeps search and registry inspection read-only, with registry network disabled by default", async () => {
    const project = fixture();
    const transactionsBefore = transactionIds(project.root);
    const before = fileSnapshot(project.root);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const server = createMergoraMcpServer();

    const search = successful(
      await server.callTool("mergora.search", { query: "button", limit: 5 }),
    );
    const inspection = successful(
      await server.callTool("mergora.registry.inspect", {
        cwd: project.root,
        id: "official",
      }),
    ) as { readonly network: string };

    expect(search).toEqual(expect.objectContaining({ query: "button" }));
    expect(inspection.network).toBe("forbidden");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fileSnapshot(project.root)).toEqual(before);
    expect(transactionIds(project.root)).toEqual(transactionsBefore);
  });

  it("returns the exact shared CLI plan and leaves all bytes unchanged", async () => {
    const project = fixture();
    const transactionsBefore = transactionIds(project.root);
    const direct = planSourceAdd({ projectRoot: project.root, itemIds: ["button"] });
    const before = fileSnapshot(project.root);
    const server = createMergoraMcpServer();

    const fromMcp = successful(
      await server.callTool("mergora.plan.add", {
        cwd: project.root,
        items: ["button"],
      }),
    );

    expect(fromMcp).toEqual(direct);
    expect(fileSnapshot(project.root)).toEqual(before);
    expect(transactionIds(project.root)).toEqual(transactionsBefore);
  });

  it("lists and exports themes without changing project bytes", async () => {
    const project = fixture();
    const before = fileSnapshot(project.root);
    const server = createMergoraMcpServer();

    const themes = successful(
      await server.callTool("mergora.theme.list", { cwd: project.root }),
    ) as { readonly themes: readonly { readonly id: string }[] };
    const exported = successful(
      await server.callTool("mergora.theme.export", {
        cwd: project.root,
        theme: "light",
        format: "dtcg",
      }),
    ) as { readonly format: string; readonly content: string };

    expect(themes.themes.some(({ id }) => id === "light")).toBe(true);
    expect(exported.format).toBe("dtcg");
    expect(exported.content.length).toBeGreaterThan(0);
    expect(fileSnapshot(project.root)).toEqual(before);
  });

  it("preserves conflicts in the exact plan and rejects a generic force bypass", async () => {
    const project = fixture();
    const cleanPlan = planSourceAdd({ projectRoot: project.root, itemIds: ["button"] });
    const target = cleanPlan.fileOperations.find(
      ({ operation, target: operationTarget }) =>
        operation === "add" && !operationTarget.startsWith(".mergora/"),
    )?.target;
    expect(target).toBeDefined();
    mkdirSync(resolve(project.root, target!, ".."), { recursive: true });
    writeFileSync(resolve(project.root, target!), "local unowned content\n");
    const expected = planSourceAdd({ projectRoot: project.root, itemIds: ["button"] });
    const before = fileSnapshot(project.root);
    const server = createMergoraMcpServer();

    const result = successful(
      await server.callTool("mergora.plan.add", {
        cwd: project.root,
        items: ["button"],
      }),
    ) as OperationPlan;
    const bypass = await server.callTool("mergora.plan.add", {
      cwd: project.root,
      items: ["button"],
      force: true,
    });

    expect(result).toEqual(expected);
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.estimatedBytes.write).toBe(0);
    expect(
      result.fileOperations.every(({ operation }) => ["conflict", "no-op"].includes(operation)),
    ).toBe(true);
    expect(bypass).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "MCP_INPUT_FIELDS_INVALID" } },
    });
    expect(fileSnapshot(project.root)).toEqual(before);
  });
});

describe("Mergora MCP input, error, and transport safety", () => {
  it("rejects unsafe item input and non-plain objects", async () => {
    const server = createMergoraMcpServer();
    const traversal = await server.callTool("mergora.view", { items: ["../button"] });
    const inherited = Object.create({ items: ["button"] }) as unknown;
    const prototype = await server.callTool("mergora.view", inherited);

    expect(traversal).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "MCP_INPUT_ITEMS_INVALID" } },
    });
    expect(prototype).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "MCP_INPUT_INVALID" } },
    });
  });

  it("redacts machine paths and never returns stack traces", async () => {
    const project = fixture();
    const missing = resolve(project.root, "private-machine-path");
    const server = createMergoraMcpServer();
    const result = await server.callTool("mergora.project.info", { cwd: missing });
    const text = JSON.stringify(result);

    expect(result.isError).toBe(true);
    expect(text).not.toContain(project.root);
    expect(text).not.toContain("private-machine-path");
    expect(text).not.toContain("stack");
  });

  it("handles split newline-delimited requests deterministically", async () => {
    const server = createMergoraMcpServer();
    const request = JSON.stringify({ id: 7, method: "tools/list" });
    const output: string[] = [];

    await runMergoraMcpLineTransport({
      server,
      input: (async function* () {
        yield new TextEncoder().encode(request.slice(0, 9));
        yield new TextEncoder().encode(`${request.slice(9)}\n`);
      })(),
      write: (line) => {
        output.push(line);
      },
    });

    expect(output).toHaveLength(1);
    const response = JSON.parse(output[0]!) as {
      readonly id: number;
      readonly ok: boolean;
      readonly result: { readonly tools: readonly unknown[] };
    };
    expect(response.id).toBe(7);
    expect(response.ok).toBe(true);
    expect(response.result.tools).toEqual(server.listTools());
  });
});
