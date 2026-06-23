import { useState, type ReactNode } from 'react';
import type { SharedTagResponse } from '../../data/api/shareTypes';
import { collapseDescendants, type CompletedMode } from '../../domain/itemTree';
import type { ListActions, ListItem, ListViewModel } from './listController';
import { AddTaskBar } from './AddTaskBar';
import { TaskList } from './TaskList';
import { TaskDetail } from './TaskDetail';

const MODES: { value: CompletedMode; label: string }[] = [
  { value: 'inline', label: 'Inline' },
  { value: 'below', label: 'Below' },
  { value: 'hidden', label: 'Hidden' },
];

interface Props {
  list: ListViewModel;
  items: ListItem[];
  canEdit: boolean;
  tagsById: Map<string, SharedTagResponse>;
  actions: ListActions;
  /** Member surface only: list members for the assignee picker. Omitted on the share surface. */
  members?: { email: string }[];
  /** Optional control rendered in the header (e.g. a members/share button). */
  headerExtra?: ReactNode;
}

/** Presentational list + tasks, shared by the share and member surfaces. Owns view-only UI state
 *  (expanded set, completed-display mode, open task) — none persisted. Fetching lives in the hooks. */
export function ListView({ list, items, canEdit, tagsById, actions, members, headerExtra }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<CompletedMode>('inline');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isShopping = list.kind === 'Shopping';
  const simplePriority = list.simplePriority !== false; // default (undefined) = simple star mode
  const selected = selectedId ? (items.find(i => i.id === selectedId) ?? null) : null;

  const toggleExpand = (id: string) =>
    setExpanded(prev => (prev.has(id) ? collapseDescendants(prev, id, items) : new Set(prev).add(id)));

  return (
    <div className="share-view">
      <div className="color-stripe" style={{ background: list.color ?? 'transparent' }} />
      <header className="list-head">
        <div className="list-head-top">
          <h1 className="list-title">{list.name}</h1>
          {canEdit ? null : <span className="badge">View only</span>}
          {headerExtra}
        </div>
        <div className="seg" role="group" aria-label="Completed tasks display">
          {MODES.map(m => (
            <button
              key={m.value}
              type="button"
              className={`seg-btn${mode === m.value ? ' active' : ''}`}
              aria-pressed={mode === m.value}
              onClick={() => setMode(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </header>

      {canEdit ? <AddTaskBar onAdd={t => actions.addTask(t)} /> : null}

      <TaskList
        items={items}
        isShopping={isShopping}
        canEdit={canEdit}
        simplePriority={simplePriority}
        completedMode={mode}
        expanded={expanded}
        tagsById={tagsById}
        onToggle={actions.toggleComplete}
        onOpen={it => setSelectedId(it.id)}
        onToggleExpand={toggleExpand}
        onSetPriority={actions.setPriority}
        onDelete={actions.remove}
        onMove={actions.move}
      />

      {selected ? (
        <TaskDetail
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
