import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LIST_POLL_MS } from '../../config';
import { onlineManager } from '@tanstack/react-query';
import { syncNow } from '../../state/syncStatus';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

/**
 * Keep an open list fresh: while its screen is focused and the app is foregrounded, sync every
 * LIST_POLL_MS. A sync pushes, then pulls only what changed since the last cursor.
 */
export function useListPolling(listId: string): void {
  useFocusEffect(() => {
    if (LIST_POLL_MS <= 0) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Self-scheduling timeout, not setInterval: at most one pull in flight, and a slow tick
    // stretches the cadence instead of stacking requests.
    const schedule = () => { timer = setTimeout(() => void tick(), LIST_POLL_MS); };

    const tick = async () => {
      const online = onlineManager.isOnline();
      const state = AppState.currentState;
      // Skip the request while offline or backgrounded, but keep the chain alive — a regained
      // connection or a foreground already triggers a full sync of its own. Logged because both
      // gates are otherwise invisible: a wrongly-stuck one looks exactly like "polling is broken".
      if (!online || state !== 'active') {
        logDebug('poll:skip', online ? `appState=${state}` : 'offline');
      } else {
        // Failures are surfaced by the sync banner, never thrown, so the loop survives them.
        await syncNow();
        logDebug('poll', listId);
      }
      if (!stopped) schedule();
    };

    schedule();
    return () => { stopped = true; clearTimeout(timer); };
  });
}
