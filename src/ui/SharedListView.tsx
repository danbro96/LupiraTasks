import { useState } from 'react';
import { ApiError } from '../api/fetcher';
import { useSharedList } from '../hooks/useSharedList';
import { collapseDescendants, type CompletedMode } from '../domain/itemTree';
import { Centered } from './Centered';
import { AddTaskBar } from './AddTaskBar';
import { TaskList } from './TaskList';
import { TaskDetail } from './TaskDetail';

const MODES: { value: CompletedMode; label: string }[] = [
  { value: 'inline', label: 'Inline' },
  { value: 'below', label: 'Below' },
  { value: 'hidden', label: 'Hidden' },
];

/** The shared list, once a token is known. Owns view-only UI state (expanded set, completed-mode,
 *  open task) — none of it persisted, matching the no-browser-storage constraint. */
export function SharedListView({ token }: { token: string }) {
  const { query, list, items, canEdit, tagsById, actions } = useSharedList(token);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<CompletedMode>('inline');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (query.isLoading) return <Centered title="Loading…" />;

  if (query.isError || !list) {
    const status = query.error instanceof ApiError ? query.error.status : 0;
    if (status === 401 || status === 404) {
      return (
        <Centered title="This link is no longer valid">
          <p>It may have expired or been revoked. Ask whoever shared it for a new link.</p>
        </Centered>
      );
    }
    return (
      <Centered title={status === 429 ? 'Too many requests' : "Couldn't load this list"}>
        <p>{status === 429 ? 'Please wait a moment, then try again.' : 'Something went wrong reaching the server.'}</p>
        <button type="button" className="btn" onClick={() => void query.refetch()}>
          Retry
        </button>
      </Centered>
    );
  }

  const isShopping = list.kind === 'Shopping';
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
        completedMode={mode}
        expanded={expanded}
        tagsById={tagsById}
        onToggle={actions.toggleComplete}
        onOpen={it => setSelectedId(it.id)}
        onToggleExpand={toggleExpand}
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
          onClose={() => setSelectedId(null)}
          onOpen={it => setSelectedId(it.id)}
        />
      ) : null}
    </div>
  );
}
