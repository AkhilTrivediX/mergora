# Screen Reader Announcer

`ScreenReaderAnnouncer.Provider` owns separate polite and assertive live regions. `useAnnouncer()` queues concise localized summaries without placing an entire changing widget in a live region.

```tsx
const { announce } = useAnnouncer();

announce({ key: "upload.complete", defaultMessage: "Upload complete" }, { priority: "polite" });
```

Each priority is FIFO. Identical text—or an explicit semantic key—is deduplicated inside the configured window. Pass `dedupe: false` only when an intentional repeat conveys new user-relevant context. Assertive announcements are reserved for urgent errors that require interruption; persistent recovery information must remain visible outside the live region.

Nested providers reuse the nearest announcer and do not add another pair of live regions.

Message descriptors resolve through the nearest `MergoraProvider`. Do not include secrets or high-frequency streaming/progress text; summarize or throttle those sources before announcing.

Current status is `source-present-unreleased`. Real desktop/mobile AT timing, interruption/noise, localization, cleanup, packed-consumer, parity, Semantic Sync, Risk Class 2 manual, dogfood, and Quality Passport evidence remain required.
