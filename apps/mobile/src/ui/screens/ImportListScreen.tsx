import { useLayoutEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ListKind } from '@lupira/tasks-api/models';
import type { RootStackParamList } from '../navigation/types';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { SegmentedPicker } from '@danbro96/lupira-expo-paper/components/SegmentedPicker';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { SyncBanner } from '../components/SyncBanner';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';
import * as commands from '../../state/commands';
import { parseImport, type ImportedTask } from '../../domain/importTasks';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import { spacing, useColors, type Palette } from '../theme';

const KINDS = [ListKind.Todo, ListKind.Shopping] as const;
// Keyed by the full ListKind union (SegmentedPicker widens its label callback to ListKind). Agent lists
// aren't user-importable, so the label is inert — KINDS controls which chips actually render.
const KIND_LABELS: Record<ListKind, string> = { [ListKind.Todo]: 'To-do', [ListKind.Shopping]: 'Shopping', [ListKind.Agent]: 'Agent' };

async function enqueueImport(
  name: string,
  kind: ListKind,
  tasks: ImportedTask[],
  onImported: () => void,
  setBusy: (busy: boolean) => void,
) {
  setBusy(true);
  try {
    await commands.importList(name, kind, tasks);
    onImported();
  } catch (e) {
    toastError("Couldn't import list");
    logDebug('importList:error', e instanceof Error ? e.message : String(e));
  } finally {
    setBusy(false);
  }
}

export function ImportListScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ListKind>(ListKind.Todo);
  const [csvText, setCsvText] = useState('');
  const [busy, setBusy] = useState(false);
  const c = useColors();
  const styles = makeStyles(c);

  const parsed = csvText.trim() ? parseImport(csvText) : null;
  const canImport = !!name.trim() && parsed?.ok === true && !busy;

  // Prefill name/kind from a JSON export's header — but only while the user hasn't named the
  // list themselves, so a round-trip is one paste while a manual name is never clobbered.
  function changeCsvText(text: string) {
    setCsvText(text);
    const next = text.trim() ? parseImport(text) : null;
    if (next?.ok && next.name && !name.trim()) setName(next.name);
    if (next?.ok && (next.kind === ListKind.Todo || next.kind === ListKind.Shopping)) setKind(next.kind);
  }

  // Modal actions live in the header (always visible, reachable with the keyboard up) — same
  // pattern as CreateListScreen.
  useLayoutEffect(() => {
    const importList = async () => {
      if (!parsed?.ok || !name.trim()) return;
      await enqueueImport(name.trim(), kind, parsed.tasks, () => nav.goBack(), setBusy);
    };
    nav.setOptions({
      headerLeft: () => (
        <Button variant="text" title="Cancel" onPress={() => nav.goBack()} />
      ),
      headerRight: () => (
        <Button variant="text" title="Import" onPress={() => void importList()} disabled={!canImport} accessibilityLabel="Import list" />
      ),
    });
  }, [nav, parsed, name, kind, canImport]);

  const preview = parsed
    ? parsed.ok
      ? `${parsed.tasks.length} task${parsed.tasks.length === 1 ? '' : 's'}` +
        (parsed.tasks.some(t => t.completed) ? `, ${parsed.tasks.filter(t => t.completed).length} completed` : '')
      : parsed.error
    : 'Paste a JSON export or one task per line.';

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SyncBanner />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="labelMedium" style={styles.section}>NAME</Text>
        <TextField
          placeholder="List name…"
          value={name}
          onChangeText={setName}
          autoFocus
          returnKeyType="done"
          accessibilityLabel="List name"
        />

        <Text variant="labelMedium" style={styles.section}>TYPE</Text>
        <SegmentedPicker options={KINDS} selected={kind} onSelect={setKind} getLabel={k => KIND_LABELS[k]} />

        <Text variant="labelMedium" style={styles.section}>TASKS (JSON OR ONE PER LINE)</Text>
        <TextField
          placeholder={'Paste a JSON export…\nor just:\nMilk\nBread'}
          value={csvText}
          onChangeText={changeCsvText}
          multiline
          style={styles.csvInput}
          accessibilityLabel="Tasks to import"
        />
        <Text variant="bodySmall" style={[styles.preview, parsed && !parsed.ok && styles.previewError]}>{preview}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    content: { padding: spacing.lg, paddingBottom: 48 },
    section: { color: c.textSubtle, marginTop: spacing.xl, marginBottom: spacing.sm },
    csvInput: { minHeight: 160 },
    preview: { color: c.textMuted, marginTop: spacing.sm },
    previewError: { color: c.danger },
  });
