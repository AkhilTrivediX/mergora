# Mergora token source

This directory is the canonical DTCG 2025.10 source for the Living Workbench. `mergora.resolver.json` composes a foundation set with orthogonal theme and density modifiers. Source files preserve aliases; the compiler rejects unknown semantic color groups, invalid values, unresolved references, reference cycles, type mismatches, brand-anchor drift, missing contexts, and contrast failures.

Only semantic and component aliases are public styling contracts. Primitive color ramps exist to make the official mappings auditable; application and component CSS must not couple directly to them.

## Living Workbench signature

The shared contract gives every family the same visual grammar before component-specific styling is added:

- literal Canvas and restrained Surface roles keep evaluation surfaces white and structure explicit;
- Primary/Muted Ink, Subtle/Default/Interactive/Strong borders, Action Green, and Deep Violet separate hierarchy from state;
- `component.control` describes hover, press, selection, disabled, focus-adjacent, density, and touch-target geometry without requiring a generic runtime feature object;
- `component.field`, `component.overlay`, `component.progress`, and `component.focusIndicator` expose focused aliases for labels, descriptions, recovery signals, loading, floating structure, and the two-layer focus treatment;
- Compact, Control, Surface, Container, Panel, Overlay, Status, and legacy Pill radii are all capped at 16px; routine overlay shadows use no more than 8px blur;
- motion roles communicate state with short ease-out transitions, while system and explicit reduced-motion policies collapse them to the one-millisecond completion fallback.

Optional component enhancements should consume these roles, but must keep their own explicit APIs and removal behavior. These tokens are a coherent vocabulary, not permission to add unrelated decoration or a catch-all `features` prop.

Forced-colors files retain valid OKLCH fallbacks for portable DTCG interchange. Their `org.mergora.forcedColors.cssSystemColor` extensions and the explicit system-color map in `contract.json` drive the generated `forced-colors: active` CSS. The browser's system palette, not a hard-coded simulated palette, has final authority in that mode.

Generated package artifacts are written under `packages/tokens/src/generated`. Run the compiler with `--write` to update them or `--check` to fail on drift. Generation contains no timestamps, random identifiers, or machine-specific paths.
