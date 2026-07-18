# Product

## Register

brand

## Users

Mergora serves frontend engineers, design-system maintainers, product designers who work in code, technical founders, agencies, and teams standardizing React interfaces. They arrive while evaluating a default UI foundation, looking for a difficult production component, or trying to keep an existing component system safe and current. Their job is to discover a trustworthy component, verify its behavior, install it in one command, adapt it without lock-in, and continue receiving upstream improvements without losing local work.

## Product Purpose

Mergora is an open-source React interface system that combines editable source components, an optional versioned package distribution, production-grade composite components, a standards-based token system, and a provenance-aware update workflow. It exists to remove the false choice between owning component source and receiving safe upgrades.

Success means a developer can start a clean Next.js or Vite project, install Mergora, ship an accessible responsive interface, customize the source, run an update months later, review a deterministic three-way merge, and pass the same quality gates used by the library itself. The public website must make that quality visible rather than merely claiming it.

## Brand Personality

Exacting, alive, and generous. Mergora should feel like a beautifully maintained workbench: confident enough to expose every seam, energetic without spectacle, and welcoming to both first-time adopters and design-system experts. Its voice is direct, evidence-led, technically literate, and never smug.

## Anti-references

- A visual clone of shadcn/ui, including the same neutral palette, page proportions, component demos, or documentation rhythm.
- Generic developer-tool marketing built from purple gradients, dark glass panels, floating code windows, and vague claims about speed.
- Repeated identical card grids, oversized rounded containers, gradient text, decorative grid backgrounds, or tiny uppercase eyebrows above every section.
- Monospace typography used everywhere as a shortcut for “technical.”
- A component gallery that hides keyboard behavior, accessibility limitations, dependency health, responsive behavior, or real production states.
- A copy-paste registry that silently overwrites customized files or treats “you own the code” as an excuse to abandon upgrades.
- An accessibility badge based only on automated axe output.

## Design Principles

1. **Evidence over claims.** Every important promise—accessibility, responsiveness, bundle impact, browser support, update safety—must link to visible, reproducible evidence.
2. **Open seams, safe evolution.** Users can inspect and own the source while provenance, version history, diffs, and deterministic merge tools preserve a path forward.
3. **Immediate value, progressive depth.** A one-command happy path comes first; architecture, contracts, tokens, and internals are available without becoming prerequisites.
4. **Practice what the library teaches.** The documentation site dogfoods public components, tokens, responsive rules, internationalization, and accessibility gates.
5. **Production states are the product.** Loading, empty, error, offline, dense data, long content, touch, RTL, reduced motion, and high contrast are first-class—not appendix examples.

## Accessibility & Inclusion

The documentation website targets full-page WCAG 2.2 Level AA conformance. Components target all applicable WCAG 2.2 A and AA success criteria when used according to their documented contract and follow the relevant WAI-ARIA Authoring Practices patterns without claiming that APG examples alone are production standards. Canonical examples must support keyboard-only operation, screen readers, touch, 400% reflow, 200% text zoom, forced-colors/high-contrast modes, reduced motion, RTL, localization, and color-vision differences. Automated testing is a release gate but never a substitute for the documented manual assistive-technology matrix.
