# Cross-commit visual evidence

`baseline.v1.json` names an immutable Git commit, the exact visual matrix, the
pixel policy, and the review state. The baseline is rendered from that commit in
the same process environment as the candidate. Candidate screenshots are then
compared with Playwright's image comparator, so a passing result never comes
from comparing two captures of the same rendered source.

Run the blocking comparison with:

```sh
pnpm test:visual
```

Run a non-accepting review bundle when an intentional change is expected:

```sh
node scripts/run-visual-regression.mjs --review
```

The review command records baseline, candidate, actual, and diff artifacts
under `artifacts/browser-evidence/visual-regression/`. It does not update the
accepted commit. Baseline acceptance is a separate, explicit step:

```sh
MERGORA_VISUAL_CHANGE_LABEL=visual-change \
MERGORA_VISUAL_CHANGE_EXPLANATION="Describe the intentional presentation change." \
MERGORA_VISUAL_AFFECTED_STORIES="Components/Button,Components/Dialog" \
MERGORA_VISUAL_REVIEWER="reviewer-handle" \
node scripts/accept-visual-baseline.mjs --commit <reviewed-commit> --bundle <summary.json>
```

Acceptance requires a clean checkout, a committed candidate, the exact review
label, a concrete explanation, affected Storybook titles, and a review bundle
whose candidate matches the requested commit. The script updates metadata only;
it never commits, pushes, or changes component source.

CI runs on the explicit `ubuntu-24.04` image with Playwright and self-hosted font
versions pinned by the repository. It uploads the rendered comparison bundle on
success and failure. A changed baseline manifest in a pull request must carry
the `visual-change` label. A direct `feature/*` push with no exact associated
pull request receives a separate, fail-closed CI authority: an initial
`provisional` record is accepted only when its immutable commit is exactly the
push comparison base, while every later change needs a structurally complete
`approved` record whose accepted commit is an ancestor of candidate `HEAD`.
Workflow dispatches, `main`, release branches, and other refs cannot use this
authority. This path removes the pull-request ceremony, not the rendered review
bundle, named reviewer, explanation, affected-story record, or immutable commit
checks. The current bootstrap record remains deliberately `provisional`; its
comparisons can catch drift, but its output is not described as independently
reviewed or release-eligible.

Both revisions use the candidate checkout's pinned browser and dependency
toolchain. Source, generated token CSS, and font bytes come from their respective
commits. This removes historical runtime drift from the pixel comparison while
still making font loading and byte identity part of the evidence record.
