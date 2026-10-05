import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import type { ItemState } from '../../domain/itemState';
import { TASK_ITEM } from '../../domain/ops';

/** A list's live items in sort order. */
export async function itemsOfList(tx: Tx, listId: string): Promise<ItemState[]> {
  const rows = await tx.all<{ local: string }>(
    `SELECT d.local FROM item_index i JOIN docs d ON d.aggregate = ? AND d.id = i.id
     WHERE i.list_id = ? ORDER BY i.sort_order`,
    [TASK_ITEM, listId],
  );
  return rows.map(r => (JSON.parse(r.local) as { doc: ItemState }).doc);
}
