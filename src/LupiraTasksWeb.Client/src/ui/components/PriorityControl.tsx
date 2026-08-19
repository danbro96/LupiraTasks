import { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';

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
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (simple) {
    const on = value > 0;
    if (!editable) return on ? <span className="priority-star on"><StarIcon fontSize="small" /></span> : null;
    return (
      <IconButton
        color={on ? 'primary' : 'default'}
        aria-label={on ? 'Clear priority' : 'Set priority'}
        aria-pressed={on}
        onClick={e => {
          e.stopPropagation();
          onChange(on ? 0 : 1);
        }}
        sx={{ flex: 'none' }}
      >
        {on ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
      </IconButton>
    );
  }

  const badge = <span className={`priority-badge${value > 0 ? ' on' : ''}`}>{value}</span>;
  if (!editable) return badge;

  return (
    <>
      <IconButton
        aria-label={`Priority ${value}. Change.`}
        aria-haspopup="listbox"
        aria-expanded={anchor != null}
        onClick={e => {
          e.stopPropagation();
          setAnchor(e.currentTarget);
        }}
        sx={{ flex: 'none' }}
      >
        {badge}
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={anchor != null}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          list: {
            role: 'listbox',
            'aria-label': 'Priority',
            sx: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0.5, p: 1 },
          },
        }}
      >
        {SCALE.map(n => (
          <MenuItem
            key={n}
            role="option"
            selected={n === value}
            aria-selected={n === value}
            onClick={e => {
              e.stopPropagation();
              onChange(n);
              setAnchor(null);
            }}
            sx={{ justifyContent: 'center', minWidth: 34, minHeight: 34, borderRadius: 1 }}
          >
            {n}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
