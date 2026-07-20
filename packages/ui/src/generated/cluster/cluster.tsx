// Generated from registry/source/components/cluster/cluster.tsx by @mergora-internal/source-transformer. Do not edit.
import { forwardRef, type HTMLAttributes } from "react";

import "./cluster.css";

export type ClusterGap = "none" | "xs" | "sm" | "md" | "lg";
export type ClusterAlign = "start" | "center" | "end" | "baseline" | "stretch";
export type ClusterJustify = "start" | "center" | "end" | "between";
export type ClusterOrphan = "start" | "fill";

export interface ClusterProps extends HTMLAttributes<HTMLDivElement> {
  /** Sets tokenized space between wrapped items without accepting arbitrary CSS lengths. */
  readonly gap?: ClusterGap;
  /** Aligns items on the cross axis, including a typography-friendly baseline option. */
  readonly align?: ClusterAlign;
  /** Distributes each wrapped row along the logical inline axis. */
  readonly justify?: ClusterJustify;
  /** `start` keeps an orphan on the logical leading edge; `fill` lets the final item grow. */
  readonly orphan?: ClusterOrphan;
}

function joinClusterClassName(className: string | undefined): string {
  return className === undefined || className.trim().length === 0
    ? "mrg-cluster"
    : `mrg-cluster ${className}`;
}

export const Cluster = forwardRef<HTMLDivElement, ClusterProps>(function Cluster(
  { align = "center", className, gap = "sm", justify = "start", orphan = "start", ...nativeProps },
  forwardedRef,
) {
  return (
    <div
      {...nativeProps}
      ref={forwardedRef}
      className={joinClusterClassName(className)}
      data-align={align}
      data-gap={gap}
      data-justify={justify}
      data-orphan={orphan}
      data-slot="cluster"
    />
  );
});

Cluster.displayName = "Cluster";
