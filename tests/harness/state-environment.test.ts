import { describe, expect, it, vi } from "vitest";

import {
  REQUIRED_STORY_STATES,
  RuntimeCapabilityError,
  defineStoryEnvironment,
  defineStoryStateMatrix,
  expandStoryEnvironmentAxes,
  expandStoryStateRuns,
  querySemantically,
  semanticQueryRank,
  withStoryEnvironment,
  type SemanticQueryPort,
  type StoryStateCase,
} from "../../packages/test-utils/src/index.js";

function requiredStates(): readonly StoryStateCase[] {
  return REQUIRED_STORY_STATES.map((id) => ({
    id,
    applicability: { status: "applicable" as const },
  }));
}

function environment() {
  const result = defineStoryEnvironment({
    locale: "en-US",
    direction: "ltr",
    theme: "light",
    density: "comfortable",
    motion: "reduce",
    viewport: { id: "mobile-compact", width: 320, height: 568 },
    containerWidth: 240,
    zoomPercent: 100,
    textScalePercent: 200,
    textSpacing: "wcag-override",
  });
  if (!result.ok) throw new Error(result.issues.map((entry) => entry.message).join("; "));
  return result.value;
}

describe("story state and environment controls", () => {
  it("requires an explicit disposition for every canonical state", () => {
    const missing = defineStoryStateMatrix("button", requiredStates().slice(1));
    expect(missing.ok).toBe(false);
    expect(missing.issues.map((entry) => entry.code)).toContain(
      "state-matrix.missing-required-state",
    );

    const states = requiredStates().map((state) =>
      state.id === "loading"
        ? { ...state, applicability: { status: "not-applicable" as const, reason: "" } }
        : state,
    );
    const unexplained = defineStoryStateMatrix("button", states);
    expect(unexplained.ok).toBe(false);
    expect(unexplained.issues.map((entry) => entry.code)).toContain(
      "state-matrix.missing-not-applicable-reason",
    );
  });

  it("expands only applicable states in deterministic environment order", () => {
    const matrixResult = defineStoryStateMatrix(
      "button",
      requiredStates().map((state) =>
        state.id === "read-only"
          ? {
              ...state,
              applicability: {
                status: "not-applicable" as const,
                reason: "Buttons do not expose a read-only mode.",
              },
            }
          : state,
      ),
    );
    if (!matrixResult.ok) throw new Error("expected valid state matrix");
    const runs = expandStoryStateRuns(matrixResult.value, [environment()]);
    expect(runs).toHaveLength(REQUIRED_STORY_STATES.length - 1);
    expect(runs.some((run) => run.stateId === "read-only")).toBe(false);
    expect(runs.at(0)?.stateId).toBe("default");
  });

  it("applies and restores framework-specific controls", async () => {
    const events: string[] = [];
    const result = await withStoryEnvironment(
      {
        apply: (value) => {
          events.push(`apply:${value.id}`);
          return () => {
            events.push(`restore:${value.id}`);
          };
        },
      },
      environment(),
      (value) => {
        events.push(`render:${value.id}`);
        return "rendered";
      },
    );

    expect(result).toBe("rendered");
    expect(events.map((entry) => entry.split(":")[0])).toEqual(["apply", "render", "restore"]);
    await expect(
      withStoryEnvironment(undefined, environment(), () => undefined),
    ).rejects.toBeInstanceOf(RuntimeCapabilityError);
  });

  it("expands control axes into canonical, sorted environments", () => {
    const result = expandStoryEnvironmentAxes({
      locales: ["en-US"],
      directions: ["ltr", "rtl"],
      themes: ["light"],
      densities: ["comfortable"],
      motions: ["reduce"],
      viewports: [{ id: "mobile-compact", width: 320, height: 568 }],
      containerWidths: [undefined, 240],
      zoomPercents: [100, 400],
      textScalePercents: [200],
      textSpacings: ["wcag-override"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(8);
    expect(result.value.map((entry) => entry.id)).toEqual(
      [...result.value.map((entry) => entry.id)].sort(),
    );
  });
});

describe("semantic query boundary", () => {
  it("dispatches through the semantic port and ranks test ids last", () => {
    const getByRole = vi.fn(() => "button-node");
    const port: SemanticQueryPort<string> = {
      getByRole,
      getByLabelText: vi.fn(() => "label-node"),
      getByPlaceholderText: vi.fn(() => "placeholder-node"),
      getByText: vi.fn(() => "text-node"),
      getByDisplayValue: vi.fn(() => "value-node"),
      getByTestId: vi.fn(() => "test-id-node"),
    };

    expect(
      querySemantically(port, { kind: "role", role: "button", options: { name: "Save" } }),
    ).toBe("button-node");
    expect(getByRole).toHaveBeenCalledWith("button", { name: "Save" });
    expect(semanticQueryRank({ kind: "role", role: "button" })).toBeLessThan(
      semanticQueryRank({
        kind: "test-id",
        testId: "anchor",
        use: "geometry",
        justification: "Measure the popover anchor rectangle.",
      }),
    );
  });

  it("rejects an unjustified test-id escape hatch", () => {
    const port = { getByTestId: vi.fn() } as unknown as SemanticQueryPort<unknown>;
    expect(() =>
      querySemantically(port, {
        kind: "test-id",
        testId: "anchor",
        use: "geometry",
        justification: "",
      }),
    ).toThrow(/justification/i);
  });
});
