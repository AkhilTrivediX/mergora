# Combobox canonical source

Status: implemented P1 source, not released and not eligible for Stable until its complete evidence matrix passes.

Combobox wraps React Aria Components 1.19 behind Mergora-owned anatomy, types, slots, state attributes, and semantic-token styling. DOM focus remains in the editable input while the listbox uses virtual focus. The listbox, items, sections, popup relationship, localized announcements, form serialization, and platform editing behavior are delegated to the single React Aria collection path.

```tsx
<Combobox.Root name="country" defaultValue="in">
  <Combobox.Label>Country</Combobox.Label>
  <Combobox.Input placeholder="Choose a country" />
  <Combobox.Clear label="Clear country" />
  <Combobox.Trigger label="Show countries" />
  <Combobox.Description>Type to filter.</Combobox.Description>
  <Combobox.Popover>
    <Combobox.ListBox>
      <Combobox.Item id="de">Germany</Combobox.Item>
      <Combobox.Item id="in">India</Combobox.Item>
      <Combobox.Item id="jp">Japan</Combobox.Item>
    </Combobox.ListBox>
  </Combobox.Popover>
</Combobox.Root>
```

Mergora's literal Canvas surface, Ink structure, Green selection signal, and Violet focus seam keep the field visibly related to the rest of the library. `Combobox.Clear` is an optional recovery action beyond the ordinary editable-combobox composition: it clears the committed key and editable text through the same controlled or uncontrolled state boundaries, then closes the popup. The action is inert when the root is disabled or read-only. Omit the compound part to remove its button, click path, and accessible name completely; the plain combobox keeps the same input, selection, form, and popup behavior.

Plain string or number item children become the item's text value automatically, so default
selection and type-ahead use the visible label. Supply `textValue` explicitly whenever an item
uses formatted or render-function children.

The consumer supplies all user-facing strings. Interactive descendants inside items are prohibited because DOM focus stays on the input. `value` is an item key; `inputValue` is the editable string. When both are controlled, update them independently in `onValueChange` and `onInputValueChange`.

The local [P1 browser evidence](../../../../docs/quality/BROWSER_EVIDENCE.md) covers keyboard
selection, three-engine preferences/geometry, and the fixture-level axe gate. The
[packed-consumer record](../../../../docs/quality/P1_PACKED_CONSUMERS.md) proves source/package
compilation in Next and Vite. The draft contract keeps those results unattested until an immutable
candidate binds their exact digests; manual assistive-technology, full adverse collection states,
Semantic Sync, and behavioral parity remain missing. It is not a Quality Passport, certification,
or WCAG-conformance claim.
