import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BillingSubscriptionKit } from "../../../registry/source/kits/billing-subscription-kit/billing-subscription-kit.tsx";
import {
  assertImplementationProfileShard,
  loadMergoraSignaturePolicy,
} from "../../../tooling/registry-builder/src/index.ts";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const id = "billing-subscription-kit";
const plans = [
  { id: "basic", name: "Basic", priceLabel: "12 credits" },
  { id: "plus", name: "Plus", priceLabel: "30 credits" },
] as const;
const invoices = [
  { amountLabel: "12 credits", dateLabel: "1 July 2026", id: "INV-1", status: "paid" as const },
] as const;

describe("billing subscription kit canonical source", () => {
  it("keeps the baseline native and removes every optional workflow", () => {
    const basic = renderToStaticMarkup(
      <BillingSubscriptionKit invoices={invoices} plans={plans} />,
    );
    expect(basic).toContain('type="radio"');
    expect(basic).toContain("Invoice records");
    expect(basic).not.toContain("billing-change-preview");
    expect(basic).not.toContain("billing-payment-method");
    expect(basic).not.toContain("billing-cancellation");
    expect(basic).not.toContain("Open INV-1");

    const enhanced = renderToStaticMarkup(
      <BillingSubscriptionKit
        cancellationReview={{
          consequences: ["Access changes at term end."],
          description: "Review access.",
          onConfirm: () => undefined,
        }}
        invoices={invoices}
        onInvoiceOpen={() => undefined}
        paymentMethodForm={<input aria-label="Provider boundary" />}
        plans={plans}
        renderChangePreview={(plan) => `Preview ${String(plan.name)}`}
      />,
    );
    expect(enhanced).toContain("billing-change-preview");
    expect(enhanced).toContain("billing-payment-method");
    expect(enhanced).toContain("billing-cancellation");
    expect(enhanced).toContain("Open INV-1");
  });

  it("rejects duplicate or unavailable plan identities", () => {
    expect(() =>
      renderToStaticMarkup(<BillingSubscriptionKit invoices={[]} plans={[plans[0], plans[0]]} />),
    ).toThrow(/unique/u);
    expect(() =>
      renderToStaticMarkup(
        <BillingSubscriptionKit invoices={[]} plans={plans} selectedPlanId="missing" />,
      ),
    ).toThrow(/selected plan must be available/u);
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
        resolve(workspaceRoot, "registry/quality/implementation-profiles/billing.v1.json"),
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

  it("uses semantic tokens and required preference fallbacks without banned styling", () => {
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
