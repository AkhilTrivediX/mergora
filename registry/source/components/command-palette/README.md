# Command Palette

An accessible modal or embedded command finder with ink structure, literal-white surfaces, restrained state color, predictable modal focus restoration, and bounded responsive layout.

## Mergora advantage

`showExecutionPreview` adds contextual effect text for the active command before execution. It defaults off; false removes the preview, live output, and related behavior without altering search or command events.

Grouped commands, nested pages, async search states, and an optional navigation adapter support larger catalogs. `presentation="embedded"` deliberately removes modal UI, focus trapping, close behavior, and `aria-modal`; `navigationAdapter={false}` performs no navigation work.

`shouldFilter={false}` cleanly disables internal matching when a consumer supplies its own ranked, local, or remote result set. The palette still owns keyboard navigation and execution, but emits no additional filtering behavior.

## Status

`source-present-unreleased`; distribution parity and complete automated/manual evidence remain promotion blockers.
