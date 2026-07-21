import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  canonicalInstallBasket,
  createInstallBasketCliPlan,
  DEFAULT_INSTALL_BASKET_OPTIONS,
  installBasketPlanCommand,
  installBasketShareFragment,
  parseInstallBasket,
  parseInstallBasketShareFragment,
  parseInstallBasketShareState,
  resolveInstallBasket,
} from "../../apps/web/src/app/install-basket.ts";
import {
  assertAllowedCliInvocation,
  parseArguments,
} from "../../packages/cli/src/argument-parser.ts";
import { applyInit, planInit } from "../../packages/cli/src/configuration.ts";
import { resolveDistributionAddMode } from "../../packages/cli/src/distribution-operations.ts";
import { loadAllSourceItems } from "../../packages/cli/src/registry-data.ts";
import { planSourceAdd } from "../../packages/cli/src/source-operations.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

describe("checked install-basket state", () => {
  it("keeps item routes on the shared fail-closed command model", () => {
    const routeSource = readFileSync(
      resolve(import.meta.dirname, "../../apps/web/src/app/item-documentation.tsx"),
      "utf8",
    );
    expect(routeSource).toContain("createInstallBasketCliPlan");
    expect(routeSource).toContain("Package mode unavailable");
    expect(routeSource).not.toContain("add {id} --mode package --plan");
    expect(routeSource).not.toContain("--framework vite-react");
  });

  it("canonicalizes direct choices and rejects malformed or overlarge input", () => {
    expect(canonicalInstallBasket(["slider", "button", "slider"])).toEqual(["button", "slider"]);
    expect(canonicalInstallBasket(["Button"])).toBeNull();
    expect(canonicalInstallBasket(Array.from({ length: 101 }, (_, index) => `item-${index}`))).toBe(
      null,
    );
    expect(parseInstallBasket(["button", 42])).toBeNull();
  });

  it("round-trips a versioned share fragment and rejects tampering or excess", () => {
    const options = { ...DEFAULT_INSTALL_BASKET_OPTIONS, mode: "package" as const };
    const fragment = installBasketShareFragment(["slider", "button"], options);
    expect(fragment).toMatch(/^#basket\.v2\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/u);
    expect(parseInstallBasketShareFragment(fragment!)).toEqual(["button", "slider"]);
    expect(parseInstallBasketShareState(fragment!)?.options).toEqual(options);
    const tampered = `${fragment!.slice(0, -1)}${fragment!.endsWith("0") ? "1" : "0"}`;
    expect(parseInstallBasketShareFragment(tampered)).toBeNull();
    expect(parseInstallBasketShareFragment(`#basket.v1.${"a".repeat(2_100)}.00000000`)).toBeNull();
  });

  it("builds a deterministic source plan that the real CLI parser accepts", () => {
    const options = {
      framework: "vite-react" as const,
      mode: "source" as const,
      packageManager: "npm" as const,
      preset: "none" as const,
    };
    const result = createInstallBasketCliPlan(["slider", "button"], options);
    expect(result).toMatchObject({
      argv: ["add", "button", "slider", "--mode", "source", "--package-manager", "npm", "--plan"],
      command:
        "npx --yes mergora@1.0.0 add button slider --mode source --package-manager npm --plan",
      frameworkBinding: "initialized-project",
      releaseFile: null,
      status: "ready",
    });
    if (result.status !== "ready") throw new Error(result.message);
    const parsed = parseArguments(result.argv);
    expect(() => assertAllowedCliInvocation(parsed)).not.toThrow();
    expect(parsed.command).toBe("add");
    expect(parsed.positionals).toEqual(["button", "slider"]);
    expect(parsed.flags.get("framework")).toBeUndefined();
    expect(installBasketPlanCommand(["slider", "button"], options)).toBe(result.command);
  });

  it("fails package mode closed without an exact release and validates a supplied reference", () => {
    const options = {
      framework: "vite-react" as const,
      mode: "package" as const,
      packageManager: "npm" as const,
      preset: "none" as const,
    };
    expect(createInstallBasketCliPlan(["button"], options)).toEqual({
      code: "package-release-required",
      message:
        "Package mode requires an exact verified release file. No runnable package command is available for the unreleased catalog.",
      status: "unavailable",
    });
    expect(installBasketPlanCommand(["button"], options)).toBeNull();
    expect(
      createInstallBasketCliPlan(["button"], options, { releaseFile: "../release.json" }),
    ).toMatchObject({ code: "invalid-input", status: "unavailable" });

    const released = createInstallBasketCliPlan(["button"], options, {
      releaseFile: ".mergora/releases/mergora-1.0.0.json",
    });
    expect(released).toMatchObject({
      argv: [
        "add",
        "button",
        "--mode",
        "package",
        "--package-manager",
        "npm",
        "--release-file",
        ".mergora/releases/mergora-1.0.0.json",
        "--plan",
      ],
      status: "ready",
    });
    if (released.status !== "ready") throw new Error(released.message);
    const parsed = parseArguments(released.argv);
    expect(() => assertAllowedCliInvocation(parsed)).not.toThrow();
    expect(parsed.flags.get("release-file")).toEqual([".mergora/releases/mergora-1.0.0.json"]);
  });

  it("matches direct CLI dependency planning for normalized website argv", () => {
    const fixture = createProjectFixture({ framework: "vite-react", manager: "npm" });
    const initOptions = {
      projectRoot: fixture.root,
      defaultMode: "source" as const,
      framework: "vite-react" as const,
      packageManager: "npm" as const,
    };
    applyInit(initOptions, planInit(initOptions).planDigest);
    const website = createInstallBasketCliPlan(["provider"], {
      framework: "vite-react",
      mode: "source",
      packageManager: "npm",
      preset: "none",
    });
    if (website.status !== "ready") throw new Error(website.message);
    const parsed = parseArguments(website.argv);
    assertAllowedCliInvocation(parsed);
    const distributionMode = resolveDistributionAddMode({
      projectRoot: fixture.root,
      explicitMode: parsed.flags.get("mode")?.[0] as "source",
    });
    const directPlan = planSourceAdd({
      projectRoot: fixture.root,
      itemIds: parsed.positionals,
      distributionMode,
      noInstall: true,
      packageManager: parsed.flags.get("package-manager")?.[0] as "npm",
      commandArguments: website.argv,
    });
    const graph = loadAllSourceItems().map((item) => ({
      id: item.itemId,
      registryDependencies: item.registryDependencies,
      runtimeDependencies: Object.keys(item.runtimeDependencies),
    }));
    const websiteResolution = resolveInstallBasket(parsed.positionals, graph);
    const direct = directPlan.items
      .filter((item) => item.direct)
      .map((item) => item.id.replace(/^official:/u, ""))
      .sort();
    const implicit = directPlan.items
      .filter((item) => !item.direct)
      .map((item) => item.id.replace(/^official:/u, ""))
      .sort();
    expect({ direct, implicit }).toEqual({
      direct: websiteResolution.direct,
      implicit: websiteResolution.implicit,
    });
    expect(distributionMode).toBe("source");
    expect(directPlan.command).toBe("add");
  });

  it("keeps the former add --framework output invalid at the shared CLI contract", () => {
    const parsed = parseArguments([
      "add",
      "button",
      "--mode",
      "source",
      "--framework",
      "vite-react",
      "--plan",
    ]);
    expect(() => assertAllowedCliInvocation(parsed)).toThrow("--framework is not valid for add.");
  });

  it("separates direct choices from transitive dependencies", () => {
    expect(
      resolveInstallBasket(
        ["panel", "button"],
        [
          { id: "button", registryDependencies: [] },
          { id: "focus-ring", registryDependencies: [] },
          {
            id: "panel",
            registryDependencies: ["surface", "button"],
            runtimeDependencies: ["react"],
          },
          { id: "surface", registryDependencies: ["focus-ring"], runtimeDependencies: ["react"] },
        ],
      ),
    ).toEqual({
      cycles: [],
      direct: ["button", "panel"],
      implicit: ["focus-ring", "surface"],
      missing: [],
      requiredBy: {
        button: ["panel"],
        "focus-ring": ["panel"],
        surface: ["panel"],
      },
      runtimeDependencies: ["react"],
    });
  });

  it("reports missing records and cycles without losing the bounded plan", () => {
    expect(
      resolveInstallBasket(
        ["alpha", "missing-root"],
        [
          { id: "alpha", registryDependencies: ["beta"] },
          { id: "beta", registryDependencies: ["alpha", "unknown-leaf"] },
        ],
      ),
    ).toEqual({
      cycles: ["alpha -> beta -> alpha"],
      direct: ["alpha", "missing-root"],
      implicit: ["beta", "unknown-leaf"],
      missing: ["missing-root", "unknown-leaf"],
      requiredBy: { beta: ["alpha"], "unknown-leaf": ["alpha"] },
      runtimeDependencies: [],
    });
  });
});
