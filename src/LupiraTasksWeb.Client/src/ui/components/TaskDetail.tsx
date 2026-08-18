import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import CloseIcon from '@mui/icons-material/Close';
import type { ListActions, ListItem, ListViewModel } from './listController';
import { childrenOf } from '../../domain/itemTree';
import { dueInDays, dueNextWeekend, dueOnDate, formatDue, toDateInputValue } from '../../domain/dueDate';
import { oneLine } from '../../domain/text';
import { Checkbox } from './Checkbox';
import { AddTaskBar } from './AddTaskBar';
import { PriorityControl } from './PriorityControl';
import { priorityLabel } from '../../domain/priority';

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

interface TaskFields {
  title: string;
  notes: string;
  quantity: string;
  unit: string;
}

function editableValues(item: ListItem): TaskFields {
  return {
    title: item.title,
    notes: item.notes ?? '',
    quantity: item.quantity != null ? String(item.quantity) : '',
    unit: item.unit ?? '',
  };
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
  const { control, getValues, reset } = useForm<TaskFields>({ defaultValues: editableValues(item) });
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Reseed editable fields when a different task is opened (e.g. tapping into a subtask).
  useEffect(() => {
    reset(editableValues(item));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, reset]);

  const subtasks = useMemo(() => childrenOf(items, item.id), [items, item.id]);
  const subtasksDone = subtasks.filter(s => s.completed).length;
  const due = formatDue(item.dueAt);
  const itemTagIds = new Set(item.tags);

  function commitTitle() {
    const t = oneLine(getValues('title')).trim();
    if (!t || t === item.title) return;
    actions.rename(item.id, t);
  }
  function commitNotes() {
    const n = getValues('notes').trim() || null;
    if ((n ?? null) === (item.notes ?? null)) return;
    actions.setNotes(item.id, n);
  }
  function commitQuantity() {
    const [qty, unit] = getValues(['quantity', 'unit']);
    const parsed = qty.trim() === '' ? null : Number(qty.trim());
    const qVal = parsed != null && Number.isFinite(parsed) ? parsed : null;
    const u = unit.trim() || null;
    if ((qVal ?? null) === (item.quantity ?? null) && (u ?? null) === (item.unit ?? null)) return;
    actions.setQuantity(item.id, qVal, u);
  }

  return (
    <>
      <Dialog open fullWidth maxWidth="sm" onClose={onClose} aria-labelledby="task-detail-title">
        <DialogTitle id="task-detail-title" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          Task details
          <IconButton size="small" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent>
          <Controller
            name="title"
            control={control}
            render={({ field }) => (
              <TextField
                fullWidth
                label="Task title"
                value={field.value}
                disabled={!canEdit}
                placeholder="Task title"
                sx={{
                  '& .MuiInputBase-input': {
                    fontSize: 22,
                    fontWeight: 700,
                    ...(item.completed && { color: 'text.disabled', textDecoration: 'line-through' }),
                  },
                }}
                inputRef={field.ref}
                onChange={e => field.onChange(oneLine(e.target.value))}
                onBlur={() => {
                  field.onBlur();
                  commitTitle();
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            )}
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
                  <Chip
                    key={q.label}
                    size="small"
                    variant="outlined"
                    label={q.label}
                    onClick={() => actions.setDue(item.id, q.iso())}
                  />
                ))}
                {item.dueAt ? (
                  <Chip size="small" variant="outlined" color="error" label="Clear" onClick={() => actions.setDue(item.id, null)} />
                ) : null}
              </div>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="Pick a due date"
                value={toDateInputValue(item.dueAt)}
                slotProps={{ inputLabel: { shrink: true } }}
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
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Assignee"
                  value={item.assignee?.principalId ?? ''}
                  slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                  onChange={e => {
                    const picked = e.target.value;
                    // The item carries a PersonRef, but assignee-set is still email-addressed.
                    actions.setAssignee(item.id, members.find(m => m.principalId === picked)?.email ?? null);
                  }}
                >
                  <MenuItem value="">Unassigned</MenuItem>
                  {members.map(m => (
                    <MenuItem key={m.principalId} value={m.principalId}>
                      {m.displayName ?? m.email}
                    </MenuItem>
                  ))}
                </TextField>
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
                  <Controller
                    name="quantity"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        size="small"
                        label="Quantity"
                        value={field.value}
                        placeholder="Qty"
                        sx={{ flex: 1 }}
                        slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                        inputRef={field.ref}
                        onChange={field.onChange}
                        onBlur={() => {
                          field.onBlur();
                          commitQuantity();
                        }}
                      />
                    )}
                  />
                  <Controller
                    name="unit"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        size="small"
                        label="Unit"
                        value={field.value}
                        placeholder="Unit (e.g. kg)"
                        sx={{ flex: 2 }}
                        inputRef={field.ref}
                        onChange={field.onChange}
                        onBlur={() => {
                          field.onBlur();
                          commitQuantity();
                        }}
                      />
                    )}
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
                    <Chip
                      key={t.id}
                      size="small"
                      label={t.label}
                      variant={on ? 'filled' : 'outlined'}
                      sx={on ? { bgcolor: t.color, color: '#fff' } : undefined}
                      disabled={!canEdit}
                      aria-pressed={on}
                      onClick={() => actions.toggleTag(item.id, t.id, !on)}
                    />
                  );
                })}
              </div>
            </>
          ) : null}

          <div className="section-label">NOTES</div>
          {canEdit ? (
            <Controller
              name="notes"
              control={control}
              render={({ field }) => (
                <TextField
                  fullWidth
                  multiline
                  minRows={3}
                  label="Task notes"
                  value={field.value}
                  placeholder="Add notes…"
                  inputRef={field.ref}
                  onChange={field.onChange}
                  onBlur={() => {
                    field.onBlur();
                    commitNotes();
                  }}
                />
              )}
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
        </DialogContent>

        {canEdit ? (
          <DialogActions>
            <Button variant="outlined" color="error" size="small" onClick={() => setConfirmingDelete(true)}>
              Delete task
            </Button>
          </DialogActions>
        ) : null}
      </Dialog>

      <Dialog open={confirmingDelete} onClose={() => setConfirmingDelete(false)} aria-labelledby="task-delete-title">
        <DialogTitle id="task-delete-title">Delete this task and its subtasks?</DialogTitle>
        <DialogActions>
          <Button variant="outlined" size="small" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            size="small"
            onClick={() => {
              actions.remove(item);
              onClose();
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
