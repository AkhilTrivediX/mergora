// Generated from registry/source/components/image-cropper/image-cropper.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./image-cropper.css";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

export interface ImageCropValue {
  /** Crop rectangle height as a percentage of the source frame. */
  readonly height: number;
  /** Crop rectangle width as a percentage of the source frame. */
  readonly width: number;
  /** Logical horizontal crop offset as a percentage of the source frame. */
  readonly x: number;
  /** Vertical crop offset as a percentage of the source frame. */
  readonly y: number;
  /** Source preview magnification clamped from one through four. */
  readonly zoom: number;
}

export type ImageCropChangeReason = "keyboard" | "numeric" | "pointer" | "reset" | "zoom";

export interface ImageCropperProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "defaultValue" | "onChange"
> {
  /** Source image URL used for the editing stage and optional preview. */
  readonly src: string;
  /** Required meaningful alternative text for the source image. */
  readonly alt: string;
  /** Required visible name linked to the keyboard-operable crop rectangle. */
  readonly label: ReactNode;
  /** Optional guidance linked to the crop rectangle through `aria-describedby`. */
  readonly description?: ReactNode;
  /** Controlled normalized crop value; use with `onValueChange`. */
  readonly value?: ImageCropValue;
  /** Initial normalized crop for uncontrolled use and native form reset. */
  readonly defaultValue?: ImageCropValue;
  /** Reports normalized changes with pointer, keyboard, numeric, zoom, or reset reason. */
  readonly onValueChange?: (value: ImageCropValue, reason: ImageCropChangeReason) => void;
  /** Optional output crop ratio enforced while normalizing width and height. */
  readonly aspectRatio?: number;
  /** Positive source-image width-to-height ratio used for normalization and layout. */
  readonly sourceAspectRatio?: number;
  /** Positive movement and numeric-input increment, bounded at 25 percentage points. */
  readonly step?: number;
  /** Disables crop, zoom, and numeric controls while preserving current visual context. */
  readonly disabled?: boolean;
  /** Prevents value changes while retaining focusable crop review and form serialization. */
  readonly readOnly?: boolean;
  /** Native hidden-field name for the serialized normalized crop JSON. */
  readonly name?: string;
  /** ID of an external form that owns crop serialization and reset behavior. */
  readonly form?: string;
  /** Adds coordinate inputs; false removes their UI and numeric change events. */
  readonly showNumericControls?: boolean;
  /** Adds a decorative crop preview; false removes its figure and duplicate image rendering. */
  readonly showPreview?: boolean;
  /** Adds a decorative rule-of-thirds overlay; false removes its visual elements. */
  readonly showRuleOfThirds?: boolean;
  /** Visible caption for the optional crop preview figure. */
  readonly previewLabel?: string;
  /** Accessible crop-area instruction announced with current position and size. */
  readonly cropAreaLabel?: string;
}

const DEFAULT_VALUE: ImageCropValue = { x: 20, y: 20, width: 60, height: 60, zoom: 1 };

function classes(...values: readonly (false | string | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function normalizeImageCropValue(
  input: ImageCropValue,
  aspectRatio?: number,
  sourceAspectRatio = 16 / 10,
): ImageCropValue {
  let width = clamp(Number.isFinite(input.width) ? input.width : DEFAULT_VALUE.width, 5, 100);
  let height = clamp(Number.isFinite(input.height) ? input.height : DEFAULT_VALUE.height, 5, 100);
  if (aspectRatio !== undefined) {
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
      throw new RangeError("Mergora ImageCropper aspectRatio must be a positive finite number.");
    }
    if (!Number.isFinite(sourceAspectRatio) || sourceAspectRatio <= 0) {
      throw new RangeError(
        "Mergora ImageCropper sourceAspectRatio must be a positive finite number.",
      );
    }
    height = clamp((width * sourceAspectRatio) / aspectRatio, 5, 100);
    if (height === 100) width = clamp((height * aspectRatio) / sourceAspectRatio, 5, 100);
  }
  const x = clamp(Number.isFinite(input.x) ? input.x : DEFAULT_VALUE.x, 0, 100 - width);
  const y = clamp(Number.isFinite(input.y) ? input.y : DEFAULT_VALUE.y, 0, 100 - height);
  return {
    x,
    y,
    width,
    height,
    zoom: clamp(Number.isFinite(input.zoom) ? input.zoom : DEFAULT_VALUE.zoom, 1, 4),
  };
}

export const ImageCropper = forwardRef<HTMLDivElement, ImageCropperProps>(function ImageCropper(
  {
    src,
    alt,
    label,
    description,
    value,
    defaultValue = DEFAULT_VALUE,
    onValueChange,
    aspectRatio,
    sourceAspectRatio = 16 / 10,
    step = 1,
    disabled = false,
    readOnly = false,
    name,
    form,
    showNumericControls = false,
    showPreview = false,
    showRuleOfThirds = false,
    previewLabel = "Crop preview",
    cropAreaLabel = "Crop area. Use arrow keys to move it.",
    className,
    ...props
  },
  ref,
) {
  if (value !== undefined && defaultValue !== DEFAULT_VALUE && defaultValue !== undefined) {
    throw new RangeError("Mergora ImageCropper cannot receive both value and defaultValue.");
  }
  if (!Number.isFinite(step) || step <= 0 || step > 25) {
    throw new RangeError("Mergora ImageCropper step must be greater than 0 and at most 25.");
  }
  if (alt.trim().length === 0) {
    throw new RangeError("Mergora ImageCropper requires alternative text for the source image.");
  }
  if (!Number.isFinite(sourceAspectRatio) || sourceAspectRatio <= 0) {
    throw new RangeError(
      "Mergora ImageCropper sourceAspectRatio must be a positive finite number.",
    );
  }
  const controlled = value !== undefined;
  const initialValueRef = useRef(
    normalizeImageCropValue(defaultValue, aspectRatio, sourceAspectRatio),
  );
  const [internalValue, setInternalValue] = useState(initialValueRef.current);
  const crop = normalizeImageCropValue(value ?? internalValue, aspectRatio, sourceAspectRatio);
  const id = useId().replaceAll(":", "");
  const stageRef = useRef<HTMLDivElement | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const labelId = `mrg-image-cropper-${id}-label`;
  const descriptionId = `mrg-image-cropper-${id}-description`;
  const cropInstructionsId = `mrg-image-cropper-${id}-crop-instructions`;

  const commit = (next: ImageCropValue, reason: ImageCropChangeReason): void => {
    const normalized = normalizeImageCropValue(next, aspectRatio, sourceAspectRatio);
    if (!controlled) setInternalValue(normalized);
    onValueChange?.(normalized, reason);
  };

  useEffect(() => {
    const owner = hiddenInputRef.current?.form;
    if (owner === null || owner === undefined) return;
    const reset = () => commit(initialValueRef.current, "reset");
    owner.addEventListener("reset", reset);
    return () => owner.removeEventListener("reset", reset);
  });

  const onCropKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (disabled || readOnly) return;
    const multiplier = event.shiftKey ? 10 : 1;
    const delta = step * multiplier;
    const direction = getComputedStyle(event.currentTarget).direction;
    let next: ImageCropValue;
    if (event.key === "ArrowUp") next = { ...crop, y: crop.y - delta };
    else if (event.key === "ArrowDown") next = { ...crop, y: crop.y + delta };
    else if (event.key === "ArrowLeft") {
      next = { ...crop, x: crop.x + (direction === "rtl" ? delta : -delta) };
    } else if (event.key === "ArrowRight") {
      next = { ...crop, x: crop.x + (direction === "rtl" ? -delta : delta) };
    } else if (event.key === "Home") next = { ...crop, x: 0, y: 0 };
    else if (event.key === "End") next = { ...crop, x: 100 - crop.width, y: 100 - crop.height };
    else return;
    event.preventDefault();
    commit(next, "keyboard");
  };

  const pointerCoordinates = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (bounds === undefined || bounds.width === 0 || bounds.height === 0) return null;
    const physicalX = ((event.clientX - bounds.left) / bounds.width) * 100;
    return {
      x: getComputedStyle(event.currentTarget).direction === "rtl" ? 100 - physicalX : physicalX,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    };
  };

  const cropStyle = {
    "--mrg-crop-height": `${crop.height}%`,
    "--mrg-crop-width": `${crop.width}%`,
    "--mrg-crop-x": `${crop.x}%`,
    "--mrg-crop-y": `${crop.y}%`,
  } as CSSProperties;
  const stageStyle = {
    "--mrg-crop-source-aspect-ratio": sourceAspectRatio,
    "--mrg-crop-zoom": crop.zoom,
  } as CSSProperties;
  const previewStyle = {
    "--mrg-crop-preview-aspect-ratio": (crop.width * sourceAspectRatio) / crop.height,
    "--mrg-crop-preview-block-size": `${10000 / crop.height}%`,
    "--mrg-crop-preview-inline-size": `${10000 / crop.width}%`,
    "--mrg-crop-preview-x": `${(-crop.x * 100) / crop.width}%`,
    "--mrg-crop-preview-y": `${(-crop.y * 100) / crop.height}%`,
    "--mrg-crop-zoom": crop.zoom,
  } as CSSProperties;

  return (
    <div
      {...props}
      ref={ref}
      className={classes("mrg-image-cropper", className)}
      data-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
      data-slot="image-cropper"
    >
      <div className="mrg-image-cropper__heading">
        <strong id={labelId}>{label}</strong>
        {description === undefined ? null : <span id={descriptionId}>{description}</span>}
      </div>
      <span className="mrg-image-cropper__sr-only" id={cropInstructionsId}>
        {cropAreaLabel} Current position: {Math.round(crop.x)} percent horizontal and{" "}
        {Math.round(crop.y)}
        percent vertical. Current size: {Math.round(crop.width)} by {Math.round(crop.height)}{" "}
        percent.
      </span>
      <div className="mrg-image-cropper__layout">
        <div
          className="mrg-image-cropper__stage"
          data-slot="image-cropper-stage"
          ref={stageRef}
          style={stageStyle}
        >
          <img alt={alt} src={src} />
          <div aria-hidden="true" className="mrg-image-cropper__shade" />
          <div
            aria-describedby={
              description === undefined
                ? cropInstructionsId
                : `${descriptionId} ${cropInstructionsId}`
            }
            aria-labelledby={labelId}
            aria-roledescription="movable crop rectangle"
            className="mrg-image-cropper__crop"
            data-slot="image-cropper-area"
            role="group"
            style={cropStyle}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={onCropKeyDown}
            onPointerCancel={(event) => {
              if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
            }}
            onPointerDown={(event) => {
              if (disabled || readOnly || event.button !== 0) return;
              const coordinates = pointerCoordinates(event);
              if (coordinates === null) return;
              dragRef.current = {
                pointerId: event.pointerId,
                offsetX: coordinates.x - crop.x,
                offsetY: coordinates.y - crop.y,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (drag?.pointerId !== event.pointerId) return;
              const coordinates = pointerCoordinates(event);
              if (coordinates === null) return;
              commit(
                { ...crop, x: coordinates.x - drag.offsetX, y: coordinates.y - drag.offsetY },
                "pointer",
              );
            }}
            onPointerUp={(event) => {
              if (dragRef.current?.pointerId !== event.pointerId) return;
              dragRef.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
          >
            {showRuleOfThirds ? (
              <span aria-hidden="true" className="mrg-image-cropper__thirds">
                <span data-axis="inline" data-position="first" />
                <span data-axis="inline" data-position="second" />
                <span data-axis="block" data-position="first" />
                <span data-axis="block" data-position="second" />
              </span>
            ) : null}
          </div>
        </div>
        {showPreview ? (
          <figure className="mrg-image-cropper__preview" data-slot="image-cropper-preview">
            <div style={previewStyle}>
              <img alt="" aria-hidden="true" src={src} />
            </div>
            <figcaption>{previewLabel}</figcaption>
          </figure>
        ) : null}
      </div>
      <label className="mrg-image-cropper__zoom">
        <span>Zoom</span>
        <input
          aria-readonly={readOnly || undefined}
          disabled={disabled}
          max={4}
          min={1}
          step={0.1}
          type="range"
          value={crop.zoom}
          onChange={(event) => {
            if (readOnly) return;
            commit({ ...crop, zoom: event.currentTarget.valueAsNumber }, "zoom");
          }}
          onKeyDown={(event) => {
            if (readOnly) event.preventDefault();
          }}
          onPointerDown={(event) => {
            if (readOnly) event.preventDefault();
          }}
        />
        <output>{crop.zoom.toFixed(1)}×</output>
      </label>
      {showNumericControls ? (
        <fieldset className="mrg-image-cropper__numeric" data-slot="image-cropper-numeric">
          <legend>Crop coordinates in percent</legend>
          {(["x", "y", "width", "height"] as const).map((key) => (
            <label key={key}>
              <span>{key === "x" ? "Horizontal" : key === "y" ? "Vertical" : key}</span>
              <input
                disabled={disabled}
                max={100}
                min={key === "width" || key === "height" ? 5 : 0}
                readOnly={readOnly || (aspectRatio !== undefined && key === "height")}
                step={step}
                type="number"
                value={Math.round(crop[key] * 100) / 100}
                onChange={(event) =>
                  commit({ ...crop, [key]: event.currentTarget.valueAsNumber }, "numeric")
                }
              />
            </label>
          ))}
        </fieldset>
      ) : null}
      <input
        data-slot="image-cropper-input"
        disabled={disabled}
        form={form}
        name={name}
        ref={hiddenInputRef}
        type="hidden"
        value={JSON.stringify(crop)}
      />
      <p className="mrg-image-cropper__original" data-slot="image-cropper-original-note">
        The original image is preserved. Export and pixel processing remain application-controlled.
      </p>
    </div>
  );
});
