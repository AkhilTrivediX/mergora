---
name: Mergora
description: Open components that remain safe to evolve.
colors:
  primary-living-green: "oklch(0.600 0.158 150)"
  primary-action: "oklch(0.420 0.130 150)"
  accent-deep-violet: "oklch(0.330 0.135 292)"
  canvas: "oklch(1.000 0.000 0)"
  surface: "oklch(0.970 0.006 150)"
  ink: "oklch(0.180 0.018 150)"
  muted-ink: "oklch(0.470 0.018 150)"
  line: "oklch(0.875 0.010 150)"
typography:
  display:
    fontFamily: "Schibsted Grotesk, Arial, sans-serif"
    fontSize: "clamp(3rem, 7vw, 6rem)"
    fontWeight: 650
    lineHeight: 0.96
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Schibsted Grotesk, Arial, sans-serif"
    fontSize: "clamp(2rem, 4vw, 4rem)"
    fontWeight: 620
    lineHeight: 1.02
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Schibsted Grotesk, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 420
    lineHeight: 1.65
  code:
    fontFamily: "Commit Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 450
    lineHeight: 1.6
rounded:
  control: "8px"
  surface: "12px"
  compact: "6px"
spacing:
  unit: "4px"
  control-x: "14px"
  control-y: "10px"
  section: "clamp(4rem, 10vw, 9rem)"
components:
  button-primary:
    backgroundColor: "{colors.primary-action}"
    textColor: "{colors.canvas}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
---

# Design System: Mergora

## Overview

**Creative North Star: “The Living Workbench”**

Mergora should resemble a precise physical workbench in daylight: tools are visible, test pieces remain on the surface, measurements can be inspected, and nothing is hidden behind decorative casing. The marketing surface and the documentation surface share a voice, but not a rigid layout. Large brand moments use committed living green; long reading and component work happen on a literal white canvas.

The website is light-first because its primary scene is a frontend engineer comparing rendered states and code during a working day. Dark mode is fully supported as a user preference, but it is not used as shorthand for a developer brand. Product evidence—real components, state matrices, keyboard maps, diffs, and test status—provides the imagery.

**Key Characteristics:**

- Live, usable component specimens instead of screenshots or placeholder panels.
- Edge-to-edge state rails and deliberate split views instead of repeated card grids.
- One expressive sans family for narrative hierarchy and one highly legible mono only for code and machine data.
- Brand color used in committed passages, with white documentation canvases and crisp structural lines.
- Motion that explains state, merging, or spatial relationships and disappears cleanly under reduced motion.

## Colors

The palette combines a living green with a deep violet counterweight; neutral surfaces remain truly neutral or barely biased toward the brand hue.

### Primary

- **Living Green:** the identifying brand field, selected states, diagrams, and large launch moments.
- **Action Green:** the darker interactive fill used when white text must remain clearly readable.

### Secondary

- **Deep Violet:** the contrast color for version markers, update diagrams, secondary data, and occasional focused accents. It never becomes a purple gradient.

### Neutral

- **Canvas:** literal white for documentation and component evaluation.
- **Surface:** a near-white brand-biased layer for code rails, selected rows, and quiet grouping.
- **Ink:** near-black with a trace of the green hue for primary content.
- **Muted Ink:** secondary content only after verified contrast.
- **Line:** structure, separators, tables, and focus-adjacent geometry—not decoration.

**The Evidence Color Rule.** Saturated color marks state or carries a deliberate brand passage; it is never sprayed across arbitrary icons.

**The Verified Pair Rule.** Implementation must calculate contrast for every foreground/background token pair and adjust lightness while preserving the palette’s intended hue and role. The values in frontmatter are design targets, not permission to ship an unverified pair.

## Typography

**Display Font:** Schibsted Grotesk with Arial and system sans fallbacks.  
**Body Font:** Schibsted Grotesk with Arial and system sans fallbacks.  
**Code Font:** Commit Mono with the platform monospace fallback.

**Character:** Schibsted Grotesk supplies editorial clarity without turning the site into a magazine; Commit Mono is neutral, highly legible, and confined to code, commands, versions, and token values. Both are open-source and must be self-hosted with subsets and preload behavior that avoids layout shift.

### Hierarchy

- **Display** (650, fluid 48–96px, 0.96): homepage statements only; never allowed to overflow at 320px.
- **Headline** (620, fluid 32–64px, 1.02): major page and section hierarchy.
- **Title** (600, 20–28px, 1.2): component and subsection headings.
- **Body** (420, 16–18px, 1.6–1.7): documentation, capped at 70ch.
- **Label** (560, 12–14px, normal or minimally positive tracking): controls, metadata, and status—not decorative eyebrows.
- **Code** (450, 13–15px, 1.6): code, CLI output, token values, and keyboard maps.

**The Mono Boundary Rule.** If content is written for a human sentence rather than parsed as code or machine metadata, it uses the sans family.

## Elevation

Mergora is flat by default. Depth comes from tonal surfaces, occlusion, sticky regions, and explicit overlay backdrops. Shadows are reserved for floating overlays that need separation from arbitrary content; they are not paired decoratively with a border and do not exceed an 8px blur in routine UI.

**The State, Not Decoration Rule.** A shadow may explain that an element is floating or being dragged. It may not be added merely to make a panel feel “premium.”

## Components

### Buttons

- **Shape:** compact and deliberate (8px), with a minimum visual height of 40px and a 44px comfortable/touch size option.
- **Primary:** Action Green with white text; strong enough to be found without glowing.
- **Secondary:** white or surface background with an explicit structural border; no wide ambient shadow.
- **Hover / Active:** color and 1px optical movement only where it does not cause layout shift.
- **Focus:** high-contrast two-layer focus indicator that remains visible in forced-colors mode.

### Chips

- **Style:** compact, content-sized, and semantically different for status, input tokens, and filters.
- **State:** selection is never conveyed by color alone; checkmarks, text, or shape changes accompany color.

### Cards / Containers

- **Corner Style:** 12px maximum for normal surfaces.
- **Background:** Canvas or Surface depending on hierarchy.
- **Shadow Strategy:** none at rest.
- **Border:** structural when the boundary communicates grouping; absent when spacing already does the job.
- **Internal Padding:** responsive 16–28px based on content density.

### Inputs / Fields

- **Style:** stable dimensions, visible label, readable placeholder, and 8px control radius.
- **Focus:** explicit focus-visible treatment without changing control size.
- **Error / Disabled:** text and programmatic state accompany color; disabled content remains readable.

### Navigation

Navigation is sans-first, compact, and task-oriented. Desktop documentation navigation may use a left rail; mobile uses an accessible disclosure/drawer with focus return. Active location is conveyed through text weight, position, and programmatic current-page state—not color alone.

### Quality Passport

The signature documentation component combines maturity, test evidence, WCAG/APG mapping, keyboard coverage, browser/assistive-technology results, bundle impact, dependencies, and known limitations. It reads like a concise inspection sheet, not a marketing badge.

## Do's and Don'ts

### Do:

- **Do** make real component behavior the main visual material of the site.
- **Do** show empty, error, loading, long-content, RTL, touch, reduced-motion, and high-contrast states alongside the ideal state.
- **Do** use large fields of Living Green deliberately, then return to a literal white reading canvas.
- **Do** make install commands, version provenance, and test evidence easy to copy and verify.
- **Do** vary page rhythm with rails, tables, specimens, and prose instead of forcing every idea into a card.

### Don't:

- **Don't** create a visual clone of shadcn/ui or reuse its page proportions and neutral styling grammar.
- **Don't** use purple gradients, gradient text, glassmorphism, decorative grid backgrounds, or floating code-window theatre.
- **Don't** repeat identical icon-heading-text card grids or tiny uppercase tracked eyebrows as section scaffolding.
- **Don't** use border radii above 16px for normal cards and sections.
- **Don't** pair a 1px decorative border with a wide soft shadow.
- **Don't** use monospace typography outside code, commands, versions, tokens, and machine-readable evidence.
- **Don't** claim accessibility from automated testing alone.
