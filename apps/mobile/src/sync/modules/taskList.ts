import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { syncLists } from '@lupira/tasks-api/fetch/sync';
import type { ListDto, PersonRef } from '@lupira/tasks-api/models';
import { reduceList } from '../../domain/listDoc';
import { TASK_LIST, type ListOp } from '../../domain/ops';
import { replayOp } from '../replayOp';

const stateOf = (doc: ListDto | null) => doc && { doc, guards: null };

/** `self` is the signed-in user, the actor of an optimistic create or membership change. */
export function taskListModule(self: () => PersonRef | null): AggregateModule<ListDto, null, ListOp, ListDto> {
  return {
    aggregate: TASK_LIST,
    feed: {
      fetch: since => syncLists(since === null ? {} : { since }),
      fromWire: list => ({ id: list.id, state: { doc: list, guards: null } }),
    },
    reduce: (state, op) => stateOf(reduceList(state?.doc ?? null, op, self())),
    replay: replayOp,
    holdKeyOf: op => op.listId,
  };
}
