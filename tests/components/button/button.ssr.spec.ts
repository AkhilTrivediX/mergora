import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { Button } from "../../../registry/source/components/button/button.tsx";

describe("Button server rendering", () => {
  it("renders native semantics, safe type, selectors, native props, and consumer classes", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Button,
        {
          className: "consumer-action",
          form: "profile-form",
          name: "intent",
          size: "small",
          value: "save",
          variant: "secondary",
        },
        "Save profile",
      ),
    );

    expect(markup).toContain("<button");
    expect(markup).toContain('type="button"');
    expect(markup).toContain('class="mrg-button consumer-action"');
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain('data-variant="secondary"');
    expect(markup).toContain('data-size="small"');
    expect(markup).toContain('form="profile-form"');
    expect(markup).toContain('name="intent"');
    expect(markup).toContain('value="save"');
    expect(markup).toContain("Save profile");
  });

  it("keeps pending buttons focusable and exposes a visible pending label", () => {
    const markup = renderToStaticMarkup(
      createElement(Button, { pending: true, pendingLabel: "Saving profile" }, "Save profile"),
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain('data-pending="true"');
    expect(markup).toContain('data-slot="button-pending-indicator"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("Saving profile");
    expect(markup).not.toContain(" disabled");
  });

  it("uses the original visible label when no pendingLabel is supplied", () => {
    const markup = renderToStaticMarkup(createElement(Button, { pending: true }, "Saving"));

    expect(markup).toContain("Saving");
    expect(markup).toContain('aria-busy="true"');
  });

  it("keeps a visible pending label in the accessible name", () => {
    const labelledMarkup = renderToStaticMarkup(
      createElement(
        Button,
        { "aria-label": "Add row", pending: true, pendingLabel: "Adding row" },
        createElement("svg", { "aria-hidden": "true" }),
      ),
    );
    const referencedMarkup = renderToStaticMarkup(
      createElement(
        Button,
        {
          "aria-labelledby": "add-row-label",
          pending: true,
          pendingLabel: "Adding row",
        },
        createElement("svg", { "aria-hidden": "true" }),
      ),
    );

    expect(labelledMarkup).toContain('aria-label="Adding row"');
    expect(labelledMarkup).toContain("Adding row");
    expect(referencedMarkup).not.toContain("aria-labelledby");
    expect(referencedMarkup).toContain("Adding row");
  });

  it("preserves native disabled behavior separately from pending", () => {
    const markup = renderToStaticMarkup(createElement(Button, { disabled: true }, "Unavailable"));

    expect(markup).toContain('data-disabled="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain('data-pending="true"');
    expect(markup).not.toContain('aria-busy="true"');
  });
});
