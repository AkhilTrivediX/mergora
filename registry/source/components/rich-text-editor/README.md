# Rich Text Editor (Labs)

Status: Labs source present and unreleased. This item is not Stable and is excluded from Stable counts. No adapter has earned a complete editing, screen-reader, mobile, serialization, security, package-parity, or manual Risk Class 3 claim.

`RichTextEditor` is deliberately an integration shell, not a home-grown editor engine. A required identified/versioned adapter owns the editing surface, document schema, selection, history, toolbar behavior, serialization, migrations, paste/import/export, and engine accessibility. Mergora provides label/error context, controlled and uncontrolled serialized state, reset, optional form serialization, and independently optional adapter boundary, serialization disclosure, and status rail.

Consumers must use a maintained licensed engine, pin and audit it, sanitize untrusted import/export, define URL/media policy, prove migrations, prevent data loss, and complete editor-specific desktop/mobile assistive-technology testing. A textarea fixture in Storybook proves only shell wiring.

The shell uses the same literal Canvas, Ink boundaries, strong label hierarchy, Green status rule, Violet serialization seam, shared focus geometry, bounded corners, logical layout, forced-color mapping, and reduced-motion fallback while staying visually subordinate to the consumer engine.
