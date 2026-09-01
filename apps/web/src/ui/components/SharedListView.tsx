import Button from '@mui/material/Button';
import { ApiError } from '../../data/api/fetcher';
import { useSharedList } from '../../state/useSharedList';
import { Centered } from './Centered';
import { ListView } from './ListView';

/** Account-less share surface: resolve the token to a list, then render the shared task UI. Owns
 *  only the share-specific loading / invalid-link / error copy; the list UI lives in ListView. */
export function SharedListView({ token }: { token: string }) {
  const { query, list, items, canEdit, tagsById, actions, changes } = useSharedList(token);

  if (query.isLoading) return <Centered title="Loading…" />;

  if (query.isError || !list) {
    const status = query.error instanceof ApiError ? query.error.status : 0;
    if (status === 401 || status === 404) {
      return (
        <Centered title="This link is no longer valid">
          <p>It may have expired or been revoked. Ask whoever shared it for a new link.</p>
        </Centered>
      );
    }
    return (
      <Centered title={status === 429 ? 'Too many requests' : "Couldn't load this list"}>
        <p>{status === 429 ? 'Please wait a moment, then try again.' : 'Something went wrong reaching the server.'}</p>
        <Button variant="outlined" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </Centered>
    );
  }

  return (
    <ListView list={list} items={items} canEdit={canEdit} tagsById={tagsById} actions={actions} changes={changes} />
  );
}
