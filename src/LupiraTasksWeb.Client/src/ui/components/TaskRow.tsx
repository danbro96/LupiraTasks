import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SharedItemResponse, SharedTagResponse } from '../../data/api/shareTypes';
import type { VisibleRow } from '../../domain/itemTree';
import { formatDue } from '../../domain/dueDate';
import { Checkbox } from './Checkbox';
import { PriorityControl } from './PriorityControl';
import { ChevronDownIcon, ChevronRightIcon, GripIcon, TrashIcon } from './icons';

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
      {draggable ? (
        <button type="button" className="row-grip" aria-label="Drag to reorder" {...attributes} {...listeners}>
          <GripIcon />
        </button>
      ) : (
        <span className="row-grip-spacer" />
      )}

      <Checkbox checked={item.completed} disabled={!canEdit} onChange={() => onToggle(item)} />

      <button type="button" className="row-body" onClick={() => onOpen(item)}>
        <span className={`title${item.completed ? ' done' : ''}`}>
          {qty ? <span className="qty">{qty} </span> : null}
          {item.title}
        </span>
        {(due || tags.length > 0) && !item.completed ? (
          <span className="meta-row">
            {due ? <span className={`meta${due.overdue ? ' overdue' : ''}`}>{due.label}</span> : null}
            {tags.map(t => (
              <span key={t.id} className="tag-chip" style={{ backgroundColor: t.color }}>
                {t.label}
              </span>
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
        <button
          type="button"
          className="icon-btn"
          aria-label={expanded ? 'Collapse subtasks' : 'Expand subtasks'}
          onClick={() => onToggleExpand(item.id)}
        >
          {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </button>
      ) : null}

      {canEdit ? (
        <button type="button" className="icon-btn row-delete" aria-label="Delete task" onClick={() => onDelete(item)}>
          <TrashIcon />
        </button>
      ) : null}
    </div>
  );
}
