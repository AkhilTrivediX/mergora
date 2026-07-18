# Button canonical source

Status: P1 canonical input. Package/registry artifacts and local browser/packed-consumer runs now
exist, but they are not attached to an immutable release record. Release and manual
assistive-technology evidence remain absent. This directory does not make a Stable or conformance
claim.

`Button` renders a native `<button>`. Navigation belongs to the separate Link contract; this component intentionally has no `asChild` escape hatch. The public ref resolves to `HTMLButtonElement`, and all applicable native button attributes remain available.

```tsx
<Button onClick={save}>Save changes</Button>

<Button pending pendingLabel="Saving changes">
  Save changes
</Button>
```

## Public props

| Prop           | Type                                                   | Default           | Contract                                                                                                 |
| -------------- | ------------------------------------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------- |
| `variant`      | `"primary" \| "secondary" \| "quiet" \| "destructive"` | `"primary"`       | Visual intent only; semantics remain a button.                                                           |
| `size`         | `"small" \| "medium" \| "large"`                       | `"medium"`        | Intrinsic minimum size; coarse pointers raise the target to at least 44 CSS pixels.                      |
| `pending`      | `boolean`                                              | `false`           | Keeps focusability, sets `aria-busy` and `aria-disabled`, and cancels click activation before `onClick`. |
| `pendingLabel` | `string`                                               | original children | Replaces the visible label while pending when non-empty. Consumers provide localized text.               |
| `type`         | native button type                                     | `"button"`        | Set `"submit"` explicitly for native form submission.                                                    |

`disabled` retains native behavior. It is intentionally different from `pending`: a native disabled button can leave the tab order and lose focus, while a pending button remains focusable. If both are supplied, native `disabled` behavior wins, so do not combine them when focus retention is required.

When an idle icon-only button is named with `aria-label`, a visible `pendingLabel` temporarily becomes its accessible name. When `aria-labelledby` named the idle button, the pending label temporarily uses content naming instead. This keeps the visible pending text in the accessible name for speech users; choose a pending label that retains any context users still need.

## Accessible naming

Visible text is the preferred name. Icon-only use supplies a non-empty `aria-label` or `aria-labelledby` and marks decorative SVGs `aria-hidden="true"`. In development, the component reports a precise diagnostic when it can prove that the content is unnamed. It deliberately reports an indeterminate result for opaque custom children; the diagnostic is a guardrail, not evidence that every consumer label is meaningful.

```tsx
<Button aria-label="Add row" size="large" variant="secondary">
  <PlusIcon aria-hidden="true" />
</Button>
```

## Stable styling surface

- Root: `data-slot="button"`.
- Parts: `data-slot="button-label"` and `data-slot="button-pending-indicator"`.
- Values: `data-variant` and `data-size` are always present.
- States: `data-pending="true"` and `data-disabled="true"` are present only in those states. Pending also exposes `aria-busy="true"` and `aria-disabled="true"`; disabled uses the native `disabled` attribute.

The stylesheet uses Mergora semantic color, type, spacing, radius, focus, density, target-size, and motion tokens. It uses logical properties for RTL, grows for multiline and 200% text, stops spinner rotation under reduced motion, uses system colors under forced colors, and enforces a 44 CSS-pixel coarse-pointer target. Theme and enhanced-contrast values come from the token layer.

The canonical Storybook story imports `mergora-tokens/tokens.css` before rendering this source. Package and source-registry generation must preserve that token dependency; unscoped literal fallback colors are intentionally not embedded in the component.

## Canonical inputs

- `button.source.json` describes the source-transform entry.
- `button.metadata.json` is the schema-valid component metadata input; `button.status.json` keeps distribution, promotion, and evidence status explicit.
- `button.api.json` freezes exports, props, ref, defaults, and event policy.
- `button.anatomy.json` freezes slots and documented attributes.
- `button.stories.json` records every required state as applicable or gives a concrete not-applicable rationale.
- `button.contract.json` records semantics, naming, interaction, preferences, consumer obligations, and evidence still required.

Architecture is frozen in [P1_VERTICAL_SLICE_API.md](../../../../docs/architecture/P1_VERTICAL_SLICE_API.md). The public accessibility, testing, and promotion boundaries are recorded in [BROWSER_EVIDENCE.md](../../../../docs/quality/BROWSER_EVIDENCE.md), [HARNESS.md](../../../../docs/quality/HARNESS.md), and [MATURITY_GATES.md](../../../../docs/quality/MATURITY_GATES.md).

## Evidence status and promotion boundary

The scoped deterministic tests cover state logic, contract inputs, and server markup. The local
[P1 browser evidence](../../../../docs/quality/BROWSER_EVIDENCE.md) adds native activation, semantic
queries, axe, a small ARIA snapshot, geometry, 320 CSS-pixel reflow, 200% text, preferences, and
three-engine deterministic capture. The
[packed-consumer record](../../../../docs/quality/P1_PACKED_CONSUMERS.md) proves package/source
compilation and production builds, not behavioral parity.

Promotion still requires immutable CI evidence, pointer cancellation/focus-retention depth,
reviewed visual baselines, manual Windows forced-colors review, complete package/source behavioral
parity, Semantic Sync evidence, and the Risk Class 1 keyboard plus NVDA/Firefox and
VoiceOver/Safari records bound to the exact candidate digest.
