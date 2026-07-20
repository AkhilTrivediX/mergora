# `mergora-tokens`

Private during foundation development, this package is the generated distribution of Mergora's canonical DTCG 2025.10 Living Workbench tokens. It has no React or browser-runtime dependency.

Use `tokens.css` for semantic CSS variables and self-hosted font faces. Use `tailwind.css` for the same variables plus an inline Tailwind CSS v4 `@theme` mapping. Theme state is expressed with `data-theme="light|dark"`; omit it to follow `prefers-color-scheme`. Enhanced contrast uses `data-contrast="enhanced"`. Density uses `data-density="comfortable|compact|touch"`. Platform forced colors and reduced motion are handled by media queries in the generated CSS.

The 1.1 contract adds the reusable Mergora family signature: literal-white Canvas, Ink typography and structural borders, restrained Action Green and Deep Violet state signals, explicit neutral/loading/success/warning/danger roles, two-layer focus aliases, shared control/field/overlay/progress recipes, density-aware block and inline spacing, and a hard 16px radius ceiling. `MergoraProvider` can override density and motion policy for a nested subtree without changing root attributes.

JavaScript consumers can import typed token names, CSS variable names, default resolved values, contexts, and measured contrast evidence from the package root. JSON subpaths expose the canonical default DTCG document, portable resolver with every referenced source file alongside it, all 12 resolved contexts, documentation data, structural schema, and design-tool interchange projection.

All files are deterministic. The compiler's check mode fails if a committed artifact differs from canonical source, contains an unresolved or circular alias, changes type through a mode, introduces an unknown semantic color group, moves a committed brand anchor, fails an official contrast pair, or changes a verified font asset.
