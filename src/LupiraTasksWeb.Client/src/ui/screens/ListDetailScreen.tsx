import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Button from '@mui/material/Button';
import MuiLink from '@mui/material/Link';
import { useMemberList } from '../../state/useMemberList';
import { ApiError } from '../../data/api/fetcher';
import { Centered } from '../components/Centered';
import { ListView } from '../components/ListView';
import { MembersPanel } from '../components/MembersPanel';

/** A single list's tasks (mirrors the mobile ListDetailScreen) plus a members/sharing panel. */
export function ListDetailScreen() {
  const { listId } = useParams<{ listId: string }>();
  if (!listId) {
    return (
      <Centered title="List not found">
        <Button component={Link} to="/" variant="outlined">
          Back to lists
        </Button>
      </Centered>
    );
  }
  return <ListDetail listId={listId} />;
}

function ListDetail({ listId }: { listId: string }) {
  const c = useMemberList(listId);
  const [panelOpen, setPanelOpen] = useState(false);

  if (c.query.isLoading) return <Centered title="Loading…" />;

  if (c.query.isError || !c.list) {
    const status = c.query.error instanceof ApiError ? c.query.error.status : 0;
    if (status === 403 || status === 404) {
      return (
        <Centered title="You don't have access to this list">
          <p>It may have been deleted, or you were removed.</p>
          <Button component={Link} to="/" variant="outlined">
            Back to lists
          </Button>
        </Centered>
      );
    }
    return (
      <Centered title="Couldn't load this list">
        <p>Something went wrong reaching the server.</p>
        <Button variant="outlined" onClick={() => c.query.refetch()}>
          Retry
        </Button>
      </Centered>
    );
  }

  const isOwner = c.list.access === 'Owner';

  return (
    <>
      <div className="topbar">
        <MuiLink component={Link} to="/">
          ← All lists
        </MuiLink>
      </div>
      <ListView
        list={c.list}
        items={c.items}
        canEdit={c.canEdit}
        tagsById={c.tagsById}
        actions={c.actions}
        members={c.members}
        changes={c.changes}
        headerExtra={
          <MuiLink component="button" type="button" onClick={() => setPanelOpen(true)}>
            Members &amp; sharing
          </MuiLink>
        }
      />
      {panelOpen ? (
        <MembersPanel listId={listId} members={c.members} isOwner={isOwner} onClose={() => setPanelOpen(false)} />
      ) : null}
    </>
  );
}
