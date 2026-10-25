import { useOnline } from '@danbro96/lupira-expo-query/online';
import { SyncStatusView } from '@danbro96/lupira-expo-paper/components/SyncStatusView';
import { toast } from '@danbro96/lupira-expo-feedback/toast';
import type { OpBase } from '@danbro96/lupira-sync-engine/types';
import { useParkedChanges } from '../../state/outbox';
import { syncNow, useSyncStatus } from '../../state/syncStatus';
import * as commands from '../../state/commands';
import type { ClientOp } from '../../domain/ops';
import { SYNC_LABELS } from '../components/SyncBanner';
import { run } from '../run';

// Human label per op kind. A Record over the union forces every new op kind to get a label.
const OP_LABELS: Record<ClientOp['kind'], string> = {
  'item.create': 'Add task',
  'item.rename': 'Rename task',
  'item.notes': 'Edit notes',
  'item.assign': 'Assign task',
  'item.due': 'Set due date',
  'item.quantity': 'Set quantity',
  'item.priority': 'Set priority',
  'item.tagAdd': 'Add tag',
  'item.tagRemove': 'Remove tag',
  'item.complete': 'Complete task',
  'item.reopen': 'Reopen task',
  'item.move': 'Move task',
  'item.delete': 'Delete task',
  'list.create': 'Create list',
  'list.rename': 'Rename list',
  'list.recolor': 'Change list color',
  'list.setSimplePriority': 'Change priority mode',
  'list.reorder': 'Reorder lists',
  'list.memberAdd': 'Add member',
  'list.memberRoleChange': 'Change member role',
  'list.memberRemove': 'Remove member',
  'list.leave': 'Leave list',
  'list.delete': 'Delete list',
  'list.archive': 'Archive list',
  'list.restore': 'Restore list',
};

const labelOf = (op: OpBase) => OP_LABELS[(op as ClientOp).kind];

export function SyncIssuesScreen() {
  const rows = useParkedChanges() ?? [];
  const status = useSyncStatus();
  const online = useOnline();

  return (
    <SyncStatusView
      status={status}
      parked={rows}
      opLabel={labelOf}
      online={online}
      progressLabels={SYNC_LABELS}
      onSync={() => run(syncNow, 'Sync failed')}
      onRetry={commandId => run(() => commands.retryChanges([commandId]), "Couldn't retry change")}
      onRetryAll={() => {
        run(() => commands.retryChanges(rows.map(r => r.op.commandId)), "Couldn't retry changes");
        toast('Retrying failed changes…');
      }}
      onDiscard={commandId => run(() => commands.discardChange(commandId), "Couldn't discard change", 'Change discarded')}
    />
  );
}
