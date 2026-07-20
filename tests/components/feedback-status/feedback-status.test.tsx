import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  validateStoryStateMatrix,
  type StoryStateMatrix,
} from "../../../packages/test-utils/src/index.ts";
import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import { Alert } from "../../../registry/source/components/alert/alert.tsx";
import {
  assertNonInteractiveBadgeProps,
  Badge,
} from "../../../registry/source/components/badge/badge.tsx";
import {
  Banner,
  createBannerStoragePersistence,
} from "../../../registry/source/components/banner/banner.tsx";
import { Callout } from "../../../registry/source/components/callout/callout.tsx";
import { EmptyState } from "../../../registry/source/components/empty-state/empty-state.tsx";
import { ErrorState } from "../../../registry/source/components/error-state/error-state.tsx";
import { Meter } from "../../../registry/source/components/meter/meter.tsx";
import { Progress } from "../../../registry/source/components/progress/progress.tsx";
import { MergoraProvider } from "../../../registry/source/components/provider/provider.tsx";
import {
  resolveSkeletonSize,
  Skeleton,
} from "../../../registry/source/components/skeleton/skeleton.tsx";
import { BusyRegion, Spinner } from "../../../registry/source/components/spinner/spinner.tsx";
import { Status } from "../../../registry/source/components/status/status.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = [
  "alert",
  "callout",
  "banner",
  "badge",
  "status",
  "progress",
  "meter",
  "spinner",
  "skeleton",
  "empty-state",
  "error-state",
] as const;
const recordSuffixes = [
  "anatomy.json",
  "api.json",
  "contract.json",
  "metadata.json",
  "source.json",
  "status.json",
  "stories.json",
] as const;

function readItem(itemId: string, filename: string): string {
  return readFileSync(resolve(componentsRoot, itemId, filename), "utf8");
}

function readJson<T>(itemId: string, filename: string): T {
  return JSON.parse(readItem(itemId, filename)) as T;
}

type RecordedStoryState = StoryStateMatrix["states"][number] & {
  readonly story?: string;
};

describe("P2 feedback and status records", () => {
  it("ships the complete eleven-item canonical source batch", () => {
    for (const itemId of itemIds) {
      const files = new Set(readdirSync(resolve(componentsRoot, itemId)));
      for (const suffix of recordSuffixes) expect(files).toContain(`${itemId}.${suffix}`);
      expect(files).toContain(`${itemId}.tsx`);
      expect(files).toContain(`${itemId}.css`);
      expect(files).toContain(`${itemId}-css.d.ts`);
      expect(files).toContain("index.ts");
      expect(files).toContain("README.md");
    }
  });

  it("keeps every source descriptor at exactly five keys with explicit dependencies", () => {
    const expectedDependencies = {
      alert: ["provider", "sr-announcer"],
      badge: ["provider"],
      banner: ["provider"],
      callout: ["provider"],
      "empty-state": [],
      "error-state": ["provider", "sr-announcer"],
      meter: ["provider"],
      progress: ["provider"],
      skeleton: [],
      spinner: ["provider", "sr-announcer"],
      status: ["provider"],
    } satisfies Record<(typeof itemIds)[number], readonly string[]>;

    for (const itemId of itemIds) {
      const source = readJson<Record<string, unknown>>(itemId, `${itemId}.source.json`);
      expect(Object.keys(source).sort(), itemId).toEqual([
        "declaredImports",
        "entryPath",
        "id",
        "itemDependencies",
        "outputRole",
      ]);
      expect(source).toMatchObject({
        entryPath: `registry/source/components/${itemId}/${itemId}.tsx`,
        id: itemId,
        itemDependencies: expectedDependencies[itemId],
        outputRole: "component",
      });
    }
  });

  it("validates metadata and all sixteen required story states", () => {
    for (const itemId of itemIds) {
      const metadata = readJson<Record<string, unknown>>(itemId, `${itemId}.metadata.json`);
      const stories = readJson<StoryStateMatrix>(itemId, `${itemId}.stories.json`);
      expect(validateSchemaDocument("component-metadata", metadata), itemId).toMatchObject({
        errors: [],
        ok: true,
      });
      expect(validateStoryStateMatrix(stories), itemId).toMatchObject({ issues: [], ok: true });
      expect(stories.states).toHaveLength(16);
    }
  });

  it("binds every applicable state to a real export and exact variant or interaction lane", () => {
    const storySource = readFileSync(
      resolve(root, "apps/storybook/src/P2FeedbackStatus.stories.tsx"),
      "utf8",
    );
    const storyExports = new Set(
      [...storySource.matchAll(/export const ([A-Za-z][A-Za-z0-9]*): Story/gu)].map(
        (match) => match[1],
      ),
    );
    for (const itemId of itemIds) {
      const matrix = readJson<StoryStateMatrix>(itemId, `${itemId}.stories.json`);
      for (const state of matrix.states as readonly RecordedStoryState[]) {
        if (state.applicability.status !== "applicable") continue;
        expect(state.story, `${itemId}:${state.id}`).toBeTypeOf("string");
        expect(storyExports.has(state.story ?? ""), `${itemId}:${state.id}`).toBe(true);
      }
    }

    const exactMappings = {
      alert: {
        error: "FeedbackVariants",
        success: "FeedbackVariants",
        warning: "FeedbackVariants",
      },
      badge: {
        error: "FeedbackVariants",
        success: "FeedbackVariants",
        warning: "FeedbackVariants",
      },
      banner: {
        active: "BannerInteractions",
        error: "FeedbackVariants",
        "focus-visible": "BannerInteractions",
        hover: "BannerInteractions",
        success: "FeedbackVariants",
        warning: "FeedbackVariants",
      },
      callout: { warning: "FeedbackVariants" },
      "error-state": {
        active: "ErrorInteractions",
        error: "RecommendedMergora",
        "focus-visible": "ErrorInteractions",
        hover: "ErrorInteractions",
      },
      skeleton: { loading: "RecommendedMergora" },
      spinner: { loading: "RecommendedMergora" },
      status: {
        error: "FeedbackVariants",
        success: "FeedbackVariants",
        warning: "FeedbackVariants",
      },
    } as const;
    for (const [itemId, mappings] of Object.entries(exactMappings)) {
      const matrix = readJson<StoryStateMatrix>(itemId, `${itemId}.stories.json`);
      for (const [stateId, story] of Object.entries(mappings)) {
        expect(
          (matrix.states as readonly RecordedStoryState[]).find((state) => state.id === stateId)
            ?.story,
          `${itemId}:${stateId}`,
        ).toBe(story);
      }
    }
  });

  it("makes no Stable, distribution, conformance, or fabricated evidence claim", () => {
    for (const itemId of itemIds) {
      const records = recordSuffixes
        .map((suffix) => readItem(itemId, `${itemId}.${suffix}`))
        .join("\n");
      expect(records).not.toMatch(/"(?:maturity|publishedMaturity)"\s*:\s*"stable"/iu);
      expect(records).not.toMatch(/"recordedEvidence"\s*:\s*\[[^\]]+\]/u);
      expect(readJson<Record<string, unknown>>(itemId, `${itemId}.status.json`)).toMatchObject({
        distributionStatus: "not-generated",
        evidenceStatus: "incomplete",
        implementationStatus: "source-present-unreleased",
        recordedEvidence: [],
        releaseStatus: "unreleased",
      });
    }
  });

  it("uses declared semantic tokens, logical edges, and no literal colors", () => {
    const tokenCss = readFileSync(
      resolve(root, "packages/tokens/src/generated/tokens.css"),
      "utf8",
    );
    const tokenDeclarations = new Set(
      [...tokenCss.matchAll(/(--mrg-[a-z0-9-]+)\s*:/gu)].map((match) => match[1]),
    );
    for (const itemId of itemIds) {
      const css = readItem(itemId, `${itemId}.css`);
      const declaredTokens = new Set([
        ...tokenDeclarations,
        ...[...css.matchAll(/(--mrg-[a-z0-9-]+)\s*:/gu)].map((match) => match[1]),
        ...(itemId === "skeleton"
          ? ["--mrg-skeleton-block-size", "--mrg-skeleton-inline-size"]
          : []),
      ]);
      const tokenReferences = [...css.matchAll(/var\((--mrg-[a-z0-9-]+)/gu)].map(
        (match) => match[1],
      );
      for (const reference of tokenReferences) {
        expect(declaredTokens.has(reference), `${itemId}: ${reference}`).toBe(true);
      }
      expect(css).not.toMatch(/^\s*(?:margin|padding|inset|border)-(?:left|right)\s*:/mu);
      expect(css).not.toMatch(/#[0-9a-f]{3,8}|(?:oklch|rgb|hsl)\(/iu);
    }
  });

  it("uses the shared Mergora signature and exposes basic and enhanced Storybook modes", () => {
    const storySource = readFileSync(
      resolve(root, "apps/storybook/src/P2FeedbackStatus.stories.tsx"),
      "utf8",
    );
    expect(storySource).toContain("export const BasicDefaults");
    expect(storySource).toContain("export const RecommendedMergora");
    for (const control of [
      "animateSkeleton",
      "announceAlert",
      "announceBusyState",
      "landmarkCallout",
      "liveStatus",
      "persistBannerDismissal",
      "showBadgeSemantics",
      "showErrorDetails",
      "showMeterThresholds",
      "showProgressValue",
      "showRecoverySuggestions",
    ]) {
      expect(storySource).toContain(`${control}: { control: "boolean" }`);
    }

    for (const itemId of itemIds) {
      const css = readItem(itemId, `${itemId}.css`);
      expect(css, itemId).not.toMatch(/(?:linear|radial)-gradient|backdrop-filter/iu);
      expect(css, itemId).not.toMatch(/border-inline-(?:start|end)-width\s*:/iu);
    }
    for (const itemId of ["alert", "banner", "callout", "empty-state", "error-state"]) {
      expect(readItem(itemId, `${itemId}.css`), itemId).toContain(
        "var(--mrg-semantic-color-background-canvas)",
      );
    }
  });
});

describe("P2 static feedback and live-region policy", () => {
  it("keeps static alerts quiet and makes live behavior explicit", () => {
    const staticMarkup = renderToStaticMarkup(
      <Alert
        description="The artifact remains available."
        title="Registry notice"
        variant="info"
      />,
    );
    expect(staticMarkup).toContain('data-live="off"');
    expect(staticMarkup).not.toContain('role="alert"');
    expect(staticMarkup).not.toContain('role="status"');
    expect(staticMarkup).not.toContain("aria-live");
    expect(staticMarkup).toContain("Information");

    const politeMarkup = renderToStaticMarkup(
      <Alert
        announcement="Assistive draft-saved announcement."
        live="polite"
        title="Saved"
        variant="success"
      >
        The draft was saved.
      </Alert>,
    );
    expect(politeMarkup).toContain('data-live="polite"');
    expect(politeMarkup).not.toContain('role="status"');
    expect(politeMarkup).not.toContain("aria-live");
    expect(politeMarkup).not.toContain("Assistive draft-saved announcement.");

    const assertiveMarkup = renderToStaticMarkup(
      <Alert
        announcement="Assistive upload-failed announcement."
        live="assertive"
        title="Upload failed"
        variant="error"
      >
        Choose the file again.
      </Alert>,
    );
    expect(assertiveMarkup).toContain('data-live="assertive"');
    expect(assertiveMarkup).not.toContain('role="alert"');
    expect(assertiveMarkup).not.toContain("Assistive upload-failed announcement.");
    expect(assertiveMarkup).toContain("Error");
  });

  it("renders callouts as non-live content and adds a landmark only when named", () => {
    const plainMarkup = renderToStaticMarkup(
      <Callout title="Why this matters">Provenance keeps updates explainable.</Callout>,
    );
    expect(plainMarkup).toContain('<div class="mrg-callout"');
    expect(plainMarkup).not.toContain("aria-live");
    expect(plainMarkup).not.toContain('role="note"');

    const landmarkMarkup = renderToStaticMarkup(
      <Callout landmarkLabel="Security guidance" title="Verify the digest" variant="warning">
        Compare the immutable payload digest before installation.
      </Callout>,
    );
    expect(landmarkMarkup).toContain('<aside aria-label="Security guidance"');
    expect(landmarkMarkup).toContain("Warning");
  });

  it("localizes visible severity labels without changing static semantics", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider
        locale="de-DE"
        messages={{
          "alert.warning": "Warnung",
          "callout.tip": "Tipp",
          "status.success": "Erfolg",
        }}
      >
        <Alert description="Bitte prüfen." title="Hinweis" variant="warning" />
        <Callout title="Tastenkürzel" variant="tip">
          Verwenden Sie die Tabulatortaste.
        </Callout>
        <Status variant="success">Veröffentlicht</Status>
      </MergoraProvider>,
    );
    expect(markup).toContain("Warnung");
    expect(markup).toContain("Tipp");
    expect(markup).toContain("Erfolg");
    expect(markup).not.toContain('role="status"');
  });

  it("rejects incomplete feedback and empty accessible labels", () => {
    expect(() => renderToStaticMarkup(<Alert title=" ">Missing</Alert>)).toThrow("title");
    expect(() => renderToStaticMarkup(<Alert title="Only a title" />)).toThrow("description");
    expect(() => renderToStaticMarkup(<Callout title=" ">Body</Callout>)).toThrow("non-empty");
    expect(() =>
      renderToStaticMarkup(
        <Callout landmarkLabel=" " title="Title">
          Body
        </Callout>,
      ),
    ).toThrow("landmarkLabel");
    expect(() => renderToStaticMarkup(<Status> </Status>)).toThrow("non-empty");
  });
});

describe("P2 banner and badge behavior", () => {
  it("uses an injectable synchronous banner persistence adapter", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const persistence = createBannerStoragePersistence(storage, "test.banner.");
    expect(persistence.read("release")).toBeUndefined();
    persistence.write("release", true);
    expect(values.get("test.banner.release")).toBe("dismissed");
    expect(persistence.read("release")).toBe(true);
    persistence.write("release", false);
    expect(values.has("test.banner.release")).toBe(false);
    expect(persistence.read("release")).toBeUndefined();
    expect(() => createBannerStoragePersistence(storage, "")).toThrow("prefix");
  });

  it("renders a named non-live banner with controlled dismissal state", () => {
    const markup = renderToStaticMarkup(
      <Banner dismissed id="maintenance" title="Scheduled maintenance" variant="warning">
        Exports pause for five minutes.
      </Banner>,
    );
    expect(markup).toContain("<aside");
    expect(markup).toContain('data-dismissed="true"');
    expect(markup).toContain("hidden");
    expect(markup).toContain('data-slot="banner-dismiss"');
    expect(markup).toContain('aria-label="Dismiss message"');
    expect(markup).not.toContain("aria-live");
  });

  it("keeps every badge non-interactive and exposes category, status, and count distinctly", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider
        locale="ar-EG"
        messages={{
          "badge.count": "{label}: {count}",
          "badge.success": "ناجح",
        }}
      >
        <Badge>Beta</Badge>
        <Badge kind="status" variant="success">
          Published
        </Badge>
        <Badge count={1234} kind="count" label="Notifications" maximum={99} />
      </MergoraProvider>,
    );
    expect(markup).toContain('data-kind="category"');
    expect(markup).toContain('data-kind="status"');
    expect(markup).toContain("ناجح");
    expect(markup).toContain('data-kind="count"');
    expect(markup).toContain('data-overflow="true"');
    expect(markup).toContain("٩٩+");
    expect(markup).toContain("١٬٢٣٤");
    expect(markup).toContain('class="mrg-badge__sr-only"');
    expect(markup).not.toContain("aria-label");
    expect(markup).not.toContain("tabindex");
    expect(markup).not.toContain('role="button"');
    expect(() => assertNonInteractiveBadgeProps({ onClick: vi.fn() })).toThrow("onClick");
    expect(() => assertNonInteractiveBadgeProps({ href: "/interactive" })).toThrow("href");
  });

  it("rejects invalid banner identity and badge data", () => {
    expect(() =>
      renderToStaticMarkup(
        <Banner id=" " title="Title">
          Body
        </Banner>,
      ),
    ).toThrow("id");
    expect(() =>
      renderToStaticMarkup(<Badge count={-1} kind="count" label="Notifications" />),
    ).toThrow("non-negative");
    expect(() => renderToStaticMarkup(<Badge count={1} kind="count" label=" " />)).toThrow("label");
    expect(() => renderToStaticMarkup(<Badge> </Badge>)).toThrow("non-empty");
  });
});

describe("P2 progress, meter, and loading ownership", () => {
  it("uses native progress semantics for determinate and indeterminate work", () => {
    const determinate = renderToStaticMarkup(
      <MergoraProvider locale="de-DE">
        <Progress label="Upload" maximum={200} value={50} />
      </MergoraProvider>,
    );
    expect(determinate).toContain("<progress");
    expect(determinate).toContain('max="200"');
    expect(determinate).toContain('value="50"');
    const labelId = determinate.match(/id="(mrg-progress-[^"]+-label)"/u)?.[1];
    expect(labelId).toBeDefined();
    expect(determinate).toContain(`aria-labelledby="${labelId}"`);
    expect(determinate).toContain("25 %");

    const indeterminate = renderToStaticMarkup(<Progress label="Indexing" />);
    expect(indeterminate).toContain('data-indeterminate="true"');
    expect(indeterminate).toContain('aria-valuetext="In progress"');
    expect(indeterminate).not.toContain('value="');
  });

  it("uses a native meter and validates its full range model", () => {
    const markup = renderToStaticMarkup(
      <Meter high={80} label="Storage used" low={20} maximum={100} optimum={10} value={62} />,
    );
    expect(markup).toContain("<meter");
    expect(markup).toContain('low="20"');
    expect(markup).toContain('high="80"');
    expect(markup).toContain('optimum="10"');
    expect(markup).toContain('value="62"');
    expect(() => renderToStaticMarkup(<Meter label="Invalid" value={101} />)).toThrow("within");
    expect(() =>
      renderToStaticMarkup(<Meter high={20} label="Invalid" low={80} value={50} />),
    ).toThrow("low must not exceed high");
  });

  it("keeps the spinner decorative and gives busy semantics to a named region", () => {
    const visual = renderToStaticMarkup(<Spinner size="large" />);
    expect(visual).toContain('aria-hidden="true"');
    expect(visual).not.toContain('role="status"');
    expect(visual).not.toContain("aria-label");

    const quietRegion = renderToStaticMarkup(
      <BusyRegion label="Results" busy>
        <Spinner />
      </BusyRegion>,
    );
    expect(quietRegion).toContain('aria-busy="true"');
    expect(quietRegion).toContain('aria-label="Results"');
    expect(quietRegion).toContain('role="region"');
    expect(quietRegion).not.toContain('role="status"');

    const announcedRegion = renderToStaticMarkup(
      <BusyRegion announce busy labelledBy="results-heading" busyMessage="Refreshing results">
        Results
      </BusyRegion>,
    );
    expect(announcedRegion).toContain('aria-labelledby="results-heading"');
    expect(announcedRegion).toContain('data-announcement="polite"');
    expect(announcedRegion).not.toContain('role="status"');
    expect(announcedRegion).not.toContain("aria-live");
    expect(announcedRegion).not.toContain("Refreshing results");
  });

  it("renders skeletons as decorative geometry and validates dimensions", () => {
    const markup = renderToStaticMarkup(
      <Skeleton blockSize={24} inlineSize="min(100%, 30rem)" shape="rectangle" />,
    );
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("--mrg-skeleton-block-size:24px");
    expect(markup).toContain("--mrg-skeleton-inline-size:min(100%, 30rem)");
    expect(markup).not.toContain("aria-label");
    expect(resolveSkeletonSize(0, "width")).toBe("0px");
    expect(() => resolveSkeletonSize(-1, "width")).toThrow("non-negative");
    expect(() => resolveSkeletonSize(" ", "width")).toThrow("non-empty");
  });

  it("removes optional value, threshold, and motion enhancements without residual output", () => {
    const progressFormatter = vi.fn(() => "42 of 100");
    const plainProgress = renderToStaticMarkup(
      <Progress formatValue={progressFormatter} label="Processing" showValue={false} value={42} />,
    );
    expect(plainProgress).not.toContain('data-slot="progress-value"');
    expect(plainProgress).not.toContain("aria-valuetext");
    expect(progressFormatter).not.toHaveBeenCalled();
    expect(plainProgress).toContain('value="42"');

    const meterFormatter = vi.fn((candidate: number) => `${candidate} units`);
    const plainMeter = renderToStaticMarkup(
      <Meter
        formatValue={meterFormatter}
        high={85}
        label="Capacity"
        low={55}
        optimum={35}
        showThresholdSummary={false}
        value={68}
      />,
    );
    expect(plainMeter).not.toContain('data-slot="meter-thresholds"');
    expect(plainMeter).not.toContain("aria-describedby");
    expect(meterFormatter).toHaveBeenCalledTimes(1);

    const staticSkeleton = renderToStaticMarkup(<Skeleton animated={false} />);
    expect(staticSkeleton).not.toContain("data-animated");
    expect(staticSkeleton).toContain('aria-hidden="true"');
    expect(() =>
      renderToStaticMarkup(
        <Progress label="Processing" showValue={"yes" as unknown as boolean} value={42} />,
      ),
    ).toThrow("showValue");
    expect(() =>
      renderToStaticMarkup(
        <Meter label="Capacity" showThresholdSummary={"yes" as unknown as boolean} value={42} />,
      ),
    ).toThrow("showThresholdSummary");
    expect(() => renderToStaticMarkup(<Skeleton animated={"yes" as unknown as boolean} />)).toThrow(
      "animated",
    );
  });

  it("adds optional threshold context to the native meter without replacing its value model", () => {
    const markup = renderToStaticMarkup(
      <Meter high={85} label="Capacity" low={55} optimum={35} showThresholdSummary value={68} />,
    );
    const summaryId = markup.match(/id="(mrg-meter-[^"]+-thresholds)"/u)?.[1];
    expect(summaryId).toBeDefined();
    expect(markup).toContain(`aria-describedby="${summaryId}"`);
    expect(markup).toContain('data-slot="meter-thresholds"');
    expect(markup).toContain("Low");
    expect(markup).toContain("High");
    expect(markup).toContain("Optimum");
    expect(markup).toContain('value="68"');
  });

  it("does not resolve enhancement-only messages when related enhancements are disabled", () => {
    const optionalMessage = vi.fn(() => "Optional enhancement copy");
    renderToStaticMarkup(
      <MergoraProvider
        messages={{
          "badge.status": optionalMessage,
          "banner.dismiss": optionalMessage,
          "errorState.details": optionalMessage,
          "errorState.retry": optionalMessage,
          "meter.high": optionalMessage,
          "meter.low": optionalMessage,
          "meter.optimum": optionalMessage,
          "progress.indeterminate": optionalMessage,
          "spinner.busy": optionalMessage,
        }}
      >
        <Badge>Category</Badge>
        <Banner dismissible={false} id="quiet" title="Notice">
          Static content
        </Banner>
        <ErrorState description="Return later." title="Unavailable" />
        <Meter high={85} label="Capacity" low={55} optimum={35} value={68} />
        <Progress label="Processing" showValue={false} />
        <BusyRegion announce={false} busy label="Results">
          Results
        </BusyRegion>
      </MergoraProvider>,
    );
    expect(optionalMessage).not.toHaveBeenCalled();
  });

  it("rejects invalid progress, meter, and busy-region contracts", () => {
    expect(() => renderToStaticMarkup(<Progress label=" " />)).toThrow("label");
    expect(() => renderToStaticMarkup(<Progress label="Upload" maximum={0} />)).toThrow("maximum");
    expect(() => renderToStaticMarkup(<Progress label="Upload" value={101} />)).toThrow("within");
    expect(() => renderToStaticMarkup(<Meter label="Storage" maximum={0} value={0} />)).toThrow(
      "below maximum",
    );
    expect(() =>
      renderToStaticMarkup(
        <BusyRegion label=" " busy>
          Results
        </BusyRegion>,
      ),
    ).toThrow("non-empty");
  });
});

describe("P2 empty and error recovery states", () => {
  it("renders a named empty-state section with a required primary recovery path", () => {
    const markup = renderToStaticMarkup(
      <EmptyState
        context="search"
        description="Try a broader query."
        icon="?"
        primaryAction={<button type="button">Clear filters</button>}
        secondaryAction={<a href="/help">Search help</a>}
        title="No matching components"
      />,
    );
    expect(markup).toContain("<section");
    expect(markup).toContain('aria-labelledby="mrg-empty-state-');
    expect(markup).toContain('aria-describedby="mrg-empty-state-');
    expect(markup).toContain('data-context="search"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("Clear filters");
    expect(markup).toContain("Search help");
  });

  it("keeps errors quiet by default and exposes retry/details only when requested", () => {
    const retry = vi.fn();
    const recoverable = renderToStaticMarkup(
      <ErrorState
        description="Check the connection and retry."
        onRetry={retry}
        recoverable
        technicalDetails="Request ID: safe-public-id"
        title="Could not load the registry"
      />,
    );
    expect(recoverable).toContain('data-recoverable="true"');
    expect(recoverable).toContain('data-slot="error-state-retry"');
    expect(recoverable).toContain("Try again");
    expect(recoverable).toContain("<details");
    expect(recoverable).toContain("Technical details");
    expect(recoverable).not.toContain('role="alert"');

    const assertive = renderToStaticMarkup(
      <ErrorState
        announcement="Import failed. Stop and review the file."
        description="Stop and review the file."
        live="assertive"
        title="Import failed"
      />,
    );
    expect(assertive).toContain('data-live="assertive"');
    expect(assertive).not.toContain('role="alert"');
    expect(assertive).not.toContain("aria-live");
    expect(assertive).not.toContain('data-slot="error-state-retry"');
  });

  it("localizes recovery labels and rejects incomplete recovery contracts", () => {
    const markup = renderToStaticMarkup(
      <MergoraProvider
        locale="de-DE"
        messages={{
          "errorState.details": "Technische Details",
          "errorState.label": "Fehler",
          "errorState.retry": "Erneut versuchen",
        }}
      >
        <ErrorState
          description="Verbindung prüfen."
          onRetry={() => undefined}
          recoverable
          technicalDetails="Öffentliche Fehlerkennung"
          title="Laden fehlgeschlagen"
        />
      </MergoraProvider>,
    );
    expect(markup).toContain("Fehler");
    expect(markup).toContain("Erneut versuchen");
    expect(markup).toContain("Technische Details");
    expect(() =>
      renderToStaticMarkup(
        <EmptyState
          description="Description"
          primaryAction={null as unknown as ReactElement}
          title="Empty"
        />,
      ),
    ).toThrow("primary recovery");
    expect(() => renderToStaticMarkup(<ErrorState description=" " title="Error" />)).toThrow(
      "description",
    );
  });
});
