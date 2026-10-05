import type { Tx } from '@danbro96/lupira-expo-sqlite/types';

export type OpStatus = 'pending' | 'failed';

/** Aggregate id (list or item) → whether it has queued changes; a parked one marks it failed. */
export async function opStatuses(tx: Tx): Promise<Map<string, OpStatus>> {
  const rows = await tx.all<{ id: string; parked: number }>(
    "SELECT aggregate_id AS id, MAX(status = 'parked') AS parked FROM outbox GROUP BY aggregate_id");
  return new Map(rows.map(r => [r.id, r.parked ? 'failed' : 'pending']));
}
