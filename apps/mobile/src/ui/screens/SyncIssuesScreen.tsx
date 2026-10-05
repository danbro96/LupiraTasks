import { FlatList, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { toast } from '@danbro96/lupira-expo-feedback/toast';
import type { ParkedOp } from '@danbro96/lupira-sync-engine/types';
import { useParkedChanges } from '../../state/outbox';
import { useSyncStatus } from '../../state/syncStatus';
import * as commands from '../../state/commands';
import type { ClientOp } from '../../domain/ops';
import { spacing, useColors, type Palette } from '../theme';
import { ICONS } from '../icons';

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

const labelOf = (row: ParkedOp) => OP_LABELS[(row.op as ClientOp).kind];

/**
 * Recovery view for changes the server rejected (parked ops), reached from the sync banner. The user can
 * retry them all (e.g. after the conflicting state resolves) or discard ones that can never succeed; it
 * follows the queue, so it self-updates as a retry drains.
 */
export function SyncIssuesScreen() {
  const rows = useParkedChanges() ?? [];
  const lastError = useSyncStatus().lastError;
  const c = useColors();
  const styles = makeStyles(c);

  function onRetryAll() {
    void commands.retryChanges(rows.map(r => r.op.commandId));
    toast('Retrying failed changes…');
  }

  function onDiscard(row: ParkedOp) {
    void commands.discardChange(row.op.commandId);
    toast('Change discarded');
  }

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <MaterialIcons name={ICONS.checkCircle} size={48} color={c.textDisabled} />
        <Text variant="bodyLarge" style={styles.emptyText}>All changes are synced.</Text>
        {lastError ? <Text variant="labelSmall" style={styles.error}>{lastError}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <FlatList
        data={rows}
        keyExtractor={r => r.op.commandId}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text variant="bodySmall" style={styles.headerText}>
              These changes couldn&apos;t be saved to the server. Retry them, or discard ones you no longer want.
            </Text>
            <Button title="Retry all" onPress={onRetryAll} style={styles.retry} />
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text variant="bodyLarge">{labelOf(item)}</Text>
              {item.lastError ? <Text variant="labelSmall" style={styles.error} numberOfLines={2}>{item.lastError}</Text> : null}
            </View>
            <Button
              variant="destructive"
              title="Discard"
              onPress={() => onDiscard(item)}
              accessibilityLabel={`Discard ${labelOf(item)}`}
            />
          </View>
        )}
      />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    list: { padding: spacing.lg },
    header: { gap: spacing.md, marginBottom: spacing.lg },
    headerText: { color: c.textMuted },
    retry: { alignSelf: 'stretch' },
    sep: { height: 1, backgroundColor: c.divider },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md },
    rowText: { flex: 1, gap: spacing.xs },
    error: { color: c.danger },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: c.bg },
    emptyText: { color: c.textMuted },
  });
