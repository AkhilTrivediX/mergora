# Empty State canonical source

Status: source present and unreleased. Automated workbench evidence is not release evidence; no Stable or conformance claim is made here.

EmptyState is a named contextual section with a real heading, explanation, optional decorative icon and body, and recovery paths.

## Mergora signature and advantage

The literal Canvas, Ink boundary, compact violet context marker, strong heading, and edge-to-edge suggestion rail make the state feel like part of the Mergora workbench rather than a generic centered card. Beyond an ordinary empty-state composition, native recovery actions are validated and optional `recoverySuggestions` provide a labelled list of concrete ways forward. Omitting `recoverySuggestions` removes its label, list, items, layout rail, and accessibility-tree output with no replacement behavior.

## Contract

- context distinguishes collection, search, filtered, first-use, and permission examples without replacing explanatory text.
- A primary recovery action is required as one non-fragment React element; an optional secondary action follows the same contract.
- `recoverySuggestions` is optional; when present it requires a non-empty label and at least one non-empty item.
- Native recovery elements must be enabled buttons, href-bearing anchors, or action-capable inputs. Custom action components retain their own native semantics.
- Title and description must render content. An optional body is rejected when it is only booleans, whitespace, an empty array, or an empty fragment.
- The layout reflows actions at narrow width without hiding or clipping recovery.

The public ref and stable data-slot parts are recorded in empty-state.anatomy.json. The exact five-key source manifest, metadata, API, story-state policy, accessibility contract, and honest promotion delta live beside the implementation.

## Promotion boundary

Generation drift, strict types, unit, SSR, hydration, schema, browser, axe, announcement and preference gates, packed consumers, package/source parity, Semantic Sync fixtures, manual assistive-technology sessions, reviewed visual evidence, public-site dogfooding, and an approved digest-bound Quality Passport remain required.
