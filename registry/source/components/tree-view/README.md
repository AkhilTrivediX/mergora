# TreeView canonical source

Status: source present and unreleased. No Stable, large-data performance, package-parity, or manual assistive-technology claim is made.

`TreeView` implements a roving-focus APG tree model with mirrored RTL expansion keys, Up/Down/Home/End, parent/child navigation, sibling expansion, typeahead, single or modifier-free multiple selection, and controlled or uncontrolled active/expanded/selected state. Lazy nodes expose busy, success removal, and persistent error output; F2 rename is available only with a consumer callback. A bounded virtual window preserves full positions and requires `onVirtualWindowChange` so the consumer keeps the active item in the rendered range when focus crosses it.

Optional move actions are an explicit non-drag alternative for keyboard, touch, speech, and switch users. Setting `moveActions={false}` removes the group, buttons, names, and callbacks; drag behavior is never forced. Rendered actions, rename, lazy loading, and virtualization are likewise consumer-selected. Literal Canvas, Ink rows, Green selection, Violet active/focus geometry, restrained corners, logical depth, narrow wrapping, forced colors, and reduced-motion safety provide the family identity.

Promotion still requires regenerated parity, packed consumers, performance-scale/virtual-window evidence, and current risk-class manual screen-reader, speech, switch, keyboard, and touch sessions.
