import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { SharedItemResponse, SharedTagResponse } from '../../data/api/shared/models';
import type { VisibleRow } from '../../domain/itemTree';
import { changeLabel, type ActorRef, type ItemChangeKind } from '../../domain/itemChange';
import { formatDue } from '../../domain/dueDate';
import { Checkbox } from './Checkbox';
import { PriorityControl } from './PriorityControl';
import { GripIcon } from './icons';

const INDENT = 18; // px per nesting level

/** "2 kg"-style label for shopping items, or null when there's nothing to show. */
function qtyLabel(it: SharedItemResponse): string | null {
  if (it.quantity == null && !it.unit) return null;
  const q = it.quantity != null ? String(it.quantity) : '';
  return `${q}${q && it.unit ? ' ' : ''}${it.unit ?? ''}`.trim() || null;
}

interface Props {
  row: VisibleRow<SharedItemResponse>;
  isShopping: boolean;
  canEdit: boolean;
  /** The list's priority mode: a star (0↔1) when true, a 0–9 picker badge when false. */
  simplePriority: boolean;
  sortable: boolean;
  expanded: boolean;
  tagsById: Map<string, SharedTagResponse>;
  /** Set while someone else's edit to this row is being announced. */
  changeKind?: ItemChangeKind;
  changeActor?: ActorRef | null;
  onToggle: (item: SharedItemResponse) => void;
  onOpen: (item: SharedItemResponse) => void;
  onToggleExpand: (id: string) => void;
  onSetPriority: (itemId: string, priority: number) => void;
  onDelete: (item: SharedItemResponse) => void;
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
  const tags = item.tags.map(id => tagsById.get(id)).filter((t): t is SharedTagResponse => !!t);

  return (
    <div
      ref={setNodeRef}
      className={`row${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition, paddingLeft: 16 + depth * INDENT }}
    >
      {/* A child, not a background on .row: dnd-kit writes `transition` inline on that element. */}
      {changeKind ? <span className="row-highlight" aria-hidden="true" /> : null}

      {draggable ? (
        <button type="button" className="row-grip" aria-label={`Drag to reorder ${item.title}`} {...attributes} {...listeners}>
          <GripIcon />
        </button>
      ) : (
        <span className="row-grip-spacer" />
      )}

      <Checkbox checked={item.completed} disabled={!canEdit} onChange={() => onToggle(item)} />

      <button type="button" className="row-body" onClick={() => onOpen(item)}>
        {/* Notice shares the title's line: its own line would grow rows that have no meta line. */}
        <span className="title-line">
          <span className={`title${item.completed ? ' done' : ''}`}>
            {qty ? <span className="qty">{qty} </span> : null}
            {item.title}
          </span>
          {changeKind ? (
            <span className="row-change">{changeLabel(changeKind, changeActor ?? null)}</span>
          ) : null}
        </span>
        {(due || tags.length > 0) && !item.completed ? (
          <span className="meta-row">
            {due ? <span className={`meta${due.overdue ? ' overdue' : ''}`}>{due.label}</span> : null}
            {tags.map(t => (
              <Chip key={t.id} component="span" label={t.label} sx={{ bgcolor: t.color, color: '#fff' }} />
            ))}
          </span>
        ) : null}
      </button>

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
