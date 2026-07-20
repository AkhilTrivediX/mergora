"use client";

import "./lightbox.css";

import {
  forwardRef,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { Dialog } from "../dialog/index.js";
import { useDirection } from "../direction/index.js";

export interface LightboxItem {
  /** Provides the stable identifier used by thumbnails and focus restoration. */
  readonly id: string;
  /** Supplies the consumer-owned image URL without initiating prefetch or storage. */
  readonly src: string;
  /** Provides non-empty alternative text for the full-size image. */
  readonly alt: string;
  /** Presents the image title in its thumbnail and modal context. */
  readonly title: ReactNode;
  /** Adds optional full-size image context without changing navigation. */
  readonly caption?: ReactNode;
}

export type LightboxChangeReason = "thumbnail" | "next" | "previous" | "first" | "last" | "close";

export interface LightboxIndexChangeDetails {
  /** Identifies thumbnail, directional, boundary, or close navigation as the cause. */
  readonly reason: LightboxChangeReason;
}

export interface LightboxProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Supplies ordered images with stable identifiers and accessible alternative text. */
  readonly items: readonly LightboxItem[];
  /** Names the gallery dialog and thumbnail navigation. */
  readonly label: string;
  /** Controls the open image index, with null representing a closed lightbox. */
  readonly openIndex?: number | null;
  /** Sets the initial open image index for uncontrolled use. */
  readonly defaultOpenIndex?: number | null;
  /** Reports controlled or uncontrolled index changes with their navigation reason. */
  readonly onOpenIndexChange?: (index: number | null, details: LightboxIndexChangeDetails) => void;
  /** Wraps previous and next navigation at collection boundaries. */
  readonly loop?: boolean;
  /** Overrides the localized label for previous-image navigation. */
  readonly previousLabel?: string;
  /** Overrides the localized label for next-image navigation. */
  readonly nextLabel?: string;
  /** Overrides the localized label for closing the gallery dialog. */
  readonly closeLabel?: string;
  /** Generates each thumbnail action label from its item and zero-based index. */
  readonly thumbnailLabel?: (item: LightboxItem, index: number) => string;
  /** Adds contextual current/total text and a concise navigation announcement. */
  readonly showPositionSummary?: boolean;
  /** Adds bounded zoom plus non-gesture pan and reset controls. */
  readonly zoomControls?: boolean;
  /** Controls zoom when zoom controls are enabled; otherwise no zoom state is exposed. */
  readonly zoom?: number;
  /** Sets initial zoom for uncontrolled zoom controls. */
  readonly defaultZoom?: number;
  /** Reports zoom changes only while the optional zoom controls are enabled. */
  readonly onZoomChange?: (zoom: number) => void;
  /** Sets the smallest zoom multiplier accepted by optional zoom controls. */
  readonly minimumZoom?: number;
  /** Sets the largest zoom multiplier accepted by optional zoom controls. */
  readonly maximumZoom?: number;
  /** Sets the multiplier increment used by optional zoom actions. */
  readonly zoomStep?: number;
  /** Adds swipe navigation while retaining buttons and keyboard navigation. */
  readonly swipeNavigation?: boolean;
}

function validateLightbox(
  items: readonly LightboxItem[],
  index: number | null | undefined,
  minimumZoom: number,
  maximumZoom: number,
  zoomStep: number,
): void {
  if (items.length === 0) throw new Error("Mergora Lightbox requires at least one item.");
  const ids = new Set<string>();
  for (const item of items) {
    if (
      item.id.trim().length === 0 ||
      item.src.trim().length === 0 ||
      item.alt.trim().length === 0
    ) {
      throw new Error("Mergora Lightbox item id, src, and alt values must be non-empty.");
    }
    if (ids.has(item.id)) throw new Error(`Mergora Lightbox item ids must be unique: ${item.id}.`);
    ids.add(item.id);
  }
  if (
    index !== undefined &&
    index !== null &&
    (!Number.isInteger(index) || index < 0 || index >= items.length)
  ) {
    throw new RangeError("Mergora Lightbox open index must identify an existing item or be null.");
  }
  if (
    !Number.isFinite(minimumZoom) ||
    !Number.isFinite(maximumZoom) ||
    !Number.isFinite(zoomStep) ||
    minimumZoom < 1 ||
    maximumZoom <= minimumZoom ||
    maximumZoom > 8 ||
    zoomStep <= 0 ||
    zoomStep > maximumZoom - minimumZoom
  ) {
    throw new RangeError(
      "Mergora Lightbox zoom bounds must be finite, ordered, and within 1x through 8x.",
    );
  }
}

function classes(...values: readonly (string | undefined | false)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export const Lightbox = forwardRef<HTMLDivElement, LightboxProps>(function Lightbox(
  {
    className,
    closeLabel = "Close gallery",
    defaultOpenIndex = null,
    defaultZoom = 1,
    items,
    label,
    loop = true,
    maximumZoom = 4,
    minimumZoom = 1,
    nextLabel = "Next image",
    onOpenIndexChange,
    onZoomChange,
    openIndex,
    previousLabel = "Previous image",
    showPositionSummary = false,
    swipeNavigation = false,
    thumbnailLabel = (item) => `Open ${typeof item.title === "string" ? item.title : item.alt}`,
    zoom,
    zoomControls = false,
    zoomStep = 0.5,
    ...nativeProps
  },
  ref,
) {
  validateLightbox(items, openIndex ?? defaultOpenIndex, minimumZoom, maximumZoom, zoomStep);
  if (label.trim().length === 0) throw new Error("Mergora Lightbox requires a non-empty label.");
  const direction = useDirection();
  const [uncontrolledIndex, setUncontrolledIndex] = useState<number | null>(defaultOpenIndex);
  const [uncontrolledZoom, setUncontrolledZoom] = useState(defaultZoom);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const swipeStart = useRef<{ pointerId: number; x: number } | null>(null);
  const currentIndex = openIndex ?? uncontrolledIndex;
  const currentItem = currentIndex === null ? null : (items[currentIndex] ?? null);
  const currentZoom = zoomControls ? (zoom ?? uncontrolledZoom) : 1;
  const canPrevious = currentIndex !== null && (loop || currentIndex > 0);
  const canNext = currentIndex !== null && (loop || currentIndex < items.length - 1);

  if (!Number.isFinite(currentZoom) || currentZoom < minimumZoom || currentZoom > maximumZoom) {
    throw new RangeError("Mergora Lightbox zoom must remain within minimumZoom and maximumZoom.");
  }

  const updateZoom = (next: number): void => {
    if (!zoomControls) return;
    const bounded = Math.min(maximumZoom, Math.max(minimumZoom, next));
    if (zoom === undefined) setUncontrolledZoom(bounded);
    if (bounded <= 1) setPan({ x: 0, y: 0 });
    onZoomChange?.(bounded);
  };

  const updateIndex = (next: number | null, reason: LightboxChangeReason): void => {
    if (openIndex === undefined) setUncontrolledIndex(next);
    if (next !== null && zoomControls) updateZoom(minimumZoom);
    setPan({ x: 0, y: 0 });
    onOpenIndexChange?.(next, { reason });
  };

  const navigate = (delta: -1 | 1, reason: "next" | "previous"): void => {
    if (currentIndex === null) return;
    const raw = currentIndex + delta;
    if (loop) updateIndex((raw + items.length) % items.length, reason);
    else if (raw >= 0 && raw < items.length) updateIndex(raw, reason);
  };

  const handleDialogKey = (event: KeyboardEvent<HTMLElement>): void => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    const previousKey = direction === "rtl" ? "ArrowRight" : "ArrowLeft";
    const nextKey = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
    if (event.key === previousKey && canPrevious) {
      event.preventDefault();
      navigate(-1, "previous");
    } else if (event.key === nextKey && canNext) {
      event.preventDefault();
      navigate(1, "next");
    } else if (event.key === "Home") {
      event.preventDefault();
      updateIndex(0, "first");
    } else if (event.key === "End") {
      event.preventDefault();
      updateIndex(items.length - 1, "last");
    }
  };

  const handleSwipeEnd = (event: PointerEvent<HTMLElement>): void => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (start?.pointerId !== event.pointerId) return;
    const delta = event.clientX - start.x;
    if (Math.abs(delta) < 48) return;
    const logicalDelta = direction === "rtl" ? -delta : delta;
    if (logicalDelta < 0 && canNext) navigate(1, "next");
    else if (logicalDelta > 0 && canPrevious) navigate(-1, "previous");
  };

  const imageStyle = {
    "--mrg-lightbox-pan-x": `${pan.x}%`,
    "--mrg-lightbox-pan-y": `${pan.y}%`,
    "--mrg-lightbox-zoom": String(currentZoom),
  } as CSSProperties;

  return (
    <div
      {...nativeProps}
      ref={ref}
      aria-label={label}
      className={classes("mrg-lightbox", className)}
      data-slot="lightbox"
      role="region"
    >
      <div className="mrg-lightbox__thumbnails" data-slot="lightbox-thumbnails">
        {items.map((item, index) => (
          <button
            ref={(node) => {
              if (node === null) triggerRefs.current.delete(item.id);
              else triggerRefs.current.set(item.id, node);
            }}
            aria-haspopup="dialog"
            aria-label={thumbnailLabel(item, index)}
            className="mrg-lightbox__thumbnail"
            data-current={currentIndex === index || undefined}
            data-slot="lightbox-thumbnail"
            key={item.id}
            onClick={(event) => {
              lastTriggerRef.current = event.currentTarget;
              updateIndex(index, "thumbnail");
            }}
            type="button"
          >
            <img alt="" src={item.src} />
          </button>
        ))}
      </div>

      <Dialog.Root
        finalFocusRef={lastTriggerRef}
        onOpenChange={(next) => {
          if (!next && currentIndex !== null) updateIndex(null, "close");
        }}
        open={currentItem !== null}
      >
        <Dialog.Overlay>
          <Dialog.Content
            className="mrg-lightbox__dialog"
            dismissPolicy="outside-and-escape"
            onKeyDownCapture={handleDialogKey}
          >
            {currentItem === null || currentIndex === null ? null : (
              <>
                <Dialog.Header>
                  <Dialog.Title>{currentItem.title}</Dialog.Title>
                  <Dialog.Description>{currentItem.caption ?? currentItem.alt}</Dialog.Description>
                </Dialog.Header>
                {showPositionSummary ? (
                  <output
                    aria-live="polite"
                    className="mrg-lightbox__position"
                    data-slot="lightbox-position-summary"
                  >
                    Image {currentIndex + 1} of {items.length}
                  </output>
                ) : null}
                <figure
                  className="mrg-lightbox__stage"
                  data-slot="lightbox-stage"
                  onPointerCancel={swipeNavigation ? () => (swipeStart.current = null) : undefined}
                  onPointerDown={
                    swipeNavigation
                      ? (event) => {
                          if (event.pointerType === "touch") {
                            swipeStart.current = { pointerId: event.pointerId, x: event.clientX };
                          }
                        }
                      : undefined
                  }
                  onPointerUp={swipeNavigation ? handleSwipeEnd : undefined}
                >
                  <img
                    alt={currentItem.alt}
                    className="mrg-lightbox__image"
                    data-slot="lightbox-image"
                    src={currentItem.src}
                    style={imageStyle}
                  />
                  {currentItem.caption === undefined ? null : (
                    <figcaption>{currentItem.caption}</figcaption>
                  )}
                </figure>
                <div
                  aria-label="Gallery navigation"
                  className="mrg-lightbox__navigation"
                  data-slot="lightbox-navigation"
                  role="group"
                >
                  <button
                    disabled={!canPrevious}
                    onClick={() => navigate(-1, "previous")}
                    type="button"
                  >
                    {previousLabel}
                  </button>
                  <button disabled={!canNext} onClick={() => navigate(1, "next")} type="button">
                    {nextLabel}
                  </button>
                </div>
                {zoomControls ? (
                  <div
                    aria-label="Image zoom and pan"
                    className="mrg-lightbox__zoom"
                    data-slot="lightbox-zoom-controls"
                    role="group"
                  >
                    <button
                      aria-label="Zoom out"
                      disabled={currentZoom <= minimumZoom}
                      onClick={() => updateZoom(currentZoom - zoomStep)}
                      type="button"
                    >
                      −
                    </button>
                    <output aria-live="polite" data-slot="lightbox-zoom-value">
                      {Math.round(currentZoom * 100)}%
                    </output>
                    <button
                      aria-label="Zoom in"
                      disabled={currentZoom >= maximumZoom}
                      onClick={() => updateZoom(currentZoom + zoomStep)}
                      type="button"
                    >
                      +
                    </button>
                    <button onClick={() => updateZoom(minimumZoom)} type="button">
                      Reset zoom
                    </button>
                    {currentZoom > 1 ? (
                      <div
                        aria-label="Pan image"
                        className="mrg-lightbox__pan"
                        data-slot="lightbox-pan-controls"
                        role="group"
                      >
                        <button
                          aria-label="Pan up"
                          onClick={() => setPan((value) => ({ ...value, y: value.y + 10 }))}
                          type="button"
                        >
                          ↑
                        </button>
                        <button
                          aria-label="Pan toward start"
                          onClick={() => setPan((value) => ({ ...value, x: value.x + 10 }))}
                          type="button"
                        >
                          ←
                        </button>
                        <button
                          aria-label="Center image"
                          onClick={() => setPan({ x: 0, y: 0 })}
                          type="button"
                        >
                          Center
                        </button>
                        <button
                          aria-label="Pan toward end"
                          onClick={() => setPan((value) => ({ ...value, x: value.x - 10 }))}
                          type="button"
                        >
                          →
                        </button>
                        <button
                          aria-label="Pan down"
                          onClick={() => setPan((value) => ({ ...value, y: value.y - 10 }))}
                          type="button"
                        >
                          ↓
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <Dialog.Footer>
                  <Dialog.Close>{closeLabel}</Dialog.Close>
                </Dialog.Footer>
              </>
            )}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Root>
    </div>
  );
});

Lightbox.displayName = "Lightbox";
