import { createSyncEngine } from '@danbro96/lupira-sync-engine/engine';
import { invalidateOnChange } from '@danbro96/lupira-expo-query/invalidateOnChange';
import { isNetworkError } from '@danbro96/lupira-http/apiError';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { getMe } from '@lupira/tasks-api/fetch/me';
import { authPort } from '../data/api/authProvider';
import { getDb } from '../data/db/expoDb';
import { TASK_ITEM, TASK_LIST } from '../domain/ops';
import { taskItemModule } from './modules/taskItem';
import { taskListModule } from './modules/taskList';
import { OUTBOX_ROOT, queryClient } from './queryClient';
import { notePulled } from './remoteChanges';

/** Best-effort `/me`: provisions the caller and resolves the principal id the reducers attribute edits to. */
async function pullMe(): Promise<void> {
  try {
    const me = await getMe();
    await authPort().applyProfile({ principalId: me.principalId, displayName: me.displayName ?? null, isAdmin: me.isAdmin });
  } catch (e) {
    if (isNetworkError(e)) throw e;
    logDebug('pullMe:error', e instanceof Error ? e.message : String(e));
  }
}

async function beforePush(): Promise<void> {
  const token = await authPort().refresh();
  if (!token && authPort().getAuthMode() !== 'dev') throw new Error('Not signed in');
  await pullMe();
}

const invalidate = invalidateOnChange(queryClient, { [TASK_LIST]: [OUTBOX_ROOT], [TASK_ITEM]: [OUTBOX_ROOT] });

export const engine = createSyncEngine({
  openDb: getDb,
  modules: [taskListModule(() => authPort().getSelf()), taskItemModule(() => authPort().getActor())],
  cacheVersion: 1,
  hooks: { beforePush },
  onChange: event => {
    if (event.origin === 'pull' && event.aggregate === TASK_ITEM) notePulled(event.ids);
    invalidate(event);
  },
});

// An ack or a park moves the queue without changing any doc, so badges follow the counts too.
let counts = '';
engine.status.subscribe(() => {
  const { pending, parked } = engine.status.getSnapshot();
  const next = `${pending}/${parked}`;
  if (next === counts) return;
  counts = next;
  void queryClient.invalidateQueries({ queryKey: [OUTBOX_ROOT] });
});

let opened: Promise<Db> | null = null;

/** The database for mirror reads, once the engine has migrated it and created the index tables. */
export function mirrorDb(): Promise<Db> {
  opened ??= engine.ready().then(getDb, (e: unknown) => {
    opened = null;
    throw e;
  });
  return opened;
}
