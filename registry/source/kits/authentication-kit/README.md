# Authentication Kit

This source-only workflow composes canonical Mergora fields, password, OTP, and button controls around native forms for sign in, sign up, password reset, passkey, MFA, and recovery-code paths. Mutable forms preserve native reset, while read-only mode removes the reset action and cancels programmatic reset without changing values. The consumer owns the identity provider, network, credentials, sessions, authorization, security policy, and every side effect.

## Mergora advantage

Optional flow navigation makes only consumer-enabled recovery paths visible. Optional rate-limit recovery reports when another attempt becomes available and invokes its readiness callback exactly once. Optional security context keeps the ownership boundary visible. Each enhancement defaults off; disabling it removes its UI, timers, callbacks, and accessibility output while the current native form remains usable.

## Status

Current status is `source-present-unreleased`. Generated parity, dependency closure, clean-consumer lifecycle evidence, password-manager and passkey-device matrices, browser and packed-consumer gates, security and privacy review, manual assistive-technology records, and an approved Quality Passport remain blockers.
