import { useState } from 'react';
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
      <input
        className="text-input"
        value={title}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={e => setTitle(oneLine(e.target.value))}
      />
      <button type="submit" className="btn primary" disabled={!title.trim()}>
        Add
      </button>
    </form>
  );
}
