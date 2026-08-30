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
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MuiLink from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import { useLists } from '../../state/useLists';
import { useMe } from '../../state/useMe';
import { logout } from '../../data/api/session';
import { ApiError } from '../../data/api/fetcher';
import type { ListKind, ListDto } from '../../data/api/member/models';
import { listColorOptions } from '../theme/colors';
import { Centered } from '../components/Centered';
import { DragIcon } from '../icons';

/** One list row: a drag grip plus a link into the list. The grip owns the drag listeners so the
 *  link stays clickable (same split as TaskRow). */
function ListRow({ list }: { list: ListDto }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: list.id });

  return (
    <div
      ref={setNodeRef}
      role="listitem"
      className={`list-row${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button type="button" className="row-grip" aria-label={`Reorder ${list.name}`} {...attributes} {...listeners}>
        <DragIcon fontSize="small" />
      </button>
      <Box
        component={Link}
        to={`/lists/${list.id}`}
        sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
      >
        <Box
          component="span"
          sx={{ width: 14, height: 14, borderRadius: '999px', border: 1, flex: 'none' }}
          style={{ background: list.color ?? 'transparent', borderColor: list.color ?? 'var(--mui-palette-border)' }}
        />
        <Typography component="span" sx={{ flex: 1, fontSize: 16, overflowWrap: 'anywhere' }}>{list.name}</Typography>
        {list.kind === 'Shopping' ? <Chip variant="outlined" label="Shopping" /> : null}
        <ChevronRightIcon fontSize="small" sx={{ color: 'text.disabled', flex: 'none' }} />
      </Box>
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
      <Box component="header" sx={{ p: 2, borderBottom: 1, borderColor: 'divider', position: 'sticky', top: 0, bgcolor: 'background.default', zIndex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700, m: 0, flex: 1, overflowWrap: 'anywhere' }}>Lupira Tasks</Typography>
          <Button variant="contained" onClick={() => setCreating(true)}>
            New list
          </Button>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1 }}>
          {me.data ? <Typography variant="caption" sx={{ color: 'text.secondary' }}>{me.data.displayName ?? me.data.email}</Typography> : null}
          <MuiLink component="button" type="button" onClick={() => logout()}>
            Sign out
          </MuiLink>
        </Box>
      </Box>

      {query.isLoading ? (
        <Centered title="Loading…" />
      ) : query.isError ? (
        <Centered title="Couldn't load your lists">
          <p>
            {query.error instanceof ApiError && query.error.status === 401
              ? 'Your session expired — try signing in again.'
              : 'Something went wrong reaching the server.'}
          </p>
          <Button variant="outlined" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </Centered>
      ) : lists.length === 0 ? (
        <Typography component="p" sx={{ textAlign: 'center', color: 'text.subtle', mt: 6 }}>No lists yet — create your first one.</Typography>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={lists.map(l => l.id)} strategy={verticalListSortingStrategy}>
            <Box role="list" sx={{ pb: 3 }}>
              {lists.map(l => <ListRow key={l.id} list={l} />)}
            </Box>
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
  const { control, handleSubmit, watch } = useForm<{ name: string; kind: ListKind; color: string | null }>({
    defaultValues: { name: '', kind: 'Todo', color: null },
  });
  const trimmed = watch('name').trim();

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onCancel} aria-labelledby="create-list-title">
      <DialogTitle id="create-list-title">
        New list
        <IconButton aria-label="Close" onClick={onCancel}>
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

          <Typography variant="overline" component="div" sx={{ display: 'block', color: 'text.subtle', p: '16px 16px 8px' }}>TYPE</Typography>
          <Controller
            name="kind"
            control={control}
            render={({ field }) => (
              <ToggleButtonGroup
                exclusive
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

          <Typography variant="overline" component="div" sx={{ display: 'block', color: 'text.subtle', p: '16px 16px 8px' }}>COLOR</Typography>
          <Controller
            name="color"
            control={control}
            render={({ field }) => (
              <ToggleButtonGroup
                exclusive
                value={field.value ?? ''}
                aria-label="List color"
                onChange={(_, next: string | null) => field.onChange(next || null)}
                sx={{
                  flexWrap: 'wrap',
                  gap: 1,
                  '& .MuiToggleButtonGroup-grouped': {
                    width: 30,
                    height: 30,
                    minWidth: 0,
                    ml: 0,
                    border: '2px solid',
                    borderRadius: '50%',
                    '&.Mui-selected': { outline: 2, outlineStyle: 'solid', outlineColor: 'primary.main', outlineOffset: '2px' },
                  },
                }}
              >
                {listColorOptions.map((c, i) => (
                  <ToggleButton
                    key={i}
                    value={c ?? ''}
                    aria-label={c ?? 'No color'}
                    style={{ background: c ?? 'transparent', borderColor: c ?? 'var(--mui-palette-border)' }}
                  />
                ))}
              </ToggleButtonGroup>
            )}
          />

          {failed ? (
            <Alert severity="error" variant="outlined">
              Couldn't create the list. Try again.
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button type="submit" variant="contained" disabled={!trimmed || pending}>
            {pending ? 'Creating…' : 'Create list'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
