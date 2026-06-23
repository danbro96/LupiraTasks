import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLists } from '../../state/useLists';
import { useMe } from '../../state/useMe';
import { logout } from '../../data/api/session';
import { ApiError } from '../../data/api/fetcher';
import type { ListKind } from '../../data/api/listTypes';
import { listColorOptions } from '../theme/colors';
import { Centered } from '../components/Centered';
import { ChevronRightIcon, CloseIcon } from '../components/icons';

/** The SSO landing: the caller's lists (mirrors the mobile ListsScreen). Each row links to its tasks. */
export function ListsScreen() {
  const { query, lists, create } = useLists();
  const me = useMe();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <header className="list-head">
        <div className="list-head-top">
          <h1 className="list-title">Lupira Tasks</h1>
          <button type="button" className="btn primary" onClick={() => setCreating(true)}>
            New list
          </button>
        </div>
        <div className="account-row">
          {me.data?.email ? <span className="meta">{me.data.email}</span> : null}
          <button type="button" className="linklike" onClick={() => logout()}>
            Sign out
          </button>
        </div>
      </header>

      {query.isLoading ? (
        <Centered title="Loading…" />
      ) : query.isError ? (
        <Centered title="Couldn't load your lists">
          <p>
            {query.error instanceof ApiError && query.error.status === 401
              ? 'Your session expired — try signing in again.'
              : 'Something went wrong reaching the server.'}
          </p>
          <button type="button" className="btn" onClick={() => void query.refetch()}>
            Retry
          </button>
        </Centered>
      ) : lists.length === 0 ? (
        <p className="empty">No lists yet — create your first one.</p>
      ) : (
        <div className="list-rows" role="list">
          {lists.map(l => (
            <Link key={l.id} to={`/lists/${l.id}`} className="list-row" role="listitem">
              <span
                className="color-dot"
                style={{ background: l.color ?? 'transparent', borderColor: l.color ?? 'var(--border)' }}
              />
              <span className="list-row-name">{l.name}</span>
              {l.kind === 'Shopping' ? <span className="badge">Shopping</span> : null}
              <ChevronRightIcon className="row-chevron" />
            </Link>
          ))}
        </div>
      )}

      {creating ? (
        <CreateListModal
          pending={create.isPending}
          failed={create.isError}
          onCancel={() => setCreating(false)}
          onCreate={(name, kind, color) =>
            create.mutate({ name, kind, color }, { onSuccess: list => navigate(`/lists/${list.id}`) })
          }
        />
      ) : null}
    </div>
  );
}

function CreateListModal({
  pending,
  failed,
  onCancel,
  onCreate,
}: {
  pending: boolean;
  failed: boolean;
  onCancel: () => void;
  onCreate: (name: string, kind: ListKind, color: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ListKind>('Todo');
  const [color, setColor] = useState<string | null>(null);
  const trimmed = name.trim();

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="New list" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <button type="button" className="icon-btn" aria-label="Close" onClick={onCancel}>
            <CloseIcon />
          </button>
        </div>
        <form
          className="modal-body"
          onSubmit={e => {
            e.preventDefault();
            if (trimmed) onCreate(trimmed, kind, color);
          }}
        >
          <div className="section-label">NAME</div>
          <input
            className="text-input"
            value={name}
            placeholder="List name"
            aria-label="List name"
            autoFocus
            onChange={e => setName(e.target.value)}
          />

          <div className="section-label">TYPE</div>
          <div className="seg" role="group" aria-label="List type">
            {(['Todo', 'Shopping'] as ListKind[]).map(k => (
              <button
                key={k}
                type="button"
                className={`seg-btn${kind === k ? ' active' : ''}`}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {k}
              </button>
            ))}
          </div>

          <div className="section-label">COLOR</div>
          <div className="color-row">
            {listColorOptions.map((c, i) => (
              <button
                key={i}
                type="button"
                aria-label={c ?? 'No color'}
                className={`color-swatch${color === c ? ' on' : ''}`}
                style={{ background: c ?? 'transparent', borderColor: c ?? 'var(--border)' }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>

          {failed ? <p className="field-value overdue">Couldn't create the list. Try again.</p> : null}
          <button type="submit" className="btn primary delete-btn" disabled={!trimmed || pending}>
            {pending ? 'Creating…' : 'Create list'}
          </button>
        </form>
      </div>
    </div>
  );
}
