"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";

import { isSlottableChild, Slot } from "../slot/index.js";
import "./layer-manager.css";

export type LayerDismissReason = "escape";

export interface LayerDismissDetail {
  readonly id: string;
  readonly reason: LayerDismissReason;
}

export interface LayerRegistration {
  readonly id: string;
  readonly element: HTMLElement;
  readonly modal: boolean;
  readonly dismissible: boolean;
  /** False when a single external behavior engine already owns inerting and scroll prevention. */
  readonly manageEnvironment?: boolean;
  readonly onDismiss: (detail: LayerDismissDetail) => void;
}

export interface LayerManagerSnapshot {
  readonly version: number;
  readonly layerIds: readonly string[];
  readonly modalLayerIds: readonly string[];
  readonly topLayerId: string | null;
}

export interface LayerManagerApi {
  readonly registerLayer: (registration: LayerRegistration) => () => void;
  readonly updateLayer: (registration: LayerRegistration) => void;
  readonly registerApplicationRoot: (element: HTMLElement) => () => void;
  readonly dismissTopLayer: (reason: LayerDismissReason) => boolean;
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => LayerManagerSnapshot;
  readonly getLayers: () => readonly LayerRegistration[];
  readonly getApplicationRoots: () => readonly HTMLElement[];
}

export function createLayerManager(): LayerManagerApi {
  const layers = new Map<string, LayerRegistration>();
  const roots = new Set<HTMLElement>();
  const listeners = new Set<() => void>();
  let version = 0;
  let snapshot: LayerManagerSnapshot = {
    version,
    layerIds: [],
    modalLayerIds: [],
    topLayerId: null,
  };

  const emit = (): void => {
    version += 1;
    const entries = [...layers.values()];
    snapshot = {
      version,
      layerIds: entries.map((layer) => layer.id),
      modalLayerIds: entries.filter((layer) => layer.modal).map((layer) => layer.id),
      topLayerId: entries.at(-1)?.id ?? null,
    };
    listeners.forEach((listener) => listener());
  };

  return {
    registerLayer(registration) {
      if (layers.has(registration.id)) {
        throw new Error(`Mergora LayerManager received duplicate layer id "${registration.id}".`);
      }
      layers.set(registration.id, registration);
      emit();
      return () => {
        if (layers.delete(registration.id)) emit();
      };
    },
    updateLayer(registration) {
      const current = layers.get(registration.id);
      if (current === undefined) return;
      if (
        current.element === registration.element &&
        current.modal === registration.modal &&
        current.dismissible === registration.dismissible &&
        current.manageEnvironment === registration.manageEnvironment &&
        current.onDismiss === registration.onDismiss
      ) {
        return;
      }
      layers.set(registration.id, registration);
      emit();
    },
    registerApplicationRoot(element) {
      roots.add(element);
      emit();
      return () => {
        if (roots.delete(element)) emit();
      };
    },
    dismissTopLayer(reason) {
      const top = [...layers.values()].at(-1);
      if (top === undefined || !top.dismissible) return false;
      top.onDismiss({ id: top.id, reason });
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
    getLayers() {
      return [...layers.values()];
    },
    getApplicationRoots() {
      return [...roots];
    },
  };
}

const LayerManagerContext = createContext<LayerManagerApi | null>(null);
const emptySnapshot: LayerManagerSnapshot = {
  version: 0,
  layerIds: [],
  modalLayerIds: [],
  topLayerId: null,
};

const environmentObjectIds = new WeakMap<object, number>();
let nextEnvironmentObjectId = 1;

function environmentObjectId(value: object): number {
  const current = environmentObjectIds.get(value);
  if (current !== undefined) return current;
  const created = nextEnvironmentObjectId;
  nextEnvironmentObjectId += 1;
  environmentObjectIds.set(value, created);
  return created;
}

/**
 * Only environment-managed modal identity/order and application-root identity can change
 * inerting or scroll ownership. Non-modal overlays and externally managed modal layers still
 * update the public stack snapshot, but must not momentarily unlock and re-lock the page.
 */
function modalEnvironmentKey(manager: LayerManagerApi): string {
  const layers = manager
    .getLayers()
    .filter((layer) => layer.modal && layer.manageEnvironment !== false)
    .map((layer) => `${layer.id}:${environmentObjectId(layer.element)}`);
  if (layers.length === 0) return "";
  const roots = manager
    .getApplicationRoots()
    .map((root) => environmentObjectId(root))
    .sort((left, right) => left - right);
  return `${layers.join("|")}::${roots.join("|")}`;
}

function composeRefs<T>(...refs: readonly (Ref<T> | undefined)[]): (node: T | null) => void {
  return (node) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") ref(node);
      else if (ref !== null && ref !== undefined) (ref as { current: T | null }).current = node;
    });
  };
}

interface InertRecord {
  readonly element: HTMLElement;
  readonly hadAttribute: boolean;
  readonly value: boolean;
}

function applyModalEnvironment(manager: LayerManagerApi, scrollLock: boolean): () => void {
  const modalLayers = manager
    .getLayers()
    .filter((layer) => layer.modal && layer.manageEnvironment !== false);
  if (modalLayers.length === 0) return () => undefined;
  const topModal = modalLayers.at(-1)!;
  const inertRecords: InertRecord[] = [];

  for (const root of manager.getApplicationRoots()) {
    if (root.contains(topModal.element) || topModal.element.contains(root)) continue;
    inertRecords.push({
      element: root,
      hadAttribute: root.hasAttribute("inert"),
      value: root.inert,
    });
    root.inert = true;
    root.setAttribute("inert", "");
  }

  if (!scrollLock) {
    return () => {
      inertRecords.forEach(({ element, hadAttribute, value }) => {
        element.inert = value;
        if (hadAttribute) element.setAttribute("inert", "");
        else element.removeAttribute("inert");
      });
    };
  }

  const body = document.body;
  const root = document.documentElement;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const previous = {
    left: body.style.left,
    overflow: body.style.overflow,
    paddingInlineEnd: body.style.paddingInlineEnd,
    position: body.style.position,
    top: body.style.top,
    width: body.style.width,
  };
  const priorScrollLockAttribute = root.getAttribute("data-mergora-scroll-locked");
  const scrollbar = Math.max(0, window.innerWidth - root.clientWidth);
  const computedPadding = Number.parseFloat(getComputedStyle(body).paddingInlineEnd) || 0;

  body.style.position = "fixed";
  body.style.top = `${-scrollY}px`;
  body.style.left = `${-scrollX}px`;
  body.style.width = "100%";
  body.style.overflow = "hidden";
  if (scrollbar > 0) body.style.paddingInlineEnd = `${computedPadding + scrollbar}px`;
  root.setAttribute("data-mergora-scroll-locked", "true");

  return () => {
    inertRecords.forEach(({ element, hadAttribute, value }) => {
      element.inert = value;
      if (hadAttribute) element.setAttribute("inert", "");
      else element.removeAttribute("inert");
    });
    body.style.position = previous.position;
    body.style.top = previous.top;
    body.style.left = previous.left;
    body.style.width = previous.width;
    body.style.overflow = previous.overflow;
    body.style.paddingInlineEnd = previous.paddingInlineEnd;
    if (priorScrollLockAttribute === null) root.removeAttribute("data-mergora-scroll-locked");
    else root.setAttribute("data-mergora-scroll-locked", priorScrollLockAttribute);
    window.scrollTo(scrollX, scrollY);
  };
}

export interface LayerManagerProviderProps {
  readonly children: ReactNode;
  readonly scrollLock?: boolean;
}

export function LayerManagerProvider({
  children,
  scrollLock = true,
}: LayerManagerProviderProps): ReactElement {
  const parent = useContext(LayerManagerContext);
  const owned = useMemo(() => createLayerManager(), []);
  const manager = parent ?? owned;
  const ownsManager = manager === owned;
  useSyncExternalStore(manager.subscribe, manager.getSnapshot, () => emptySnapshot);
  // Reading the snapshot subscribes this provider. The derived key deliberately excludes
  // unrelated stack changes while still changing when managed modal/root identity changes.
  const environmentKey = modalEnvironmentKey(manager);

  useEffect(() => {
    if (!ownsManager) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }
      if (manager.dismissTopLayer("escape")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [manager, ownsManager]);

  useEffect(() => {
    if (!ownsManager || environmentKey === "") return undefined;
    return applyModalEnvironment(manager, scrollLock);
  }, [environmentKey, manager, ownsManager, scrollLock]);

  if (!ownsManager) return <>{children}</>;
  return <LayerManagerContext.Provider value={manager}>{children}</LayerManagerContext.Provider>;
}

export function useLayerManager(): LayerManagerApi {
  const manager = useContext(LayerManagerContext);
  if (manager === null) {
    throw new Error("Mergora Layer components require a LayerManager.Provider ancestor.");
  }
  return manager;
}

interface SharedBoundaryProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  readonly asChild?: boolean;
  readonly children: ReactNode;
}

export type LayerApplicationProps = SharedBoundaryProps;

export const LayerApplication = forwardRef<HTMLElement, LayerApplicationProps>(
  function LayerApplication({ asChild = false, children, ...nativeProps }, forwardedRef) {
    const manager = useLayerManager();
    const [element, setElement] = useState<HTMLElement | null>(null);
    useEffect(
      () => (element === null ? undefined : manager.registerApplicationRoot(element)),
      [element, manager],
    );
    const props = {
      ...nativeProps,
      ref: composeRefs(forwardedRef, setElement),
      "data-slot": "layer-application",
    } as const;

    if (asChild) {
      if (!isSlottableChild(children)) {
        throw new Error("LayerManager.Application with asChild requires one concrete element.");
      }
      return <Slot {...props}>{children}</Slot>;
    }
    return <div {...props}>{children}</div>;
  },
);

LayerApplication.displayName = "LayerManager.Application";

export interface LayerProps extends SharedBoundaryProps {
  readonly active?: boolean;
  /** Internal/public slot identity; defaults to layer and may be preserved when composing asChild. */
  readonly "data-slot"?: string;
  readonly dismissible?: boolean;
  readonly id?: string;
  /** Disable only when one named external behavior engine owns modal inerting and scroll lock. */
  readonly manageEnvironment?: boolean;
  readonly modal?: boolean;
  readonly onDismiss?: (detail: LayerDismissDetail) => void;
}

export const Layer = forwardRef<HTMLElement, LayerProps>(function Layer(
  {
    active = true,
    asChild = false,
    children,
    "data-slot": dataSlot = "layer",
    dismissible = true,
    id: providedId,
    manageEnvironment = true,
    modal = false,
    onDismiss,
    style,
    ...nativeProps
  },
  forwardedRef,
) {
  const manager = useLayerManager();
  const reactId = useId();
  const id = providedId ?? `mrg-layer-${reactId.replaceAll(":", "")}`;
  const [element, setElement] = useState<HTMLElement | null>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const modalRef = useRef(modal);
  modalRef.current = modal;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;
  const manageEnvironmentRef = useRef(manageEnvironment);
  manageEnvironmentRef.current = manageEnvironment;
  const registrationDismiss = useMemo(
    () => (detail: LayerDismissDetail) => dismissRef.current?.(detail),
    [],
  );

  useEffect(() => {
    if (!active || element === null) return undefined;
    return manager.registerLayer({
      id,
      element,
      modal: modalRef.current,
      dismissible: dismissibleRef.current,
      manageEnvironment: manageEnvironmentRef.current,
      onDismiss: registrationDismiss,
    });
  }, [active, element, id, manager, registrationDismiss]);

  useEffect(() => {
    if (!active || element === null) return;
    manager.updateLayer({
      id,
      element,
      modal,
      dismissible,
      manageEnvironment,
      onDismiss: registrationDismiss,
    });
  }, [active, dismissible, element, id, manageEnvironment, manager, modal, registrationDismiss]);

  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    () => emptySnapshot,
  );
  const layerIndex = Math.max(0, snapshot.layerIds.indexOf(id));
  const mergedStyle = {
    ...style,
    "--mrg-layer-index": layerIndex,
  } as CSSProperties;
  const props = {
    ...nativeProps,
    ref: composeRefs(forwardedRef, setElement),
    style: mergedStyle,
    "data-layer-active": active ? "true" : "false",
    "data-layer-dismissible": dismissible ? "true" : "false",
    "data-layer-id": id,
    "data-layer-index": layerIndex,
    "data-layer-modal": modal ? "true" : "false",
    "data-layer-manages-environment": manageEnvironment ? "true" : "false",
    "data-layer-top": snapshot.topLayerId === id ? "true" : undefined,
    "data-slot": dataSlot,
  } as const;

  if (asChild) {
    if (!isSlottableChild(children)) {
      throw new Error("LayerManager.Layer with asChild requires one concrete element.");
    }
    return <Slot {...props}>{children}</Slot>;
  }
  return <div {...props}>{children}</div>;
});

Layer.displayName = "LayerManager.Layer";

export const LayerManager = {
  Provider: LayerManagerProvider,
  Application: LayerApplication,
  Layer,
} as const;
