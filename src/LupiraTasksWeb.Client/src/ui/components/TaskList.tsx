import { useMemo } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { SharedItemResponse, SharedTagResponse } from '../../data/api/shareTypes';
import { rowsForMode, siblingReorder, type CompletedMode } from '../../domain/itemTree';
import type { ItemChange } from '../../domain/itemChange';
import { TaskRow } from './TaskRow';

interface Props {
  items: SharedItemResponse[];
  isShopping: boolean;
  canEdit: boolean;
  simplePriority: boolean;
  completedMode: CompletedMode;
  expanded: Set<string>;
  tagsById: Map<string, SharedTagResponse>;
  /** Rows currently announcing someone else's edit. */
  flashes: Map<string, ItemChange>;
  /** Completed rows to leave where they are while their flash runs. */
  held: ReadonlySet<string>;
  onToggle: (item: SharedItemResponse) => void;
  onOpen: (item: SharedItemResponse) => void;
  onToggleExpand: (id: string) => void;
  onSetPriority: (itemId: string, priority: number) => void;
  onDelete: (item: SharedItemResponse) => void;
  onMove: (itemId: string, sortOrder: string, parentItemId: string | null) => void;
}

export function TaskList({
  items,
  isShopping,
  canEdit,
  simplePriority,
  completedMode,
  expanded,
  tagsById,
  flashes,
  held,
  onToggle,
  onOpen,
  onToggleExpand,
  onSetPriority,
  onDelete,
  onMove,
}: Props) {
  const rows = useMemo(() => rowsForMode(items, expanded, completedMode, held), [items, expanded, completedMode, held]);
  // A held row still sits in the open section, so it must not be taken for the section start.
  const firstCompleted = completedMode === 'below' ? rows.findIndex(r => r.item.completed && !held.has(r.item.id)) : -1;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex(r => r.item.id === active.id);
    const newIndex = rows.findIndex(r => r.item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    // 'below' mode: keep reordering inside the open section (completed rows are pinned below).
    const boundary = completedMode === 'below' ? rows.findIndex(r => r.item.completed && !held.has(r.item.id)) : -1;
    if (boundary >= 0 && (oldIndex >= boundary || newIndex >= boundary)) return;
    const reordered = arrayMove(rows, oldIndex, newIndex);
    const scope = boundary >= 0 ? reordered.slice(0, boundary) : reordered;
    const target = siblingReorder(scope, String(active.id));
    if (target) onMove(String(active.id), target.sortOrder, target.parentItemId);
  }

  if (rows.length === 0) {
    return <p className="empty">No tasks yet.</p>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={rows.map(r => r.item.id)} strategy={verticalListSortingStrategy}>
        <div className="task-list" role="list">
          {rows.map((row, i) => (
            <div key={row.item.id} role="listitem">
              {i === firstCompleted ? <div className="section-label">COMPLETED</div> : null}
              <TaskRow
                row={row}
                isShopping={isShopping}
                canEdit={canEdit}
                simplePriority={simplePriority}
                sortable={!(completedMode === 'below' && row.item.completed)}
                expanded={expanded.has(row.item.id)}
                tagsById={tagsById}
                changeKind={flashes.get(row.item.id)?.kind}
                changeActor={flashes.get(row.item.id)?.actor ?? null}
                onToggle={onToggle}
                onOpen={onOpen}
                onToggleExpand={onToggleExpand}
                onSetPriority={onSetPriority}
                onDelete={onDelete}
              />
            </div>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
