import { useQuery } from '@tanstack/react-query';
import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import type { ParkedOp } from '@danbro96/lupira-sync-engine/types';
import { opStatuses, type OpStatus } from '../data/queries/outbox';
import { engine, mirrorDb } from '../sync/engine';
import { OUTBOX_ROOT } from '../sync/queryClient';

export type { OpStatus };

const NONE = new Map<string, OpStatus>();

const statusQuery = mirrorQuery([OUTBOX_ROOT, 'status'], async () => opStatuses(await mirrorDb()));

/** Aggregate id (list or item) → its queued-change badge. */
export function useOutboxStatus(): Map<string, OpStatus> {
  return useQuery(statusQuery).data ?? NONE;
}

/** One aggregate's badge; re-renders only when that entry changes. */
export function useOpStatus(id: string): OpStatus | undefined {
  return useQuery({ ...statusQuery, select: map => map.get(id) }).data;
}

/** Changes the server rejected, for Sync issues. */
export function useParkedChanges(): ParkedOp[] | undefined {
  return useQuery(mirrorQuery([OUTBOX_ROOT, 'parked'], () => engine.parked())).data;
}
