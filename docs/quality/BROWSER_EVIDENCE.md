# P1 browser evidence runner

The P1 runner exercises the canonical Button, Dialog, Combobox, and constrained Data Grid tracer in
real Playwright browsers. It records reproducible automated facts; it does not promote an item to
Stable, replace manual assistive-technology review, or claim WCAG conformance.

## Commands

```bash
pnpm test:browser
pnpm test:a11y
pnpm test:visual
```

`test:browser` runs every browser fixture in the pinned Chromium, Firefox, and WebKit projects.
`test:a11y` selects the axe, semantic, keyboard, preference, and forced-colors checks tagged
`@a11y`. `test:visual` selects deterministic capture checks tagged `@visual`. A missing browser,
token build failure, missing font, page or console error, failed resource, invalid evidence shape,
or failed assertion exits non-zero. Console errors and warnings are both treated as fixture failures.

## Current P1 qualification

The current suite shape produces these exact results on the pinned local toolchain:

| Command             | Scheduled | Passed | Explicit policy skips |
| ------------------- | --------: | -----: | --------------------: |
| `pnpm test:browser` |        36 |     32 |                     4 |
| `pnpm test:a11y`    |        12 |     10 |                     2 |
| `pnpm test:visual`  |        18 |     16 |                     2 |

Every policy skip is a Firefox or WebKit instance of a Chromium-only forced-colors test. There are
no missing-engine, missing-browser, quarantine, retry, or failure-derived skips.

Before Vite starts, the Playwright web-server command checks and builds `mergora-tokens`. The
fixture imports the package's public `tokens.css` export so fonts and CSS are tested from the package
shape rather than a test-only token copy. Component implementations come directly from canonical
`registry/source`; package/source parity and packed-consumer evidence remain separate P1 gates.
The load gate explicitly requests both self-hosted families, verifies their WOFF2 resource entries
and `FontFaceSet` status, and lets each engine's font-decoder warning fail the run.

## What is exercised

| Area            | Current automated evidence                                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Semantics       | Shared DOM semantic-query adapter resolves the named native Button; small Playwright ARIA snapshots cover Button and an open Dialog.                                                    |
| Interaction     | Native Button activation, keyboard Dialog open/Escape/focus return, Combobox keyboard selection, Data Grid sorting, and single-row selection.                                           |
| Axe             | Shared axe-core adapter scans the default page and open modal without waivers; any violation fails. Incomplete results are retained for manual review.                                  |
| Geometry        | Shared Playwright geometry adapter checks page overflow, visible/unoccluded focus, touch target size, and Dialog overlay bounds at 320x568 and the 320x256 reflow-height condition.     |
| Reflow and text | A 320 CSS-pixel viewport, touch density, 200% root text, and WCAG text-spacing overrides must preserve page-level reflow. The Experimental table may scroll inside its labelled region. |
| Preferences     | RTL operation, reduced-motion computed styles, light, dark, enhanced-contrast, and Chromium forced-colors emulation.                                                                    |
| Visual capture  | The shared visual adapter captures PNG bytes twice after deterministic font loading, persists request metadata and SHA-256 digests, and fails when the two same-state bytes differ.     |

The fixture uses prepared data and performs no network request beyond its local Vite origin. It has
no clock, randomness, animation-dependent content, or screenshot mask.

## Evidence artifacts

Local runs write ignored artifacts beneath `artifacts/browser-evidence/`:

```text
artifacts/browser-evidence/
+-- axe/<playwright-project>/p1-tracer.json
`-- visual/<playwright-project>/<mode>-<sequence>.{png,json}
```

Visual metadata records the exact OS and browser versions reported by the runner, viewport, mode,
font-manifest digest, artifact path, and screenshot digest. Playwright's ordinary failure report,
trace, and screenshots live under `artifacts/browser/`. CI must publish these directories as an
immutable run artifact before a Quality Passport may link to them; a local path is not public
release evidence.

## Honest boundaries

- Same-run byte equality is a deterministic capture smoke check, not a reviewed visual regression
  baseline. Baseline approval, narrow diffs, ownership, and expiry policy still have to be wired to
  protected CI.
- The P1 geometry lane proves the equivalent 320 CSS-pixel reflow condition, Dialog operation at
  320x256, and 200% text adaptation. It does not drive a browser's native zoom UI, every canonical
  viewport, safe-area behavior, or on-screen keyboard behavior.
- Playwright forced-colors emulation is collected only in Chromium. It does not replace manual
  Windows High Contrast inspection, and the runner never labels it as such.
- Automated axe and ARIA output do not cover screen-reader usability, speech, switch access, touch
  screen readers, cognitive review, or complete WCAG applicability. Required Risk Class 1-3 manual
  records remain absent until real testers execute the documented task matrix.
- Firefox and WebKit here are Playwright engines. Real Chrome, Firefox, Safari/macOS/iOS, and Edge
  smoke checks remain release evidence outside this runner where the plan requires them.
- Data Grid is asserted to carry `data-maturity="experimental"`. Its scoped table scroll, sort, and
  selection checks validate the architecture tracer only; they are not Stable Risk Class 3
  evidence and do not waive its documented completion delta.
- Visual captures render canonical source with the token package. Packed UI tarball behavior,
  source/package equality, Next/Vite consumers, updater survival, and manual evidence remain
  independent P1 exit conditions.

These boundaries are deliberate release controls: a missing prerequisite produces a failing command
instead of a synthetic pass, skipped record, or accessibility badge.
