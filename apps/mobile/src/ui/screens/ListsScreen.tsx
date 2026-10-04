import { memo, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import ReorderableList, { useReorderableDrag, useIsActive, reorderItems } from 'react-native-reorderable-list';
import { Gesture } from 'react-native-gesture-handler';
import { LinearTransition, runOnJS } from 'react-native-reanimated';
import type { ListDto } from '@lupira/tasks-api/models';
import type { RootStackParamList } from '../navigation/types';
import { SyncBanner } from '../components/SyncBanner';
import { SyncDot } from '../components/SyncDot';
import { DebugPanel } from '../components/DebugPanel';
import { hapticImpact } from '@danbro96/lupira-expo-feedback/haptics';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';
import { useLists } from '../hooks/useMirror';
import { useOutboxStatus, type OpStatus } from '../hooks/useOutboxStatus';
import { useSyncStatus } from '../../sync/syncStatus';
import { syncAll } from '../../sync/sync';
import { enqueueMany } from '../../sync/outbox';
import { getDb } from '../../data/db/expoDb';
import { planListReorder } from '@lupira/tasks-domain/listOrder';
import { stamp } from '../../domain/ops';
import { radii, spacing, useColors, type Palette } from '../theme';
import { ICONS } from '../icons';

interface RowProps {
  list: ListDto;
  status?: OpStatus;
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  onOpen: (list: ListDto) => void;
}

const ListRow = memo(function ListRow({ list, status, styles, palette, onOpen }: RowProps) {
  const drag = useReorderableDrag();
  const isActive = useIsActive();

  return (
    <Pressable
      style={[styles.row, isActive && styles.rowActive]}
      onPress={() => onOpen(list)}
      onLongPress={drag}
      delayLongPress={500}
      accessibilityRole="button"
      accessibilityLabel={list.name}
      accessibilityHint="Opens the list. Long-press to reorder."
    >
      <View style={[styles.colorDot, list.color ? { backgroundColor: list.color } : styles.colorDotNone]} />
      <Text variant="bodyLarge" style={styles.rowTitle} numberOfLines={1}>{list.name}</Text>
      <View style={styles.rowRight}>
        <SyncDot status={status} />
        <MaterialIcons name={ICONS.chevronRight} size={18} color={palette.textDisabled} />
      </View>
    </Pressable>
  );
});

export function ListsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { lists } = useLists();
  const opStatus = useOutboxStatus();
  const firstSyncDone = useSyncStatus(s => s.firstSyncDone);
  const [refreshing, setRefreshing] = useState(false);
  const c = useColors();
  const styles = makeStyles(c);

  // The background poll must not re-sort under the finger mid-drag (same freeze as ListDetailScreen).
  const [dragging, setDragging] = useState(false);
  // The list moves the row on drop, but our order only changes once the enqueued op reaches the
  // mirror. Keep rendering the reordered snapshot until it does, or the cells lose their slots.
  const [frozen, setFrozen] = useState<{ lists: typeof lists; sourceLists: typeof lists } | null>(null);
  const data = frozen && (dragging || frozen.sourceLists === lists) ? frozen.lists : lists;
  const rendered = useRef({ lists, data });
  useLayoutEffect(() => {
    rendered.current = { lists, data };
  }, [lists, data]);

  const [dragGesture] = useState(() => Gesture.Pan().activateAfterLongPress(520));

  function openList(l: ListDto) {
    nav.navigate('ListDetail', { listId: l.id, name: l.name });
  }

  async function refresh() {
    setRefreshing(true);
    await syncAll()
      .catch(() => toastError('Sync failed'))
      .finally(() => setRefreshing(false));
  }

  function freezeForDrag() {
    setFrozen({ lists: rendered.current.data, sourceLists: rendered.current.lists });
    setDragging(true);
  }

  function onReorder({ from, to }: { from: number; to: number }) {
    setDragging(false);
    // Indices refer to the frozen array the list was rendered with during the drag.
    const dragLists = rendered.current.data;
    const targets = planListReorder(dragLists, from, to);
    if (targets.length === 0) return;
    setFrozen({ lists: reorderItems(dragLists, from, to), sourceLists: rendered.current.lists });
    // One transaction, one mirror bump — the first drag materializes every list's key at once.
    void getDb().then(db => enqueueMany(db, targets.map(t => ({ ...stamp(), kind: 'list.reorder' as const, ...t }))))
      .catch(() => toastError("Couldn't reorder lists"));
  }

  return (
    <View style={styles.fill}>
      <SyncBanner />
      <ReorderableList
        data={data}
        keyExtractor={l => l?.id ?? ''}
        panGesture={dragGesture}
        shouldUpdateActiveItem
        itemLayoutAnimation={LinearTransition.duration(200)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        onDragStart={() => {
          'worklet';
          runOnJS(hapticImpact)(); // "pickup" thunk when a row is grabbed to reorder
          runOnJS(freezeForDrag)();
        }}
        onDragEnd={() => {
          'worklet';
          runOnJS(setDragging)(false);
        }}
        onReorder={onReorder}
        ListEmptyComponent={
          firstSyncDone ? (
            <Text style={styles.empty}>No lists yet — tap + to add one.</Text>
          ) : (
            <ActivityIndicator style={styles.loading} color={c.textSubtle} />
          )
        }
        renderItem={({ item }) =>
          !item ? null : (
          <ListRow
            list={item}
            status={opStatus.get(item.id)}
            styles={styles}
            palette={c}
            onOpen={openList}
          />
          )
        }
      />
      <DebugPanel />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    row: {
      paddingVertical: 14,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bg, // opaque so a picked-up row doesn't show the rows it passes over
    },
    rowActive: { backgroundColor: c.surface, borderBottomColor: 'transparent' },
    colorDot: { width: 12, height: 12, borderRadius: radii.sm, marginRight: spacing.md },
    colorDotNone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border },
    rowTitle: { flex: 1 },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    empty: { textAlign: 'center', color: c.textSubtle, marginTop: 40 },
    loading: { marginTop: 40 },
  });
