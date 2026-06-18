import { CheckIcon } from './icons';

interface Props {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label?: string;
}

/** A square checkbox matching the mobile app's tick affordance. */
export function Checkbox({ checked, disabled, onChange, label }: Props) {
  return (
    <button
      type="button"
      className={`checkbox${checked ? ' checked' : ''}`}
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? (checked ? 'Mark incomplete' : 'Mark complete')}
      disabled={disabled}
      onClick={e => {
        e.stopPropagation();
        onChange();
      }}
    >
      {checked ? <CheckIcon size={15} /> : null}
    </button>
  );
}
