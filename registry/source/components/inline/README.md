# Inline

`Inline` arranges related content in a wrapping flex row. Gap, cross-axis alignment, and logical main-axis alignment are closed tokenized options; nowrap is intentionally absent so the default remains reflow-safe.

```tsx
<Inline align="baseline" gap="md">
  <strong>Version 1.4</strong>
  <span>Published from a verified commit</span>
</Inline>
```

`Inline` is semantically neutral. Put it inside a real list, toolbar, or navigation element when those meanings apply, and keep DOM order equal to the intended reading and focus order.

The stable root slot is `[data-slot="inline"]`, with `data-gap`, `data-align`, and `data-justify`. The component never clips children; consumers remain responsible for unbreakable embedded content such as URLs or code.

Current status is `source-present-unreleased`; generated distributions, responsive browser evidence, packed-consumer parity, updater fixtures, manual review, public-site use, and an approved Passport remain outstanding.

## Mergora advantage

Adaptive wrapping is the resilient Mergora baseline for localized actions and metadata. `wrap={false}` disables it for deliberate one-line compositions without adding an overflow container, event handler, role, or screen-reader-only output.
