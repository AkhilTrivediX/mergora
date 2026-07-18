# PercentageField canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

`PercentageField` uses one unambiguous fractional contract. `0.125` displays as 12.5% and submits as `0.125`; `1` is 100%. The visible percentage, separator, spacing, sign, and digits are localized by `Intl.NumberFormat`, while JavaScript and form values stay canonical fractions.

Defaults cover a common 0% to 100% domain: `minValue={0}`, `maxValue={1}`, `step={0.01}`, and two maximum displayed percentage fraction digits. Override the bounds for signed change, growth above 100%, variance, or other domains. Bounds and steps are fractions too. Precision controls visible percentage decimals and does not change the scale.

Use a visible `Field` label and make the measured quantity clear. Do not pass whole-number percentage values or attempt to parse the visible localized string in application code.

Promotion requires generated artifacts, package/source parity, percentage locale matrices, fractional controlled and form contracts, reset and bounds evidence, IME and caret review, mobile and RTL geometry, forced colors, and current manual assistive-technology sessions.
