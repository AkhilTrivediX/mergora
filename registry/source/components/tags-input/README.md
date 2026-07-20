# Tags Input

A native-entry tag editor with predictable repeated-value serialization, reset behavior, clear removal names, bounded tokens, and Mergora focus/selection treatment.

## Mergora advantage

`recoverDuplicates` announces duplicate entry, invokes its callback only while enabled, and moves focus to the existing tag's remove action. False removes the live output, focus recovery, callback, and accessibility relationship.

Configurable delimiters support atomic multi-tag paste, `validateTag` explains recoverable syntax failures, and `reorderable` adds explicit earlier/later controls as a keyboard and touch alternative. With reordering off, those controls and reorder events do not exist. IME composition never commits an unfinished token.

## Status

`source-present-unreleased`; generated parity and complete browser/manual evidence remain blockers.
