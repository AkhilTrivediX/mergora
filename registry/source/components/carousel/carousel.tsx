"use client";

import "./carousel.css";

import {
  Children,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type TouchEvent,
} from "react";

export interface CarouselAutoplay {
  /** Rotation interval in milliseconds, clamped to a minimum of one second. */
  readonly interval?: number;
}

export interface CarouselProps extends Omit<HTMLAttributes<HTMLElement>, "children" | "onChange"> {
  /** Ordered slide content; each child becomes one labelled slide group. */
  readonly children: ReactNode;
  /** Accessible name applied to the carousel region. */
  readonly label: string;
  /** Localized accessible labels aligned by index with children. */
  readonly slideLabels?: readonly string[];
  /** Controlled zero-based active slide index; pair with onIndexChange. */
  readonly index?: number;
  /** Initial zero-based active slide index for uncontrolled use; defaults to zero. */
  readonly defaultIndex?: number;
  /** Reports active-slide changes and the keyboard, pointer, swipe, or autoplay reason. */
  readonly onIndexChange?: (
    index: number,
    detail: {
      /** Interaction channel that committed the next active index. */
      readonly reason: "previous" | "next" | "keyboard" | "swipe" | "autoplay";
    },
  ) => void;
  /** Wraps previous and next navigation across the first and last slides. */
  readonly loop?: boolean;
  /** Enables pausable rotation with optional timing; false removes rotation and its pause control. */
  readonly autoplay?: false | CarouselAutoplay;
  /** Adds a polite contextual slide announcement; false removes the live output entirely. */
  readonly announceSlide?: boolean;
}

function classes(...values: readonly (string | undefined | false)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export function Carousel({
  children,
  label,
  slideLabels = [],
  index,
  defaultIndex = 0,
  onIndexChange,
  loop = false,
  autoplay = false,
  announceSlide = false,
  className,
  onKeyDown: consumerOnKeyDown,
  onTouchStart: consumerOnTouchStart,
  onTouchEnd: consumerOnTouchEnd,
  onFocusCapture: consumerOnFocusCapture,
  onBlurCapture: consumerOnBlurCapture,
  onMouseEnter: consumerOnMouseEnter,
  onMouseLeave: consumerOnMouseLeave,
  ...props
}: CarouselProps): ReactElement {
  const slides = Children.toArray(children);
  const [internalIndex, setInternalIndex] = useState(() =>
    Math.min(Math.max(0, defaultIndex), Math.max(0, slides.length - 1)),
  );
  const [paused, setPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const current = Math.min(Math.max(0, index ?? internalIndex), Math.max(0, slides.length - 1));
  const touchStart = useRef<number | null>(null);
  const commit = (
    next: number,
    reason: "previous" | "next" | "keyboard" | "swipe" | "autoplay",
  ) => {
    if (slides.length === 0) return;
    const normalized = loop
      ? (next + slides.length) % slides.length
      : Math.min(Math.max(0, next), slides.length - 1);
    if (normalized === current) return;
    if (index === undefined) setInternalIndex(normalized);
    onIndexChange?.(normalized, { reason });
  };
  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (
      autoplay === false ||
      paused ||
      interactionPaused ||
      reducedMotion ||
      slides.length < 2 ||
      typeof window === "undefined"
    )
      return;
    const timer = window.setInterval(
      () => commit(current + 1, "autoplay"),
      Math.max(1000, autoplay.interval ?? 5000),
    );
    return () => window.clearInterval(timer);
  }, [autoplay, current, interactionPaused, paused, reducedMotion, slides.length]);
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    consumerOnKeyDown?.(event);
    if (event.defaultPrevented) return;
    const direction =
      event.currentTarget.ownerDocument.defaultView?.getComputedStyle(event.currentTarget)
        .direction ??
      props.dir ??
      "ltr";
    const previousKey = direction === "rtl" ? "ArrowRight" : "ArrowLeft";
    const nextKey = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
    if (event.key === previousKey) {
      event.preventDefault();
      commit(current - 1, "keyboard");
    }
    if (event.key === nextKey) {
      event.preventDefault();
      commit(current + 1, "keyboard");
    }
    if (event.key === "Home") {
      event.preventDefault();
      commit(0, "keyboard");
    }
    if (event.key === "End") {
      event.preventDefault();
      commit(slides.length - 1, "keyboard");
    }
  };
  const touchEnd = (event: TouchEvent<HTMLElement>) => {
    consumerOnTouchEnd?.(event);
    if (event.defaultPrevented) return;
    const start = touchStart.current;
    const end = event.changedTouches[0]?.clientX;
    touchStart.current = null;
    if (start === null || end === undefined || Math.abs(end - start) < 40) return;
    commit(current + (end < start ? 1 : -1), "swipe");
  };
  const activelyRotating = autoplay !== false && !paused && !interactionPaused && !reducedMotion;
  const focusCapture = (event: FocusEvent<HTMLElement>) => {
    consumerOnFocusCapture?.(event);
    if (!event.defaultPrevented) setInteractionPaused(true);
  };
  const blurCapture = (event: FocusEvent<HTMLElement>) => {
    consumerOnBlurCapture?.(event);
    if (!event.defaultPrevented && !event.currentTarget.contains(event.relatedTarget))
      setInteractionPaused(false);
  };
  const mouseEnter = (event: MouseEvent<HTMLElement>) => {
    consumerOnMouseEnter?.(event);
    if (!event.defaultPrevented) setInteractionPaused(true);
  };
  const mouseLeave = (event: MouseEvent<HTMLElement>) => {
    consumerOnMouseLeave?.(event);
    if (!event.defaultPrevented) setInteractionPaused(false);
  };
  return (
    <section
      {...props}
      aria-label={label}
      aria-roledescription="carousel"
      className={classes("mrg-carousel", className)}
      data-slot="carousel"
      tabIndex={0}
      onKeyDown={keyDown}
      onTouchStart={(event) => {
        consumerOnTouchStart?.(event);
        if (!event.defaultPrevented) touchStart.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={touchEnd}
      onFocusCapture={focusCapture}
      onBlurCapture={blurCapture}
      onMouseEnter={mouseEnter}
      onMouseLeave={mouseLeave}
    >
      <div className="mrg-carousel__viewport">
        {slides.map((slide, slideIndex) => (
          <div
            key={slideIndex}
            role="group"
            aria-roledescription="slide"
            aria-label={slideLabels[slideIndex] ?? `${slideIndex + 1} of ${slides.length}`}
            hidden={slideIndex !== current}
            className="mrg-carousel__slide"
            data-slot="carousel-slide"
          >
            {slide}
          </div>
        ))}
      </div>
      <div className="mrg-carousel__controls">
        <button
          type="button"
          disabled={!loop && current === 0}
          onClick={() => commit(current - 1, "previous")}
        >
          Previous
        </button>
        <span aria-hidden="true">
          {slides.length === 0 ? 0 : current + 1} / {slides.length}
        </span>
        <button
          type="button"
          disabled={!loop && current >= slides.length - 1}
          onClick={() => commit(current + 1, "next")}
        >
          Next
        </button>
        {autoplay !== false ? (
          <button type="button" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
            {paused ? "Resume rotation" : "Pause rotation"}
          </button>
        ) : null}
      </div>
      {announceSlide ? (
        <output
          aria-live={activelyRotating ? "off" : "polite"}
          className="mrg-carousel__announcement"
          data-slot="carousel-announcement"
        >
          Slide {slides.length === 0 ? 0 : current + 1} of {slides.length}:{" "}
          {slideLabels[current] ?? "Untitled slide"}
        </output>
      ) : null}
    </section>
  );
}
