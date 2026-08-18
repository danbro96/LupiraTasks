import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
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
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MuiLink from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import { useLists } from '../../state/useLists';
import { useMe } from '../../state/useMe';
import { logout } from '../../data/api/session';
import { ApiError } from '../../data/api/fetcher';
import type { ListKind, ListResponse } from '../../data/api/member/models';
import { listColorOptions } from '../theme/colors';
import { Centered } from '../components/Centered';
import { GripIcon } from '../components/icons';

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
        <ChevronRightIcon fontSize="small" sx={{ color: 'text.disabled', flex: 'none' }} />
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
          <Button variant="contained" size="small" onClick={() => setCreating(true)}>
            New list
          </Button>
        </div>
        <div className="account-row">
          {me.data ? <span className="meta">{me.data.displayName ?? me.data.email}</span> : null}
          <MuiLink component="button" type="button" underline="hover" onClick={() => logout()}>
            Sign out
          </MuiLink>
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
          <Button variant="outlined" size="small" onClick={() => void query.refetch()}>
            Retry
          </Button>
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
  const { control, handleSubmit, setValue, watch } = useForm<{ name: string; kind: ListKind; color: string | null }>({
    defaultValues: { name: '', kind: 'Todo', color: null },
  });
  const trimmed = watch('name').trim();
  const color = watch('color');

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onCancel} aria-labelledby="create-list-title">
      <DialogTitle id="create-list-title" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        New list
        <IconButton size="small" aria-label="Close" onClick={onCancel}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <form
        onSubmit={handleSubmit(v => {
          const name = v.name.trim();
          if (name) onCreate(name, v.kind, v.color);
        })}
      >
        <DialogContent>
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <TextField
                fullWidth
                size="small"
                label="List name"
                value={field.value}
                placeholder="List name"
                autoFocus
                inputRef={field.ref}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />

          <div className="section-label">TYPE</div>
          <Controller
            name="kind"
            control={control}
            render={({ field }) => (
              <ToggleButtonGroup
                exclusive
                size="small"
                value={field.value}
                aria-label="List type"
                onChange={(_, next: ListKind | null) => {
                  if (next != null) field.onChange(next);
                }}
              >
                {(['Todo', 'Shopping'] as ListKind[]).map(k => (
                  <ToggleButton key={k} value={k}>
                    {k}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            )}
          />

          <div className="section-label">COLOR</div>
          <div className="color-row">
            {listColorOptions.map((c, i) => (
              <button
                key={i}
                type="button"
                aria-label={c ?? 'No color'}
                className={`color-swatch${color === c ? ' on' : ''}`}
                style={{ background: c ?? 'transparent', borderColor: c ?? 'var(--border)' }}
                onClick={() => setValue('color', c)}
              />
            ))}
          </div>

          {failed ? <p className="field-value overdue">Couldn't create the list. Try again.</p> : null}
        </DialogContent>
        <DialogActions>
          <Button type="submit" variant="contained" size="small" disabled={!trimmed || pending}>
            {pending ? 'Creating…' : 'Create list'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
