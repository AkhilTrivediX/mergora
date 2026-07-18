import { describe, expect, it } from "vitest";
import {
  getDialogDismissBehavior,
  getDialogNamingDiagnostics,
  joinDialogClassName,
  resolveDialogOpenChangeReason,
} from "../../../registry/source/components/dialog/model.js";

describe("Dialog state and diagnostics model", () => {
  it("maps each public dismissal policy without an implicit path", () => {
    expect(getDialogDismissBehavior("outside-and-escape")).toEqual({
      allowsEscape: true,
      allowsOutsideInteraction: true,
    });
    expect(getDialogDismissBehavior("escape-only")).toEqual({
      allowsEscape: true,
      allowsOutsideInteraction: false,
    });
    expect(getDialogDismissBehavior("explicit")).toEqual({
      allowsEscape: false,
      allowsOutsideInteraction: false,
    });
  });

  it("preserves a recorded user reason and uses bounded fallbacks", () => {
    expect(resolveDialogOpenChangeReason("escape-key", false)).toBe("escape-key");
    expect(resolveDialogOpenChangeReason("outside-interaction", false)).toBe("outside-interaction");
    expect(resolveDialogOpenChangeReason(null, true)).toBe("trigger");
    expect(resolveDialogOpenChangeReason(null, false)).toBe("dismiss");
  });

  it("keeps the canonical class while allowing a consumer class", () => {
    expect(joinDialogClassName("mrg-dialog__content", undefined)).toBe("mrg-dialog__content");
    expect(joinDialogClassName("mrg-dialog__content", "consumer-panel")).toBe(
      "mrg-dialog__content consumer-panel",
    );
  });

  it("names the corrective action for missing and ambiguous anatomy", () => {
    expect(
      getDialogNamingDiagnostics({
        closeCount: 0,
        descriptionCount: 2,
        hasAriaLabel: false,
        hasAriaLabelledBy: false,
        titleCount: 0,
      }),
    ).toEqual([
      "Dialog.Content requires Dialog.Title, aria-label, or aria-labelledby. Add a visible Dialog.Title whenever possible.",
      "Dialog.Content found multiple Dialog.Description parts. Keep one description or provide an explicit aria-describedby relationship.",
      "Dialog.Content requires a visible Dialog.Close so every viewport and input modality has an explicit dismissal path.",
    ]);
  });

  it("accepts one title, one description, one close, and deliberate label alternatives", () => {
    expect(
      getDialogNamingDiagnostics({
        closeCount: 1,
        descriptionCount: 1,
        hasAriaLabel: false,
        hasAriaLabelledBy: false,
        titleCount: 1,
      }),
    ).toEqual([]);
    expect(
      getDialogNamingDiagnostics({
        closeCount: 1,
        descriptionCount: 0,
        hasAriaLabel: true,
        hasAriaLabelledBy: false,
        titleCount: 0,
      }),
    ).toEqual([]);
  });
});
