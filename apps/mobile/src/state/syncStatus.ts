import { useSyncExternalStore } from 'react';
import type { SyncStatus } from '@danbro96/lupira-sync-engine/status';
import { engine } from '../sync/engine';

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(engine.status.subscribe, engine.status.getSnapshot);
}

/** Whether a sync attempt has finished, either way: until then an empty mirror means "not loaded yet". */
export function useFirstSyncDone(): boolean {
  const { phase, lastSyncAt, lastError } = useSyncStatus();
  return phase === 'idle' && (lastSyncAt !== null || lastError !== null);
}

/** Push, then pull everything; false when it failed (the banner carries the reason). */
export async function syncNow(): Promise<boolean> {
  await engine.sync();
  return engine.status.getSnapshot().lastError === null;
}
