import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dialog } from "../../../registry/source/components/dialog/index.js";

function dialogTree(defaultOpen = false) {
  return createElement(
    Dialog.Root,
    { defaultOpen },
    createElement(
      Dialog.Trigger,
      { "aria-label": "Open release review", className: "consumer-trigger", id: "review-trigger" },
      "Review",
    ),
    createElement(
      Dialog.Overlay,
      null,
      createElement(
        Dialog.Content,
        { dismissPolicy: "explicit" },
        createElement(Dialog.Title, null, "Release review"),
        createElement(Dialog.Description, null, "Review the pending release changes."),
        createElement(Dialog.Close, null, "Return"),
      ),
    ),
  );
}

describe("Dialog server rendering", () => {
  it("renders a semantic native trigger with stable public attributes", () => {
    const html = renderToStaticMarkup(dialogTree());

    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).toContain('id="review-trigger"');
    expect(html).toContain('aria-label="Open release review"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('data-slot="dialog-trigger"');
    expect(html).toContain('data-state="closed"');
    expect(html).toContain('class="mrg-dialog__trigger consumer-trigger"');
  });

  it("does not emit a server-side portal or document-global side effect", () => {
    const html = renderToStaticMarkup(dialogTree(true));

    expect(html).toContain('data-state="open"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain('data-slot="dialog-overlay"');
    expect(html).not.toContain('role="dialog"');
  });
});
