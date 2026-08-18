import { Controller, useForm } from 'react-hook-form';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { oneLine } from '../../domain/text';

interface Props {
  placeholder?: string;
  onAdd: (title: string) => void;
}

/** Quick-add input. Enter (or the Add button) commits a single-line, trimmed title. */
export function AddTaskBar({ placeholder = 'Add task…', onAdd }: Props) {
  const { control, handleSubmit, reset, watch } = useForm<{ title: string }>({ defaultValues: { title: '' } });
  const title = watch('title');

  return (
    <form
      className="add-bar"
      onSubmit={handleSubmit(v => {
        const t = oneLine(v.title).trim();
        if (!t) return;
        reset();
        onAdd(t);
      })}
    >
      <Controller
        name="title"
        control={control}
        render={({ field }) => (
          <TextField
            size="small"
            label={placeholder}
            value={field.value}
            inputRef={field.ref}
            sx={{ flex: 1 }}
            onChange={e => field.onChange(oneLine(e.target.value))}
            onBlur={field.onBlur}
          />
        )}
      />
      <Button type="submit" variant="contained" size="small" disabled={!title.trim()}>
        Add
      </Button>
    </form>
  );
}
