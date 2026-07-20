import { SITE_PREFERENCE_STORAGE_KEYS } from "./site-preferences";

export const MERGORA_LOCAL_DATA = Object.freeze([
  { key: SITE_PREFERENCE_STORAGE_KEYS.theme, label: "Theme preference" },
  { key: SITE_PREFERENCE_STORAGE_KEYS.density, label: "Density preference" },
  { key: SITE_PREFERENCE_STORAGE_KEYS.direction, label: "Direction preference" },
  { key: SITE_PREFERENCE_STORAGE_KEYS.motion, label: "Motion preference" },
  { key: "mergora.install-basket.v2", label: "Current install basket" },
  { key: "mergora.install-basket.v1", label: "Legacy install basket migration data" },
  { key: "mergora.studio.state.v2", label: "Current Studio draft" },
  { key: "mergora.studio.state.v1", label: "Legacy Studio migration data" },
] as const);

export interface LocalDataClearResult {
  readonly failed: readonly string[];
  readonly removed: readonly string[];
}

export function clearMergoraLocalData(storage: Pick<Storage, "removeItem">): LocalDataClearResult {
  const failed: string[] = [];
  const removed: string[] = [];
  for (const { key } of MERGORA_LOCAL_DATA) {
    try {
      storage.removeItem(key);
      removed.push(key);
    } catch {
      failed.push(key);
    }
  }
  return { failed, removed };
}
