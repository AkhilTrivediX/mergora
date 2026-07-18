# Concrete adapter wiring

`@mergora/test-utils` supplies concrete adapters for DOM Testing Library, axe-core, browser geometry,
and Playwright screenshots. Creating or importing an adapter does not query a document, launch a
browser, capture a screenshot, or write a file. Runtime work happens only when the caller invokes a
query, `run`, `measure`, or `capture` method.

Missing documents, browser APIs, Playwright pages, Web Crypto, and artifact writers throw an explicit
`RuntimeCapabilityError`. An absent capability is never converted into an empty result or a pass.

## DOM semantic queries

Bind an explicit element instead of relying on Testing Library's global `screen`:

```ts
import { createDomSemanticQueryPort, querySemantically } from "@mergora/test-utils";

const queries = createDomSemanticQueryPort(document.body);
const save = querySemantically(queries, {
  kind: "role",
  role: "button",
  options: { name: "Save" },
});
```

The adapter delegates to `@testing-library/dom` 10.4.1. Role state filters are supported on role
queries. Label, placeholder, text, and display-value queries accept only `exact`; passing a role
state filter to one of them is a configuration error. A string accessible name with `exact: false`
uses a case-insensitive substring predicate. Test ids still require the framework-neutral
justification enforced by `querySemantically`.

## axe-core

Compose the lazy axe adapter with the existing contract runner:

```ts
import { createAxeCoreAdapter, runAxeContract } from "@mergora/test-utils";

const { result, assessment } = await runAxeContract(
  createAxeCoreAdapter(),
  document.body,
  { runOnly: ["wcag2a", "wcag2aa", "wcag22aa"] },
  "2026-07-18T12:00:00.000Z",
);
```

The adapter loads axe-core 4.12.1 on first execution, forces the standard `v2` reporter, requests
only violations and incomplete findings, preserves actual node counts, validates impacts, and sorts
rule ids for deterministic serialization. It does not create waivers. `assessAxeResult` blocks
unwaived serious and critical violations and reports incomplete checks for manual review.

`result` and `assessment` are in-memory observations, not durable evidence. The caller must bind a
retained raw report to source and artifact digests through the evidence pipeline before any maturity
gate may use it. A zero-violation result does not supply screen-reader, keyboard, focus, responsive,
or other manual evidence.

## Geometry

`createDomGeometryAdapter()` accepts an explicit root, optional focus element, target elements with
minimum dimensions, and overlay elements. It measures horizontal overflow, rendered focus
visibility, center-point focus occlusion, target rectangles, viewport bounds, and clipping ancestors.
It requires `ownerDocument.defaultView`, `getComputedStyle`, layout rectangles, and
`elementFromPoint`.

`createPlaywrightGeometryAdapter()` performs the equivalent observation inside `page.evaluate`.
Its target uses serializable CSS selectors:

```ts
const target = {
  page,
  rootSelector: "#fixture",
  focusSelector: "#trigger",
  targets: [
    {
      id: "trigger",
      selector: "#trigger",
      minimumWidth: 24,
      minimumHeight: 24,
      touch: false,
    },
  ],
  overlays: [{ id: "popover", selector: "#popover" }],
};

const observation = await runGeometryContract(createPlaywrightGeometryAdapter(), target);
```

Selector-based geometry is an implementation boundary. If a test id is used, the calling contract
must record the geometry justification. The current center-point occlusion measurement is a useful
automated signal, not proof that every pixel of a focus indicator is unobscured; the required manual
focus review remains separate.

## Playwright visual capture

The visual adapter captures PNG bytes in memory, verifies the exact viewport requested by the
framework-neutral contract, applies the request's justified mask selectors, hashes the bytes with
SHA-256, waits for a caller-provided writer, and only then returns an `EvidenceReference`:

```ts
const adapter = createPlaywrightVisualCaptureAdapter({
  writeArtifact: async ({ artifact, bytes }) => {
    await evidenceArtifactStore.write(artifact, bytes);
  },
});

const reference = await captureVisual(
  adapter,
  {
    page,
    referenceId: "button-focused-desktop-light-visual",
    artifact: "evidence/visual/button-focused-desktop-light.png",
  },
  request,
);
```

The writer owns durable persistence and must make the returned artifact path resolvable by the later
inventory gate. The adapter checks screenshot dimensions against `page.viewportSize()`, but the
current contract cannot independently discover the host OS version or font digest. The Playwright
fixture must derive and pin the browser version, OS version, and font digest supplied in `request`;
copying labels into the request without that fixture binding is not evidence.

## Browser-runner work still required

The deterministic Node tests cover adapter dispatch, validation, axe result normalization, DOM
measurement with controlled geometry, Playwright serialization hooks, screenshot hashing, and all
missing-runtime paths. A real browser project is still required before browser, accessibility, or
visual gates can be enabled:

1. Install the pinned Playwright browser binaries in the browser CI job.
2. Run role, label, placeholder, text, and display-value queries against rendered fixtures in each
   supported engine.
3. Execute axe-core against the same rendered state/environment matrix and retain the raw report.
4. Execute the Playwright geometry callback in Chromium, Firefox, and WebKit, including zoom,
   clipping, portal, and focus-occlusion fixtures.
5. Provide a durable screenshot writer, runtime-derived browser/OS/font metadata, baseline
   comparison, retention, and evidence-index binding.

Until those jobs and artifacts exist, the fail-closed root browser, accessibility, and visual gates
must remain unavailable. These adapters are executable plumbing, not fabricated pass records.
