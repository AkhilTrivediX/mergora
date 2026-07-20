# CurrencyField canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

`CurrencyField` requires a three-letter currency code and keeps that code explicit in its contract. JavaScript values and hidden form values are canonical major-unit numbers: `1250.5` means 1,250 major units and 50 minor units for a two-decimal currency. Symbols, codes, localized digits, separators, and accounting parentheses are presentation only.

The default display uses the currency code to reduce symbol ambiguity. Precision and step default to the currency's `Intl.NumberFormat` minor-unit convention. Pass an explicit `precision` when business rules differ. Negative values are rejected by the implicit minimum unless `allowNegative` is enabled; `currencySign="accounting"` changes the visible sign style, not the numeric value.

The hidden amount does not include the currency code. Submit the code in a separate field when the receiving API needs an amount-and-currency pair. This component does not perform currency conversion, tax, ledger rounding, or exchange-rate work.

The shared Mergora numeric workbench gives currency values a stronger typographic weight while preserving the literal white surface, ink boundary, green action, and violet focus language. `showCanonicalPreview` is the component-specific inspection advantage: it presents the normalized currency code beside the exact major-unit JavaScript value without creating a live announcement. `statusRail="auto"` independently exposes localized currency bounds through the input description. Both default to off and leave no UI or accessibility output when disabled.

Promotion requires generated artifacts, package/source parity, locale and currency-minor-unit matrices, major-unit serialization and reset evidence, canonical-preview/status opt-in and disabled-absence evidence, negative and accounting cases, IME and caret review, mobile and RTL geometry, forced colors, and current manual assistive-technology sessions.
