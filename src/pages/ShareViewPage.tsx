import { useParams } from 'react-router-dom';
import { Centered } from '../ui/Centered';
import { SharedListView } from '../ui/SharedListView';

/** Route entry for `/s/:token` (the URL the API mints for share links). Guards a missing token so
 *  the data hook below always has one. */
export default function ShareViewPage() {
  const { token } = useParams<{ token: string }>();
  if (!token) {
    return (
      <Centered title="No share link">
        <p>Open the link you were given — it should look like <code>/s/&lt;token&gt;</code>.</p>
      </Centered>
    );
  }
  return <SharedListView token={token} />;
}
