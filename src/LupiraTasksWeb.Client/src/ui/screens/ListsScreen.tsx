import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLists } from '../../state/useLists';
import { useMe } from '../../state/useMe';
import { logout } from '../../data/api/session';
import { ApiError } from '../../data/api/fetcher';
import type { ListKind, ListResponse } from '../../data/api/listTypes';
import { listColorOptions } from '../theme/colors';
import { Centered } from '../components/Centered';
import { ChevronRightIcon, CloseIcon, GripIcon } from '../components/icons';

/** One list row: a drag grip plus a link into the list. The grip owns the drag listeners so the
 *  link stays clickable (same split as TaskRow). */
function ListRow({ list }: { list: ListResponse }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: list.id });

  return (
    <div
      ref={setNodeRef}
      role="listitem"
      className={`list-row${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button type="button" className="row-grip" aria-label={`Reorder ${list.name}`} {...attributes} {...listeners}>
        <GripIcon />
      </button>
      <Link to={`/lists/${list.id}`} className="list-row-link">
        <span
          className="color-dot"
          style={{ background: list.color ?? 'transparent', borderColor: list.color ?? 'var(--border)' }}
        />
        <span className="list-row-name">{list.name}</span>
        {list.kind === 'Shopping' ? <span className="badge">Shopping</span> : null}
        <ChevronRightIcon className="row-chevron" />
      </Link>
    </div>
  );
}

/** The SSO landing: the caller's lists (mirrors the mobile ListsScreen). Each row links to its tasks,
 *  and the grip reorders them — per-user, so a shared list can sit elsewhere for other members. */
export function ListsScreen() {
  const { query, lists, create, reorder } = useLists();
  const me = useMe();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = lists.findIndex(l => l.id === active.id);
    const to = lists.findIndex(l => l.id === over.id);
    if (from < 0 || to < 0) return;
    reorder.mutate({ from, to });
  }

  return (
    <div>
      <header className="list-head">
        <div className="list-head-top">
          <h1 className="list-title">Lupira Tasks</h1>
          <button type="button" className="btn primary" onClick={() => setCreating(true)}>
            New list
          </button>
        </div>
        <div className="account-row">
          {me.data ? <span className="meta">{me.data.displayName ?? me.data.email}</span> : null}
          <button type="button" className="linklike" onClick={() => logout()}>
            Sign out
          </button>
        </div>
      </header>

      {query.isLoading ? (
        <Centered title="Loading…" />
      ) : query.isError ? (
        <Centered title="Couldn't load your lists">
          <p>
            {query.error instanceof ApiError && query.error.status === 401
              ? 'Your session expired — try signing in again.'
              : 'Something went wrong reaching the server.'}
          </p>
          <button type="button" className="btn" onClick={() => void query.refetch()}>
            Retry
          </button>
        </Centered>
      ) : lists.length === 0 ? (
        <p className="empty">No lists yet — create your first one.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={lists.map(l => l.id)} strategy={verticalListSortingStrategy}>
            <div className="list-rows" role="list">
              {lists.map(l => <ListRow key={l.id} list={l} />)}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {creating ? (
        <CreateListModal
          pending={create.isPending}
          failed={create.isError}
          onCancel={() => setCreating(false)}
          onCreate={(name, kind, color) =>
            create.mutate({ name, kind, color }, { onSuccess: list => navigate(`/lists/${list.id}`) })
          }
        />
      ) : null}
    </div>
  );
}

function CreateListModal({
  pending,
  failed,
  onCancel,
  onCreate,
}: {
  pending: boolean;
  failed: boolean;
  onCancel: () => void;
  onCreate: (name: string, kind: ListKind, color: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ListKind>('Todo');
  const [color, setColor] = useState<string | null>(null);
  const trimmed = name.trim();

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="New list" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <button type="button" className="icon-btn" aria-label="Close" onClick={onCancel}>
            <CloseIcon />
          </button>
        </div>
        <form
          className="modal-body"
          onSubmit={e => {
            e.preventDefault();
            if (trimmed) onCreate(trimmed, kind, color);
          }}
        >
          <div className="section-label">NAME</div>
          <input
            className="text-input"
            value={name}
            placeholder="List name"
            aria-label="List name"
            autoFocus
            onChange={e => setName(e.target.value)}
          />

          <div className="section-label">TYPE</div>
          <div className="seg" role="group" aria-label="List type">
            {(['Todo', 'Shopping'] as ListKind[]).map(k => (
              <button
                key={k}
                type="button"
                className={`seg-btn${kind === k ? ' active' : ''}`}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {k}
              </button>
            ))}
          </div>

          <div className="section-label">COLOR</div>
          <div className="color-row">
            {listColorOptions.map((c, i) => (
              <button
                key={i}
                type="button"
                aria-label={c ?? 'No color'}
                className={`color-swatch${color === c ? ' on' : ''}`}
                style={{ background: c ?? 'transparent', borderColor: c ?? 'var(--border)' }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>

          {failed ? <p className="field-value overdue">Couldn't create the list. Try again.</p> : null}
          <button type="submit" className="btn primary delete-btn" disabled={!trimmed || pending}>
            {pending ? 'Creating…' : 'Create list'}
          </button>
        </form>
      </div>
    </div>
  );
}
