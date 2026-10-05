import type { ListDto } from '@lupira/tasks-api/models';
import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import { TASK_LIST } from '../../domain/ops';

/** Every visible list, active and archived, unordered: display order lives inside the docs. */
export async function allLists(tx: Tx): Promise<ListDto[]> {
  const rows = await tx.all<{ local: string }>(
    'SELECT local FROM docs WHERE aggregate = ? AND local IS NOT NULL', [TASK_LIST]);
  return rows.map(r => (JSON.parse(r.local) as { doc: ListDto }).doc);
}
