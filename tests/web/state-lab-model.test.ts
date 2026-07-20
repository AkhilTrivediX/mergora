import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import documentationContracts from "../../registry/generated/documentation-contract-index.v1.json";
import {
  buildStateLabModel,
  buildStateLabSearch,
  defaultStateLabConfiguration,
  humanStateLabel,
  parseStateLabSearch,
  resolveStateLabStoryIds,
  STATE_LAB_GLOBAL_CONTROLS,
  stateLabGlobals,
  stateLabStoryForConfiguration,
  type DocumentationContractItem,
} from "../../apps/web/src/app/state-lab-model";

function contractItem(id: string): DocumentationContractItem {
  const item = documentationContracts.items.find((candidate) => candidate.id === id);
  expect(item, `documentation contract for ${id}`).toBeDefined();
  return item as unknown as DocumentationContractItem;
}

describe("catalog-wide State Lab model", () => {
  it("preserves every generated state, rationale, and exact source pointer", () => {
    expect(documentationContracts.items).toHaveLength(documentationContracts.inventory.items);
    expect(documentationContracts.items).toHaveLength(178);

    for (const item of documentationContracts.items) {
      const model = buildStateLabModel(item as unknown as DocumentationContractItem);
      expect(model.itemId, item.id).toBe(item.id);
      expect(model.displayName, item.id).toBe(item.displayName);
      expect(model.inventoryStatus, item.id).toBe(item.stateApplicability.status);
      expect(model.inventoryReason, item.id).toBe(item.stateApplicability.reason);
      expect(model.inventorySourcePath, item.id).toBe(item.stateApplicability.sourcePath);
      expect(
        model.states.map(({ id }) => id),
        item.id,
      ).toEqual(item.stateApplicability.states.map(({ id }) => id));

      for (const [mode, source] of [
        ["basic", item.storybook.basic],
        ["recommended", item.storybook.recommended],
      ] as const) {
        const story = model[mode];
        expect(story.availability, `${item.id}:${mode}`).toBe("available");
        expect(story.evidenceStatus, `${item.id}:${mode}`).toBe(source.status);
        expect(story.mode, `${item.id}:${mode}`).toBe(source.mode);
        expect(story.matrixStatus, `${item.id}:${mode}`).toBe(source.matrixStatus);
        expect(story.pointer, `${item.id}:${mode}`).toEqual({
          exportName: source.exportName,
          modulePath: source.modulePath,
        });
      }

      item.stateApplicability.states.forEach((sourceState, index) => {
        const state = model.states[index];
        expect(state?.id, `${item.id}:${sourceState.id}`).toBe(sourceState.id);
        expect(state?.applicability, `${item.id}:${sourceState.id}`).toBe(
          sourceState.applicability,
        );
        expect(state?.rationale, `${item.id}:${sourceState.id}`).toBe(sourceState.rationale);
        expect(state?.label.trim().length, `${item.id}:${sourceState.id}`).toBeGreaterThan(0);
        if (sourceState.applicability === "applicable") {
          expect(state?.story, `${item.id}:${sourceState.id}`).not.toBeNull();
          expect(state?.story?.availability, `${item.id}:${sourceState.id}`).toBe("available");
          expect(state?.story?.evidenceStatus, `${item.id}:${sourceState.id}`).toBe(
            sourceState.story?.status,
          );
          expect(state?.story?.pointer, `${item.id}:${sourceState.id}`).toEqual(
            sourceState.story === null
              ? null
              : {
                  exportName: sourceState.story.exportName,
                  modulePath: sourceState.story.modulePath,
                },
          );
        } else {
          expect(state?.story, `${item.id}:${sourceState.id}`).toBeNull();
        }
      });
    }
  });

  it("keeps unavailable and draft inventories unavailable even with a valid pointer", () => {
    const source = contractItem("button");
    const fixture: DocumentationContractItem = {
      ...source,
      stateApplicability: {
        reason: "Review has not established applicability.",
        sourcePath: "registry/source/components/example/example.stories.json",
        states: [
          {
            applicability: "applicable",
            id: "loading",
            rationale: null,
            story: source.storybook.recommended,
          },
        ],
        status: "draft",
      },
    };
    const model = buildStateLabModel(fixture);
    expect(model.inventoryStatus).toBe("draft");
    expect(model.states[0]?.story).toMatchObject({
      availability: "unavailable",
      unavailableReason: "Review has not established applicability.",
    });
    expect(model.states[0]?.story?.pointer).toEqual({
      exportName: source.storybook.recommended.exportName,
      modulePath: source.storybook.recommended.modulePath,
    });

    const draftState = buildStateLabModel({
      ...source,
      stateApplicability: {
        reason: null,
        sourcePath: "registry/source/components/example/example.stories.json",
        states: [
          {
            applicability: "draft",
            id: "loading",
            rationale: null,
            story: source.storybook.recommended,
          },
        ],
        status: "available",
      },
    }).states[0];
    expect(draftState?.story).toMatchObject({
      availability: "unavailable",
      unavailableReason: "State applicability is draft.",
    });
    expect(draftState?.story?.pointer).toEqual({
      exportName: source.storybook.recommended.exportName,
      modulePath: source.storybook.recommended.modulePath,
    });

    for (const id of ["client-only", "combobox", "data-grid"]) {
      const unavailable = buildStateLabModel(contractItem(id));
      expect(unavailable.inventoryStatus, id).not.toBe("available");
      expect(unavailable.inventoryReason, id).not.toBeNull();
      expect(unavailable.states, id).toEqual([]);
    }
  });

  it("round-trips item, story, state, and actual global controls deterministically", () => {
    const model = buildStateLabModel(contractItem("button"));
    const parsed = parseStateLabSearch(
      "?labItem=button&labStory=state&labState=disabled&labTheme=dark&labContrast=forced-colors&labDensity=touch&labDirection=rtl&labMotion=reduced&labViewport=narrow",
      model,
    );
    expect(parsed.issues).toEqual([]);
    expect(parsed.configuration).toEqual({
      controls: {
        contrast: "forced-colors",
        density: "touch",
        direction: "rtl",
        motion: "reduced",
        theme: "dark",
        viewportMode: "narrow",
      },
      stateId: "disabled",
      story: "state",
    });

    const search = buildStateLabSearch(
      model,
      parsed.configuration,
      "?label=primary&lens=contrast&labOld=x",
    );
    expect(search).toBe(
      "?labContrast=forced-colors&labDensity=touch&labDirection=rtl&label=primary&labItem=button&labMotion=reduced&labState=disabled&labStory=state&labTheme=dark&labViewport=narrow&lens=contrast",
    );
    expect(parseStateLabSearch(search, model).configuration).toEqual(parsed.configuration);
    expect(buildStateLabSearch(model, defaultStateLabConfiguration())).toBe(
      "?labContrast=standard&labDensity=comfortable&labDirection=ltr&labItem=button&labMotion=full&labStory=basic&labTheme=light&labViewport=responsive",
    );
    expect(stateLabGlobals(parsed.configuration)).toBe(
      "theme:dark;contrast:forced-colors;density:touch;direction:rtl;motion:reduced;viewportMode:narrow",
    );
  });

  it("keeps non-applicable deep links selected but unavailable with the exact rationale", () => {
    const model = buildStateLabModel(contractItem("button"));
    const parsed = parseStateLabSearch(
      "?labItem=button&labStory=state&labState=empty&labTheme=unknown&labExtra=true",
      model,
    );
    expect(parsed.configuration.story).toBe("state");
    expect(parsed.configuration.stateId).toBe("empty");
    expect(parsed.configuration.controls.theme).toBe("light");
    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        "Unknown State Lab parameter labExtra was ignored.",
        "labTheme value unknown is unavailable and was reset.",
      ]),
    );
    const source = documentationContracts.items
      .find(({ id }) => id === "button")
      ?.stateApplicability.states.find(({ id }) => id === "empty");
    const story = stateLabStoryForConfiguration(model, parsed.configuration);
    expect(story).toMatchObject({ availability: "unavailable", pointer: null });
    expect(story?.unavailableReason).toBe(source?.rationale);
  });

  it("resolves only exact module/export pairs and never substitutes similarly named stories", () => {
    const model = buildStateLabModel(contractItem("button"));
    const entries = Object.fromEntries(
      [model.basic, model.recommended, ...model.states.flatMap(({ story }) => story ?? [])]
        .filter(({ pointer }) => pointer !== null)
        .map((story, index) => [
          `record-${String(index)}`,
          {
            exportName: story.pointer?.exportName,
            id: `exact-${story.key}`,
            importPath: `./${story.pointer?.modulePath.slice("apps/storybook/".length)}`,
            type: "story",
          },
        ]),
    );
    entries.distractor = {
      exportName: model.basic.pointer?.exportName,
      id: "wrong-module",
      importPath: "./src/Unrelated.stories.tsx",
      type: "story",
    };
    entries.docs = {
      exportName: model.basic.pointer?.exportName,
      id: "wrong-entry-type",
      importPath: `./${model.basic.pointer?.modulePath.slice("apps/storybook/".length)}`,
      type: "docs",
    };
    const resolved = resolveStateLabStoryIds({ entries }, model);
    expect(resolved.basic).toBe("exact-basic");
    expect(resolved.recommended).toBe("exact-recommended");
    expect(resolved["state:disabled"]).toBe("exact-state:disabled");
    expect(Object.values(resolved)).not.toContain("wrong-module");
    expect(Object.values(resolved)).not.toContain("wrong-entry-type");
  });

  it("uses human labels and only globals declared by Storybook preview", () => {
    expect(humanStateLabel("rtl")).toBe("RTL");
    expect(humanStateLabel("zoom-400")).toBe("Zoom at 400%");
    expect(humanStateLabel("focus-visible")).toBe("Focus visible");
    expect(humanStateLabel("custom-state")).toBe("Custom state");

    const preview = readFileSync(
      resolve(import.meta.dirname, "../../apps/storybook/.storybook/preview.ts"),
      "utf8",
    );
    expect(STATE_LAB_GLOBAL_CONTROLS.map(({ storybookKey }) => storybookKey)).toEqual([
      "theme",
      "contrast",
      "density",
      "direction",
      "motion",
      "viewportMode",
    ]);
    for (const control of STATE_LAB_GLOBAL_CONTROLS) {
      expect(preview, control.storybookKey).toMatch(
        new RegExp(`\\n\\s{4}${control.storybookKey}: \\{`, "u"),
      );
      for (const option of control.options) {
        expect(preview, `${control.storybookKey}:${option.value}`).toContain(
          `value: "${option.value}"`,
        );
      }
    }
  });
});
