import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { syncItems } from '@lupira/tasks-api/fetch/sync';
import type { ItemSyncChange } from '@lupira/tasks-api/models';
import { applyItemEvent } from '../../domain/itemLww';
import { itemFromWire } from '../../domain/itemMap';
import { emptyItemState, type ItemState } from '../../domain/itemState';
import { itemEventOf, TASK_ITEM, type ItemOp } from '../../domain/ops';
import { replayOp } from '../replayOp';

/** `actor` is the signed-in user's principal id, recorded as created/completed-by. */
export function taskItemModule(actor: () => string | null): AggregateModule<ItemState, null, ItemOp, ItemSyncChange> {
  return {
    aggregate: TASK_ITEM,
    feed: {
      fetch: since => syncItems(since === null ? {} : { since }),
      fromWire: change => ({ id: change.item.id, state: { doc: itemFromWire(change), guards: null } }),
    },
    reduce: (state, op) => {
      const event = itemEventOf(op);
      // An edit to an item that is gone must not seed a ghost from empty state; its replay parks instead.
      if (!state && event.type !== 'ItemAdded') return null;
      return { doc: applyItemEvent(state?.doc ?? emptyItemState(), event, actor()), guards: null };
    },
    replay: replayOp,
    holdKeyOf: op => op.listId,
    index: {
      version: 1,
      tables: ['item_index'],
      ddl: `CREATE TABLE item_index (id TEXT PRIMARY KEY, list_id TEXT NOT NULL, sort_order TEXT NOT NULL);
            CREATE INDEX item_index_list ON item_index (list_id, sort_order);`,
      async write(tx, id, state) {
        if (!state || state.doc.deleted) {
          await tx.run('DELETE FROM item_index WHERE id = ?', [id]);
          return;
        }
        await tx.run('INSERT OR REPLACE INTO item_index (id, list_id, sort_order) VALUES (?, ?, ?)',
          [id, state.doc.listId, state.doc.sortOrder]);
      },
    },
  };
}
