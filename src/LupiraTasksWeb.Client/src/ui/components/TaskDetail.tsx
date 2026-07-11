import { useEffect, useMemo, useState } from 'react';
import type { ListActions, ListItem, ListViewModel } from './listController';
import { childrenOf } from '../../domain/itemTree';
import { dueInDays, dueNextWeekend, dueOnDate, formatDue, toDateInputValue } from '../../domain/dueDate';
import { oneLine } from '../../domain/text';
import { Checkbox } from './Checkbox';
import { AddTaskBar } from './AddTaskBar';
import { PriorityControl } from './PriorityControl';
import { priorityLabel } from '../../domain/priority';
import { CloseIcon } from './icons';

const DUE_QUICK: { label: string; iso: () => string }[] = [
  { label: 'Today', iso: () => dueInDays(0) },
  { label: 'Tomorrow', iso: () => dueInDays(1) },
  { label: 'This weekend', iso: dueNextWeekend },
  { label: 'Next week', iso: () => dueInDays(7) },
];

function fromDateInput(v: string): string | null {
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return null;
  return dueOnDate(new Date(y, m - 1, d));
}

interface Props {
  item: ListItem;
  list: ListViewModel;
  items: ListItem[];
  canEdit: boolean;
  actions: ListActions;
  /** Member surface only: list members for the assignee picker. Omitted on the share surface. */
  members?: { principalId: string; email: string; displayName?: string | null }[];
  onClose: () => void;
  onOpen: (item: ListItem) => void;
}

export function TaskDetail({ item, list, items, canEdit, actions, members, onClose, onOpen }: Props) {
  const isShopping = list.kind === 'Shopping';
  const simplePriority = list.simplePriority !== false;
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [qty, setQty] = useState(item.quantity != null ? String(item.quantity) : '');
  const [unit, setUnit] = useState(item.unit ?? '');

  // Reseed editable fields when a different task is opened (e.g. tapping into a subtask).
  useEffect(() => {
    setTitle(item.title);
    setNotes(item.notes ?? '');
    setQty(item.quantity != null ? String(item.quantity) : '');
    setUnit(item.unit ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const subtasks = useMemo(() => childrenOf(items, item.id), [items, item.id]);
  const subtasksDone = subtasks.filter(s => s.completed).length;
  const due = formatDue(item.dueAt);
  const itemTagIds = new Set(item.tags);

  function commitTitle() {
    const t = oneLine(title).trim();
    if (!t || t === item.title) return;
    actions.rename(item.id, t);
  }
  function commitNotes() {
    const n = notes.trim() || null;
    if ((n ?? null) === (item.notes ?? null)) return;
    actions.setNotes(item.id, n);
  }
  function commitQuantity() {
    const parsed = qty.trim() === '' ? null : Number(qty.trim());
    const qVal = parsed != null && Number.isFinite(parsed) ? parsed : null;
    const u = unit.trim() || null;
    if ((qVal ?? null) === (item.quantity ?? null) && (u ?? null) === (item.unit ?? null)) return;
    actions.setQuantity(item.id, qVal, u);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Task details" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          <input
            className={`title-input${item.completed ? ' done' : ''}`}
            value={title}
            disabled={!canEdit}
            placeholder="Task title"
            aria-label="Task title"
            onChange={e => setTitle(oneLine(e.target.value))}
            onBlur={commitTitle}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
          />

          <div className="complete-row">
            <Checkbox checked={item.completed} disabled={!canEdit} onChange={() => actions.toggleComplete(item)} />
            <span>{item.completed ? 'Completed' : 'Mark complete'}</span>
          </div>

          <div className="section-label">DUE</div>
          {canEdit ? (
            <div className="due-controls">
              <div className="chip-row">
                {DUE_QUICK.map(q => (
                  <button key={q.label} type="button" className="chip" onClick={() => actions.setDue(item.id, q.iso())}>
                    {q.label}
                  </button>
                ))}
                {item.dueAt ? (
                  <button type="button" className="chip danger" onClick={() => actions.setDue(item.id, null)}>
                    Clear
                  </button>
                ) : null}
              </div>
              <input
                type="date"
                className="text-input"
                value={toDateInputValue(item.dueAt)}
                aria-label="Pick a due date"
                onChange={e => actions.setDue(item.id, fromDateInput(e.target.value))}
              />
            </div>
          ) : (
            <p className={`field-value${due?.overdue ? ' overdue' : ''}`}>
              {due ? (due.overdue ? `Overdue · ${due.label}` : due.label) : 'None'}
            </p>
          )}

          <div className="section-label">PRIORITY</div>
          {canEdit ? (
            <div className="priority-detail">
              <PriorityControl
                simple={simplePriority}
                value={item.priority ?? 0}
                editable
                onChange={n => actions.setPriority(item.id, n)}
              />
              <span className="field-value">{priorityLabel(simplePriority, item.priority ?? 0)}</span>
            </div>
          ) : (
            <p className="field-value">{priorityLabel(simplePriority, item.priority ?? 0)}</p>
          )}

          {members && members.length > 0 ? (
            <>
              <div className="section-label">ASSIGNEE</div>
              {canEdit ? (
                <select
                  className="text-input"
                  value={item.assignee?.principalId ?? ''}
                  aria-label="Assignee"
                  onChange={e => {
                    const picked = e.target.value;
                    // The item carries a PersonRef, but assignee-set is still email-addressed.
                    actions.setAssignee(item.id, members.find(m => m.principalId === picked)?.email ?? null);
                  }}
                >
                  <option value="">Unassigned</option>
                  {members.map(m => (
                    <option key={m.principalId} value={m.principalId}>
                      {m.displayName ?? m.email}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="field-value">{item.assignee ? (item.assignee.displayName ?? item.assignee.email) : 'Unassigned'}</p>
              )}
            </>
          ) : null}

          {isShopping ? (
            <>
              <div className="section-label">QUANTITY</div>
              {canEdit ? (
                <div className="qty-row">
                  <input
                    className="text-input qty-input"
                    value={qty}
                    inputMode="decimal"
                    placeholder="Qty"
                    aria-label="Quantity"
                    onChange={e => setQty(e.target.value)}
                    onBlur={commitQuantity}
                  />
                  <input
                    className="text-input unit-input"
                    value={unit}
                    placeholder="Unit (e.g. kg)"
                    aria-label="Unit"
                    onChange={e => setUnit(e.target.value)}
                    onBlur={commitQuantity}
                  />
                </div>
              ) : (
                <p className="field-value">
                  {item.quantity != null || item.unit ? `${item.quantity ?? ''} ${item.unit ?? ''}`.trim() : 'None'}
                </p>
              )}
            </>
          ) : null}

          {list.tags.length > 0 ? (
            <>
              <div className="section-label">TAGS</div>
              <div className="chip-row">
                {list.tags.map(t => {
                  const on = itemTagIds.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`tag-chip toggle${on ? ' on' : ''}`}
                      style={on ? { backgroundColor: t.color } : undefined}
                      disabled={!canEdit}
                      aria-pressed={on}
                      onClick={() => actions.toggleTag(item.id, t.id, !on)}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          <div className="section-label">NOTES</div>
          {canEdit ? (
            <textarea
              className="text-input notes-input"
              value={notes}
              placeholder="Add notes…"
              aria-label="Task notes"
              onChange={e => setNotes(e.target.value)}
              onBlur={commitNotes}
            />
          ) : (
            <p className="field-value">{item.notes || 'None'}</p>
          )}

          <div className="section-label">
            SUBTASKS{subtasks.length > 0 ? ` · ${subtasksDone}/${subtasks.length} done` : ''}
          </div>
          {subtasks.length === 0 ? <p className="field-value">No subtasks</p> : null}
          {subtasks.map(st => (
            <div className="sub-row" key={st.id}>
              <Checkbox checked={st.completed} disabled={!canEdit} onChange={() => actions.toggleComplete(st)} />
              <button type="button" className={`sub-title${st.completed ? ' done' : ''}`} onClick={() => onOpen(st)}>
                {st.title}
              </button>
            </div>
          ))}
          {canEdit ? <AddTaskBar placeholder="Add subtask…" onAdd={t => actions.addTask(t, item.id)} /> : null}

          {canEdit ? (
            <button
              type="button"
              className="btn destructive delete-btn"
              onClick={() => {
                if (window.confirm('Delete this task and its subtasks?')) {
                  actions.remove(item);
                  onClose();
                }
              }}
            >
              Delete task
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
