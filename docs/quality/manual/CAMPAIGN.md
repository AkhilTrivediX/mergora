# Manual accessibility campaign

> Status: **NOT RUN**. No manual session, component, family, maturity level, or release has passed because this campaign document exists.

The generated catalog is the inventory authority. `scripts/prepare-manual-evidence.mjs` joins that inventory to the typed risk policy and creates the exact sessions required for the current commit. The generated workspace is Git-ignored and keeps every observation, outcome, tester, reviewer, candidate digest, version, and artifact blank.

## Required lane groups

| Risk | Exact environment lanes added at this depth                                                                                                                                                     | Coverage purpose                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1    | `windows-keyboard-edge`; `windows-nvda-firefox`; current and previous `macos-*-voiceover-safari`                                                                                                | Keyboard/manual visual review and separate semantic-engine A/B verification |
| 2    | `windows-nvda-chrome`; current and previous `windows-jaws-*-edge`; `windows-high-contrast-edge`; `windows-voice-access-edge`; `macos-full-keyboard-access-safari`; `macos-voice-control-safari` | Complete desktop AT, enterprise, forced-colors, keyboard, and speech paths  |
| 2    | current and previous iOS, iPadOS, and Android screen-reader touch lanes; current iPadOS and Android external-keyboard lanes                                                                     | Responsive touch screen-reader and external-input paths where applicable    |
| 2    | `windows-zoom-firefox`; `windows-nvda-firefox-rtl`; `windows-nvda-chrome-focus-restoration`                                                                                                     | 400% zoom/reflow, RTL, and focus restoration                                |
| 3    | Risk 2 lanes with full mobile, voice, workflow, interruption/recovery, and scale claims                                                                                                         | Complete complex/system workflows                                           |
| 3    | iOS and iPadOS Switch Control plus Android Switch Access lanes                                                                                                                                  | Task-based switch/scanning verification                                     |

The machine-readable policy contains the full lane ids, exact fixed environment axes, permitted coverage ids, and current/previous pair constraints. The campaign generator and maturity validator have a drift test; changing one without the other fails the focused release-gate suite.

## Execution sequence

1. Prepare from the exact candidate commit with a clean or explicitly recorded dirty state.
2. Confirm each item Risk Class and required sessions against the generated catalog.
3. Assign testers with access to the exact platform/AT lane. Assign a different reviewer for every Risk Class 3 record.
4. Fill exact numeric versions and candidate digests before executing tasks.
5. Execute every generated task; record observed behavior and honest Pass, Fail, or permitted Not applicable outcomes.
6. Capture sanitized immutable artifacts and SHA-256 digests.
7. Review failures and limitations. Do not convert an upstream defect, missing device, missing version, or unexecuted task into a pass.
8. Run record validation and maturity validation. A record with any integrity or candidate-binding error contributes no coverage.
9. Promote maturity only when all exact lane–coverage claims and every other automated and manual gate pass.

## Current blockers

- Sessions have not been performed.
- Exact runtime versions, candidate digests, testers, independent Risk Class 3 reviewers, observations, outcomes, and artifacts have not been recorded.
- Therefore no generated item has complete manual evidence and no Stable claim may rely on this campaign.
