import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  assertNonInteractiveBadgeProps,
  Badge,
  type BadgeProps,
} from "../../../registry/source/components/badge/badge.tsx";
import { EmptyState } from "../../../registry/source/components/empty-state/empty-state.tsx";
import { Meter } from "../../../registry/source/components/meter/meter.tsx";
import { Progress } from "../../../registry/source/components/progress/progress.tsx";
import { MergoraProvider } from "../../../registry/source/components/provider/provider.tsx";

const ownedValueAndNameProps = [
  "aria-label",
  "aria-labelledby",
  "aria-valuemax",
  "aria-valuemin",
  "aria-valuenow",
  "aria-valuetext",
  "role",
] as const;

function runtimeElement(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

describe("Badge static-contract hardening", () => {
  it("rejects every event-handler shape and every noninteractive boundary override", () => {
    for (const key of [
      "onAnimationEnd",
      "onBeforeInputCapture",
      "onBlur",
      "onClick",
      "onCopy",
      "onDragStart",
      "onFocus",
      "onKeyDown",
      "onPointerDownCapture",
      "onTransitionRun",
    ]) {
      expect(() => assertNonInteractiveBadgeProps({ [key]: () => undefined }), key).toThrow(key);
    }

    const blocked = {
      accessKey: "b",
      "aria-label": "Override",
      "aria-labelledby": "other-label",
      contentEditable: true,
      dangerouslySetInnerHTML: { __html: "unsafe" },
      draggable: true,
      href: "/details",
      role: "button",
      tabIndex: 0,
    } as const;
    for (const [key, value] of Object.entries(blocked)) {
      expect(() => assertNonInteractiveBadgeProps({ [key]: value }), key).toThrow(key);
      expect(() =>
        runtimeElement(
          createElement(Badge, { [key]: value, children: "Beta" } as unknown as BadgeProps),
        ),
      ).toThrow(key);
    }
  });

  it("localizes status punctuation and order through badge.status", () => {
    const markup = runtimeElement(
      <MergoraProvider
        messages={{
          "badge.status": ({ values }) => `${String(values.label)} — ${String(values.variant)}`,
          "badge.success": "Erfolg",
        }}
      >
        <Badge kind="status" variant="success">
          Veröffentlicht
        </Badge>
      </MergoraProvider>,
    );
    const labelPosition = markup.indexOf("Veröffentlicht");
    const punctuationPosition = markup.indexOf(" — ");
    const severityPosition = markup.indexOf("Erfolg");
    expect(labelPosition).toBeGreaterThan(-1);
    expect(punctuationPosition).toBeGreaterThan(labelPosition);
    expect(severityPosition).toBeGreaterThan(punctuationPosition);
    expect(markup).not.toContain("Erfolg:");
  });

  it("keeps exact count text accessible while applying the cap only visually", () => {
    const markup = runtimeElement(
      <Badge count={1234} kind="count" label="Notifications" maximum={99} />,
    );
    expect(markup).toContain("Notifications: 1,234");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("99+");
    expect(markup).not.toContain("Notifications: 99+");
  });

  it("allows badge labels to wrap without clipping or ellipsis", () => {
    const css = readFileSync(
      resolve(import.meta.dirname, "../../../registry/source/components/badge/badge.css"),
      "utf8",
    );
    const labelRule = css.match(/\[data-slot="badge-label"\]\s*\{(?<body>[^}]+)\}/u)?.groups?.body;
    expect(labelRule).toContain("overflow-wrap: anywhere");
    expect(labelRule).toContain("white-space: normal");
    expect(labelRule).not.toContain("text-overflow");
    expect(labelRule).not.toContain("overflow: hidden");
  });
});

describe("EmptyState recovery and content boundaries", () => {
  const validProps = {
    description: "Try a broader query.",
    title: "No results",
  } as const;

  it("accepts enabled native recovery actions and action components", () => {
    function CustomAction() {
      return <button type="button">Create component</button>;
    }
    const fixtures = [
      <button key="button" type="button">
        Reset
      </button>,
      <a href="/help" key="anchor">
        Help
      </a>,
      <input key="submit" type="submit" value="Search again" />,
      <CustomAction key="custom" />,
    ];
    for (const primaryAction of fixtures) {
      expect(() =>
        runtimeElement(<EmptyState {...validProps} primaryAction={primaryAction} />),
      ).not.toThrow();
    }
  });

  it("rejects text, null, fragments, disabled actions, and non-action native elements", () => {
    const invalidActions: unknown[] = [
      "Retry",
      null,
      <></>,
      <>
        <button type="button">One</button>
      </>,
      <button disabled type="button">
        Retry
      </button>,
      <button aria-disabled="true" type="button">
        Retry
      </button>,
      <a>Missing href</a>,
      <a href=" ">Empty href</a>,
      <input type="text" />,
      <div>Not an action</div>,
    ];
    for (const primaryAction of invalidActions) {
      expect(() =>
        runtimeElement(
          <EmptyState {...validProps} primaryAction={primaryAction as ReactElement} />,
        ),
      ).toThrow();
    }

    expect(() =>
      runtimeElement(
        <EmptyState
          {...validProps}
          primaryAction={<button type="button">Reset</button>}
          secondaryAction={null as unknown as ReactElement}
        />,
      ),
    ).toThrow("secondaryAction");
  });

  it("rejects non-rendering title, description, and supplied body content", () => {
    const primaryAction = <button type="button">Reset</button>;
    const emptyValues = [true, [], [null, false, " "], <></>, <>{[]}</>] as const;
    for (const title of emptyValues) {
      expect(() =>
        runtimeElement(
          <EmptyState description="Description" primaryAction={primaryAction} title={title} />,
        ),
      ).toThrow("title and description");
    }
    for (const description of emptyValues) {
      expect(() =>
        runtimeElement(
          <EmptyState description={description} primaryAction={primaryAction} title="Title" />,
        ),
      ).toThrow("title and description");
    }
    for (const children of emptyValues) {
      expect(() =>
        runtimeElement(
          <EmptyState description="Description" primaryAction={primaryAction} title="Title">
            {children}
          </EmptyState>,
        ),
      ).toThrow("body");
    }
  });
});

describe("Progress and Meter native semantic ownership", () => {
  it("runtime-rejects role, accessible-name, and aria value overrides", () => {
    for (const key of ownedValueAndNameProps) {
      const value = key === "role" ? "presentation" : key === "aria-valuenow" ? 80 : "override";
      expect(() =>
        runtimeElement(createElement(Progress, { [key]: value, label: "Upload", value: 20 })),
      ).toThrow(key);
      expect(() =>
        runtimeElement(createElement(Meter, { [key]: value, label: "Storage", value: 20 })),
      ).toThrow(key);
    }
  });

  it("rejects boolean, empty-array, and empty-fragment labels", () => {
    const emptyLabels = [true, [], [false, null, " "], <></>, <>{[]}</>] as const;
    for (const label of emptyLabels) {
      expect(() => runtimeElement(<Progress label={label} value={20} />)).toThrow("label");
      expect(() => runtimeElement(<Meter label={label} value={20} />)).toThrow("label");
    }
  });

  it("preserves implicit visible labels and component-owned native values", () => {
    const progress = runtimeElement(<Progress label="Upload" maximum={200} value={50} />);
    expect(progress).toContain("<label");
    expect(progress).toContain("<progress");
    expect(progress).toContain('max="200"');
    expect(progress).toContain('value="50"');
    expect(progress).not.toContain("aria-label=");
    expect(progress).not.toContain("aria-labelledby=");

    const meter = runtimeElement(
      <Meter high={80} label="Storage" low={20} maximum={100} optimum={10} value={62} />,
    );
    expect(meter).toContain("<label");
    expect(meter).toContain("<meter");
    expect(meter).toContain('min="0"');
    expect(meter).toContain('max="100"');
    expect(meter).toContain('value="62"');
    expect(meter).not.toContain("aria-label=");
    expect(meter).not.toContain("aria-labelledby=");
  });
});
