import { forwardRef, type HTMLAttributes } from "react";

import "./container.css";

export type ContainerWidth = "prose" | "content" | "wide" | "full";
export type ContainerGutter = "none" | "compact" | "default" | "spacious";

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  /** Selects a semantic maximum width without accepting arbitrary layout strings. */
  readonly width?: ContainerWidth;
  /** Controls logical inline padding using the public spacing tokens. */
  readonly gutter?: ContainerGutter;
  /** Adds physical safe-area insets to the corresponding logical edge. */
  readonly safeArea?: boolean;
  /** Makes this element an anonymous inline-size query container. */
  readonly queryContainer?: boolean;
}

function joinContainerClassName(className: string | undefined): string {
  return className === undefined || className.trim().length === 0
    ? "mrg-container"
    : `mrg-container ${className}`;
}

export const Container = forwardRef<HTMLDivElement, ContainerProps>(function Container(
  {
    className,
    gutter = "default",
    queryContainer = false,
    safeArea = true,
    width = "content",
    ...nativeProps
  },
  forwardedRef,
) {
  return (
    <div
      {...nativeProps}
      ref={forwardedRef}
      className={joinContainerClassName(className)}
      data-gutter={gutter}
      data-query-container={queryContainer ? "true" : undefined}
      data-safe-area={safeArea ? "true" : "false"}
      data-slot="container"
      data-width={width}
    />
  );
});

Container.displayName = "Container";
