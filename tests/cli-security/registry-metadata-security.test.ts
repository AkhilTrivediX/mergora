import { describe, expect, it, vi } from "vitest";

import {
  CliError,
  normalizeRegistryOrigin,
  retrieveRegistryMetadata,
} from "../../packages/cli/src/index.ts";

const ORIGIN = "https://registry.security.invalid/v1";
const REDIRECT_ORIGIN = "https://redirect.security.invalid/v1";

interface ShadcnFile {
  readonly path: string;
  readonly type: "registry:file";
  readonly target: string;
  readonly content: string;
}

function shadcnItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: "button",
    type: "registry:ui",
    title: "Button",
    description: "A deterministic button.",
    dependencies: ["react@^19.0.0"],
    devDependencies: [],
    registryDependencies: [],
    files: [],
    docs: "Security fixture.",
    ...overrides,
  };
}

function shadcnCatalog(items: readonly Record<string, unknown>[]): Record<string, unknown> {
  return {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "security-fixture",
    homepage: "https://registry.security.invalid",
    items,
  };
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  return new Response(body, {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...init.headers },
  });
}

function metadata(value: unknown, options: { readonly maxBytes?: number } = {}) {
  return retrieveRegistryMetadata({
    origin: ORIGIN,
    protocol: "shadcn-v1",
    fetchImplementation: vi.fn<typeof fetch>(async () => jsonResponse(value)),
    ...options,
  });
}

function errorCode(error: unknown): string | undefined {
  return error instanceof CliError ? error.code : undefined;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("malicious registry metadata", () => {
  it.each([
    "script",
    "scripts",
    "shell",
    "command",
    "postinstall",
    "preinstall",
    "hook",
    "hooks",
    "codemod",
    "eval",
    "wasm",
  ])("rejects the arbitrary executable field %s", async (field) => {
    const error = await caught(
      metadata(shadcnCatalog([shadcnItem({ [field]: "run arbitrary code" })])),
    );

    expect(error).toBeInstanceOf(CliError);
    expect(errorCode(error)).toBe("REGISTRY_METADATA_SCHEMA_INVALID");
  });

  it.each([
    "react@file:../escape",
    "react@link:../escape",
    "react@workspace:*",
    "react@portal:../escape",
    "react@patch:react@npm%3A19.0.0#fixture.patch",
    "react@git+https://attacker.invalid/repository.git",
    "react@https://attacker.invalid/react.tgz",
    "react@github:attacker/repository",
  ])("rejects dependency protocol %s", async (dependency) => {
    const error = await caught(
      metadata(shadcnCatalog([shadcnItem({ dependencies: [dependency] })])),
    );

    expect(error).toBeInstanceOf(CliError);
    expect(errorCode(error)).toBe("REGISTRY_DEPENDENCY_INVALID");
  });

  it("drops authorization on cross-origin redirects and records the exact hop", async () => {
    const authorization = new Map<string, string | null>();
    const initial = `${REDIRECT_ORIGIN}/registry.json`;
    const target = `${ORIGIN}/registry.json`;
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      authorization.set(url, new Headers(init?.headers).get("authorization"));
      if (url === initial) {
        return new Response(null, { status: 302, headers: { location: target } });
      }
      return jsonResponse(shadcnCatalog([shadcnItem()]));
    });

    const result = await retrieveRegistryMetadata({
      origin: REDIRECT_ORIGIN,
      protocol: "shadcn-v1",
      authEnvironmentVariable: "SECURITY_REGISTRY_TOKEN",
      environment: { SECURITY_REGISTRY_TOKEN: "never-forward-cross-origin" },
      fetchImplementation,
    });

    expect(authorization.get(initial)).toBe("Bearer never-forward-cross-origin");
    expect(authorization.get(target)).toBeNull();
    expect(result.redirects).toEqual([{ from: initial, to: target }]);
    expect(JSON.stringify(result)).not.toContain("never-forward-cross-origin");
  });

  it.each([
    "https://user:secret@attacker.invalid/v1/registry.json",
    "https://attacker.invalid/v1/registry.json?token=secret",
    "https://attacker.invalid/v1/registry.json#fragment",
    "http://attacker.invalid/v1/registry.json",
  ])("rejects a redirect to %s before a second request", async (location) => {
    const fetchImplementation = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 302, headers: { location } }),
    );

    const error = await caught(
      retrieveRegistryMetadata({
        origin: ORIGIN,
        protocol: "shadcn-v1",
        fetchImplementation,
      }),
    );

    expect(error).toBeInstanceOf(CliError);
    expect(errorCode(error)).toBe("REGISTRY_REDIRECT_SECURITY_INVALID");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("rejects over-depth JSON before parsing application metadata", async () => {
    const overDepth = `${"[".repeat(65)}0${"]".repeat(65)}`;
    const error = await caught(metadata(overDepth));

    expect(error).toBeInstanceOf(CliError);
    expect(errorCode(error)).toBe("REGISTRY_JSON_DEPTH_EXCEEDED");
  });

  it("rejects an oversized streamed response at the configured byte boundary", async () => {
    const error = await caught(metadata(shadcnCatalog([shadcnItem()]), { maxBytes: 128 }));

    expect(error).toBeInstanceOf(CliError);
    expect(errorCode(error)).toBe("REGISTRY_RESPONSE_TOO_LARGE");
  });

  it("rejects duplicate IDs, uppercase aliases, and non-normalized Unicode IDs", async () => {
    const duplicate = await caught(
      metadata(shadcnCatalog([shadcnItem(), shadcnItem({ title: "Duplicate" })])),
    );
    const uppercase = await caught(metadata(shadcnCatalog([shadcnItem({ name: "Button" })])));
    const unicode = await caught(metadata(shadcnCatalog([shadcnItem({ name: "cafe\u0301" })])));

    expect(errorCode(duplicate)).toBe("REGISTRY_CATALOG_COLLISION");
    expect(errorCode(uppercase)).toBe("REGISTRY_METADATA_SCHEMA_INVALID");
    expect(errorCode(unicode)).toBe("REGISTRY_METADATA_SCHEMA_INVALID");
  });

  it.each([
    ["../outside.ts", "src/components/button.tsx"],
    ["src/button.tsx", "../outside.ts"],
    ["\\\\server\\share\\button.tsx", "src/components/button.tsx"],
    ["src/button.tsx", "\\\\server\\share\\button.tsx"],
    ["src/CON", "src/components/button.tsx"],
    ["src/button.tsx", "src/NUL.ts"],
    ["src/control\u0001.ts", "src/components/button.tsx"],
    ["src/button.tsx", "src/components/control\u007f.tsx"],
    ["src/trailing.", "src/components/button.tsx"],
    ["src/button.tsx", "src/components/trailing "],
  ])("rejects unsafe registry file path %j -> %j", async (path, target) => {
    const file: ShadcnFile = { path, target, type: "registry:file", content: "export {};\n" };
    const error = await caught(metadata(shadcnCatalog([shadcnItem({ files: [file] })])));

    expect(error).toBeInstanceOf(CliError);
  });

  it("rejects portable case collisions between registry file targets", async () => {
    const files: readonly ShadcnFile[] = [
      {
        path: "src/Button.tsx",
        target: "src/components/Button.tsx",
        type: "registry:file",
        content: "export const first = true;\n",
      },
      {
        path: "src/button.tsx",
        target: "src/components/button.tsx",
        type: "registry:file",
        content: "export const second = true;\n",
      },
    ];

    await expect(metadata(shadcnCatalog([shadcnItem({ files })]))).rejects.toBeInstanceOf(CliError);
  });

  it.each([
    "https://registry.security.invalid/v1/../private",
    "https://registry.security.invalid/v1/%2e%2e/private",
    "https://registry.security.invalid/v1\\private",
    "https://registry.security.invalid/v1/control\u0001",
  ])("rejects the ambiguous registry origin %j", (origin) => {
    expect(() => normalizeRegistryOrigin(origin)).toThrow(CliError);
  });
});
