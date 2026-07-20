import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ClientOnly } from "../../registry/source/components/client-only/index.ts";
import {
  Direction,
  resolveLogicalSide,
  useDirection,
} from "../../registry/source/components/direction/index.ts";
import { FocusRing } from "../../registry/source/components/focus-ring/index.ts";
import {
  LayerManager,
  useLayerManager,
  type LayerManagerApi,
} from "../../registry/source/components/layer-manager/index.ts";
import { Portal } from "../../registry/source/components/portal/index.ts";
import {
  MergoraProvider,
  resolveMergoraMessage,
  useMergoraContext,
} from "../../registry/source/components/provider/index.ts";
import { Presence } from "../../registry/source/components/presence/index.ts";
import { Slot } from "../../registry/source/components/slot/index.ts";
import {
  ScreenReaderAnnouncer,
  useAnnouncer,
  type AnnouncerApi,
} from "../../registry/source/components/sr-announcer/index.ts";
import {
  VisuallyHidden,
  type VisuallyHiddenProps,
} from "../../registry/source/components/visually-hidden/index.ts";

const validHiddenLink: VisuallyHiddenProps = { as: "a", href: "#content" };
// @ts-expect-error href is invalid when the selected native element is a span.
const invalidHiddenSpan: VisuallyHiddenProps = { as: "span", href: "#content" };
void validHiddenLink;
void invalidHiddenSpan;

function ContextProbe(): ReactElement {
  const context = useMergoraContext();
  const direction = useDirection();
  return (
    <output data-slot="context-probe">
      {[
        context.locale,
        direction,
        context.timeZone,
        context.density,
        context.getMessage("save", "Save"),
        context.getMessage("cancel", "Cancel"),
      ].join("|")}
    </output>
  );
}

function ManagerProbe({ onRead }: { readonly onRead: (manager: LayerManagerApi) => void }): null {
  onRead(useLayerManager());
  return null;
}

function AnnouncerProbe({ onRead }: { readonly onRead: (announcer: AnnouncerApi) => void }): null {
  onRead(useAnnouncer());
  return null;
}

function MessageProbe(): ReactElement {
  const context = useMergoraContext();
  return (
    <output>
      {context.getMessage("files.count", "{count} files", { count: 2 })}|
      {context.getMessage(
        "keys.list",
        ({ values }) => (Array.isArray(values.keys) ? values.keys.join(" plus ") : ""),
        { keys: ["Control", "K"] },
      )}
    </output>
  );
}

describe("P2 context and infrastructure server rendering", () => {
  it("composes nested provider overrides without losing parent messages", () => {
    const html = renderToStaticMarkup(
      <MergoraProvider
        locale="de-DE"
        messages={{ cancel: "Abbrechen", save: "Speichern" }}
        timeZone="Europe/Berlin"
      >
        <MergoraProvider direction="rtl" density="compact" messages={{ save: "حفظ" }}>
          <ContextProbe />
        </MergoraProvider>
      </MergoraProvider>,
    );

    expect(html).toContain('lang="de-DE"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('data-density="compact"');
    expect(html).toContain("de-DE|rtl|Europe/Berlin|compact|حفظ|Abbrechen");
  });

  it("formats stable keyed messages with named values, arrays, locale, and fallbacks", () => {
    const html = renderToStaticMarkup(
      <MergoraProvider
        locale="de-DE"
        messages={{
          "files.count": ({ locale, values }) =>
            `${new Intl.NumberFormat(locale).format(Number(values.count))} Dateien`,
          "keys.list": ({ values }) =>
            Array.isArray(values.keys) ? values.keys.join(" und ") : "",
        }}
      >
        <MessageProbe />
      </MergoraProvider>,
    );

    expect(html).toContain("2 Dateien|Control und K");
    expect(resolveMergoraMessage("Open {name}", "en-US", { name: "settings" })).toBe(
      "Open settings",
    );
    expect(resolveMergoraMessage("Keep {unknown}", "en-US")).toBe("Keep {unknown}");
  });

  it("keeps provider context attributes authoritative in asChild composition", () => {
    const html = renderToStaticMarkup(
      <MergoraProvider asChild locale="ar-EG" direction="rtl" density="compact">
        <section lang="en-US" dir="ltr" data-density="touch">
          Context boundary
        </section>
      </MergoraProvider>,
    );

    expect(html).toContain('data-slot="provider"');
    expect(html).toContain('lang="ar-EG"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('data-density="compact"');
    expect(html).not.toContain('data-density="touch"');
  });

  it("pairs native direction with context and maps logical sides", () => {
    const isolated = renderToStaticMarkup(
      <Direction.Boundary direction="rtl" isolate>
        <ContextProbe />
      </Direction.Boundary>,
    );
    const plain = renderToStaticMarkup(
      <Direction.Boundary direction="rtl">
        <ContextProbe />
      </Direction.Boundary>,
    );

    expect(isolated).toContain('data-slot="direction-boundary"');
    expect(isolated).toContain('dir="rtl"');
    expect(isolated).toContain('data-bidi-isolate="true"');
    expect(plain).not.toContain("data-bidi-isolate");
    expect(resolveLogicalSide("start", "ltr")).toBe("left");
    expect(resolveLogicalSide("start", "rtl")).toBe("right");
    expect(resolveLogicalSide("end", "rtl")).toBe("left");
  });

  it("preserves child slots in FocusRing and honors an explicit Slot contract", () => {
    const focused = renderToStaticMarkup(
      <FocusRing contrast="strong" className="outer">
        <button
          type="button"
          data-slot="button"
          data-focus-ring="false"
          className="inner"
          aria-label="Save draft"
        />
      </FocusRing>,
    );
    const composed = renderToStaticMarkup(
      <Slot data-slot="toolbar-action" aria-label="Slot label">
        <button type="button" data-slot="button" aria-label="Child label" />
      </Slot>,
    );

    expect(focused).toContain('data-slot="button"');
    expect(focused).toContain('data-focus-ring="true"');
    expect(focused).not.toContain('data-focus-ring="false"');
    expect(focused).toContain('class="outer inner"');
    expect(composed).toContain('data-slot="toolbar-action"');
    expect(composed).toContain('aria-label="Child label"');
    expect(composed).not.toContain("Slot label");
  });

  it("keeps visually hidden text nameable and renders a focus-reveal anchor", () => {
    const html = renderToStaticMarkup(
      <>
        <button type="button">
          <span aria-hidden="true">↑</span>
          <VisuallyHidden>Upload invoice</VisuallyHidden>
        </button>
        <VisuallyHidden as="a" href="#content" revealOnFocus>
          Skip to content
        </VisuallyHidden>
      </>,
    );

    expect(html).toContain("Upload invoice");
    expect(html).toContain('href="#content"');
    expect(html).toContain('data-reveal-on-focus="true"');
    expect(html).not.toContain('aria-hidden="true">Upload');
    expect(renderToStaticMarkup(<VisuallyHidden>Plain context</VisuallyHidden>)).not.toContain(
      "data-reveal-on-focus",
    );
  });

  it("uses deterministic fallback markup for Portal and ClientOnly", () => {
    const onClientReady = vi.fn();
    const tree = (
      <MergoraProvider locale="ar-EG" direction="rtl" density="touch">
        <ul>
          <ClientOnly fallback={<li>Server fallback</li>} onClientReady={onClientReady}>
            <li>Client content</li>
          </ClientOnly>
        </ul>
        <Portal fallback={<p role="status">Portal fallback</p>}>
          <aside>Portaled content</aside>
        </Portal>
      </MergoraProvider>
    );
    const server = renderToString(tree);
    const firstHydrationRender = renderToString(tree);

    expect(firstHydrationRender).toBe(server);
    expect(server).toContain("<ul><li>Server fallback</li></ul>");
    expect(server).toContain("Portal fallback");
    expect(server).not.toContain("Client content");
    expect(server).not.toContain("Portaled content");
    expect(server).not.toMatch(/<span[^>]*>\s*<li>/u);
    expect(onClientReady).not.toHaveBeenCalled();
    expect(
      renderToStaticMarkup(
        <Portal>
          <aside>Deferred without fallback</aside>
        </Portal>,
      ),
    ).toBe("");
  });

  it("renders disabled portals inline with inherited native context", () => {
    const html = renderToStaticMarkup(
      <MergoraProvider locale="he-IL" direction="rtl" density="compact">
        <Portal disabled>
          <aside>Inline portal</aside>
        </Portal>
      </MergoraProvider>,
    );

    expect(html).toContain('data-slot="portal-context"');
    expect(html).toContain('lang="he-IL"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('data-density="compact"');
    expect(html).toContain("Inline portal");
  });

  it("starts present content visible and leaves absent content unmounted on the server", () => {
    const present = renderToStaticMarkup(
      <Presence present>
        {({ state }) => <section data-render-state={state}>Details</section>}
      </Presence>,
    );
    const absent = renderToStaticMarkup(
      <Presence present={false}>
        <section>Details</section>
      </Presence>,
    );

    expect(present).toContain('data-presence="entered"');
    expect(present).toContain('data-render-state="entered"');
    expect(absent).toBe("");
  });

  it("emits separate empty live regions and neutral layer anatomy during SSR", () => {
    const announcements = renderToStaticMarkup(
      <ScreenReaderAnnouncer.Provider>
        <main>Application</main>
      </ScreenReaderAnnouncer.Provider>,
    );
    const layers = renderToStaticMarkup(
      <LayerManager.Provider>
        <LayerManager.Application>
          <main>Application</main>
        </LayerManager.Application>
        <LayerManager.Layer id="help-layer" modal>
          <section>Help</section>
        </LayerManager.Layer>
      </LayerManager.Provider>,
    );

    expect(announcements).toContain('role="status"');
    expect(announcements).toContain('aria-live="polite"');
    expect(announcements).toContain('role="alert"');
    expect(announcements).toContain('aria-live="assertive"');
    expect(layers).toContain('data-slot="layer-application"');
    expect(layers).toContain('data-slot="layer"');
    expect(layers).toContain('data-layer-modal="true"');
    expect(layers).toContain('data-layer-manages-environment="true"');
    expect(layers).not.toContain("inert");
  });

  it("keeps announcement composition completely inert when its provider is omitted", () => {
    let announcer: AnnouncerApi | undefined;
    const html = renderToStaticMarkup(<AnnouncerProbe onRead={(value) => (announcer = value)} />);

    expect(html).toBe("");
    expect(announcer?.announce("No provider")).toBe(false);
    expect(html).not.toContain("aria-live");
  });

  it("reuses a nested announcer instead of duplicating live regions", () => {
    const html = renderToStaticMarkup(
      <ScreenReaderAnnouncer.Provider>
        <ScreenReaderAnnouncer.Provider>
          <main>Application</main>
        </ScreenReaderAnnouncer.Provider>
      </ScreenReaderAnnouncer.Provider>,
    );

    expect(html.match(/role="status"/gu)).toHaveLength(1);
    expect(html.match(/role="alert"/gu)).toHaveLength(1);
  });

  it("reuses one manager across nested LayerManager providers", () => {
    const managers: LayerManagerApi[] = [];
    renderToStaticMarkup(
      <LayerManager.Provider>
        <ManagerProbe onRead={(manager) => managers.push(manager)} />
        <LayerManager.Provider>
          <ManagerProbe onRead={(manager) => managers.push(manager)} />
        </LayerManager.Provider>
      </LayerManager.Provider>,
    );

    expect(managers).toHaveLength(2);
    expect(managers[1]).toBe(managers[0]);
  });

  it("rejects Fragment composition before semantics or refs become ambiguous", () => {
    expect(() =>
      renderToStaticMarkup(
        <Slot>
          <>
            <button type="button">One</button>
          </>
        </Slot>,
      ),
    ).toThrow(/one concrete React element/u);
    expect(() =>
      renderToStaticMarkup(createElement(Slot, null, "text" as unknown as ReactElement)),
    ).toThrow(/one concrete React element/u);
    expect(() =>
      renderToStaticMarkup(
        createElement(Slot, null, [
          <button key="one">One</button>,
          <button key="two">Two</button>,
        ] as unknown as ReactElement),
      ),
    ).toThrow(/one concrete React element/u);
  });

  it("keeps the exported primitives valid through createElement consumers", () => {
    const html = renderToStaticMarkup(createElement(VisuallyHidden, null, "Programmatic name"));
    expect(html).toContain("Programmatic name");
  });
});
