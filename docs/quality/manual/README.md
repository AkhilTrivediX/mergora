# Manual evidence

Manual records cover the user tasks and environments that automation cannot prove. They follow the risk-class matrix in the accessibility plan and include exact component/contract digest, OS, browser, assistive technology, input method, locale, direction, zoom, task protocol, result, defects, reviewer, and date.

Rules:

- Never record a mutable version such as `latest`.
- Do not infer a pass from axe, Lighthouse, APG ancestry, or another library's claim.
- Carried-forward evidence is valid only when the exact digest and dependency blast-radius rules permit it.
- Risk Class 3 evidence requiring an independent review cannot be self-approved.
- A limitation is not a pass when it violates a Stable blocker.
- Personal disability information is neither requested nor retained.

Use [`RECORD_TEMPLATE.md`](RECORD_TEMPLATE.md) when the manual evidence tooling is not yet generating a schema-valid record.
