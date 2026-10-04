import { expoDb } from '@danbro96/lupira-expo-sqlite/expoDb';
import { migrate } from '@danbro96/lupira-expo-sqlite/migrate';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import { MIGRATIONS } from './schema';

const open = expoDb('lupira-tasks-offline.db', { serializeStatements: true, onRetry: message => logDebug('db:retry', message) });

let ready: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  ready ??= open()
    .then(async db => {
      await migrate(db, MIGRATIONS);
      return db;
    })
    .catch(e => {
      ready = null;
      throw e;
    });
  return ready;
}
