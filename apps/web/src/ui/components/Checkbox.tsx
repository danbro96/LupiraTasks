import MuiCheckbox from '@mui/material/Checkbox';

interface Props {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label?: string | null;
}

/** A square checkbox matching the mobile app's tick affordance. */
export function Checkbox({ checked, disabled, onChange, label }: Props) {
  const ariaLabel = label === null ? undefined : (label ?? (checked ? 'Mark incomplete' : 'Mark complete'));

  return (
    <MuiCheckbox
      size="small"
      checked={checked}
      disabled={disabled}
      onClick={e => e.stopPropagation()}
      onChange={onChange}
      slotProps={{ input: { 'aria-label': ariaLabel } }}
      sx={{ flex: 'none' }}
    />
  );
}
