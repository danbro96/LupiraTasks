import { useEffect, useRef, useState } from 'react';
import { StarIcon } from './icons';

const SCALE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

interface Props {
  /** The list's mode: a star toggling 0↔1 when true, a 0–9 picker badge when false. */
  simple: boolean;
  value: number;
  editable: boolean;
  onChange: (priority: number) => void;
}

/** Per-task priority control. Read-only (no controls) when not editable: a star for >0 in simple
 *  mode, the value badge in scale mode. */
export function PriorityControl({ simple, value, editable, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (simple) {
    const on = value > 0;
    if (!editable) return on ? <span className="priority-star on"><StarIcon filled /></span> : null;
    return (
      <button
        type="button"
        className={`icon-btn priority-star${on ? ' on' : ''}`}
        aria-label={on ? 'Clear priority' : 'Set priority'}
        aria-pressed={on}
        onClick={e => {
          e.stopPropagation();
          onChange(on ? 0 : 1);
        }}
      >
        <StarIcon filled={on} />
      </button>
    );
  }

  const badge = <span className={`priority-badge${value > 0 ? ' on' : ''}`}>{value}</span>;
  if (!editable) return badge;

  return (
    <div className="priority-wrap" ref={ref}>
      <button
        type="button"
        className="priority-badge-btn"
        aria-label={`Priority ${value}. Change.`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={e => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
      >
        {badge}
      </button>
      {open ? (
        <div className="priority-pop" role="listbox" aria-label="Priority">
          {SCALE.map(n => (
            <button
              key={n}
              type="button"
              role="option"
              aria-selected={n === value}
              className={`priority-pop-cell${n === value ? ' on' : ''}`}
              onClick={e => {
                e.stopPropagation();
                onChange(n);
                setOpen(false);
              }}
            >
              {n}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
