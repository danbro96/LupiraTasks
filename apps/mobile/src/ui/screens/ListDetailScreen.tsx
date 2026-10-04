import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import ReorderableList, { useReorderableDrag, useIsActive, reorderItems } from 'react-native-reorderable-list';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { LinearTransition, runOnJS, SlideOutLeft, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { hapticImpact, hapticSuccess } from '../../feedback/haptics';
import { ListKind } from '@lupira/tasks-api/models';
import type { RootStackParamList } from '../navigation/types';
import type { ItemState } from '../../domain/itemState';
import { Button } from '../components/Button';
import { Checkbox } from '../components/Checkbox';
import { IconButton } from '../components/IconButton';
import { PriorityControl } from '../components/PriorityControl';
import { TextField } from '../components/TextField';
import { SyncBanner } from '../components/SyncBanner';
import { SyncDot } from '../components/SyncDot';
import { toastError } from '../../feedback/toast';
import { useItems, useLists } from '../hooks/useMirror';
import { useListPolling } from '../hooks/useListPolling';
import { useOpStatus } from '../hooks/useOutboxStatus';
import { useMyRole, canEditWithRole } from '../hooks/useMyRole';
import { usePendingDeletes, requestItemDeleteMany } from '../state/pendingDeletes';
import { ROW_SPACING_PAD, TEXT_SIZE_SCALE, usePrefs } from '../../state/prefs-store';
import { collapseDescendants, descendantIds, rowsForMode, siblingReorder, topSortOrder } from '@lupira/tasks-domain/itemTree';
import { changeLabel, type ItemChange, type ItemChangeKind } from '@lupira/tasks-domain/itemChange';
import { qtyLabel } from '@lupira/tasks-domain/itemFormat';
import { oneLine } from '@lupira/tasks-domain/text';
import { enqueue } from '../../sync/outbox';
import { pullList } from '../../sync/sync';
import { newId } from '@lupira/tasks-domain/ids';
import { stamp } from '../../domain/ops';
import { formatDue } from '@lupira/tasks-domain/dueDate';
import { spacing, useColors, type Palette } from '../theme';
import { ICONS } from '../icons';

const INDENT = spacing.lg; // left inset per nesting level
const SWIPE_DELETE_THRESHOLD = -80; // swipe left past this (px) and release to delete
// How long a remotely-changed row stays highlighted and held in place.
const REMOTE_FLASH_MS = 4000;
const FLASH_IN_MS = 180;
const FLASH_OUT_MS = 1200;

interface RowProps {
  // Spread from the row wrapper rather than passed whole: the wrapper is rebuilt on every rowsForMode
  // run, and would defeat the memo even when the item itself is unchanged.
  item: ItemState;
  depth: number;
  hasChildren: boolean;
  canEdit: boolean;
  /** Long-press drag handle — off for completed rows when they live in their own section. */
  draggable: boolean;
  isShopping: boolean;
  /** Resolved assignee display name (from list.members), or '' when unassigned/unresolved. */
  assigneeName: string;
  /** The list's priority mode: a star (0↔1) when true, a 0–9 picker badge when false. */
  simplePriority: boolean;
  /** Set while someone else's edit to this row is being announced. Primitives, so the memo still
   *  bails out. */
  changeKind?: ItemChangeKind;
  changeWho?: string | null;
  expanded: boolean;
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  onToggle: (it: ItemState) => void;
  onOpen: (it: ItemState) => void;
  onToggleExpand: (id: string) => void;
  onSetPriority: (it: ItemState, priority: number) => void;
  onDelete: (it: ItemState) => void;
}

// Memoized: rows must not re-render on unrelated screen state (e.g. each keystroke in the
// add-task field) — with stable callbacks below, only rows whose props changed re-render.
/** Its own component so only a flashing row pays for the shared value and animated style. */
function RemoteHighlight({ style, flashKey }: { style: StyleProp<ViewStyle>; flashKey: string }) {
  // Tint in fast, hold, fade out slowly — the slow tail is what stops it reading as a UI glitch.
  const highlight = useSharedValue(0);
  const highlightStyle = useAnimatedStyle(() => ({ opacity: highlight.get() }));
  useEffect(() => {
    highlight.set(withSequence(
      withTiming(1, { duration: FLASH_IN_MS }),
      withDelay(Math.max(0, REMOTE_FLASH_MS - FLASH_IN_MS - FLASH_OUT_MS), withTiming(0, { duration: FLASH_OUT_MS })),
    ));
  }, [flashKey, highlight]);
  return <Animated.View style={[style, highlightStyle]} pointerEvents="none" />;
}

const TaskRow = memo(function TaskRow({ item, depth, hasChildren, canEdit, draggable, isShopping, assigneeName, simplePriority, changeKind, changeWho, expanded, styles, palette, onToggle, onOpen, onToggleExpand, onSetPriority, onDelete }: RowProps) {
  const drag = useReorderableDrag();
  const status = useOpStatus(item.id);
  const isActive = useIsActive();
  const translateX = useSharedValue(0);
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.get() }] }));
  // Red delete backdrop is invisible until the row is actually swiped — so it never shows at rest
  // or while the row is picked up for reordering.
  const deleteBgStyle = useAnimatedStyle(() => ({ opacity: translateX.get() < -1 ? 1 : 0 }));
  // Memoized: a fresh gesture object makes GestureDetector re-attach its native handler every render.
  const swipe = useMemo(() => Gesture.Pan()
    .activeOffsetX(-15)
    .failOffsetY([-12, 12])
    .onUpdate(e => {
      translateX.set(Math.min(0, e.translationX));
    })
    .onEnd(e => {
      if (e.translationX < SWIPE_DELETE_THRESHOLD) {
        // Remove it — the row's `exiting` animation slides it the rest of the way out and the
        // neighbors close the gap via the list's itemLayoutAnimation.
        runOnJS(onDelete)(item);
      } else {
        translateX.set(withSpring(0));
      }
    }), [item, onDelete, translateX]);
  const due = formatDue(item.dueAt);
  const qty = isShopping ? qtyLabel(item) : null;

  const inner = (
    <Pressable
      style={[styles.row, { paddingLeft: spacing.lg + depth * INDENT }, isActive && styles.rowActive]}
      onPress={() => onOpen(item)}
      onLongPress={draggable ? drag : undefined}
      delayLongPress={500}
      accessibilityRole="button"
      accessibilityLabel={`${qty ? qty + ' ' : ''}${item.title}${due ? `, due ${due.label}` : ''}`}
      accessibilityHint="Opens task details. Long-press to reorder."
    >
      {changeKind ? <RemoteHighlight style={styles.remoteHighlight} flashKey={`${changeKind}:${changeWho ?? ''}`} /> : null}
      <Checkbox checked={item.completed} disabled={!canEdit} onPress={() => onToggle(item)} />
      <View style={styles.rowBody}>
        {/* Notice shares the title's line: its own line would grow rows that have no meta line. */}
        <View style={styles.titleLine}>
          <Text style={[styles.itemTitle, item.completed && styles.itemDone]} numberOfLines={2}>
            {qty ? <Text style={styles.qty}>{qty}  </Text> : null}
            {item.title}
          </Text>
          {changeKind ? (
            <Text style={styles.changeMeta} numberOfLines={1}>{changeLabel(changeKind, changeWho ?? null)}</Text>
          ) : null}
        </View>
        {(due || assigneeName) && !item.completed ? (
          <View style={styles.metaRow}>
            {due ? <Text style={[styles.meta, due.overdue && styles.overdue]}>{due.label}</Text> : null}
            {assigneeName ? <Text style={styles.meta} numberOfLines={1}>{assigneeName}</Text> : null}
          </View>
        ) : null}
      </View>
      <SyncDot status={status} />
      <PriorityControl
        simple={simplePriority}
        value={item.priority}
        editable={canEdit}
        onChange={p => onSetPriority(item, p)}
      />
      {hasChildren ? (
        <IconButton
          name={expanded ? ICONS.expand : ICONS.chevronRight}
          accessibilityLabel={expanded ? 'Collapse subtasks' : 'Expand subtasks'}
          color={palette.textSubtle}
          size={20}
          onPress={() => onToggleExpand(item.id)}
        />
      ) : null}
    </Pressable>
  );

  if (!canEdit) return inner;

  // Swipe the row left and release past the threshold to delete; otherwise it springs back.
  // A custom Pan (instead of Swipeable's open-callback, which doesn't fire reliably here) lets us
  // own the release handler and call onDelete via runOnJS. activeOffsetX claims only leftward drags;
  // failOffsetY yields vertical gestures to scroll. The reorder drag is gated behind a long-press
  // (list `panGesture`, below) so it doesn't steal these quick horizontal swipes.
  return (
    <View style={styles.swipeContainer}>
      <Animated.View style={[styles.swipeDelete, deleteBgStyle]} pointerEvents="none">
        <MaterialIcons name={ICONS.delete} size={22} color="#fff" />
      </Animated.View>
      <GestureDetector gesture={swipe}>
        <Animated.View style={rowStyle} exiting={SlideOutLeft.duration(180)}>{inner}</Animated.View>
      </GestureDetector>
    </View>
  );
});

const listLayoutAnimation = LinearTransition.duration(200);
const rowKey = (r: { item: ItemState } | undefined) => r?.item.id ?? '';

export function ListDetailScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'ListDetail'>>();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const listId = params.listId;
  const { items, changes } = useItems(listId);
  const { lists } = useLists();
  const list = lists.find(l => l.id === listId);
  const color = list?.color ?? null;
  const isShopping = list?.kind === ListKind.Shopping;
  const simplePriority = list?.simplePriority ?? true;
  const assigneeNames = useMemo(
    () => new Map((list?.members ?? []).map(m => [m.principalId, m.displayName ?? m.email] as const)),
    [list],
  );
  const pendingDeletes = usePendingDeletes();
  const role = useMyRole(listId);
  const canEdit = canEditWithRole(role);
  const completedMode = usePrefs(s => s.completedMode[listId] ?? 'inline');
  const textSize = usePrefs(s => s.textSize);
  const rowSpacing = usePrefs(s => s.rowSpacing);
  const [title, setTitle] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pulled, setPulled] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const c = useColors();
  const styles = useMemo(
    () => makeStyles(c, TEXT_SIZE_SCALE[textSize], ROW_SPACING_PAD[rowSpacing]),
    [c, textSize, rowSpacing],
  );
  const insets = useSafeAreaInsets();
  // Gate the reorder drag behind a long-press so it doesn't claim the quick horizontal swipes used
  // for swipe-to-delete (slightly longer than the row's 500ms delayLongPress, per the lib's guidance).
  const dragGesture = useMemo(() => Gesture.Pan().activateAfterLongPress(520), []);

  // Pull on focus (not just mount): native-stack keeps this screen mounted when TaskDetail /
  // ListSettings are pushed on top, so a mount-only effect would leave tasks stale on return.
  useFocusEffect(
    useCallback(() => {
      // Background refresh: errors surface via the sync banner, not an unhandled rejection.
      void pullList(listId).catch(() => {}).finally(() => setPulled(true));
    }, [listId]),
  );

  useListPolling(listId);

  // Each batch owns its expiry timer — a change arriving mid-flash must not cancel the previous
  // batch's cleanup and leave those rows highlighted for good.
  const [flashes, setFlashes] = useState<Map<string, ItemChange<string>>>(
    () => new Map(changes.list.map(c => [c.itemId, c])),
  );
  const [flashedChanges, setFlashedChanges] = useState(changes);
  if (flashedChanges !== changes) {
    setFlashedChanges(changes);
    if (changes.list.length > 0) {
      setFlashes(prev => {
        const next = new Map(prev);
        for (const c of changes.list) next.set(c.itemId, c);
        return next;
      });
    }
  }
  const flashTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => flashTimers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (changes.list.length === 0) return;
    const batch = changes.list;
    flashTimers.current.push(setTimeout(() => {
      setFlashes(prev => {
        const next = new Map(prev);
        for (const c of batch) next.delete(c.itemId);
        return next;
      });
    }, REMOTE_FLASH_MS));
  }, [changes]);

  // Held in place until the flash ends: otherwise a remote completion hides the row, or flings it
  // to the COMPLETED section, at the instant it changes.
  const heldCompleted = useMemo(
    () => new Set([...flashes.values()].filter(c => c.kind === 'completed').map(c => c.itemId)),
    [flashes],
  );

  const visibleItems = useMemo(() => items.filter(i => !pendingDeletes.has(i.id)), [items, pendingDeletes]);
  const rows = useMemo(
    () => rowsForMode(visibleItems, expanded, completedMode, heldCompleted),
    [visibleItems, expanded, completedMode, heldCompleted],
  );

  // Freeze the rendered data while a drag is active: a mirror reload landing mid-gesture (a sync
  // pull or another device's edit) would otherwise swap the rows under the drag and snap it.
  const [dragging, setDragging] = useState(false);
  // The list moves the row on drop, but our order only changes once the enqueued op reaches the
  // mirror. Keep rendering the reordered snapshot until it does, or the cells lose their slots.
  const [frozen, setFrozen] = useState<{ rows: typeof rows; sourceRows: typeof rows } | null>(null);
  const listData = frozen && (dragging || frozen.sourceRows === rows) ? frozen.rows : rows;
  const rendered = useRef({ rows, listData });
  useLayoutEffect(() => {
    rendered.current = { rows, listData };
  }, [rows, listData]);
  // Index of the first completed row in 'below' mode — the COMPLETED header renders above it.
  // Derived from the rendered array so it stays consistent while rows are frozen mid-drag. A held
  // row still sits in the open section, so it must not be taken for the section start.
  const firstCompletedIndex = useMemo(
    () => (completedMode === 'below' ? listData.findIndex(r => r?.item.completed && !heldCompleted.has(r.item.id)) : -1),
    [completedMode, listData, heldCompleted],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await pullList(listId);
    } catch {
      toastError('Sync failed');
    } finally {
      setRefreshing(false);
    }
  }, [listId]);

  async function addItem() {
    const t = oneLine(title).trim();
    if (!t) return;
    setTitle('');
    // New tasks from the list view are always top-level and go to the top.
    const sortOrder = topSortOrder(items);
    try {
      await enqueue({ ...stamp(), kind: 'item.create', listId, itemId: newId(), title: t, sortOrder, parentItemId: null });
    } catch {
      toastError("Couldn't add item");
    }
  }

  // Row callbacks are stable (useCallback) so the memoized TaskRow can bail out of re-renders.
  const toggle = useCallback(async (it: ItemState) => {
    if (!it.completed) hapticSuccess(); // satisfying tick when checking a task off
    try {
      await enqueue({ ...stamp(), kind: it.completed ? 'item.reopen' : 'item.complete', listId, itemId: it.id });
    } catch {
      toastError("Couldn't update item");
    }
  }, [listId]);

  // Read through a ref: depending on `items` would hand every row a new callback on each change.
  const itemsRef = useRef(items);
  useLayoutEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => (prev.has(id) ? collapseDescendants(prev, id, itemsRef.current) : new Set(prev).add(id)));
  }, []);

  const onDelete = useCallback((it: ItemState) => {
    hapticImpact();
    requestItemDeleteMany(listId, [it.id, ...descendantIds(itemsRef.current, it.id)]);
  }, [listId]);

  const openTask = useCallback((it: ItemState) => {
    nav.navigate('TaskDetail', { listId, itemId: it.id });
  }, [nav, listId]);

  const setPriority = useCallback(async (it: ItemState, priority: number) => {
    if (priority === it.priority) return;
    try {
      await enqueue({ ...stamp(), kind: 'item.priority', listId, itemId: it.id, priority });
    } catch {
      toastError("Couldn't update priority");
    }
  }, [listId]);

  const onReorder = useCallback(({ from, to }: { from: number; to: number }) => {
    setDragging(false);
    // Indices refer to the data the list was rendered with — the frozen rows during a drag.
    const dragRows = rendered.current.listData;
    if (from === to) return;
    // 'below' mode: reordering is confined to the open section. Recompute the boundary from the
    // frozen array and bail when the drag starts in or drops into the completed section.
    const boundary = completedMode === 'below' ? dragRows.findIndex(r => r?.item.completed && !heldCompleted.has(r.item.id)) : -1;
    if (boundary >= 0 && (from >= boundary || to >= boundary)) return;
    const draggedId = dragRows[from]?.item.id;
    if (!draggedId) return;
    const next = [...dragRows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    // Scope the sibling computation to the open section — completed roots share parentItemId
    // with open roots and would otherwise pollute the neighbor picks. (from/to are both above
    // the boundary, so the splice leaves the completed segment — and the boundary — unchanged.)
    const scope = boundary >= 0 ? next.slice(0, boundary) : next;
    const target = siblingReorder(scope, draggedId);
    if (target) {
      setFrozen({ rows: reorderItems(dragRows, from, to), sourceRows: rendered.current.rows });
      void enqueue({ ...stamp(), kind: 'item.move', listId, itemId: draggedId, ...target }).catch(() => toastError("Couldn't move item"));
    }
  }, [completedMode, heldCompleted, listId]);

  // Every prop the list gets is kept stable: a new one re-renders each cell, and a cell re-render
  // re-runs its Reanimated hooks — ~300ms for a long list, several times per tick.
  const freezeForDrag = useCallback(() => {
    setFrozen({ rows: rendered.current.listData, sourceRows: rendered.current.rows });
    setDragging(true);
  }, []);
  const onDragStart = useCallback(() => {
    'worklet';
    runOnJS(hapticImpact)(); // "pickup" thunk when a row is grabbed to reorder
    runOnJS(freezeForDrag)();
  }, [freezeForDrag]);
  const onDragEnd = useCallback(() => {
    'worklet';
    runOnJS(setDragging)(false);
  }, []);
  const contentContainerStyle = useMemo(() => ({ paddingBottom: insets.bottom + spacing.md }), [insets.bottom]);
  const refreshControl = useMemo(
    () => <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />,
    [refreshing, refresh],
  );
  const listEmpty = useMemo(
    () => (pulled ? <Text style={styles.empty}>No tasks yet.</Text> : <ActivityIndicator style={styles.loading} color={c.textSubtle} />),
    [pulled, styles, c],
  );
  const renderItem = useCallback(({ item: row, index }: { item: (typeof listData)[number]; index: number }) =>
    !row?.item ? null : (
      <>
        {index === firstCompletedIndex ? <Text style={styles.completedHeader}>COMPLETED</Text> : null}
        <TaskRow
          item={row.item}
          depth={row.depth}
          hasChildren={row.hasChildren}
          canEdit={canEdit}
          draggable={canEdit && !(completedMode === 'below' && row.item.completed)}
          isShopping={isShopping}
          assigneeName={row.item.assignedTo ? (assigneeNames.get(row.item.assignedTo) ?? '') : ''}
          simplePriority={simplePriority}
          changeKind={flashes.get(row.item.id)?.kind}
          changeWho={flashes.get(row.item.id)?.actor ? assigneeNames.get(flashes.get(row.item.id)!.actor!) ?? null : null}
          expanded={expanded.has(row.item.id)}
          styles={styles}
          palette={c}
          onToggle={toggle}
          onOpen={openTask}
          onToggleExpand={toggleExpand}
          onSetPriority={setPriority}
          onDelete={onDelete}
        />
      </>
    ),
  [firstCompletedIndex, canEdit, completedMode, isShopping, assigneeNames, simplePriority, flashes, expanded, styles, c, toggle, openTask, toggleExpand, setPriority, onDelete]);

  return (
    <View style={styles.fill}>
      {color ? <View style={[styles.colorStripe, { backgroundColor: color }]} /> : null}
      <SyncBanner />
      {canEdit ? (
        <View style={styles.addRow}>
          <TextField
            placeholder="Add task…"
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={addItem}
            returnKeyType="done"
            accessibilityLabel="New task title"
          />
          <Button title="Add" onPress={addItem} disabled={!title.trim()} />
        </View>
      ) : role === null ? null : (
        <Text style={styles.readonly}>You have view-only access to this list.</Text>
      )}
      <ReorderableList
        data={listData}
        keyExtractor={rowKey}
        dragEnabled={canEdit}
        panGesture={dragGesture}
        shouldUpdateActiveItem
        // Rows are heavy (gesture + animated styles each); FlatList's default window mounts ~21
        // screens, i.e. every row of a long list.
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        itemLayoutAnimation={listLayoutAnimation}
        contentContainerStyle={contentContainerStyle}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onReorder={onReorder}
        refreshControl={refreshControl}
        ListEmptyComponent={listEmpty}
        renderItem={renderItem}
      />
    </View>
  );
}

const makeStyles = (c: Palette, fontScale = 1, rowPad = 14) => {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    colorStripe: { height: 5 },
    addRow: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm },
    readonly: { fontSize: 13, color: c.textMuted, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: rowPad,
      paddingRight: spacing.lg,
      backgroundColor: c.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
    },
    rowActive: { backgroundColor: c.surface, borderBottomColor: 'transparent' },
    rowBody: { flex: 1 },
    titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
    itemTitle: { fontSize: Math.round(17 * fontScale), color: c.text, flex: 1 },
    itemDone: { color: c.textDisabled, textDecorationLine: 'line-through' },
    qty: { color: c.textMuted, fontWeight: '700' },
    metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
    meta: { fontSize: Math.round(11 * fontScale), color: c.textMuted, flexShrink: 1 },
    overdue: { color: c.danger, fontWeight: '600' },
    // The title yields width, not this — capped so a long name can't ellipsise it away.
    changeMeta: { fontSize: Math.round(11 * fontScale), color: c.primary, fontWeight: '600', flexShrink: 0, maxWidth: '45%' },
    remoteHighlight: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.remoteChange },
    swipeContainer: { justifyContent: 'center' },
    swipeDelete: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor: c.danger,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingRight: 24,
    },
    completedHeader: { fontSize: 12, fontWeight: '700', color: c.textSubtle, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
    empty: { textAlign: 'center', color: c.textSubtle, marginTop: 40 },
    loading: { marginTop: 40 },
  });
};
