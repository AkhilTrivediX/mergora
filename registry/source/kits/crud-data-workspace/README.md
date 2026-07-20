# CRUD Data Workspace

This source-only workflow composes the canonical Mergora Data Table, Dialog, Button, Badge, Alert, and Skeleton around an abort-aware consumer adapter. It includes search, category filters, saved views, row and bulk selection, create/edit forms, permission-aware controls, safe deletion confirmation, optimistic and pessimistic mutations, cancellation, failure rollback, and undo integration.

## Mergora advantage

Saved views, bulk actions, optimistic mutations, adapter-backed delete undo, and the mutation timeline are separate opt-ins. Disabling them removes their controls, requests, callbacks, announcements, and selection semantics while the predictable searchable table and pessimistic create/edit/delete paths remain usable. Failed optimistic changes restore the exact prior snapshot and explain the recovery.

## Status

Current status is `source-present-unreleased`. Generated parity, dependency closure, clean-consumer lifecycle evidence, packed consumers, large-data and transactional conflict matrices, authorization/security/privacy review, current manual assistive-technology evidence, and an approved Quality Passport remain blockers.
