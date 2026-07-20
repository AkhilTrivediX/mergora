import "./image.css";

import {
  forwardRef,
  useEffect,
  useState,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";

export type ImageLoadState = "error" | "loading" | "loaded" | "rejected";

type ImageAlternative =
  | {
      /** Controls image semantics: true hides media and fallback, while false requires meaningful alternative text. */
      readonly decorative: true;
      /** Text alternative contract: empty for a decorative image and meaningful for a non-decorative image. */
      readonly alt?: "";
    }
  | {
      /** Controls image semantics: true hides media and fallback, while false requires meaningful alternative text. */
      readonly decorative?: false;
      /** Text alternative contract: empty for a decorative image and meaningful for a non-decorative image. */
      readonly alt: string;
    };

export type ImageProps = ImageAlternative &
  Omit<HTMLAttributes<HTMLElement>, "children" | "onLoad"> & {
    /** Image source passed to the policy before an image element is mounted. */
    readonly src: string;
    /** CSS aspect ratio reserved by the media frame to reduce layout shifts. */
    readonly aspectRatio?: number | string;
    /** Object-fit behavior applied to the loaded image within its bounded frame. */
    readonly fit?: "contain" | "cover" | "none";
    /** Consumer fallback rendered after load failure or source-policy rejection. */
    readonly fallback?: ReactNode;
    /** Status text used while an accepted source is loading. */
    readonly loadingLabel?: string;
    /** Recovery text used when the browser reports an image load error. */
    readonly errorLabel?: string;
    /** Recovery text used when `sourcePolicy` rejects the source before loading. */
    readonly rejectedLabel?: string;
    /** Adds visible and live load status; false removes its UI, announcements, and state callbacks. */
    readonly showStatusRail?: boolean;
    /** Optional synchronous allow policy evaluated before the image element is created. */
    readonly sourcePolicy?: (source: string) => boolean;
    /** Reports load states only while the optional status rail enhancement is enabled. */
    readonly onLoadStateChange?: (state: ImageLoadState) => void;
    /** Native image attributes forwarded to the media element except owned source and alternative text. */
    readonly imageProps?: Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "src">;
  };

function classes(...values: readonly (false | string | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export function defaultImageSourcePolicy(source: string): boolean {
  const trimmed = source.trim();
  if (trimmed.length === 0) return false;
  if (/^(?:javascript|vbscript):/iu.test(trimmed)) return false;
  return true;
}

export const Image = forwardRef<HTMLElement, ImageProps>(function Image(
  {
    src,
    alt,
    decorative = false,
    aspectRatio,
    fit = "cover",
    fallback,
    loadingLabel = "Image loading",
    errorLabel = "Image could not be loaded",
    rejectedLabel = "Image source was rejected",
    showStatusRail = false,
    sourcePolicy,
    onLoadStateChange,
    imageProps,
    className,
    style,
    ...props
  },
  ref,
) {
  if (!decorative && (typeof alt !== "string" || alt.trim().length === 0)) {
    throw new RangeError(
      "Mergora Image requires meaningful alt text, or decorative=true with an empty alternative.",
    );
  }
  const accepted = sourcePolicy?.(src) ?? defaultImageSourcePolicy(src);
  const [state, setState] = useState<ImageLoadState>(accepted ? "loading" : "rejected");

  useEffect(() => {
    const next = accepted ? "loading" : "rejected";
    setState(next);
    if (showStatusRail) onLoadStateChange?.(next);
  }, [accepted, onLoadStateChange, showStatusRail, src]);

  const updateState = (next: ImageLoadState): void => {
    setState(next);
    if (showStatusRail) onLoadStateChange?.(next);
  };
  const statusLabel =
    state === "loading" ? loadingLabel : state === "rejected" ? rejectedLabel : errorLabel;

  return (
    <figure
      {...props}
      ref={ref}
      className={classes("mrg-image", className)}
      data-fit={fit}
      data-slot="image"
      data-state={state}
      style={{ ...style, "--mrg-image-aspect-ratio": aspectRatio } as React.CSSProperties}
    >
      <div className="mrg-image__frame" data-slot="image-frame">
        {accepted ? (
          <img
            {...imageProps}
            alt={decorative ? "" : alt}
            aria-hidden={decorative || undefined}
            className={classes("mrg-image__media", imageProps?.className)}
            data-slot="image-media"
            src={src}
            onError={(event) => {
              imageProps?.onError?.(event);
              updateState("error");
            }}
            onLoad={(event) => {
              imageProps?.onLoad?.(event);
              updateState("loaded");
            }}
          />
        ) : null}
        {state === "error" || state === "rejected" ? (
          <div
            aria-hidden={decorative || undefined}
            className="mrg-image__fallback"
            data-slot="image-fallback"
          >
            {fallback ?? <span>{statusLabel}</span>}
          </div>
        ) : null}
      </div>
      {showStatusRail ? (
        <figcaption
          aria-live={state === "error" || state === "rejected" ? "assertive" : "polite"}
          className="mrg-image__status"
          data-slot="image-status"
        >
          <span aria-hidden="true" className="mrg-image__status-mark" />
          {state === "loaded" ? "Image ready" : statusLabel}
        </figcaption>
      ) : null}
    </figure>
  );
});
