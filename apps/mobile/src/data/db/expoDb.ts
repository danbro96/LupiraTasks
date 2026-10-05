import { deleteDatabaseAsync } from 'expo-sqlite';
import { expoDb } from '@danbro96/lupira-expo-sqlite/expoDb';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

// The file the hand-rolled mirror used; its pending ops are dropped and the new file resyncs from scratch.
const LEGACY_DB = 'lupira-tasks-offline.db';

const open = expoDb('lupira-tasks.db', { serializeStatements: true, onRetry: message => logDebug('db:retry', message) });

let ready: Promise<Db> | null = null;

/** The one connection the sync engine and the mirror reads share. */
export function getDb(): Promise<Db> {
  ready ??= deleteDatabaseAsync(LEGACY_DB)
    .catch(() => undefined)
    .then(open)
    .catch(e => {
      ready = null;
      throw e;
    });
  return ready;
}
