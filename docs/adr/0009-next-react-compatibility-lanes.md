# 0009 — Match Next compatibility lanes to the supported React major

- Status: Accepted
- Date: 2026-07-20

## Context

Mergora supports both React 18.3 and React 19 consumers. The exact packed-consumer
matrix initially paired both React majors with Next 16.2.10, then used Next 15.5.9 for
React 18. The exact React 18 run exposed React 19-only compiler and dispatcher types in
the current Next 15 declarations, while Next 16's React 19 consumer requires ES2024
library declarations.

Peer ranges alone are insufficient release evidence: a supported framework lane must
install, typecheck, build, and run the packed public artifacts.

## Decision

Use Next 14.2.35 for the React 18.3 lanes and Next 16.2.10 for the React 19 lanes.
Keep the React/TypeScript cross-product for Vite, retain Next 16 as the current primary
Next line, and give every compatibility fixture the ES2024 library declarations required
by current Next types.

## Consequences

- React 18 remains a tested supported consumer path instead of an unverified peer range.
- Next 16 is tested with the React major its current declarations compile against.
- Compatibility evidence remains fail-closed: each lane must use exact packed artifacts
  and the declared package-manager, Node, and operating-system matrix.
- Any future Next or React upgrade must update the declared matrix and rerun every exact
  lane; this decision does not claim a Stable release.

## Verification

`tests/compatibility/compatibility-matrix.test.ts` validates the declared lanes and
`.github/workflows/nightly.yml` executes them against packed artifacts. The workflow run
is the evidence authority; static matrix metadata is never pass evidence.
