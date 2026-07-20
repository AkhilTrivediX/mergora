// Generated from registry/source/components/signature-pad/signature-pad.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./signature-pad.css";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

export interface SignaturePoint {
  /** Horizontal position normalized from zero at the start edge to one at the end edge. */
  readonly x: number;
  /** Vertical position normalized from zero at the top edge to one at the bottom edge. */
  readonly y: number;
}

export interface DrawnSignatureValue {
  /** Discriminant identifying normalized canvas stroke data. */
  readonly method: "draw";
  /** Immutable sequence of strokes, each containing normalized points in drawing order. */
  readonly strokes: readonly (readonly SignaturePoint[])[];
}

export interface TypedSignatureValue {
  /** Discriminant identifying the opt-in typed signature alternative. */
  readonly method: "text";
  /** Consumer-visible typed signature text serialized with the form value. */
  readonly text: string;
}

export type SignatureValue = DrawnSignatureValue | TypedSignatureValue;
export type SignatureChangeReason = "clear" | "draw" | "keyboard" | "reset" | "text" | "undo";

export interface SignaturePadProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "defaultValue" | "onChange"
> {
  /** Required visible name linked to the drawing surface and alternative inputs. */
  readonly label: ReactNode;
  /** Optional guidance linked to the drawing surface with `aria-describedby`. */
  readonly description?: ReactNode;
  /** Controlled serialized signature value; use with `onValueChange`. */
  readonly value?: SignatureValue;
  /** Initial signature value for uncontrolled use and native form reset. */
  readonly defaultValue?: SignatureValue;
  /** Reports immutable signature updates with their draw, text, clear, undo, keyboard, or reset reason. */
  readonly onValueChange?: (value: SignatureValue, reason: SignatureChangeReason) => void;
  /** Native field name for the serialized signature hidden input. */
  readonly name?: string;
  /** ID of an external form that owns signature validation and serialized fields. */
  readonly form?: string;
  /** Disables drawing and alternative input without removing existing signature context. */
  readonly disabled?: boolean;
  /** Prevents value edits while keeping existing signature content readable and submittable. */
  readonly readOnly?: boolean;
  /** Enables native required validation and focuses the drawing surface on failure. */
  readonly required?: boolean;
  /** Adds typed-signature mode; false removes its control, input, and typed completion behavior. */
  readonly enableTextAlternative?: boolean;
  /** Adds native file mode; false removes its control, file input, and file callback. */
  readonly enableFileAlternative?: boolean;
  /** Adds explicit keyboard pen buttons; the canvas keyboard interaction remains available without them. */
  readonly showKeyboardControls?: boolean;
  /** Adds the supplied legal caveat; false removes the caveat from visual and accessibility output. */
  readonly showLegalCaveat?: boolean;
  /** Adds polite change and cursor announcements; false removes the live region and update work. */
  readonly announceChanges?: boolean;
  /** Domain-neutral caveat content rendered only when `showLegalCaveat` is enabled. */
  readonly legalCaveat?: ReactNode;
  /** Receives the selected file or null from the opt-in native file alternative. */
  readonly onFileChange?: (file: File | null) => void;
  /** Native accept string applied only to the opt-in file alternative input. */
  readonly fileAccept?: string;
}

const EMPTY_SIGNATURE: DrawnSignatureValue = { method: "draw", strokes: [] };

function classes(...values: readonly (false | string | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

function clamp(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

export function serializeSignatureValue(value: SignatureValue): string {
  return JSON.stringify(value);
}

export const SignaturePad = forwardRef<HTMLDivElement, SignaturePadProps>(function SignaturePad(
  {
    label,
    description,
    value,
    defaultValue = EMPTY_SIGNATURE,
    onValueChange,
    name,
    form,
    disabled = false,
    readOnly = false,
    required = false,
    enableTextAlternative = false,
    enableFileAlternative = false,
    showKeyboardControls = false,
    showLegalCaveat = false,
    announceChanges = false,
    legalCaveat = "A drawn, typed, or uploaded mark does not by itself establish legal validity. Confirm the requirements for your workflow.",
    onFileChange,
    fileAccept = "image/png,image/jpeg,image/webp,application/pdf",
    className,
    ...props
  },
  ref,
) {
  if (value !== undefined && defaultValue !== EMPTY_SIGNATURE) {
    throw new RangeError("Mergora SignaturePad cannot receive both value and defaultValue.");
  }
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const signature = value ?? internalValue;
  const [mode, setMode] = useState<"draw" | "file" | "text">(
    signature.method === "text" && enableTextAlternative ? "text" : "draw",
  );
  const activeMode =
    (mode === "text" && !enableTextAlternative) || (mode === "file" && !enableFileAlternative)
      ? "draw"
      : mode;
  const [announcement, setAnnouncement] = useState("");
  const [requiredError, setRequiredError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);
  const drawingRef = useRef<SignaturePoint[] | null>(null);
  const keyboardCursorRef = useRef<SignaturePoint>({ x: 0.5, y: 0.5 });
  const initialValueRef = useRef(defaultValue);
  const id = useId().replaceAll(":", "");
  const labelId = `mrg-signature-pad-${id}-label`;
  const descriptionId = `mrg-signature-pad-${id}-description`;
  const requiredErrorId = `mrg-signature-pad-${id}-required-error`;

  const isComplete = (next: SignatureValue): boolean =>
    next.method === "draw"
      ? next.strokes.length > 0
      : enableTextAlternative && next.text.trim().length > 0;

  const commit = (next: SignatureValue, reason: SignatureChangeReason): void => {
    if (!controlled) setInternalValue(next);
    onValueChange?.(next, reason);
    if (isComplete(next)) setRequiredError(false);
    if (announceChanges) {
      setAnnouncement(
        reason === "clear"
          ? "Signature cleared"
          : next.method === "text"
            ? "Typed signature updated"
            : `${next.strokes.length} signature stroke${next.strokes.length === 1 ? "" : "s"}`,
      );
    }
  };

  const drawValues = signature.method === "draw" ? signature.strokes : [];
  const serializedSignature =
    signature.method === "text" && !enableTextAlternative ? EMPTY_SIGNATURE : signature;
  const redraw = (): void => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.max(1, globalThis.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext("2d");
    if (context === null) return;
    context.clearRect(0, 0, width, height);
    const ink = getComputedStyle(canvas).color;
    context.strokeStyle = ink;
    context.fillStyle = ink;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = Math.max(2, ratio * 2);
    const paint = (stroke: readonly SignaturePoint[]) => {
      if (stroke.length === 0) return;
      if (stroke.length === 1) {
        context.beginPath();
        context.arc(stroke[0]!.x * width, stroke[0]!.y * height, context.lineWidth, 0, Math.PI * 2);
        context.fill();
        return;
      }
      context.beginPath();
      stroke.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x * width, point.y * height);
        else context.lineTo(point.x * width, point.y * height);
      });
      context.stroke();
    };
    drawValues.forEach(paint);
    if (drawingRef.current !== null) paint(drawingRef.current);
  };

  useEffect(() => {
    redraw();
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  });

  useEffect(() => {
    const owner = hiddenInputRef.current?.form;
    if (owner === null || owner === undefined) return;
    const reset = () => {
      drawingRef.current = null;
      setMode(initialValueRef.current.method === "text" && enableTextAlternative ? "text" : "draw");
      setRequiredError(false);
      commit(initialValueRef.current, "reset");
      onFileChange?.(null);
    };
    owner.addEventListener("reset", reset);
    return () => owner.removeEventListener("reset", reset);
  });

  const pointFromEvent = (event: PointerEvent<HTMLCanvasElement>): SignaturePoint | null => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return null;
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  };

  const finishStroke = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const stroke = drawingRef.current;
    drawingRef.current = null;
    if (stroke !== null && stroke.length > 0) {
      commit({ method: "draw", strokes: [...drawValues, stroke] }, "draw");
    }
    redraw();
  };

  const moveKeyboardCursor = (x: number, y: number): void => {
    keyboardCursorRef.current = {
      x: clamp(keyboardCursorRef.current.x + x),
      y: clamp(keyboardCursorRef.current.y + y),
    };
    if (announceChanges) {
      setAnnouncement(
        `Pen at ${Math.round(keyboardCursorRef.current.x * 100)} percent horizontal, ${Math.round(keyboardCursorRef.current.y * 100)} percent vertical`,
      );
    }
  };

  const onCanvasKeyDown = (event: KeyboardEvent<HTMLCanvasElement>): void => {
    if (disabled || readOnly) return;
    const increment = event.shiftKey ? 0.1 : 0.02;
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    if (event.key === "ArrowLeft") moveKeyboardCursor(rtl ? increment : -increment, 0);
    else if (event.key === "ArrowRight") moveKeyboardCursor(rtl ? -increment : increment, 0);
    else if (event.key === "ArrowUp") moveKeyboardCursor(0, -increment);
    else if (event.key === "ArrowDown") moveKeyboardCursor(0, increment);
    else if (event.key === "Enter" || event.key === " ") {
      commit({ method: "draw", strokes: [...drawValues, [keyboardCursorRef.current]] }, "keyboard");
    } else return;
    event.preventDefault();
  };

  const modes = [
    { id: "draw" as const, label: "Draw" },
    ...(enableTextAlternative ? [{ id: "text" as const, label: "Type" }] : []),
    ...(enableFileAlternative ? [{ id: "file" as const, label: "Upload" }] : []),
  ];

  return (
    <div
      {...props}
      ref={ref}
      className={classes("mrg-signature-pad", className)}
      data-disabled={disabled || undefined}
      data-invalid={requiredError || undefined}
      data-mode={activeMode}
      data-readonly={readOnly || undefined}
      data-slot="signature-pad"
    >
      <div className="mrg-signature-pad__heading">
        <strong id={labelId}>{label}</strong>
        {description === undefined ? null : <span id={descriptionId}>{description}</span>}
      </div>
      {modes.length > 1 ? (
        <div
          aria-label="Signature input method"
          className="mrg-signature-pad__modes"
          role="radiogroup"
          onKeyDown={(event) => {
            if (
              event.key !== "ArrowLeft" &&
              event.key !== "ArrowRight" &&
              event.key !== "Home" &&
              event.key !== "End"
            )
              return;
            const buttons = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
            ];
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (current < 0) return;
            const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
            const nextIndex =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : (current + ((event.key === "ArrowRight") !== rtl ? 1 : -1) + buttons.length) %
                    buttons.length;
            const next = buttons[nextIndex];
            if (next === undefined) return;
            event.preventDefault();
            next.click();
            next.focus();
          }}
        >
          {modes.map((item) => (
            <button
              aria-checked={activeMode === item.id}
              disabled={disabled}
              key={item.id}
              role="radio"
              tabIndex={activeMode === item.id ? 0 : -1}
              type="button"
              onClick={() => {
                setRequiredError(false);
                setMode(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      {activeMode === "draw" ? (
        <>
          <canvas
            aria-describedby={
              [
                description === undefined ? undefined : descriptionId,
                requiredError ? requiredErrorId : undefined,
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
            aria-labelledby={labelId}
            aria-roledescription="signature drawing surface"
            className="mrg-signature-pad__canvas"
            data-slot="signature-pad-canvas"
            ref={canvasRef}
            role="group"
            tabIndex={disabled ? -1 : 0}
            onKeyDown={onCanvasKeyDown}
            onPointerCancel={finishStroke}
            onPointerDown={(event) => {
              if (disabled || readOnly || event.button !== 0) return;
              const point = pointFromEvent(event);
              if (point === null) return;
              drawingRef.current = [point];
              event.currentTarget.setPointerCapture(event.pointerId);
              redraw();
            }}
            onPointerMove={(event) => {
              if (
                drawingRef.current === null ||
                !event.currentTarget.hasPointerCapture(event.pointerId)
              )
                return;
              const point = pointFromEvent(event);
              if (point === null) return;
              drawingRef.current.push(point);
              redraw();
            }}
            onPointerUp={finishStroke}
          />
          {showKeyboardControls ? (
            <div
              aria-label="Keyboard pen controls"
              className="mrg-signature-pad__keyboard"
              data-slot="signature-pad-keyboard-controls"
              role="group"
            >
              <button
                disabled={disabled || readOnly}
                type="button"
                onClick={() => moveKeyboardCursor(-0.02, 0)}
              >
                Move start
              </button>
              <button
                disabled={disabled || readOnly}
                type="button"
                onClick={() => moveKeyboardCursor(0.02, 0)}
              >
                Move end
              </button>
              <button
                disabled={disabled || readOnly}
                type="button"
                onClick={() => moveKeyboardCursor(0, -0.02)}
              >
                Move up
              </button>
              <button
                disabled={disabled || readOnly}
                type="button"
                onClick={() => moveKeyboardCursor(0, 0.02)}
              >
                Move down
              </button>
              <button
                disabled={disabled || readOnly}
                type="button"
                onClick={() =>
                  commit(
                    { method: "draw", strokes: [...drawValues, [keyboardCursorRef.current]] },
                    "keyboard",
                  )
                }
              >
                Mark point
              </button>
            </div>
          ) : null}
          <div className="mrg-signature-pad__actions">
            <button
              disabled={disabled || readOnly || drawValues.length === 0}
              type="button"
              onClick={() => commit({ method: "draw", strokes: drawValues.slice(0, -1) }, "undo")}
            >
              Undo last stroke
            </button>
            <button
              disabled={disabled || readOnly || drawValues.length === 0}
              type="button"
              onClick={() => commit(EMPTY_SIGNATURE, "clear")}
            >
              Clear signature
            </button>
          </div>
          <input
            aria-label="Signature completion"
            className="mrg-signature-pad__validation-proxy"
            disabled={disabled || readOnly}
            form={form}
            required={required}
            tabIndex={-1}
            type="text"
            value={isComplete(signature) ? "signed" : ""}
            onChange={() => undefined}
            onInvalid={(event) => {
              event.preventDefault();
              setRequiredError(true);
              requestAnimationFrame(() => canvasRef.current?.focus());
            }}
          />
        </>
      ) : activeMode === "text" ? (
        <label className="mrg-signature-pad__text">
          <span>Typed signature</span>
          <input
            disabled={disabled}
            required={required}
            readOnly={readOnly}
            type="text"
            value={signature.method === "text" ? signature.text : ""}
            onChange={(event) =>
              commit({ method: "text", text: event.currentTarget.value }, "text")
            }
          />
        </label>
      ) : (
        <label className="mrg-signature-pad__file">
          <span>Signature file</span>
          <input
            accept={fileAccept}
            disabled={disabled || readOnly}
            form={form}
            name={name === undefined ? undefined : `${name}File`}
            required={required}
            type="file"
            onChange={(event) => onFileChange?.(event.currentTarget.files?.[0] ?? null)}
          />
          <small>
            File bytes are submitted natively. The application must validate type, content,
            authorization, and retention.
          </small>
        </label>
      )}
      <input
        data-slot="signature-pad-input"
        disabled={disabled || activeMode === "file"}
        form={form}
        name={name}
        ref={hiddenInputRef}
        type="hidden"
        value={serializeSignatureValue(serializedSignature)}
      />
      {requiredError ? (
        <p className="mrg-signature-pad__error" id={requiredErrorId} role="alert">
          Add a signature before submitting.
        </p>
      ) : null}
      {showLegalCaveat ? (
        <p className="mrg-signature-pad__legal" data-slot="signature-pad-legal-caveat">
          {legalCaveat}
        </p>
      ) : null}
      {announceChanges ? (
        <output
          aria-live="polite"
          className="mrg-signature-pad__announcement"
          data-slot="signature-pad-announcement"
        >
          {announcement}
        </output>
      ) : null}
    </div>
  );
});
