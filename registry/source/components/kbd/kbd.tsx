import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { useMergoraMessage } from "../provider/index.js";
import "./kbd.css";

export type KbdPlatform = "generic" | "mac" | "windows" | "linux";

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  readonly spokenLabel?: string;
}

export interface KbdKey {
  readonly key: string;
  readonly spokenLabel?: string;
}

export interface KbdChordProps extends HTMLAttributes<HTMLSpanElement> {
  readonly keys: readonly KbdKey[];
  readonly label?: string;
  readonly platform?: KbdPlatform;
  readonly separator?: ReactNode;
}

const displayByPlatform: Readonly<Record<KbdPlatform, Readonly<Record<string, string>>>> = {
  generic: { Alt: "Alt", Control: "Ctrl", Enter: "Enter", Meta: "Meta", Shift: "Shift" },
  linux: { Alt: "Alt", Control: "Ctrl", Enter: "Enter", Meta: "Super", Shift: "Shift" },
  mac: { Alt: "⌥", Control: "⌃", Enter: "↩", Meta: "⌘", Shift: "⇧" },
  windows: { Alt: "Alt", Control: "Ctrl", Enter: "Enter", Meta: "Win", Shift: "Shift" },
};

export function formatKbdKey(key: string, platform: KbdPlatform): string {
  return displayByPlatform[platform][key] ?? key;
}

export const Kbd = forwardRef<HTMLElement, KbdProps>(function Kbd(
  { className, spokenLabel, ...nativeProps },
  forwardedRef,
) {
  return (
    <kbd
      {...nativeProps}
      ref={forwardedRef}
      aria-label={nativeProps["aria-label"] ?? spokenLabel}
      className={
        className === undefined || className.trim().length === 0
          ? "mrg-kbd"
          : `mrg-kbd ${className}`
      }
      data-slot="kbd"
    />
  );
});

Kbd.displayName = "Kbd";

export const KbdChord = forwardRef<HTMLSpanElement, KbdChordProps>(function KbdChord(
  { className, keys, label, platform = "generic", separator = "+", ...nativeProps },
  forwardedRef,
) {
  const spokenKeys = keys.map((item) => item.spokenLabel ?? item.key);
  const defaultSpoken = useMergoraMessage(
    "kbd.chordLabel",
    ({ values }) => {
      const messageKeys = values.keys;
      return Array.isArray(messageKeys) ? messageKeys.join(" plus ") : String(messageKeys ?? "");
    },
    { keys: spokenKeys },
  );
  const spoken = label ?? defaultSpoken;
  return (
    <span
      {...nativeProps}
      ref={forwardedRef}
      aria-label={nativeProps["aria-label"] ?? spoken}
      className={
        className === undefined || className.trim().length === 0
          ? "mrg-kbd-chord"
          : `mrg-kbd-chord ${className}`
      }
      data-platform={platform}
      data-slot="kbd-chord"
      role="group"
    >
      {keys.map((item, index) => (
        <span data-slot="kbd-chord-part" key={`${item.key}-${String(index)}`}>
          {index > 0 ? (
            <span aria-hidden="true" className="mrg-kbd-separator" data-slot="kbd-separator">
              {separator}
            </span>
          ) : null}
          <Kbd aria-hidden="true">{formatKbdKey(item.key, platform)}</Kbd>
        </span>
      ))}
    </span>
  );
});

KbdChord.displayName = "KbdChord";
