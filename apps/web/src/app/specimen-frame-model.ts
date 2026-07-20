export interface StorybookPointer {
  readonly exportName: string;
  readonly modulePath: string;
}

export interface StorybookChannel {
  emit(eventName: "forceRemount" | "resetStoryArgs", payload: { readonly storyId: string }): void;
}

export type StorybookResetResult = "reloaded" | "remounted";

interface StorybookPreview {
  readonly currentRender?: unknown;
  readonly ready?: unknown;
}

interface StorybookRuntime {
  readonly __STORYBOOK_ADDONS_CHANNEL__?: unknown;
  readonly __STORYBOOK_PREVIEW__?: unknown;
}

interface StorybookIndexEntry {
  readonly exportName?: unknown;
  readonly id?: unknown;
  readonly importPath?: unknown;
  readonly type?: unknown;
}

interface StorybookIndex {
  readonly entries?: unknown;
}

function importPathFor(modulePath: string): string {
  const prefix = "apps/storybook/";
  if (!modulePath.startsWith(prefix) || modulePath.includes("..")) {
    throw new Error(`Story module path is outside the Storybook workspace: ${modulePath}`);
  }
  return `./${modulePath.slice(prefix.length)}`;
}

function indexEntries(value: unknown): readonly StorybookIndexEntry[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  const entries = (value as StorybookIndex).entries;
  if (entries === null || typeof entries !== "object" || Array.isArray(entries)) return [];
  return Object.values(entries as Record<string, unknown>).filter(
    (entry): entry is StorybookIndexEntry =>
      entry !== null && typeof entry === "object" && !Array.isArray(entry),
  );
}

export function resolveStorybookId(index: unknown, pointer: StorybookPointer): string | null {
  const importPath = importPathFor(pointer.modulePath);
  const entry = indexEntries(index).find(
    (candidate) =>
      candidate.type === "story" &&
      candidate.importPath === importPath &&
      candidate.exportName === pointer.exportName,
  );
  return typeof entry?.id === "string" && entry.id.length > 0 ? entry.id : null;
}

export function resetStorybookSpecimen(
  channel: StorybookChannel | null | undefined,
  storyId: string | null | undefined,
): boolean {
  if (channel === null || channel === undefined || storyId === null || storyId === undefined) {
    return false;
  }

  try {
    channel.emit("resetStoryArgs", { storyId });
    channel.emit("forceRemount", { storyId });
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function storybookChannel(value: unknown): StorybookChannel | null {
  if (!isRecord(value) || typeof value.emit !== "function") return null;
  return value as unknown as StorybookChannel;
}

function storybookPreview(value: unknown): StorybookPreview | null {
  return isRecord(value) ? (value as StorybookPreview) : null;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isRecord(value) && typeof value.then === "function";
}

async function initializationFinishedWithin(
  initializationPromise: PromiseLike<unknown>,
  timeoutMs: number,
): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(initializationPromise).then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function resetReadyStorybookSpecimen(
  runtime: unknown,
  storyId: string | null | undefined,
  timeoutMs: number,
): Promise<boolean> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !isRecord(runtime)) return false;

  try {
    const pinnedRuntime = runtime as StorybookRuntime;
    const preview = storybookPreview(pinnedRuntime.__STORYBOOK_PREVIEW__);
    if (preview === null || typeof preview.ready !== "function") return false;
    const initializationPromise: unknown = preview.ready.call(preview);
    if (!isPromiseLike(initializationPromise)) return false;
    if (!(await initializationFinishedWithin(initializationPromise, timeoutMs))) return false;

    const currentRender = preview.currentRender;
    if (!isRecord(currentRender) || currentRender.phase !== "finished") return false;

    return resetStorybookSpecimen(
      storybookChannel(pinnedRuntime.__STORYBOOK_ADDONS_CHANNEL__),
      storyId,
    );
  } catch {
    return false;
  }
}

export async function resetStorybookSpecimenOrReload(
  runtime: unknown,
  storyId: string | null | undefined,
  reload: () => void,
  timeoutMs = 2_000,
): Promise<StorybookResetResult> {
  if (await resetReadyStorybookSpecimen(runtime, storyId, timeoutMs)) return "remounted";
  reload();
  return "reloaded";
}
