# Callout canonical source

Status: source present and unreleased. Automated workbench evidence is not release evidence; no Stable or conformance claim is made here.

Callout is deliberately non-live explanatory content. It defaults to a neutral div and becomes a complementary landmark only when landmarkLabel explicitly names an aside.

## Mergora signature and advantage

Callout stays on a literal Canvas with an Ink boundary, compact contextual symbol, strong title, and a restrained violet/green semantic signal rather than copying a tinted Shadcn Alert. Its useful enhancement is an opt-in named complementary landmark for important explanatory regions. Omitting `landmarkLabel` keeps the lightweight div baseline and removes the aside landmark and accessible landmark name completely.

## Contract

- No variant adds alert, status, or aria-live.
- A caller-selected native heading, visible localized variant label, symbol, and body carry meaning without color.
- Stable Provider keys are callout.note, callout.info, callout.tip, and callout.warning; explicit variantLabel wins.
- The component owns its landmark and live-region semantics; JavaScript callers receive a runtime error for role or ARIA overrides that could contradict them.
- Boolean-only, empty-array, and empty-Fragment title or body values are invalid rather than silently rendering an empty callout.

The public ref and stable data-slot parts are recorded in callout.anatomy.json. The exact five-key source manifest, metadata, API, story-state policy, accessibility contract, and honest promotion delta live beside the implementation.

## Promotion boundary

Generation drift, strict types, unit, SSR, hydration, schema, browser, axe, announcement and preference gates, packed consumers, package/source parity, Semantic Sync fixtures, manual assistive-technology sessions, reviewed visual evidence, public-site dogfooding, and an approved digest-bound Quality Passport remain required.
