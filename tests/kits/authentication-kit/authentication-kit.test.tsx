import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuthenticationKit } from "../../../registry/source/kits/authentication-kit/authentication-kit.tsx";
import {
  assertImplementationProfileShard,
  loadMergoraSignaturePolicy,
} from "../../../tooling/registry-builder/src/index.ts";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const id = "authentication-kit";

describe("authentication kit canonical source", () => {
  it("keeps the default form lightweight and removes optional output", () => {
    const basic = renderToStaticMarkup(<AuthenticationKit />);
    expect(basic).toContain('data-slot="authentication-kit"');
    expect(basic).toContain('autoComplete="username"');
    expect(basic).toContain('autoComplete="current-password"');
    expect(basic).not.toContain("authentication-flow-navigation");
    expect(basic).not.toContain("authentication-rate-limit-recovery");
    expect(basic).not.toContain("authentication-security-context");

    const enhanced = renderToStaticMarkup(
      <AuthenticationKit
        availableFlows={["sign-in", "mfa", "recovery-code"]}
        showFlowNavigation
        showRateLimitRecovery
        showSecurityContext
      />,
    );
    expect(enhanced).toContain("authentication-flow-navigation");
    expect(enhanced).toContain("authentication-security-context");
    expect(enhanced).not.toContain("authentication-rate-limit-recovery");
  });

  it("rejects ambiguous flow configuration", () => {
    expect(() =>
      renderToStaticMarkup(<AuthenticationKit availableFlows={["sign-in", "sign-in"]} />),
    ).toThrow(/non-empty and unique/u);
    expect(() =>
      renderToStaticMarkup(<AuthenticationKit availableFlows={["mfa"]} defaultFlow="sign-in" />),
    ).toThrow(/selected flow must be available/u);
  });

  it("owns the exact companion set, matching API exports, and a valid profile", () => {
    const directory = resolve(workspaceRoot, `registry/source/kits/${id}`);
    expect(readdirSync(directory).sort()).toEqual(
      [
        "README.md",
        "index.ts",
        `${id}-css.d.ts`,
        `${id}.anatomy.json`,
        `${id}.api.json`,
        `${id}.contract.json`,
        `${id}.css`,
        `${id}.metadata.json`,
        `${id}.source.json`,
        `${id}.status.json`,
        `${id}.stories.json`,
        `${id}.tsx`,
      ].sort(),
    );
    const runtime = readFileSync(resolve(directory, `${id}.tsx`), "utf8");
    const api = JSON.parse(readFileSync(resolve(directory, `${id}.api.json`), "utf8"));
    const source = JSON.parse(readFileSync(resolve(directory, `${id}.source.json`), "utf8")) as {
      declaredImports: string[];
      id: string;
      outputRole: string;
    };
    const runtimeExports = [
      ...runtime.matchAll(
        /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|const|enum|function|interface|let|namespace|type|var)\s+([A-Za-z_$][\w$]*)/gmu,
      ),
    ]
      .map((match) => match[1]!)
      .sort((left, right) => left.localeCompare(right, "en-US"));
    expect(api.exports.map((entry: { readonly name: string }) => entry.name).sort()).toEqual(
      runtimeExports,
    );
    expect(source).toMatchObject({ id, outputRole: "kit" });
    const runtimeImports = [
      ...runtime.matchAll(/^import\s+(?:["']([^"']+)["']|[\s\S]*?\sfrom\s+["']([^"']+)["']);/gmu),
    ]
      .map((match) => (match[1] ?? match[2])!)
      .sort((left, right) => left.localeCompare(right, "en-US"));
    expect([...source.declaredImports].sort()).toEqual(runtimeImports);
    expect(source.declaredImports.every((specifier) => !specifier.endsWith("/index.js"))).toBe(
      true,
    );
    const profile = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, "registry/quality/implementation-profiles/authentication.v1.json"),
        "utf8",
      ),
    );
    expect(() =>
      assertImplementationProfileShard(
        profile,
        loadMergoraSignaturePolicy(workspaceRoot),
        workspaceRoot,
      ),
    ).not.toThrow();
    expect(profile.auditPendingIds).toEqual([]);
  });

  it("uses declared semantic tokens and preference fallbacks without banned styling", () => {
    const css = readFileSync(
      resolve(workspaceRoot, `registry/source/kits/${id}/${id}.css`),
      "utf8",
    );
    const tokenCss = readFileSync(
      resolve(workspaceRoot, "packages/tokens/src/generated/tokens.css"),
      "utf8",
    );
    const references = [...css.matchAll(/var\((--mrg-semantic-[a-z0-9-]+)/gu)].map(
      (match) => match[1]!,
    );
    expect(references.length).toBeGreaterThan(20);
    expect(references.every((reference) => tokenCss.includes(`${reference}:`))).toBe(true);
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).not.toMatch(
      /(?:gradient\(|backdrop-filter|border-radius:\s*(?:2[0-9]|[3-9][0-9])px)/u,
    );
  });
});
