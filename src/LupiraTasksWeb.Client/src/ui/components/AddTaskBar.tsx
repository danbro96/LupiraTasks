import { useState } from 'react';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { oneLine } from '../../domain/text';

interface Props {
  placeholder?: string;
  onAdd: (title: string) => void;
}

/** Quick-add input. Enter (or the Add button) commits a single-line, trimmed title. */
export function AddTaskBar({ placeholder = 'Add task…', onAdd }: Props) {
  const [title, setTitle] = useState('');

  function commit() {
    const t = oneLine(title).trim();
    if (!t) return;
    setTitle('');
    onAdd(t);
  }

  return (
    <form
      className="add-bar"
      onSubmit={e => {
        e.preventDefault();
        commit();
      }}
    >
      <TextField
        size="small"
        label={placeholder}
        value={title}
        onChange={e => setTitle(oneLine(e.target.value))}
        sx={{ flex: 1 }}
      />
      <Button type="submit" variant="contained" size="small" disabled={!title.trim()}>
        Add
      </Button>
    </form>
  );
}
