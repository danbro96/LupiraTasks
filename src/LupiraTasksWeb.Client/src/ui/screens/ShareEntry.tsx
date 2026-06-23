import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { redeemShare } from '../../data/api/lists';
import { login } from '../../data/api/session';
import { ApiError } from '../../data/api/fetcher';
import { useSession } from '../../state/useSession';
import { Centered } from '../components/Centered';
import { SharedListView } from '../components/SharedListView';

/** Entry for `/s/:token` (public). Logged out → the account-less shared view + a "sign in to join"
 *  prompt. Logged in → automatically "cash in" the link via POST /shares/redeem, then go to the list. */
export function ShareEntry() {
  const { token } = useParams<{ token: string }>();
  const session = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fired = useRef(false);
  const [viewOnly, setViewOnly] = useState(false);
  const loggedIn = !!session.data;

  const redeem = useMutation({
    mutationFn: (t: string) => redeemShare(t),
    onSuccess: res => {
      void qc.invalidateQueries({ queryKey: ['lists'] });
      navigate(`/lists/${res.listId}`, { replace: true });
    },
  });
  const { mutate: runRedeem } = redeem;

  useEffect(() => {
    if (token && loggedIn && !viewOnly && !fired.current) {
      fired.current = true;
      runRedeem(token);
    }
  }, [token, loggedIn, viewOnly, runRedeem]);

  if (!token) {
    return (
      <Centered title="No share link">
        <p>
          Open the link you were given — it should look like <code>/s/&lt;token&gt;</code>.
        </p>
      </Centered>
    );
  }

  // Wait for the session probe before deciding account-less vs cash-in (avoids a flash + double path).
  if (session.isLoading) return <Centered title="Loading…" />;

  // Logged out, or the user chose to just view: the account-less surface (no session, no bearer).
  if (viewOnly || !loggedIn) {
    return (
      <>
        {!loggedIn ? (
          <div className="topbar">
            <button type="button" className="linklike" onClick={() => login(`/s/${token}`)}>
              Sign in to join this list
            </button>
          </div>
        ) : null}
        <SharedListView token={token} />
      </>
    );
  }

  if (redeem.isError) {
    const status = redeem.error instanceof ApiError ? redeem.error.status : 0;
    // Revoked / expired: fall back to the account-less view, which surfaces "link no longer valid".
    if (status === 404 || status === 410) return <SharedListView token={token} />;
    return (
      <Centered title="Couldn't add this list">
        <p>Something went wrong. Retry, view it without adding, or go to your lists.</p>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            fired.current = true;
            runRedeem(token);
          }}
        >
          Retry
        </button>
        <button type="button" className="btn" onClick={() => setViewOnly(true)}>
          View without adding
        </button>
        <button type="button" className="btn" onClick={() => navigate('/', { replace: true })}>
          Go to my lists
        </button>
      </Centered>
    );
  }

  // Pending / idle (effect about to fire) / success (navigating away).
  return <Centered title="Adding this list to your account…" />;
}
