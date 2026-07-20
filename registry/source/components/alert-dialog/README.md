# Alert Dialog

`AlertDialog` refines the canonical Dialog behavior for irreversible confirmation. It always uses modal `role="alertdialog"`, ignores outside interaction and Escape, and requires `leastDestructiveRef` so initial focus lands on Cancel or another safe return action.

```tsx
const cancelRef = useRef<HTMLButtonElement>(null);

<AlertDialog.Root>
  <AlertDialog.Trigger>Delete snapshot</AlertDialog.Trigger>
  <AlertDialog.Overlay>
    <AlertDialog.Content
      acknowledgementLabel="I understand that this snapshot cannot be restored."
      leastDestructiveRef={cancelRef}
    >
      <AlertDialog.Title>Delete snapshot?</AlertDialog.Title>
      <AlertDialog.Description>This permanently removes the snapshot.</AlertDialog.Description>
      <AlertDialog.Footer>
        <AlertDialog.Cancel ref={cancelRef}>Keep snapshot</AlertDialog.Cancel>
        <AlertDialog.Action onClick={deleteSnapshot}>Delete snapshot</AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Overlay>
</AlertDialog.Root>;
```

Name the affected object and consequence. Low-risk reversible actions should use undo instead. Do not use a countdown as the only warning. The destructive action activates on button completion, not pointer-down.

`acknowledgementLabel` enables an optional native checkbox that holds every `AlertDialog.Action` disabled until accepted. Use `acknowledged`, `defaultAcknowledged`, and `onAcknowledgedChange` for controlled or uncontrolled integration. Omitting the label removes the checkbox, gate, change event, and acknowledgement description from the accessibility tree.

Built-in message key: `alertDialog.cancel`, fallback `Cancel`, used as visible Cancel text when children are omitted. Current status is `source-present-unreleased`; all generated, immutable, manual, parity, Semantic Sync, Passport, and public-site evidence remains required.
