import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  Banner,
  createBannerStoragePersistence,
  type BannerPersistenceAdapter,
  type BannerProps,
} from "../../../registry/source/components/banner/banner.tsx";

const bannerRoot = resolve(import.meta.dirname, "../../../registry/source/components/banner");

function renderInvalidProps(props: Readonly<Record<string, unknown>>): () => string {
  return () =>
    renderToStaticMarkup(
      createElement(Banner, {
        children: "Body",
        id: "audit",
        title: "Audit notice",
        ...props,
      } as unknown as BannerProps),
    );
}

describe("Banner controlled and persistence boundaries", () => {
  it("keeps controlled state exclusive and free of persistence work", () => {
    const onDismissedChange = vi.fn();
    const markup = renderToStaticMarkup(
      <Banner dismissed id="controlled" onDismissedChange={onDismissedChange} title="Notice">
        Controlled body
      </Banner>,
    );

    expect(markup).toContain('data-dismissed="true"');
    expect(markup).toContain("hidden");
    expect(markup).not.toContain("data-persistence-pending");
    expect(onDismissedChange).not.toHaveBeenCalled();

    const persistence: BannerPersistenceAdapter = {
      read: vi.fn(() => true),
      write: vi.fn(),
    };
    expect(renderInvalidProps({ dismissed: false, persistence })).toThrow("controlled dismissal");
    expect(renderInvalidProps({ defaultDismissed: true, dismissed: false })).toThrow(
      "controlled dismissal",
    );
    expect(persistence.read).not.toHaveBeenCalled();
    expect(persistence.write).not.toHaveBeenCalled();
  });

  it("emits deterministic pending SSR markup without reading a client adapter", () => {
    const persistence: BannerPersistenceAdapter = {
      read: vi.fn(() => true),
      write: vi.fn(),
    };

    const visibleDefault = renderToStaticMarkup(
      <Banner id="persisted" persistence={persistence} title="Persisted notice">
        This resolves during hydration.
      </Banner>,
    );
    const hiddenDefault = renderToStaticMarkup(
      <Banner defaultDismissed id="persisted-hidden" persistence={persistence} title="Hidden">
        This starts hidden deterministically.
      </Banner>,
    );

    expect(visibleDefault).toContain('data-persistence-pending="true"');
    expect(visibleDefault).not.toContain(" hidden");
    expect(hiddenDefault).toContain('data-persistence-pending="true"');
    expect(hiddenDefault).toContain(" hidden");
    expect(persistence.read).not.toHaveBeenCalled();
    expect(persistence.write).not.toHaveBeenCalled();

    const css = readFileSync(resolve(bannerRoot, "banner.css"), "utf8");
    expect(css).toMatch(/\[data-persistence-pending="true"\]\s*\{[^}]*visibility:\s*hidden/iu);
    expect(css).toMatch(/@media\s*\(scripting:\s*none\)/u);
  });

  it("contains storage adapter throws at the component boundary and preserves the original error", () => {
    const readError = new Error("storage read unavailable");
    const writeError = new Error("storage write unavailable");
    const storage = {
      getItem: vi.fn(() => {
        throw readError;
      }),
      removeItem: vi.fn(() => {
        throw writeError;
      }),
      setItem: vi.fn(() => {
        throw writeError;
      }),
    };
    const persistence = createBannerStoragePersistence(storage, "audit.banner.");

    expect(() => persistence.read("read")).toThrow(readError);
    expect(() => persistence.write("write", true)).toThrow(writeError);
    expect(() => persistence.write("write", false)).toThrow(writeError);
    expect(() => createBannerStoragePersistence(storage, "   ")).toThrow("prefix");

    const source = readFileSync(resolve(bannerRoot, "banner.tsx"), "utf8");
    expect(source).toContain("reportPersistenceError(error)");
    expect(source).toContain("persistence.write(id, nextDismissed)");
  });
});

describe("Banner content, semantics, and intrinsic layout", () => {
  it("rejects booleans, empty arrays, and empty fragments as required content", () => {
    expect(() =>
      renderToStaticMarkup(
        <Banner id="boolean-title" title={true}>
          Body
        </Banner>,
      ),
    ).toThrow("non-empty title and content");
    expect(() =>
      renderToStaticMarkup(
        <Banner id="empty-body" title="Title">
          {[]}
        </Banner>,
      ),
    ).toThrow("non-empty title and content");
    expect(() =>
      renderToStaticMarkup(
        <Banner id="empty-fragment" title={<Fragment />}>
          Body
        </Banner>,
      ),
    ).toThrow("non-empty title and content");
    expect(() =>
      renderToStaticMarkup(
        <Banner actions={false} id="boolean-actions" title="Title">
          Body
        </Banner>,
      ),
    ).toThrow("actions");
  });

  it("rejects owned semantic overrides while preserving safe native attributes", () => {
    for (const props of [
      { "aria-hidden": true },
      { "aria-label": "Replacement" },
      { "aria-labelledby": "replacement-id" },
      { "aria-live": "assertive" },
      { hidden: true },
      { role: "alert" },
    ]) {
      expect(renderInvalidProps(props)).toThrow("semantic override");
    }

    const markup = renderToStaticMarkup(
      <Banner
        aria-describedby="external-description"
        className="consumer-class"
        data-consumer="preserved"
        id="safe-native"
        tabIndex={-1}
        title="Safe native props"
      >
        Body
      </Banner>,
    );
    expect(markup).toContain('aria-describedby="external-description"');
    expect(markup).toContain('class="mrg-banner consumer-class"');
    expect(markup).toContain('data-consumer="preserved"');
    expect(markup).toContain('tabindex="-1"');
  });

  it("uses a documented inner layout part and a container-relative narrow query", () => {
    const markup = renderToStaticMarkup(
      <Banner actions={<a href="/status">View status</a>} id="container" title="Maintenance">
        Long localized banner content can wrap inside a narrow embedded region.
      </Banner>,
    );
    expect(markup).toContain('data-slot="banner-layout"');
    expect(markup).toContain('data-slot="banner-actions"');

    const css = readFileSync(resolve(bannerRoot, "banner.css"), "utf8");
    expect(css).toContain("container-type: inline-size");
    expect(css).toContain("container-name: mrg-banner");
    expect(css).toMatch(/@container\s+mrg-banner\s*\(inline-size\s*<\s*32rem\)/u);
    expect(css).toMatch(/\[data-slot="banner-dismiss"\]:hover/u);
    expect(css).toMatch(/\[data-slot="banner-dismiss"\]:active/u);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/u);

    const anatomy = JSON.parse(
      readFileSync(resolve(bannerRoot, "banner.anatomy.json"), "utf8"),
    ) as {
      readonly parts: readonly { readonly slot: string }[];
      readonly root: { readonly stableAttributes: readonly string[] };
    };
    expect(anatomy.parts.some((part) => part.slot === "banner-layout")).toBe(true);
    expect(anatomy.root.stableAttributes).toContain("data-persistence-pending");

    const stories = JSON.parse(
      readFileSync(resolve(bannerRoot, "banner.stories.json"), "utf8"),
    ) as {
      readonly states: readonly {
        readonly id: string;
        readonly story?: string;
      }[];
    };
    const storyByState = new Map(stories.states.map((state) => [state.id, state.story]));
    for (const state of ["hover", "active", "focus-visible"]) {
      expect(storyByState.get(state)).toBe("BannerInteractions");
    }
    for (const state of ["success", "warning", "error"]) {
      expect(storyByState.get(state)).toBe("FeedbackVariants");
    }
  });
});
