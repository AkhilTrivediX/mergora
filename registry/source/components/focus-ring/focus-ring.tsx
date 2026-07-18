import { forwardRef, type ReactElement } from "react";

import { Slot, type SlotProps } from "../slot/index.js";
import "./focus-ring.css";

export interface FocusRingProps extends Omit<SlotProps, "data-slot"> {
  /** Adds an inner contrast layer for controls rendered on unpredictable surfaces. */
  readonly contrast?: "standard" | "strong";
}

export const FocusRing = forwardRef<HTMLElement, FocusRingProps>(function FocusRing(
  { children, contrast = "standard", ...slotProps },
  ref,
): ReactElement {
  return (
    <Slot {...slotProps} ref={ref} data-focus-ring="true" data-focus-ring-contrast={contrast}>
      {children}
    </Slot>
  );
});

FocusRing.displayName = "FocusRing";
