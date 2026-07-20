import { describe, expect, it, vi } from "vitest";

import {
  HarnessConfigurationError,
  RuntimeCapabilityError,
  captureVisual,
  createAxeCoreAdapter,
  createDomGeometryAdapter,
  createDomSemanticQueryPort,
  createPlaywrightGeometryAdapter,
  createPlaywrightVisualCaptureAdapter,
  querySemantically,
  runAxeContract,
  runGeometryContract,
  type AxeCoreRuntime,
  type DomSemanticQueryRuntime,
  type GeometryMeasurement,
  type PlaywrightEvaluationPage,
  type PlaywrightVisualPage,
  type VisualCaptureRequest,
} from "../../packages/test-utils/src/index.js";

const fontDigest = `sha256:${"f".repeat(64)}`;

function visualRequest(): VisualCaptureRequest {
  return {
    itemId: "button",
    stateId: "focused",
    environmentId: "desktop-light",
    os: "Linux",
    osVersion: "6.12",
    browser: "Chromium",
    browserVersion: "140.0.7339.0",
    fontDigest,
    width: 1280,
    height: 720,
    masks: [{ selector: "[data-clock]", reason: "The fixture clock is intentionally dynamic." }],
  };
}

describe("DOM semantic adapter", () => {
  it("uses the installed DOM Testing Library implementation for a concrete test-id query", () => {
    const node = {
      getAttribute: (name: string) => (name === "data-testid" ? "anchor" : null),
    } as HTMLElement;
    const container = {
      ownerDocument: {},
      querySelector: vi.fn(() => node),
      querySelectorAll: vi.fn(() => [node]),
    } as unknown as HTMLElement;

    const result = querySemantically(createDomSemanticQueryPort(container), {
      kind: "test-id",
      testId: "anchor",
      use: "geometry",
      justification: "The anchor rectangle is an implementation boundary for placement.",
    });

    expect(result).toBe(node);
    expect(container.querySelectorAll).toHaveBeenCalledWith("[data-testid]");
  });

  it("maps role filters and fails when the document or query options are unavailable", () => {
    let receivedName: unknown;
    const runtime: DomSemanticQueryRuntime = {
      getByRole: (_container, _role, options) => {
        receivedName = options?.name;
        return {} as HTMLElement;
      },
      getByLabelText: () => ({}) as HTMLElement,
      getByPlaceholderText: () => ({}) as HTMLElement,
      getByText: () => ({}) as HTMLElement,
      getByDisplayValue: () => ({}) as HTMLElement,
      getByTestId: () => ({}) as HTMLElement,
    };
    const port = createDomSemanticQueryPort({ ownerDocument: {} } as unknown as HTMLElement, {
      runtime,
    });

    querySemantically(port, {
      kind: "role",
      role: "button",
      options: { name: "save", exact: false, pressed: true },
    });
    expect(typeof receivedName).toBe("function");
    expect((receivedName as (name: string) => boolean)("Save changes")).toBe(true);
    expect(() =>
      querySemantically(port, { kind: "text", text: "Save", options: { selected: true } }),
    ).toThrow(HarnessConfigurationError);
    expect(() => createDomSemanticQueryPort(undefined)).toThrow(RuntimeCapabilityError);
  });
});

describe("axe-core adapter", () => {
  it("normalizes actual rule node counts and lets the core block serious findings", async () => {
    const run = vi.fn<AxeCoreRuntime["run"]>(async () => ({
      violations: [
        { id: "z-moderate", impact: "moderate", nodes: [{}, {}] },
        { id: "a-critical", impact: "critical", nodes: [{}] },
      ],
      incomplete: [{ id: "needs-review", impact: null, nodes: [{}, {}, {}] }],
    }));
    const document = { nodeType: 9, defaultView: {} } as unknown as Document;
    const output = await runAxeContract(
      createAxeCoreAdapter({ runtime: { run } }),
      document,
      { runOnly: ["wcag2a", "wcag2aa", "wcag22aa"] },
      "2026-07-18T12:00:00.000Z",
    );

    expect(output.result).toEqual({
      violations: [
        { id: "a-critical", impact: "critical", nodeCount: 1 },
        { id: "z-moderate", impact: "moderate", nodeCount: 2 },
      ],
      incomplete: [{ id: "needs-review", nodeCount: 3 }],
    });
    expect(output.assessment.state).toBe("fail");
    expect(run).toHaveBeenCalledWith(
      document,
      expect.objectContaining({
        reporter: "v2",
        resultTypes: ["violations", "incomplete"],
      }),
    );
  });

  it("fails closed for a missing document and an unknown axe impact", async () => {
    const runtime: AxeCoreRuntime = {
      run: async () => ({
        violations: [{ id: "rule", impact: "catastrophic", nodes: [{}] }],
        incomplete: [],
      }),
    };
    await expect(
      runAxeContract(
        createAxeCoreAdapter({ runtime }),
        undefined,
        undefined,
        "2026-07-18T12:00:00.000Z",
      ),
    ).rejects.toMatchObject({ capability: "axe-document" });

    const document = { nodeType: 9, defaultView: {} } as unknown as Document;
    await expect(
      runAxeContract(
        createAxeCoreAdapter({ runtime }),
        document,
        undefined,
        "2026-07-18T12:00:00.000Z",
      ),
    ).rejects.toMatchObject({ code: "axe-core.invalid-impact" });
  });
});

describe("geometry adapters", () => {
  it("measures DOM overflow, focus occlusion, targets, and clipping from runtime geometry", async () => {
    const view = {
      innerWidth: 100,
      innerHeight: 100,
      getComputedStyle: (element: { readonly styleValue?: Record<string, string> }) => ({
        display: "block",
        visibility: "visible",
        opacity: "1",
        overflowX: "visible",
        overflowY: "visible",
        ...element.styleValue,
      }),
    };
    const document = {
      defaultView: view,
      activeElement: null as HTMLElement | null,
      elementFromPoint: () => null as Element | null,
    };
    const element = (
      rect: {
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
      },
      parentElement: HTMLElement | null = null,
      styleValue: Record<string, string> = {},
    ) =>
      ({
        ownerDocument: document,
        parentElement,
        styleValue,
        getBoundingClientRect: () => rect,
        contains: () => false,
      }) as unknown as HTMLElement;

    const root = element(
      { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 },
      null,
      { overflowX: "hidden", overflowY: "hidden" },
    ) as HTMLElement & { scrollWidth: number; clientWidth: number };
    Object.defineProperties(root, {
      scrollWidth: { value: 120 },
      clientWidth: { value: 100 },
    });
    const focus = element(
      { left: 10, top: 10, right: 50, bottom: 34, width: 40, height: 24 },
      root,
    );
    const target = element(
      { left: 10, top: 40, right: 30, bottom: 60, width: 20, height: 20 },
      root,
    );
    const overlay = element(
      { left: 80, top: 20, right: 110, bottom: 50, width: 30, height: 30 },
      root,
    );
    document.activeElement = focus;
    document.elementFromPoint = () => overlay;

    const result = await runGeometryContract(createDomGeometryAdapter(), {
      root,
      targets: [
        {
          id: "trigger",
          element: target,
          minimumWidth: 24,
          minimumHeight: 24,
          touch: false,
        },
      ],
      overlays: [{ id: "popover", element: overlay }],
    });

    expect(result.measurement).toMatchObject({
      horizontalOverflowPx: 20,
      focusVisible: true,
      focusOccluded: true,
      targets: [{ id: "trigger", width: 20, height: 20 }],
      overlays: [{ id: "popover", clipped: true, offscreen: false }],
    });
    expect(result.assessment.issues.map((issue) => issue.code)).toEqual([
      "geometry.horizontal-overflow",
      "geometry.focus-occluded",
      "geometry.target-size",
      "geometry.overlay-bounds",
    ]);
  });

  it("wires Playwright evaluation and fails explicitly without a live Page", async () => {
    const measurement: GeometryMeasurement = {
      horizontalOverflowPx: 0,
      focusVisible: true,
      focusOccluded: false,
      targets: [],
      overlays: [],
    };
    let argument: unknown;
    const page = {
      evaluate: async (_pageFunction: unknown, input: unknown) => {
        argument = input;
        return measurement;
      },
    } as unknown as PlaywrightEvaluationPage;
    const adapter = createPlaywrightGeometryAdapter();

    await expect(
      adapter.measure({
        page,
        rootSelector: "#fixture",
        focusSelector: "#trigger",
        targets: [],
        overlays: [],
      }),
    ).resolves.toBe(measurement);
    expect(argument).toEqual({
      rootSelector: "#fixture",
      focusSelector: "#trigger",
      targets: [],
      overlays: [],
    });
    await expect(adapter.measure({} as never)).rejects.toMatchObject({
      capability: "playwright-page",
    });
    await expect(
      adapter.measure({
        page: {
          evaluate: async () => ({ ...measurement, horizontalOverflowPx: Number.NaN }),
        },
        rootSelector: "#fixture",
        targets: [],
        overlays: [],
      }),
    ).rejects.toMatchObject({ code: "playwright-geometry.invalid-measurement" });
  });
});

describe("Playwright visual capture adapter", () => {
  it("hashes real screenshot bytes, waits for persistence, and returns only their reference", async () => {
    const locator = vi.fn((_selector: string) => ({ count: async () => 1 }));
    const screenshot = vi.fn(async () => Uint8Array.of(1, 2, 3));
    const page = {
      locator,
      screenshot,
      viewportSize: () => ({ width: 1280, height: 720 }),
    } as unknown as PlaywrightVisualPage;
    const writes: unknown[] = [];
    const adapter = createPlaywrightVisualCaptureAdapter({
      writeArtifact: (write) => {
        writes.push(write);
      },
    });
    const reference = await captureVisual(
      adapter,
      {
        page,
        referenceId: "button-focused-desktop-light-visual",
        artifact: "evidence/visual/button-focused-desktop-light.png",
      },
      visualRequest(),
    );

    expect(reference).toEqual({
      id: "button-focused-desktop-light-visual",
      artifact: "evidence/visual/button-focused-desktop-light.png",
      digest: "sha256:039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
    });
    expect(locator).toHaveBeenCalledWith("[data-clock]");
    expect(screenshot).toHaveBeenCalledWith(
      expect.objectContaining({ animations: "disabled", caret: "hide", type: "png" }),
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ artifact: reference.artifact, digest: reference.digest });
  });

  it("does not capture when persistence or the pinned viewport is unavailable", async () => {
    const screenshot = vi.fn(async () => Uint8Array.of(1));
    const page = {
      locator: () => ({}),
      screenshot,
      viewportSize: () => ({ width: 800, height: 600 }),
    } as unknown as PlaywrightVisualPage;
    const target = {
      page,
      referenceId: "button-focused-visual",
      artifact: "evidence/button-focused.png",
    };

    await expect(
      captureVisual(createPlaywrightVisualCaptureAdapter(), target, visualRequest()),
    ).rejects.toMatchObject({ capability: "visual-artifact-writer" });
    await expect(
      captureVisual(
        createPlaywrightVisualCaptureAdapter({ writeArtifact: () => undefined }),
        target,
        visualRequest(),
      ),
    ).rejects.toMatchObject({ code: "playwright-visual.viewport-mismatch" });
    expect(screenshot).not.toHaveBeenCalled();
  });
});
