import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Chip from '@mui/material/Chip';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SharedTagDto } from '../../data/api/shared/models';
import { collapseDescendants, type CompletedMode } from '../../domain/itemTree';
import type { ItemChange } from '../../domain/itemChange';
import type { RemoteChanges } from '../../state/useRemoteChanges';
import { useListPollPaused } from '../../state/usePollInterval';
import type { ListActions, ListItem, ListViewModel } from '../listController';
import { AddTaskBar } from './AddTaskBar';
import { TaskList } from './TaskList';
import { TaskDetail } from './TaskDetail';

const MODES: { value: CompletedMode; label: string }[] = [
  { value: 'inline', label: 'Inline' },
  { value: 'below', label: 'Below' },
  { value: 'hidden', label: 'Hidden' },
];

/** How long a remotely-changed row stays highlighted and held in place. Keep in step with the
 *  `remote-flash` keyframes in index.css. */
const REMOTE_FLASH_MS = 4000;

interface Props {
  list: ListViewModel;
  items: ListItem[];
  canEdit: boolean;
  tagsById: Map<string, SharedTagDto>;
  actions: ListActions;
  /** Member surface only: list members for the assignee picker. Omitted on the share surface. */
  members?: { principalId: string; email: string; displayName?: string | null }[];
  /** Optional control rendered in the header (e.g. a members/share button). */
  headerExtra?: ReactNode;
  /** Edits that arrived from someone else, to announce on the affected rows. */
  changes: RemoteChanges;
}

/** Presentational list + tasks, shared by the share and member surfaces. Owns view-only UI state
 *  (expanded set, completed-display mode, open task) — none persisted. Fetching lives in the hooks. */
export function ListView({ list, items, canEdit, tagsById, actions, members, headerExtra, changes }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<CompletedMode>('inline');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Each batch owns its expiry timer — a change arriving mid-flash must not cancel the previous
  // batch's cleanup and leave those rows highlighted for good.
  const [flashes, setFlashes] = useState<Map<string, ItemChange>>(new Map());
  const flashTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => flashTimers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (changes.list.length === 0) return;
    const batch = changes.list;
    setFlashes(prev => {
      const next = new Map(prev);
      for (const c of batch) next.set(c.itemId, c);
      return next;
    });
    flashTimers.current.push(
      setTimeout(() => {
        setFlashes(prev => {
          const next = new Map(prev);
          for (const c of batch) next.delete(c.itemId);
          return next;
        });
      }, REMOTE_FLASH_MS),
    );
  }, [changes]);

  // Held in place until the flash ends: otherwise a remote completion hides the row, or flings it to
  // the COMPLETED section, at the instant it changes.
  const heldCompleted = useMemo(
    () => new Set([...flashes.values()].filter(c => c.kind === 'completed').map(c => c.itemId)),
    [flashes],
  );

  const pollPaused = useListPollPaused();
  const isShopping = list.kind === 'Shopping';
  const simplePriority = list.simplePriority !== false; // default (undefined) = simple star mode
  const selected = selectedId ? (items.find(i => i.id === selectedId) ?? null) : null;

  const toggleExpand = (id: string) =>
    setExpanded(prev => (prev.has(id) ? collapseDescendants(prev, id, items) : new Set(prev).add(id)));

  return (
    <div>
      <Box sx={{ height: 5 }} style={{ background: list.color ?? 'transparent' }} />
      <Box component="header" sx={{ p: 2, borderBottom: 1, borderColor: 'divider', position: 'sticky', top: 0, bgcolor: 'background.default', zIndex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700, m: 0, flex: 1, overflowWrap: 'anywhere' }}>{list.name}</Typography>
          {canEdit ? null : <Chip variant="outlined" label="View only" />}
          {headerExtra}
        </Box>
        <ToggleButtonGroup
          exclusive
          value={mode}
          onChange={(_, next: CompletedMode | null) => next != null && setMode(next)}
          aria-label="Completed tasks display"
          sx={{ mt: 1.5 }}
        >
          {MODES.map(m => (
            <ToggleButton key={m.value} value={m.value}>
              {m.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {pollPaused ? (
        <Typography component="p" role="status" sx={{ p: '6px 16px', bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', color: 'text.secondary', fontSize: 11, textAlign: 'center' }}>
          Auto-refresh paused while idle — any activity resumes it.
        </Typography>
      ) : null}

      {canEdit ? <AddTaskBar onAdd={t => actions.addTask(t)} /> : null}

      <TaskList
        items={items}
        isShopping={isShopping}
        canEdit={canEdit}
        simplePriority={simplePriority}
        completedMode={mode}
        expanded={expanded}
        tagsById={tagsById}
        flashes={flashes}
        held={heldCompleted}
        onToggle={actions.toggleComplete}
        onOpen={it => setSelectedId(it.id)}
        onToggleExpand={toggleExpand}
        onSetPriority={actions.setPriority}
        onDelete={actions.remove}
        onMove={actions.move}
      />

      {selected ? (
        <TaskDetail
          key={selected.id}
          item={selected}
          list={list}
          items={items}
          canEdit={canEdit}
          actions={actions}
          members={members}
          onClose={() => setSelectedId(null)}
          onOpen={it => setSelectedId(it.id)}
        />
      ) : null}
    </div>
  );
}
