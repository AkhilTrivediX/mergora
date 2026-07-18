import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import "mergora-tokens/tokens.css";
import "../../../registry/source/components/dialog/dialog.css";
import { Dialog } from "../../../registry/source/components/dialog/index";
import type {
  DialogDismissPolicy,
  DialogOpenChangeReason,
} from "../../../registry/source/components/dialog/index";

interface DialogSpecimenProps {
  readonly dismissPolicy?: DialogDismissPolicy;
  readonly longContent?: boolean;
  readonly rtl?: boolean;
}

function DialogSpecimen({
  dismissPolicy = "outside-and-escape",
  longContent = false,
  rtl = false,
}: DialogSpecimenProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog.Root>
      <Dialog.Trigger>{rtl ? "مراجعة التغييرات" : "Review changes"}</Dialog.Trigger>
      <Dialog.Overlay dir={rtl ? "rtl" : "ltr"}>
        <Dialog.Content dismissPolicy={dismissPolicy} initialFocusRef={closeRef}>
          <Dialog.Header>
            <Dialog.Title>{rtl ? "مراجعة التغييرات" : "Review source changes"}</Dialog.Title>
          </Dialog.Header>
          <Dialog.Description>
            {rtl
              ? "راجع الملفات المتأثرة قبل متابعة التحديث."
              : "Inspect the affected files before continuing with the update."}
          </Dialog.Description>
          {longContent ? (
            <>
              <p>
                The updater preserves local edits and reports conflicts instead of replacing
                customized source. This specimen intentionally includes enough prose to exercise
                text growth, constrained viewport height, and internal scrolling.
              </p>
              <p>
                Keyboard focus remains inside the modal while it is open. Closing returns focus to
                the Review changes trigger so the surrounding workflow resumes at a predictable
                location.
              </p>
              <p>
                At narrow widths the content uses available inline space, logical padding, safe
                areas, and a visible close action.
                LongUnbrokenContentStillWrapsWithoutCreatingTwoDimensionalScrolling.
              </p>
            </>
          ) : null}
          <Dialog.Footer>
            <Dialog.Close ref={closeRef}>{rtl ? "العودة" : "Return to diff"}</Dialog.Close>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}

function ControlledDialogSpecimen() {
  const [open, setOpen] = useState(false);
  const [lastReason, setLastReason] = useState<DialogOpenChangeReason | "none">("none");
  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <p aria-live="polite">Last open-state reason: {lastReason}</p>
      <Dialog.Root
        open={open}
        onOpenChange={(nextOpen, { reason }) => {
          setLastReason(reason);
          setOpen(nextOpen);
        }}
      >
        <Dialog.Trigger>Inspect controlled state</Dialog.Trigger>
        <Dialog.Overlay>
          <Dialog.Content dismissPolicy="escape-only" initialFocusRef={closeRef}>
            <Dialog.Header>
              <Dialog.Title>Controlled dialog</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description>
              The status outside the modal records the Mergora-owned open-change reason.
            </Dialog.Description>
            <Dialog.Footer>
              <Dialog.Close ref={closeRef}>Close controlled dialog</Dialog.Close>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Root>
    </>
  );
}

const meta = {
  component: Dialog.Root,
  parameters: {
    a11y: { test: "error" },
    docs: {
      description: {
        component:
          "Experimental P1 tracer. Browser and manual assistive-technology evidence remain intentionally unclaimed.",
      },
    },
    layout: "centered",
  },
  title: "Components/Dialog",
} satisfies Meta<typeof Dialog.Root>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultUncontrolled: Story = {
  name: "Default uncontrolled",
  render: () => <DialogSpecimen />,
};

export const ControlledReasons: Story = {
  name: "Controlled reasons",
  render: () => <ControlledDialogSpecimen />,
};

export const ExplicitDismissal: Story = {
  name: "Explicit dismissal",
  render: () => <DialogSpecimen dismissPolicy="explicit" />,
};

export const LongContent: Story = {
  name: "Long content and constrained viewport",
  render: () => <DialogSpecimen longContent />,
};

export const Rtl: Story = {
  name: "RTL",
  render: () => <DialogSpecimen rtl />,
};
