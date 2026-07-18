# Mergora token source

This directory is the canonical DTCG 2025.10 source for the Living Workbench. `mergora.resolver.json` composes a foundation set with orthogonal theme and density modifiers. Source files preserve aliases; the compiler rejects unknown semantic color groups, invalid values, unresolved references, reference cycles, type mismatches, brand-anchor drift, missing contexts, and contrast failures.

Only semantic and component aliases are public styling contracts. Primitive color ramps exist to make the official mappings auditable; application and component CSS must not couple directly to them.

Forced-colors files retain valid OKLCH fallbacks for portable DTCG interchange. Their `org.mergora.forcedColors.cssSystemColor` extensions and the explicit system-color map in `contract.json` drive the generated `forced-colors: active` CSS. The browser's system palette, not a hard-coded simulated palette, has final authority in that mode.

Generated package artifacts are written under `packages/tokens/src/generated`. Run the compiler with `--write` to update them or `--check` to fail on drift. Generation contains no timestamps, random identifiers, or machine-specific paths.
