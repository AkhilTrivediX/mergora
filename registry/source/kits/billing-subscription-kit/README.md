# Billing Subscription Kit

This source-only workflow provides native plan selection and reset, invoice-table presentation, a consumer-supplied payment-method form shell, and an explicit cancellation review. Repeated instances own unique labelled-region IDs, and read-only mode disables and cancels reset without selection callbacks or mutation. It deliberately bundles no payment SDK, secret, price calculation, tax engine, ledger, or provider integration.

## Mergora advantage

Consumers can opt into a plan-change preview that explains their own authoritative calculation before submission. Payment-method content and cancellation review are separate opt-ins. Disabling each enhancement removes its renderer, controls, callbacks, confirmation state, and accessibility output while native plan choice and invoice reading remain intact.

## Status

Current status is `source-present-unreleased`. Generated parity, dependency closure, clean-consumer lifecycle evidence, packed-consumer and browser gates, financial/security/privacy/legal review, payment-provider and PCI-scope review, manual assistive-technology records, and an approved Quality Passport remain blockers.
