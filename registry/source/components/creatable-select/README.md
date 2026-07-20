# Creatable Select

A labelled choose-or-create field with predictable controlled/uncontrolled state, native serialization, reset recovery, and Mergora overlay/focus styling.

## Mergora advantage

`showCanonicalPreview` exposes the value a workflow will receive before creation. Its formatter runs only when enabled; false removes the preview, relationship, and formatter work while choose/create behavior stays unchanged.

`validateCreate` can reject a proposed value before work starts. Async `onCreate` receives an `AbortSignal`; pending UI, cancellation, and recoverable errors stay explicit while storage and transport remain consumer-owned. A controlled `creating` prop supports external lifecycle orchestration.

## Status

`source-present-unreleased`; generated parity and complete browser/manual evidence remain blockers.
