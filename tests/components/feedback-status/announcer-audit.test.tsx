import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ErrorState,
  type ErrorStateProps,
} from "../../../registry/source/components/error-state/error-state.tsx";
import {
  BusyRegion,
  Spinner,
  type BusyRegionProps,
  type SpinnerProps,
} from "../../../registry/source/components/spinner/spinner.tsx";
import { ScreenReaderAnnouncer } from "../../../registry/source/components/sr-announcer/sr-announcer.tsx";

const root = resolve(import.meta.dirname, "../../..");

function componentMarkup(markup: string, slot: string, closingTag: string): string {
  const start = markup.indexOf(`data-slot="${slot}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  const opening = markup.lastIndexOf("<", start);
  const end = markup.indexOf(closingTag, start);
  expect(end).toBeGreaterThan(start);
  return markup.slice(opening, end + closingTag.length);
}

describe("ErrorState shared-announcer contract", () => {
  it("keeps the visible recovery section and every action outside live roots", () => {
    const markup = renderToStaticMarkup(
      <ScreenReaderAnnouncer.Provider>
        <ErrorState
          actions={<a href="/support">Contact support</a>}
          announcement="Registry loading failed."
          description="Check the connection and try again."
          live="assertive"
          onRetry={() => undefined}
          recoverable
          technicalDetails="Request ID: public-example"
          title="Could not load the registry"
        />
      </ScreenReaderAnnouncer.Provider>,
    );
    const section = componentMarkup(markup, "error-state", "</section>");

    expect(section).toContain('aria-labelledby="mrg-error-state-');
    expect(section).toContain('aria-describedby="mrg-error-state-');
    expect(section).toContain('data-live="assertive"');
    expect(section).toContain('data-slot="error-state-retry"');
    expect(section).toContain('data-slot="error-state-actions"');
    expect(section).toContain('data-slot="error-state-details"');
    expect(section).not.toContain("aria-live");
    expect(section).not.toContain('role="alert"');
    expect(section).not.toContain('role="status"');

    const sectionEnd = markup.indexOf("</section>");
    expect(markup.indexOf('data-slot="sr-announcer-polite"')).toBeGreaterThan(sectionEnd);
    expect(markup.indexOf('data-slot="sr-announcer-assertive"')).toBeGreaterThan(sectionEnd);
  });

  it("rejects missing announcement policies, empty content, and semantic overrides at runtime", () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(ErrorState, {
          description: "Retry the import.",
          live: "polite",
          title: "Import failed",
        } as ErrorStateProps),
      ),
    ).toThrow("announcement");
    expect(() =>
      renderToStaticMarkup(
        createElement(ErrorState, {
          announcement: "Unexpected summary",
          description: "Retry the import.",
          title: "Import failed",
        } as unknown as ErrorStateProps),
      ),
    ).toThrow("requires polite or assertive");
    expect(() =>
      renderToStaticMarkup(
        createElement(ErrorState, {
          description: "Retry the import.",
          role: "alert",
          title: "Import failed",
        } as unknown as ErrorStateProps),
      ),
    ).toThrow("role");
    expect(() =>
      renderToStaticMarkup(<ErrorState description="Retry the import." title={true} />),
    ).toThrow("non-empty");
    expect(() =>
      renderToStaticMarkup(<ErrorState description={<></>} title="Import failed" />),
    ).toThrow("non-empty");
    expect(() =>
      renderToStaticMarkup(
        <ErrorState description="Retry the import." technicalDetails={[]} title="Import failed" />,
      ),
    ).toThrow("technicalDetails");
  });
});

describe("BusyRegion shared-announcer contract", () => {
  it("keeps provider live roots outside the named aria-busy subtree", () => {
    const markup = renderToStaticMarkup(
      <ScreenReaderAnnouncer.Provider>
        <BusyRegion announce busy label="Search results" busyMessage="Refreshing results">
          Results remain available while refreshing.
        </BusyRegion>
      </ScreenReaderAnnouncer.Provider>,
    );
    const region = componentMarkup(markup, "busy-region", "</div>");

    expect(region).toContain('role="region"');
    expect(region).toContain('aria-busy="true"');
    expect(region).toContain('aria-label="Search results"');
    expect(region).toContain('data-announcement="polite"');
    expect(region).not.toContain("aria-live");
    expect(region).not.toContain('role="status"');
    expect(region).not.toContain('role="alert"');

    const regionEnd = markup.indexOf("</div>");
    expect(markup.indexOf('data-slot="sr-announcer-polite"')).toBeGreaterThan(regionEnd);
    expect(markup.indexOf('data-slot="sr-announcer-assertive"')).toBeGreaterThan(regionEnd);
  });

  it("keeps quiet and completed regions free of local announcement output", () => {
    const quiet = renderToStaticMarkup(
      <BusyRegion busy label="Catalog results">
        <Spinner />
      </BusyRegion>,
    );
    const complete = renderToStaticMarkup(
      <BusyRegion announce busy={false} label="Catalog results">
        Results loaded.
      </BusyRegion>,
    );

    expect(quiet).toContain('data-announcement="off"');
    expect(quiet).not.toContain("aria-live");
    expect(quiet).not.toContain('role="status"');
    expect(complete).toContain('aria-busy="false"');
    expect(complete).not.toContain("aria-live");
    expect(complete).not.toContain('role="status"');
  });

  it("rejects runtime semantic overrides while allowing a message before a busy transition", () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(BusyRegion, {
          "aria-busy": false,
          busy: true,
          children: "Results",
          label: "Results",
        } as unknown as BusyRegionProps),
      ),
    ).toThrow("aria-busy");
    expect(
      renderToStaticMarkup(
        <BusyRegion announce={false} busyMessage="Refreshing" label="Results">
          Results
        </BusyRegion>,
      ),
    ).toContain('data-announcement="off"');
    expect(() =>
      renderToStaticMarkup(
        createElement(Spinner, {
          "aria-label": "Loading",
        } as unknown as SpinnerProps),
      ),
    ).toThrow("aria-label");
    expect(() =>
      renderToStaticMarkup(
        createElement(Spinner, {
          tabIndex: 0,
        } as unknown as SpinnerProps),
      ),
    ).toThrow("tabIndex");
  });

  it("declares the shared announcer as a source dependency for both components", () => {
    for (const itemId of ["error-state", "spinner"] as const) {
      const source = JSON.parse(
        readFileSync(
          resolve(root, `registry/source/components/${itemId}/${itemId}.source.json`),
          "utf8",
        ),
      ) as {
        readonly declaredImports: readonly string[];
        readonly itemDependencies: readonly string[];
      };
      expect(source.itemDependencies).toEqual(["provider", "sr-announcer"]);
      expect(source.declaredImports).toContain("../sr-announcer/index.js");
    }
  });
});
