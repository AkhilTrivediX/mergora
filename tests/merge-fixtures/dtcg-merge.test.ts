import { describe, expect, it, vi } from "vitest";

import { mergeDtcgThreeWay } from "../../packages/registry/src/dtcg-merge.js";

function document(tokens: Record<string, unknown>): string {
  return `${JSON.stringify(tokens, null, 2)}\n`;
}

describe("DTCG Semantic Sync adapter", () => {
  it("merges disjoint token edits and keeps the local document formatting boundary", () => {
    const base = document({
      color: {
        $type: "color",
        foreground: { $value: "#111111" },
        background: { $value: "#ffffff" },
      },
    });
    const local = base.replace("#111111", "#222222");
    const remote = base.replace("#ffffff", "#f8f8f8");

    const result = mergeDtcgThreeWay({ base, local, remote });

    expect(result.status).toBe("semantic-merge");
    expect(result.content).toContain('"$value": "#222222"');
    expect(result.content).toContain('"$value": "#f8f8f8"');
    expect(result.preservedLocalKeys).toContain("dtcg:color.foreground");
    expect(result.appliedRemoteKeys).toContain("dtcg:color.background");
  });

  it("treats value and inherited type as one token unit", () => {
    const base = document({ color: { $type: "color", accent: { $value: "#0055ff" } } });
    const local = base.replace("#0055ff", "#0066ff");
    const remote = document({ color: { $type: "string", accent: { $value: "brand" } } });

    const result = mergeDtcgThreeWay({ base, local, remote });

    expect(result.status).toBe("conflict");
    expect(result.conflicts[0]?.id).toBe("dtcg:color.accent");
  });

  it("keeps mode contexts distinct", () => {
    const base = document({
      modes: {
        light: {
          $extensions: { mergora: { mode: "light" } },
          surface: { $type: "color", $value: "#ffffff" },
        },
        dark: {
          $extensions: { mergora: { mode: "dark" } },
          surface: { $type: "color", $value: "#111111" },
        },
      },
    });
    const local = base.replace("#ffffff", "#fdfdfd");
    const remote = base.replace("#111111", "#151515");

    const result = mergeDtcgThreeWay({ base, local, remote });

    expect(result.status).toBe("semantic-merge");
    expect(result.preservedLocalKeys).toEqual(["dtcg:modes.light.surface@mode=light"]);
    expect(result.appliedRemoteKeys).toEqual(["dtcg:modes.dark.surface@mode=dark"]);
  });

  it("rejects missing and cyclic aliases after an otherwise clean merge", () => {
    const base = document({
      a: { $type: "color", $value: "#000000" },
      b: { $type: "color", $value: "{a}" },
    });
    const local = base;
    const remote = document({
      a: { $type: "color", $value: "{b}" },
      b: { $type: "color", $value: "{a}" },
    });

    const result = mergeDtcgThreeWay({ base, local, remote });

    expect(result.status).toBe("conflict");
    expect(result.conflicts.some(({ detail }) => detail.includes("cycle"))).toBe(true);
  });

  it("runs the proposed accessibility validator before returning a merge", () => {
    const base = document({ space: { sm: { $type: "dimension", $value: "4px" } } });
    const remote = base.replace("4px", "2px");
    const validateAccessibility = vi.fn(() => [
      { id: "touch-target", detail: "The proposed target token is below policy." },
    ]);

    const result = mergeDtcgThreeWay({ base, local: base, remote }, { validateAccessibility });

    expect(validateAccessibility).toHaveBeenCalledOnce();
    expect(result.status).toBe("conflict");
    expect(result.conflicts[0]?.id).toBe("dtcg:a11y:touch-target");
  });

  it("fails closed on malformed tokens and resource limits", () => {
    const malformed = document({ color: { accent: { $value: "#0055ff" } } });
    expect(mergeDtcgThreeWay({ base: malformed, local: malformed, remote: malformed }).status).toBe(
      "conflict",
    );

    const valid = document({ color: { accent: { $type: "color", $value: "#0055ff" } } });
    expect(
      mergeDtcgThreeWay({ base: valid, local: valid, remote: valid }, { maxCharacters: 10 }).status,
    ).toBe("conflict");
  });

  it("is deterministic", () => {
    const base = document({
      size: {
        $type: "dimension",
        sm: { $value: "4px" },
        md: { $value: "8px" },
      },
    });
    const input = {
      base,
      local: base.replace("4px", "5px"),
      remote: base.replace("8px", "10px"),
    };
    expect(mergeDtcgThreeWay(input)).toEqual(mergeDtcgThreeWay(input));
  });
});
