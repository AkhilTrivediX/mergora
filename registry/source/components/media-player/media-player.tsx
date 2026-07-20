"use client";

import "./media-player.css";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type MediaHTMLAttributes,
  type ReactNode,
} from "react";

export interface MediaTrack {
  /** Stable unique track identifier used for deterministic rendering. */
  readonly id: string;
  /** Native HTML track kind defining captions, subtitles, descriptions, chapters, or metadata. */
  readonly kind: "captions" | "chapters" | "descriptions" | "metadata" | "subtitles";
  /** Human-readable track label exposed by native media controls. */
  readonly label: string;
  /** Track source URL evaluated by the same source policy as media and poster URLs. */
  readonly src: string;
  /** BCP 47 language tag supplied to the native track element. */
  readonly srcLang: string;
  /** Whether this track is the default native selection for its kind. */
  readonly default?: boolean;
}

export interface MediaChapter {
  /** Stable unique chapter identifier used for navigation rendering. */
  readonly id: string;
  /** Human-readable chapter name shown in navigation. */
  readonly label: string;
  /** Finite non-negative media time in seconds used for seeking. */
  readonly startTime: number;
}

export interface MediaPlayerProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Selects the native audio or video element and associated presentation. */
  readonly kind: "audio" | "video";
  /** Media source URL evaluated before the native element is mounted. */
  readonly src: string;
  /** Required accessible and visible media player name. */
  readonly label: string;
  /** Optional video poster URL evaluated by the shared source policy. */
  readonly poster?: string;
  /** Native text tracks with unique IDs and policy-validated source URLs. */
  readonly tracks?: readonly MediaTrack[];
  /** Consumer-owned transcript content rendered only when transcript disclosure is enabled. */
  readonly transcript?: ReactNode;
  /** Adds transcript disclosure and description linkage; false removes both semantics. */
  readonly showTranscript?: boolean;
  /** Ordered chapter destinations with unique IDs and non-negative start times. */
  readonly chapters?: readonly MediaChapter[];
  /** Adds chapter seek navigation; false removes its UI and seek events. */
  readonly showChapterNavigation?: boolean;
  /** Adds throttled polite time announcements; false removes live output and update work. */
  readonly showTimeAnnouncements?: boolean;
  /** Minimum five-second bucket interval between enabled time announcements. */
  readonly announcementInterval?: number;
  /** Builds enabled time-announcement copy from current time and duration in seconds. */
  readonly formatTimeAnnouncement?: (currentTime: number, duration: number) => string;
  /** Consumer source allow policy run against media, poster, and every track URL. */
  readonly validateSource?: (source: string) => boolean;
  /** Recovery content announced when any source fails the allow policy. */
  readonly sourceRejectedFallback?: ReactNode;
  /** Native audio/video attributes except source, controls, children, and autoplay owned by the contract. */
  readonly mediaProps?: Omit<
    MediaHTMLAttributes<HTMLMediaElement>,
    "autoPlay" | "children" | "controls" | "src"
  >;
}

function classes(...values: readonly (false | string | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export function formatMediaTime(seconds: number, locale = "en-US"): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const rounded = Math.floor(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;
  const digits = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false });
  return hours > 0
    ? `${hours}:${digits.format(minutes)}:${digits.format(remainder)}`
    : `${minutes}:${digits.format(remainder)}`;
}

export function defaultMediaSourcePolicy(source: string): boolean {
  const trimmed = source.trim();
  return trimmed.length > 0 && !/^(?:javascript|vbscript):/iu.test(trimmed);
}

export const MediaPlayer = forwardRef<HTMLDivElement, MediaPlayerProps>(function MediaPlayer(
  {
    kind,
    src,
    label,
    poster,
    tracks = [],
    transcript,
    showTranscript = false,
    chapters = [],
    showChapterNavigation = false,
    showTimeAnnouncements = false,
    announcementInterval = 30,
    formatTimeAnnouncement = (currentTime, duration) =>
      `${formatMediaTime(currentTime)} elapsed of ${formatMediaTime(duration)}`,
    validateSource,
    sourceRejectedFallback = "Media source was rejected by the application policy.",
    mediaProps,
    className,
    ...props
  },
  ref,
) {
  if (label.trim().length === 0) {
    throw new RangeError("Mergora MediaPlayer requires a non-empty label.");
  }
  if (!Number.isFinite(announcementInterval) || announcementInterval < 5) {
    throw new RangeError("Mergora MediaPlayer announcementInterval must be at least 5 seconds.");
  }
  if (
    chapters.some(
      (chapter) =>
        chapter.id.trim().length === 0 ||
        chapter.label.trim().length === 0 ||
        !Number.isFinite(chapter.startTime) ||
        chapter.startTime < 0,
    )
  ) {
    throw new RangeError(
      "Mergora MediaPlayer chapters require non-empty ids and labels plus finite non-negative start times.",
    );
  }
  if (new Set(chapters.map((chapter) => chapter.id)).size !== chapters.length) {
    throw new RangeError("Mergora MediaPlayer chapter ids must be unique.");
  }
  if (new Set(tracks.map((track) => track.id)).size !== tracks.length) {
    throw new RangeError("Mergora MediaPlayer track ids must be unique.");
  }
  if (
    tracks.some(
      (track) =>
        track.id.trim().length === 0 ||
        track.label.trim().length === 0 ||
        track.src.trim().length === 0 ||
        track.srcLang.trim().length === 0,
    )
  ) {
    throw new RangeError(
      "Mergora MediaPlayer tracks require non-empty ids, labels, sources, and language tags.",
    );
  }
  const sourcePolicy = validateSource ?? defaultMediaSourcePolicy;
  const accepted = [src, poster, ...tracks.map((track) => track.src)]
    .filter((source): source is string => source !== undefined)
    .every((source) => sourcePolicy(source));
  const id = useId().replaceAll(":", "");
  const transcriptId = `mrg-media-player-${id}-transcript`;
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const announcedBucketRef = useRef(-1);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    announcedBucketRef.current = -1;
    setAnnouncement("");
  }, [showTimeAnnouncements, src]);
  const describedBy = [mediaProps?.["aria-describedby"], showTranscript ? transcriptId : undefined]
    .filter(Boolean)
    .join(" ");
  const sharedMediaProps = {
    ...mediaProps,
    "aria-describedby": describedBy.length === 0 ? undefined : describedBy,
    "aria-label": label,
    className: classes("mrg-media-player__media", mediaProps?.className),
    controls: true,
    "data-slot": "media-player-media",
    onTimeUpdate: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      mediaProps?.onTimeUpdate?.(event);
      if (!showTimeAnnouncements) return;
      const media = event.currentTarget;
      const bucket = Math.floor(media.currentTime / announcementInterval);
      if (bucket === announcedBucketRef.current || media.currentTime < 1) return;
      announcedBucketRef.current = bucket;
      setAnnouncement(formatTimeAnnouncement(media.currentTime, media.duration));
    },
    preload: mediaProps?.preload ?? "metadata",
    src,
  };

  return (
    <div
      {...props}
      ref={ref}
      className={classes("mrg-media-player", className)}
      data-kind={kind}
      data-slot="media-player"
      data-source={accepted ? "accepted" : "rejected"}
    >
      <div className="mrg-media-player__heading">
        <strong>{label}</strong>
        <span>{kind === "video" ? "Video" : "Audio"} · native controls</span>
      </div>
      {accepted ? (
        kind === "video" ? (
          <video
            {...(sharedMediaProps as React.VideoHTMLAttributes<HTMLVideoElement>)}
            poster={poster}
            ref={(node) => {
              mediaRef.current = node;
            }}
          >
            {tracks.map((track) => (
              <track
                default={track.default}
                key={track.id}
                kind={track.kind}
                label={track.label}
                src={track.src}
                srcLang={track.srcLang}
              />
            ))}
          </video>
        ) : (
          <audio
            {...(sharedMediaProps as React.AudioHTMLAttributes<HTMLAudioElement>)}
            ref={(node) => {
              mediaRef.current = node;
            }}
          >
            {tracks.map((track) => (
              <track
                default={track.default}
                key={track.id}
                kind={track.kind}
                label={track.label}
                src={track.src}
                srcLang={track.srcLang}
              />
            ))}
          </audio>
        )
      ) : (
        <div className="mrg-media-player__error" role="alert">
          {sourceRejectedFallback}
        </div>
      )}
      {accepted && showChapterNavigation && chapters.length > 0 ? (
        <nav aria-label={`${label} chapters`} data-slot="media-player-chapters">
          <ol>
            {chapters.map((chapter) => (
              <li key={chapter.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (mediaRef.current !== null) mediaRef.current.currentTime = chapter.startTime;
                  }}
                >
                  <span>{chapter.label}</span>
                  <time>{formatMediaTime(chapter.startTime)}</time>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      {showTranscript ? (
        <details
          className="mrg-media-player__transcript"
          data-slot="media-player-transcript"
          id={transcriptId}
        >
          <summary>Transcript</summary>
          <div>{transcript ?? "No transcript was supplied."}</div>
        </details>
      ) : null}
      {accepted && showTimeAnnouncements ? (
        <output
          aria-live="polite"
          className="mrg-media-player__announcement"
          data-slot="media-player-announcement"
        >
          {announcement}
        </output>
      ) : null}
    </div>
  );
});
