import { Controller, useForm } from 'react-hook-form';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import { oneLine } from '@lupira/tasks-domain/text';

interface Props {
  placeholder?: string;
  onAdd: (title: string) => void;
}

/** Quick-add input. Enter (or the Add button) commits a single-line, trimmed title. */
export function AddTaskBar({ placeholder = 'Add task…', onAdd }: Props) {
  const { control, handleSubmit, reset, watch } = useForm<{ title: string }>({ defaultValues: { title: '' } });
  const title = watch('title');

  return (
    <Box
      component="form"
      sx={{ display: 'flex', gap: 1, p: '12px 16px' }}
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
            label={placeholder}
            value={field.value}
            inputRef={field.ref}
            sx={{ flex: 1 }}
            onChange={e => field.onChange(oneLine(e.target.value))}
            onBlur={field.onBlur}
          />
        )}
      />
      <Button type="submit" variant="contained" disabled={!title.trim()}>
        Add
      </Button>
    </Box>
  );
}
