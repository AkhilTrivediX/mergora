import { describe, expect, it, vi } from "vitest";

import {
  inspectButtonAccessibleName,
  MISSING_BUTTON_NAME_DIAGNOSTIC,
  reportButtonNameDiagnostic,
  runButtonActivation,
} from "../../../registry/source/components/button/button-state.ts";

function activationEvent() {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

describe("Button activation state", () => {
  it("cancels pending activation before a consumer callback can run", () => {
    const event = activationEvent();
    const handler = vi.fn();

    expect(runButtonActivation(true, event, handler)).toBe("prevented-pending");
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it("composes the native click with the consumer callback when not pending", () => {
    const event = activationEvent();
    const handler = vi.fn();

    expect(runButtonActivation(false, event, handler)).toBe("invoked");
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});

describe("Button accessible-name guard", () => {
  it("recognizes explicit and visible name sources", () => {
    expect(inspectButtonAccessibleName({ ariaLabel: "Add row" })).toEqual({
      source: "aria-label",
      status: "present",
    });
    expect(inspectButtonAccessibleName({ ariaLabelledBy: "add-row-label" })).toEqual({
      source: "aria-labelledby",
      status: "present",
    });
    expect(inspectButtonAccessibleName({ children: [null, "Save changes"] })).toEqual({
      source: "descendant-text",
      status: "present",
    });
    expect(
      inspectButtonAccessibleName({
        children: { props: { alt: "Open profile" }, type: "img" },
      }),
    ).toEqual({ source: "image-alt", status: "present" });
  });

  it("reports inspectably icon-only content as missing", () => {
    expect(
      inspectButtonAccessibleName({
        children: {
          props: { "aria-hidden": "true", children: { props: {}, type: "path" } },
          type: "svg",
        },
      }),
    ).toEqual({ status: "missing" });
  });

  it("does not fabricate a verdict for an opaque custom child", () => {
    expect(
      inspectButtonAccessibleName({
        children: { props: {}, type: function CustomChild() {} },
      }),
    ).toEqual({ status: "indeterminate" });
    expect(inspectButtonAccessibleName({ title: "Fallback action" })).toEqual({
      status: "indeterminate",
    });
    expect(
      inspectButtonAccessibleName({
        children: { props: { children: { props: {}, type: "path" } }, type: "svg" },
      }),
    ).toEqual({ status: "indeterminate" });
  });

  it("emits one actionable development diagnostic for a proven missing name", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    reportButtonNameDiagnostic({ status: "missing" });
    reportButtonNameDiagnostic({ status: "missing" });

    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(MISSING_BUTTON_NAME_DIAGNOSTIC);
    error.mockRestore();
  });
});
