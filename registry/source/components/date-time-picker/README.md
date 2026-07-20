# DateTimePicker canonical source

Status: source present and unreleased. No Stable, DST-conformance, or parity claim is made.

`DateTimePicker` keeps a native unzoned local date-time editor while adding independently optional presets and timezone clarity. `presets={false}` and `showTimeZoneContext={false}` remove their respective UI, behavior, events, formatting work, and accessibility output. It also forwards DateTimeField's opt-in `wallTimeAdapter`, explicit zone, `reject | earlier | later` ambiguity policy, recovery status, resolution callback, and optional resolved-instant form value. With the adapter disabled, none of that UI, resolution work, event output, form output, or accessibility output exists.

Canvas surfaces, Ink borders, Green success / explicit danger recovery, Violet zone/focus signals, restrained controls, and semantic tokens carry the Mergora family language. Consumers supply and maintain authoritative timezone data through the adapter. Promotion needs generated parity, packed-consumer, full-matrix, mobile, and manual assistive-technology evidence.
