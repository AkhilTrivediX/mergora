# Form canonical source

Status: source present and unreleased. No Stable, package-parity, conformance, or manual assistive-technology claim is made.

`Form` is a thin native `form` boundary. It does not cancel submit, synthesize values, replace constraint validation, or introduce a client boundary, so native actions, React server actions, `FormData`, Enter submission, reset, and successful-control rules remain authoritative.

React Hook Form and TanStack Form adapters belong at the call site: spread each library's returned native props onto Mergora controls and pass its submit handler to `onSubmit`. Those examples require no Mergora runtime dependency on either adapter. Never intercept paste, autofill, password-manager mutation, or browser authentication assistance.

Promotion still requires server-action consumers, adapter fixtures, native submission/reset coverage, generation, package/source parity, Semantic Sync, and current manual evidence.
