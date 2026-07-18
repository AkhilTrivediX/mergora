# P1 vertical-slice API review

Status: accepted architecture for the P1 tracer; implementation and evidence remain pending.

This note freezes the narrow public surface used to prove canonical generation before the catalog expands. Generated package, registry, documentation, story, and Passport outputs are never edited directly. A source record may become available only when its implementation, tests, contract, and honest evidence index all validate.

## Shared rules

- Public components expose meaningful DOM refs, `className`, native attributes where applicable, `data-slot`, and explicit state attributes.
- Native semantics are the default. React Aria Components supplies collection and overlay behavior behind Mergora-owned props, anatomy, and types; its public types and DOM arrangement are not part of the Mergora contract.
- Controlled and uncontrolled state use paired value/default/change props. Change callbacks include a small Mergora-owned reason object where cancellation or focus restoration matters.
- The tracer does not introduce `asChild`. A future polymorphic render contract requires separate ref, event-composition, semantic, and accessible-name evidence.
- Default styling consumes semantic tokens only. Forced-colors and reduced-motion behavior is explicit.
- Development diagnostics name the component and corrective action. No production warning is presented as accessibility evidence.

## Button

`Button` renders a native `button` and accepts its native attributes plus:

```ts
type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive";
type ButtonSize = "small" | "medium" | "large";

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pending?: boolean;
  pendingLabel?: string;
}
```

Pending state retains focus, exposes `aria-busy`, prevents activation, and keeps a visible or screen-reader-readable pending label. Actual `disabled` remains native disabled behavior. Icon-only usage requires an accessible name and receives a development diagnostic when one is not discoverable. Navigation remains the separate `Link` contract.

Stable selectors: `data-slot="button"`, `data-variant`, `data-size`, `data-pending`, and native `disabled`/`aria-disabled` state.

## Dialog

Dialog is a modal compound component:

```tsx
<Dialog.Root open={open} onOpenChange={setOpen}>
  <Dialog.Trigger>Open</Dialog.Trigger>
  <Dialog.Overlay>
    <Dialog.Content>
      <Dialog.Title>Title</Dialog.Title>
      <Dialog.Description>Description</Dialog.Description>
      <Dialog.Close>Close</Dialog.Close>
    </Dialog.Content>
  </Dialog.Overlay>
</Dialog.Root>
```

Named parts are `Root`, `Trigger`, `Overlay`, `Content`, `Header`, `Footer`, `Title`, `Description`, and `Close`. Root supports `open`, `defaultOpen`, and `onOpenChange(open, { reason })`. Content supports an initial-focus ref and a documented dismissal policy (`outside-and-escape`, `escape-only`, or `explicit`). Modal focus containment, background inertness, scroll locking, nested layer order, Escape ownership, and focus return use one React Aria-backed layer path. Title is required unless a deliberate accessible label is supplied; missing naming produces an actionable development diagnostic.

Stable selectors include `dialog-*` slots plus `data-state`, `data-entering`, `data-exiting`, and `data-dismiss-policy` where applicable.

## Combobox

Combobox is a Mergora-owned compound wrapper over React Aria collection and localization behavior. Named parts are `Root`, `Label`, `Input`, `Trigger`, `Popover`, `ListBox`, `Section`, `Item`, `Description`, and `ErrorMessage`.

Root owns selected item identity through `value`, `defaultValue`, and `onValueChange`, and text entry through `inputValue`, `defaultInputValue`, and `onInputValueChange`. Item identifiers use `React.Key`; callbacks otherwise use Mergora-owned reason types. The contract covers required/invalid/disabled/read-only state, empty and asynchronous results, optional custom values, section labels, form name/value serialization, and localized filtering. The public contract does not promise virtualization during P1.

The trigger remains reachable by touch and keyboard, the popup relationship and active option are exposed, Escape behavior is deterministic, and focus never moves into option descendants. Stable selectors use `combobox-*` slots and documented `data-open`, `data-focused`, `data-invalid`, `data-disabled`, `data-selected`, and `data-focus-visible` states.

## Data Grid tracer

The P1 `DataGrid` is explicitly Experimental. It proves a Mergora-owned column/row model can adapt TanStack Table without leaking TanStack types, and that the quality pipeline can refuse Stable maturity.

The tracer supports a semantic table mode, stable row keys, column headers, cells, sortable-column state, single-row selection, keyboard focus recovery after sorting, empty state, and a narrow-screen labelled scrolling region. Editing, virtualization, server operations, resizing, reordering, saved views, bulk operations, export, and interactive ARIA grid mode remain documented completion deltas for P5.

No generated catalog, package, or Passport surface may report the tracer as Stable, complete, manually assistive-technology tested, or released.

## Promotion evidence

Button, Dialog, and Combobox can move from implemented to Stable only after schema/type, state, semantic query, keyboard, browser ARIA, axe, visual-mode, responsive, locale/direction, packed-consumer, Semantic Sync, package/source parity, and required manual records are linked for the exact source digest. Data Grid remains Experimental even if its narrower tracer contract passes.
