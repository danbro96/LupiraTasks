import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, List, Text } from 'react-native-paper';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import RNDateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ListKind } from '@lupira/tasks-api/models';
import type { RootStackParamList } from '../navigation/types';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { Checkbox } from '../components/Checkbox';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { DetailRow } from '../components/DetailRow';
import { PriorityControl } from '../components/PriorityControl';
import { ActionMenu, type ActionItem } from '@danbro96/lupira-expo-paper/components/ActionMenu';
import { SyncBanner } from '../components/SyncBanner';
import { SyncDot } from '../components/SyncDot';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';
import { hapticSuccess } from '@danbro96/lupira-expo-feedback/haptics';
import { useList } from '../../state/lists';
import { useItems } from '../../state/items';
import { useOpStatus } from '../../state/outbox';
import { useDirectory } from '../../state/directory';
import * as commands from '../../state/commands';
import { useMyRole, canEditWithRole } from '../hooks/useMyRole';
import { childrenOf, nextChildSortOrder, descendantIds } from '@lupira/tasks-domain/itemTree';
import { priorityLabel } from '@lupira/tasks-domain/itemFormat';
import { oneLine } from '@lupira/tasks-domain/text';
import { dueInDays, dueNextWeekend, dueOnDate, formatDue } from '@lupira/tasks-domain/dueDate';
import { radii, spacing, useColors, type Palette } from '../theme';
import { ICONS } from '../icons';

const parseQuantity = (raw: string): number | null => {
  const parsed = raw.trim() === '' ? null : Number(raw.trim());
  return parsed != null && Number.isFinite(parsed) ? parsed : null;
};

const DUE_QUICK: { label: string; iso: () => string }[] = [
  { label: 'Today', iso: () => dueInDays(0) },
  { label: 'Tomorrow', iso: () => dueInDays(1) },
  { label: 'This weekend', iso: dueNextWeekend },
  { label: 'Next week', iso: () => dueInDays(7) },
];

export function TaskDetailScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'TaskDetail'>>();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { listId, itemId } = params;

  const { items, loading } = useItems(listId);
  const { list } = useList(listId);
  const item = items.find(i => i.id === itemId);
  const canEdit = canEditWithRole(useMyRole(listId));
  const isShopping = list?.kind === ListKind.Shopping;
  const status = useOpStatus(itemId);
  const name = useDirectory();

  const [title, setTitle] = useState(item?.title ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [qty, setQty] = useState(item?.quantity != null ? String(item.quantity) : '');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [subTitle, setSubTitle] = useState('');
  const [dueMenu, setDueMenu] = useState(false);
  const [assigneeMenu, setAssigneeMenu] = useState(false);
  const [iosDate, setIosDate] = useState<Date | null>(null);

  // Latest field values + last-saved baselines, so a save only queues what actually changed.
  const titleRef = useRef(title);
  const notesRef = useRef(notes);
  const qtyRef = useRef(qty);
  const unitRef = useRef(unit);
  const savedTitle = useRef(item?.title ?? '');
  const savedNotes = useRef(item?.notes ?? '');
  const savedQty = useRef(item?.quantity != null ? String(item.quantity) : '');
  const savedUnit = useRef(item?.unit ?? '');
  useLayoutEffect(() => {
    titleRef.current = title;
    notesRef.current = notes;
    qtyRef.current = qty;
    unitRef.current = unit;
  }, [title, notes, qty, unit]);

  const members = useMemo(() => list?.members ?? [], [list]);
  const memberNames = useMemo(() => new Map(members.map(m => [m.principalId, m.displayName ?? m.email])), [members]);
  // Assignees are always members (resolved inline); created/completed-by may be a non-member, so
  // fall back to the org directory.
  const personName = (principalId: string | null | undefined): string =>
    principalId ? (memberNames.get(principalId) ?? name(principalId)) : '';
  const subtasks = useMemo(() => childrenOf(items, itemId), [items, itemId]);
  const subtasksDone = subtasks.filter(s => s.completed).length;
  const due = formatDue(item?.dueAt);
  const c = useColors();
  const styles = makeStyles(c);

  // Header shows a sync dot for this task so saves are visibly persisted (nothing when synced).
  useLayoutEffect(() => {
    nav.setOptions({
      title: 'Task',
      headerRight: () => (
        <View style={styles.headerDot}>
          <SyncDot status={status} />
        </View>
      ),
    });
  }, [nav, status, styles]);

  // One path for blur and the unmount flush (hardware/gesture back doesn't reliably fire onBlur).
  const saveTitle = useCallback(() => {
    const t = oneLine(titleRef.current).trim();
    if (!t || t === savedTitle.current) return;
    savedTitle.current = t;
    commands.renameItem(listId, itemId, t).catch(() => toastError("Couldn't rename task"));
  }, [listId, itemId, titleRef, savedTitle]);

  const saveNotes = useCallback(() => {
    const n = notesRef.current.trim() || null;
    if (n === (savedNotes.current || null)) return;
    savedNotes.current = n ?? '';
    commands.setNotes(listId, itemId, n).catch(() => toastError("Couldn't save notes"));
  }, [listId, itemId, notesRef, savedNotes]);

  const saveQuantity = useCallback(() => {
    const quantity = parseQuantity(qtyRef.current);
    const u = unitRef.current.trim() || null;
    if (quantity === parseQuantity(savedQty.current) && u === (savedUnit.current || null)) return;
    savedQty.current = quantity != null ? String(quantity) : '';
    savedUnit.current = u ?? '';
    commands.setQuantity(listId, itemId, quantity, u).catch(() => toastError("Couldn't set quantity"));
  }, [listId, itemId, qtyRef, unitRef, savedQty, savedUnit]);

  useEffect(() => () => {
    saveTitle();
    saveNotes();
    saveQuantity();
  }, [saveTitle, saveNotes, saveQuantity]);

  // Seed editable fields once the item loads (hooks read asynchronously), and adopt refreshed
  // server values into fields the user hasn't touched (input still equals the last-saved
  // baseline) — otherwise the unmount flush would re-enqueue the stale baseline with a newer
  // occurredAt and revert the remote edit under LWW. Fields mid-edit keep the local draft.
  const seededId = useRef<string | null>(null);
  useEffect(() => {
    if (!item) return;
    const fresh = seededId.current !== item.id;
    seededId.current = item.id;
    const adopt = (server: string, saved: { current: string }, latest: { current: string }, set: (v: string) => void) => {
      if (fresh || latest.current === saved.current) {
        set(server);
        latest.current = server;
      }
      saved.current = server;
    };
    adopt(item.title, savedTitle, titleRef, setTitle);
    adopt(item.notes ?? '', savedNotes, notesRef, setNotes);
    adopt(item.quantity != null ? String(item.quantity) : '', savedQty, qtyRef, setQty);
    adopt(item.unit ?? '', savedUnit, unitRef, setUnit);
  }, [item]);

  if (!item) {
    return (
      <View style={styles.fill}>
        <SyncBanner />
        {loading ? (
          <ActivityIndicator style={styles.loading} color={c.textSubtle} />
        ) : (
          <Text style={styles.empty}>This task is no longer available.</Text>
        )}
      </View>
    );
  }

  async function run(action: () => Promise<void>, failMsg: string) {
    try {
      await action();
    } catch {
      toastError(failMsg);
    }
  }

  const setDue = (iso: string | null) => run(() => commands.setDue(listId, itemId, iso), "Couldn't set due date");

  const setAssignee = (member: { principalId: string; email: string } | null) =>
    run(() => commands.assignItem(listId, itemId, member), "Couldn't assign task");

  const setPriority = (priority: number) => run(() => commands.setPriority(listId, itemId, priority), "Couldn't set priority");

  const toggleComplete = () => {
    if (!item!.completed) hapticSuccess();
    return run(() => commands.setCompleted(listId, itemId, !item!.completed), "Couldn't update task");
  };

  const toggleSub = (st: { id: string; completed: boolean }) => {
    if (!st.completed) hapticSuccess();
    return run(() => commands.setCompleted(listId, st.id, !st.completed), "Couldn't update subtask");
  };

  async function addSubtask() {
    const t = oneLine(subTitle).trim();
    if (!t) return;
    setSubTitle('');
    await run(() => commands.addItem(listId, t, nextChildSortOrder(items, itemId), itemId), "Couldn't add subtask");
  }

  function onDelete() {
    commands.deleteItems(listId, [itemId, ...descendantIds(items, itemId)], 'Task deleted').catch(() => toastError("Couldn't delete task"));
    nav.goBack();
  }

  function openNativeDate() {
    const current = item?.dueAt ? new Date(item.dueAt) : new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        onChange: (e, d) => {
          if (e.type === 'set' && d) void setDue(dueOnDate(d));
        },
      });
    } else {
      setIosDate(current);
    }
  }

  const dueActions: ActionItem[] = [
    ...DUE_QUICK.map(q => ({ label: q.label, onPress: () => void setDue(q.iso()) })),
    { label: 'Pick a date…', onPress: openNativeDate },
    ...(item.dueAt ? [{ label: 'Clear due date', destructive: true, onPress: () => void setDue(null) }] : []),
  ];

  const assigneeActions: ActionItem[] = [
    { label: 'Unassigned', selected: !item.assignedTo, onPress: () => void setAssignee(null) },
    ...members.map(m => ({
      label: m.displayName ?? m.email,
      selected: item.assignedTo === m.principalId,
      onPress: () => void setAssignee(m),
    })),
  ];

  const fmtDate = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SyncBanner />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput
          style={[styles.titleInput, item.completed && styles.titleDone]}
          value={title}
          // multiline is for visual wrapping only — titles are single-line data, so hard breaks
          // (pasted text) are stripped as typed and Enter commits instead of breaking the line.
          onChangeText={t => setTitle(oneLine(t))}
          onBlur={saveTitle}
          editable={canEdit}
          multiline
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          placeholder="Task title"
          placeholderTextColor={c.textSubtle}
          accessibilityLabel="Task title"
        />

        <List.Item
          style={styles.completeRow}
          title={item.completed ? 'Completed' : 'Mark complete'}
          onPress={canEdit ? () => void toggleComplete() : undefined}
          disabled={!canEdit}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.completed, disabled: !canEdit }}
          left={() => <Checkbox checked={item.completed} disabled={!canEdit} onPress={() => void toggleComplete()} />}
        />

        <View style={styles.card}>
          <DetailRow
            icon={ICONS.calendar}
            label="Due"
            value={due ? (due.overdue ? `Overdue · ${due.label}` : due.label) : 'None'}
            valueColor={due?.overdue ? c.danger : undefined}
            onPress={canEdit ? () => setDueMenu(true) : undefined}
          />
          <DetailRow
            icon={ICONS.account}
            label="Assignee"
            value={item.assignedTo ? personName(item.assignedTo) : 'Unassigned'}
            onPress={canEdit ? () => setAssigneeMenu(true) : undefined}
            divider={false}
          />
        </View>

        <Text variant="labelMedium" style={styles.section}>PRIORITY</Text>
        <View style={styles.priorityRow}>
          <PriorityControl
            simple={list?.simplePriority ?? true}
            value={item.priority}
            editable={canEdit}
            onChange={p => void setPriority(p)}
          />
          <Text variant="bodyLarge" style={styles.priorityHint}>
            {priorityLabel(list?.simplePriority ?? true, item.priority)}
          </Text>
        </View>

        {isShopping ? (
          <>
            <Text variant="labelMedium" style={styles.section}>QUANTITY</Text>
            <View style={styles.qtyRow}>
              <TextField
                value={qty}
                onChangeText={setQty}
                onBlur={saveQuantity}
                editable={canEdit}
                keyboardType="numeric"
                placeholder="Qty"
                style={styles.qtyInput}
                accessibilityLabel="Quantity"
              />
              <TextField
                value={unit}
                onChangeText={setUnit}
                onBlur={saveQuantity}
                editable={canEdit}
                placeholder="Unit (e.g. kg)"
                returnKeyType="done"
                style={styles.unitInput}
                accessibilityLabel="Unit"
              />
            </View>
          </>
        ) : null}

        <Text variant="labelMedium" style={styles.section}>NOTES</Text>
        <TextField
          value={notes}
          onChangeText={setNotes}
          onBlur={saveNotes}
          editable={canEdit}
          multiline
          placeholder={canEdit ? 'Add notes…' : undefined}
          accessibilityLabel="Task notes"
        />

        <Text variant="labelMedium" style={styles.section}>
          SUBTASKS{subtasks.length > 0 ? ` · ${subtasksDone}/${subtasks.length} done` : ''}
        </Text>
        {subtasks.length === 0 ? <Text variant="bodySmall" style={styles.noneText}>No subtasks</Text> : null}
        {subtasks.map(st => (
          <List.Item
            key={st.id}
            style={styles.subRow}
            title={st.title}
            titleNumberOfLines={1}
            titleStyle={st.completed ? styles.subDone : undefined}
            onPress={() => nav.push('TaskDetail', { listId, itemId: st.id })}
            accessibilityHint="Opens subtask"
            left={() => <Checkbox checked={st.completed} disabled={!canEdit} onPress={() => void toggleSub(st)} />}
            right={() => <MaterialIcons name={ICONS.chevronRight} size={16} color={c.textDisabled} />}
          />
        ))}
        {canEdit ? (
          <View style={styles.subAddRow}>
            <TextField
              style={styles.grow}
              placeholder="Add subtask…"
              value={subTitle}
              onChangeText={setSubTitle}
              onSubmitEditing={addSubtask}
              returnKeyType="done"
              accessibilityLabel="New subtask title"
            />
            <Button title="Add" onPress={addSubtask} disabled={!subTitle.trim()} />
          </View>
        ) : null}

        {item.createdBy || item.completedBy ? (
          <View style={styles.provenance}>
            {item.createdBy ? <Text variant="labelSmall" style={styles.provText}>Added by {personName(item.createdBy)}</Text> : null}
            {item.completed && item.completedBy ? (
              <Text variant="labelSmall" style={styles.provText}>
                Completed by {personName(item.completedBy)}
                {item.completedAt ? ` · ${fmtDate(item.completedAt)}` : ''}
              </Text>
            ) : null}
          </View>
        ) : null}

        {canEdit ? <Button title="Delete task" variant="destructive" onPress={onDelete} style={styles.delete} /> : null}
      </ScrollView>

      <ActionMenu visible={dueMenu} title="Due date" actions={dueActions} onClose={() => setDueMenu(false)} />
      <ActionMenu visible={assigneeMenu} title="Assignee" actions={assigneeActions} onClose={() => setAssigneeMenu(false)} />

      {/* iOS date picker (Android uses the imperative DateTimePickerAndroid dialog). */}
      <Modal visible={iosDate !== null} transparent animationType="slide" onRequestClose={() => setIosDate(null)}>
        <Pressable style={styles.iosBackdrop} onPress={() => setIosDate(null)}>
          <Pressable style={styles.iosSheet} onPress={() => {}}>
            {iosDate ? (
              <RNDateTimePicker value={iosDate} mode="date" display="inline" onChange={(_e, d) => d && setIosDate(d)} />
            ) : null}
            <Button
              title="Set date"
              onPress={() => {
                if (iosDate) void setDue(dueOnDate(iosDate));
                setIosDate(null);
              }}
              style={styles.iosSet}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    content: { padding: spacing.lg, paddingBottom: 48 },
    headerDot: { paddingRight: spacing.xs },
    // A TextInput takes no Paper variant, so the title type is spelled out here.
    titleInput: { fontSize: 26, fontWeight: '700', color: c.text, paddingVertical: spacing.sm },
    titleDone: { color: c.textDisabled, textDecorationLine: 'line-through' },
    completeRow: { paddingHorizontal: 0, marginBottom: spacing.md },
    card: { backgroundColor: c.surface, borderRadius: radii.lg, overflow: 'hidden' },
    section: { color: c.textSubtle, marginTop: spacing.xl, marginBottom: spacing.sm },
    noneText: { color: c.textMuted, marginBottom: spacing.sm },
    priorityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    priorityHint: { color: c.textMuted },
    qtyRow: { flexDirection: 'row', gap: spacing.sm },
    qtyInput: { flex: 1 },
    unitInput: { flex: 2 },
    grow: { flex: 1 },
    subRow: { paddingHorizontal: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider },
    subDone: { color: c.textDisabled, textDecorationLine: 'line-through' },
    subAddRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    provenance: { marginTop: spacing.xl, gap: 2 },
    provText: { color: c.textSubtle },
    delete: { marginTop: spacing.xl },
    iosBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    iosSheet: { backgroundColor: c.bg, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: spacing.lg },
    iosSet: { marginTop: spacing.sm },
    empty: { textAlign: 'center', color: c.textSubtle, marginTop: 40 },
    loading: { marginTop: 40 },
  });
