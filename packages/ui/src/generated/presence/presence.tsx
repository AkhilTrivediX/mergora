// Generated from registry/source/components/presence/presence.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
  type ReactElement,
  type TransitionEvent,
} from "react";

import { useMergoraContext } from "../provider/index.js";
import { Slot } from "../slot/index.js";
import "./presence.css";

export type PresenceState = "entering" | "entered" | "exiting" | "unmounted";

export interface PresenceRenderState {
  readonly state: Exclude<PresenceState, "unmounted">;
  readonly present: boolean;
}

export interface PresenceProps {
  readonly present: boolean;
  readonly children: ReactElement | ((state: PresenceRenderState) => ReactElement);
  readonly exitDurationMs?: number;
  readonly initialEnter?: boolean;
  readonly onExitComplete?: () => void;
  readonly reducedMotion?: boolean;
}

export function nextPresenceState(current: PresenceState, present: boolean): PresenceState {
  if (present) return current === "entered" ? "entered" : "entering";
  if (current === "unmounted") return "unmounted";
  return "exiting";
}

export function normalizePresenceExitDeadline(exitDurationMs: number): number {
  return Number.isFinite(exitDurationMs) ? Math.max(0, exitDurationMs) : 0;
}

export function presenceEndEventReachesDeadline(
  elapsedTimeSeconds: number,
  exitDurationMs: number,
): boolean {
  const deadline = normalizePresenceExitDeadline(exitDurationMs);
  return deadline === 0 || elapsedTimeSeconds * 1_000 + 1 >= deadline;
}

export function Presence({
  children,
  exitDurationMs = 240,
  initialEnter = false,
  onExitComplete,
  present,
  reducedMotion,
}: PresenceProps): ReactElement | null {
  const context = useMergoraContext();
  const [systemPrefersReduce, setSystemPrefersReduce] = useState(false);
  useEffect(() => {
    if (context.reducedMotion !== "system" || typeof window.matchMedia !== "function") {
      setSystemPrefersReduce(false);
      return undefined;
    }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => setSystemPrefersReduce(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [context.reducedMotion]);
  const systemReduce =
    context.reducedMotion === "reduce" ||
    (context.reducedMotion === "system" && systemPrefersReduce);
  const shouldReduceMotion = reducedMotion ?? systemReduce;
  const [state, setState] = useState<PresenceState>(() =>
    present ? (initialEnter ? "entering" : "entered") : "unmounted",
  );
  const exitCallback = useRef(onExitComplete);
  exitCallback.current = onExitComplete;
  const exitCompleted = useRef(false);
  const finishExit = useCallback((): void => {
    if (exitCompleted.current) return;
    exitCompleted.current = true;
    setState("unmounted");
    exitCallback.current?.();
  }, []);

  useEffect(() => {
    if (present) {
      exitCompleted.current = false;
      setState((current) => nextPresenceState(current, true));
      const frame = requestAnimationFrame(() => setState("entered"));
      return () => cancelAnimationFrame(frame);
    }

    exitCompleted.current = false;
    setState((current) => nextPresenceState(current, false));
    return undefined;
  }, [present]);

  useEffect(() => {
    if (state !== "exiting") return undefined;
    const deadline = normalizePresenceExitDeadline(exitDurationMs);
    if (shouldReduceMotion || deadline === 0) {
      finishExit();
      return undefined;
    }
    const timer = setTimeout(finishExit, deadline);
    return () => clearTimeout(timer);
  }, [exitDurationMs, finishExit, shouldReduceMotion, state]);

  if (state === "unmounted") return null;

  const completeExit = (
    event: AnimationEvent<HTMLElement> | TransitionEvent<HTMLElement>,
  ): void => {
    if (
      state !== "exiting" ||
      event.currentTarget !== event.target ||
      !presenceEndEventReachesDeadline(event.elapsedTime, exitDurationMs)
    ) {
      return;
    }
    finishExit();
  };
  const renderState = { state, present: state !== "exiting" } as PresenceRenderState;
  const child = typeof children === "function" ? children(renderState) : children;

  return (
    <Slot
      data-slot="presence"
      data-presence={state}
      onAnimationEnd={completeExit}
      onTransitionEnd={completeExit}
    >
      {child}
    </Slot>
  );
}
