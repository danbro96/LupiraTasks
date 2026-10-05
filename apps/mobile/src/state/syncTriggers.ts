import { defineSyncTask, startSyncTriggers } from '@danbro96/lupira-sync-engine/expo/triggers';
import { connectFocusManager } from '@danbro96/lupira-expo-query/focus';
import { connectOnlineManager } from '@danbro96/lupira-expo-query/online';
import { engine } from '../sync/engine';
import { useAuth } from './auth-store';

const BACKGROUND_TASK = 'lupira-tasks-sync';

// The headless run mounts no UI, so it loads the persisted session itself before syncing.
defineSyncTask(BACKGROUND_TASK, engine, () => useAuth.getState().load());

/** Sync now and on foreground, reconnect, sign-in and the background task. Returns the unsubscribe. */
export function startSync(): () => void {
  connectOnlineManager();
  connectFocusManager();
  return startSyncTriggers(engine, { backgroundTaskName: BACKGROUND_TASK });
}
