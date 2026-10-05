import Constants from 'expo-constants';
import { createAppQueryClient } from '@danbro96/lupira-expo-query/queryClient';

/** Query-key root of the server-only reads (directory, share links); the mirror's roots are its aggregates. */
export const ONLINE_ROOT = 'tasks';

/** Root of the queued-change reads (row badges, Sync issues), refetched whenever the queue moves. */
export const OUTBOX_ROOT = 'outbox';

export const { queryClient, persistOptions } = createAppQueryClient({
  persistRoots: [ONLINE_ROOT],
  buster: Constants.expoConfig?.version ?? '0',
});
