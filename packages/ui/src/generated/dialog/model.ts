// Generated from registry/source/components/dialog/model.ts by @mergora-internal/source-transformer. Do not edit.
export const DIALOG_DISMISS_POLICIES = ["outside-and-escape", "escape-only", "explicit"] as const;

export type DialogDismissPolicy = (typeof DIALOG_DISMISS_POLICIES)[number];

export type DialogOpenChangeReason =
  "trigger" | "close-button" | "escape-key" | "outside-interaction" | "dismiss";

export interface DialogOpenChangeDetails {
  readonly reason: DialogOpenChangeReason;
}

export interface DialogDismissBehavior {
  readonly allowsEscape: boolean;
  readonly allowsOutsideInteraction: boolean;
}

export function getDialogDismissBehavior(policy: DialogDismissPolicy): DialogDismissBehavior {
  return {
    allowsEscape: policy !== "explicit",
    allowsOutsideInteraction: policy === "outside-and-escape",
  };
}

export function resolveDialogOpenChangeReason(
  pendingReason: DialogOpenChangeReason | null,
  nextOpen: boolean,
): DialogOpenChangeReason {
  if (pendingReason !== null) return pendingReason;
  return nextOpen ? "trigger" : "dismiss";
}

export function joinDialogClassName(base: string, className: string | undefined): string {
  return className === undefined || className.trim().length === 0 ? base : `${base} ${className}`;
}

export interface DialogNamingDiagnosticInput {
  readonly titleCount: number;
  readonly descriptionCount: number;
  readonly closeCount: number;
  readonly hasAriaLabel: boolean;
  readonly hasAriaLabelledBy: boolean;
}

export function getDialogNamingDiagnostics(input: DialogNamingDiagnosticInput): readonly string[] {
  const diagnostics: string[] = [];
  if (input.titleCount === 0 && !input.hasAriaLabel && !input.hasAriaLabelledBy) {
    diagnostics.push(
      "Dialog.Content requires Dialog.Title, aria-label, or aria-labelledby. Add a visible Dialog.Title whenever possible.",
    );
  }
  if (input.titleCount > 1) {
    diagnostics.push(
      "Dialog.Content found multiple Dialog.Title parts. Keep one title or provide one deliberate aria-labelledby target.",
    );
  }
  if (input.descriptionCount > 1) {
    diagnostics.push(
      "Dialog.Content found multiple Dialog.Description parts. Keep one description or provide an explicit aria-describedby relationship.",
    );
  }
  if (input.closeCount === 0) {
    diagnostics.push(
      "Dialog.Content requires a visible Dialog.Close so every viewport and input modality has an explicit dismissal path.",
    );
  }
  return diagnostics;
}
