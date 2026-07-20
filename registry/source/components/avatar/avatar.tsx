import "./avatar.css";

import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useMemo,
  useState,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

export type AvatarPresence = "available" | "away" | "busy" | "offline";

export interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Human-readable identity used for the image alternative and generated initials fallback. */
  readonly name: string;
  /** Optional image source; an omitted or failed source falls back to initials or fallback content. */
  readonly src?: string;
  /** Accessible image alternative; defaults to name so the identity remains announced. */
  readonly alt?: string;
  /** Custom fallback content shown when src is absent or fails; defaults to generated initials. */
  readonly fallback?: ReactNode;
  /** Native image attributes merged onto the optional image without overriding its source or alternative. */
  readonly imageProps?: Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "src">;
  /** Adds the optional text-backed presence rail; false removes its UI and presence metadata. */
  readonly showPresence?: boolean;
  /** Presence state used by the optional rail and styling; defaults to offline. */
  readonly presence?: AvatarPresence;
  /** Localized visible presence text; defaults to the selected presence value. */
  readonly presenceLabel?: string;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}

function classes(...values: readonly (string | undefined | false)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  {
    name,
    src,
    alt,
    fallback,
    imageProps,
    showPresence = false,
    presence = "offline",
    presenceLabel = presence,
    className,
    ...props
  },
  ref,
) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const showImage = src !== undefined && src !== failedSource;
  return (
    <span
      {...props}
      ref={ref}
      className={classes("mrg-avatar", className)}
      data-slot="avatar"
      data-image={showImage || undefined}
      data-presence={showPresence ? presence : undefined}
    >
      {showImage ? (
        <img
          {...imageProps}
          src={src}
          alt={alt ?? name}
          className={classes("mrg-avatar__image", imageProps?.className)}
          data-slot="avatar-image"
          onError={(event) => {
            imageProps?.onError?.(event);
            setFailedSource(src);
          }}
        />
      ) : (
        <span
          role="img"
          aria-label={name}
          className="mrg-avatar__fallback"
          data-slot="avatar-fallback"
        >
          {fallback ?? initials(name)}
        </span>
      )}
      {showPresence ? (
        <span className="mrg-avatar__presence" data-slot="avatar-presence">
          <span aria-hidden="true" className="mrg-avatar__presence-mark" />
          <span className="mrg-avatar__presence-label">{presenceLabel}</span>
        </span>
      ) : null}
    </span>
  );
});

export interface AvatarGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Avatar elements rendered in source order inside the labelled group. */
  readonly children: ReactNode;
  /** Maximum visible avatars; omitted renders every avatar and no overflow indicator. */
  readonly maximum?: number;
  /** Localized accessible label for the count of avatars hidden by maximum. */
  readonly overflowLabel?: (hiddenCount: number) => string;
}

export const AvatarGroup = forwardRef<HTMLDivElement, AvatarGroupProps>(function AvatarGroup(
  {
    children,
    maximum,
    overflowLabel = (hiddenCount) => `${hiddenCount} more people`,
    className,
    ...props
  },
  ref,
) {
  const avatars = useMemo(
    () => Children.toArray(children).filter(isValidElement) as ReactElement<AvatarProps>[],
    [children],
  );
  const visible = maximum === undefined ? avatars : avatars.slice(0, Math.max(0, maximum));
  const hiddenCount = avatars.length - visible.length;
  return (
    <div
      {...props}
      ref={ref}
      role="group"
      className={classes("mrg-avatar-group", className)}
      data-slot="avatar-group"
    >
      {visible.map((avatar, index) =>
        cloneElement(avatar, { key: avatar.key ?? `avatar-${index}` }),
      )}
      {hiddenCount > 0 ? (
        <span className="mrg-avatar-group__overflow" data-slot="avatar-group-overflow">
          <span aria-hidden="true">+{hiddenCount}</span>
          <span className="mrg-avatar__visually-hidden">{overflowLabel(hiddenCount)}</span>
        </span>
      ) : null}
    </div>
  );
});
