import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { SharedItemDto, SharedTagDto } from '../../data/api/shared/models';
import type { VisibleRow } from '../../domain/itemTree';
import { changeLabel, type ActorRef, type ItemChangeKind } from '../../domain/itemChange';
import { formatDue } from '../../domain/dueDate';
import { Checkbox } from './Checkbox';
import { PriorityControl } from './PriorityControl';
import { DragIcon } from '../icons';

const INDENT = 18; // px per nesting level

/** "2 kg"-style label for shopping items, or null when there's nothing to show. */
function qtyLabel(it: SharedItemDto): string | null {
  if (it.quantity == null && !it.unit) return null;
  const q = it.quantity != null ? String(it.quantity) : '';
  return `${q}${q && it.unit ? ' ' : ''}${it.unit ?? ''}`.trim() || null;
}

interface Props {
  row: VisibleRow<SharedItemDto>;
  isShopping: boolean;
  canEdit: boolean;
  /** The list's priority mode: a star (0↔1) when true, a 0–9 picker badge when false. */
  simplePriority: boolean;
  sortable: boolean;
  expanded: boolean;
  tagsById: Map<string, SharedTagDto>;
  /** Set while someone else's edit to this row is being announced. */
  changeKind?: ItemChangeKind;
  changeActor?: ActorRef | null;
  onToggle: (item: SharedItemDto) => void;
  onOpen: (item: SharedItemDto) => void;
  onToggleExpand: (id: string) => void;
  onSetPriority: (itemId: string, priority: number) => void;
  onDelete: (item: SharedItemDto) => void;
}

export function TaskRow({
  row,
  isShopping,
  canEdit,
  simplePriority,
  sortable,
  expanded,
  tagsById,
  changeKind,
  changeActor,
  onToggle,
  onOpen,
  onToggleExpand,
  onSetPriority,
  onDelete,
}: Props) {
  const { item, depth, hasChildren } = row;
  const draggable = canEdit && sortable;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !draggable,
  });

  const due = formatDue(item.dueAt);
  const qty = isShopping ? qtyLabel(item) : null;
  const tags = item.tags.map(id => tagsById.get(id)).filter((t): t is SharedTagDto => !!t);

  return (
    <div
      ref={setNodeRef}
      className={`row${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition, paddingLeft: 16 + depth * INDENT }}
    >
      {/* A child, not a background on .row: dnd-kit writes `transition` inline on that element. */}
      {changeKind ? (
        <span
          className="pointer-events-none absolute inset-0 bg-[var(--mui-palette-remoteChange)] animate-remote-flash motion-reduce:animate-none motion-reduce:opacity-100"
          aria-hidden="true"
        />
      ) : null}

      {draggable ? (
        <button type="button" className="row-grip" aria-label={`Drag to reorder ${item.title}`} {...attributes} {...listeners}>
          <DragIcon fontSize="small" />
        </button>
      ) : (
        <Box component="span" sx={{ width: 22, flex: 'none' }} />
      )}

      <Checkbox checked={item.completed} disabled={!canEdit} onChange={() => onToggle(item)} />

      <ButtonBase
        onClick={() => onOpen(item)}
        sx={{ flex: 1, minWidth: 0, flexDirection: 'column', alignItems: 'stretch', gap: '2px', textAlign: 'left', color: 'inherit' }}
      >
        {/* Notice shares the title's line: its own line would grow rows that have no meta line. */}
        <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
          <Typography
            component="span"
            sx={{
              flex: 1,
              minWidth: 0,
              fontSize: 16,
              ...(item.completed
                ? { color: 'text.disabled', textDecoration: 'line-through' }
                : { color: 'text.primary' }),
            }}
          >
            {qty ? (
              <Box component="span" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                {qty}{' '}
              </Box>
            ) : null}
            {item.title}
          </Typography>
          {changeKind ? (
            <Typography
              component="span"
              sx={{
                flex: 'none',
                maxWidth: '45%',
                fontSize: 11,
                fontWeight: 600,
                color: 'primary.main',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {changeLabel(changeKind, changeActor ?? null)}
            </Typography>
          ) : null}
        </Box>
        {(due || tags.length > 0) && !item.completed ? (
          <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
            {due ? (
              <Typography
                component="span"
                sx={{ fontSize: 11, ...(due.overdue ? { color: 'error.main', fontWeight: 600 } : { color: 'text.secondary' }) }}
              >
                {due.label}
              </Typography>
            ) : null}
            {tags.map(t => (
              <Chip key={t.id} component="span" label={t.label} sx={{ bgcolor: t.color, color: '#fff' }} />
            ))}
          </Box>
        ) : null}
      </ButtonBase>

      <PriorityControl
        simple={simplePriority}
        value={item.priority ?? 0}
        editable={canEdit}
        onChange={n => onSetPriority(item.id, n)}
      />

      {hasChildren ? (
        <IconButton
          aria-label={expanded ? 'Collapse subtasks' : 'Expand subtasks'}
          onClick={() => onToggleExpand(item.id)}
          sx={{ flex: 'none' }}
        >
          {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        </IconButton>
      ) : null}

      {canEdit ? (
        <IconButton
          aria-label="Delete task"
          onClick={() => onDelete(item)}
          sx={{
            flex: 'none',
            color: 'text.disabled',
            opacity: 0,
            '.row:hover &, .row:focus-within &': { opacity: 1 },
            '@media (hover: none)': { opacity: 1 },
          }}
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      ) : null}
    </div>
  );
}
