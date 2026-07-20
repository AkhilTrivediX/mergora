import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { mergeCssDeclarationsThreeWay } from "../../packages/registry/src/index.ts";

const fixtureDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "button-style-update");

function fixture(name: string): string {
  return readFileSync(resolve(fixtureDirectory, name), "utf8");
}

describe("P1 Button style update tracer", () => {
  it("preserves a local style customization while applying independent upstream changes", () => {
    const result = mergeCssDeclarationsThreeWay({
      base: fixture("base.css"),
      local: fixture("local.css"),
      remote: fixture("remote.css"),
    });

    expect(result).toMatchObject({ status: "semantic-merge", conflicts: [] });
    expect(result.content).toBe(fixture("expected.css"));
    expect(result.content).toContain("var(--mrg-semantic-radius-full)");
    expect(result.content).toContain("var(--mrg-semantic-size-control-lg)");
    expect(result.content).toContain("touch-action: manipulation");
    expect(result.preservedLocalKeys).toEqual([
      "$root|selector:.mrg-button|property:border-radius",
    ]);
  });

  it("fails closed when local and upstream edit the same declaration differently", () => {
    const result = mergeCssDeclarationsThreeWay({
      base: ".mrg-button { border-radius: 4px; }\n",
      local: ".mrg-button { border-radius: 999px; }\n",
      remote: ".mrg-button { border-radius: 8px; }\n",
    });

    expect(result.status).toBe("conflict");
    expect(result.content).toBeNull();
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        semanticKey: "$root|selector:.mrg-button|property:border-radius",
        reason: "concurrent-edit",
        base: "4px",
        local: "999px",
        remote: "8px",
      }),
    ]);
  });

  it("rejects ambiguous cascade declarations instead of guessing", () => {
    const result = mergeCssDeclarationsThreeWay({
      base: ".mrg-button { color: CanvasText; color: var(--ink); }\n",
      local: ".mrg-button { color: CanvasText; color: var(--local-ink); }\n",
      remote: ".mrg-button { color: CanvasText; color: var(--remote-ink); }\n",
    });

    expect(result.status).toBe("conflict");
    expect(result.content).toBeNull();
    expect(result.conflicts.some(({ reason }) => reason === "ambiguous-semantic-key")).toBe(true);
  });

  it("validates then returns trivial states without reformatting bytes", () => {
    const base = ".mrg-button { color: CanvasText; }\r\n";
    const local = ".mrg-button { color: ButtonText; }\r\n";
    expect(mergeCssDeclarationsThreeWay({ base, local: base, remote: local })).toMatchObject({
      status: "fast-forward",
      content: local,
    });
    expect(mergeCssDeclarationsThreeWay({ base, local, remote: base })).toMatchObject({
      status: "keep-local",
      content: local,
    });
  });

  it("reports parse failures without returning proposed live bytes", () => {
    const result = mergeCssDeclarationsThreeWay({
      base: ".mrg-button { color: CanvasText; }",
      local: ".mrg-button { color: CanvasText; }",
      remote: ".mrg-button { color: ;",
    });

    expect(result.status).toBe("conflict");
    expect(result.content).toBeNull();
    expect(result.conflicts[0]).toMatchObject({
      semanticKey: "$parse:remote",
      reason: "parse-error",
    });
  });
});
