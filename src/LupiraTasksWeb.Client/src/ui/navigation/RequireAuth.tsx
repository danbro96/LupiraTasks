import { useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { useSession } from '../../state/useSession';
import { login } from '../../data/api/session';
import { Centered } from '../components/Centered';

/** Gate for every route except the public `/s/:token`. A logged-out visitor is sent to the BFF
 *  sign-in (required SSO), returning to the original path. */
export function RequireAuth() {
  const { data, isLoading } = useSession();
  const triggered = useRef(false);

  useEffect(() => {
    if (!isLoading && data == null && !triggered.current) {
      triggered.current = true;
      login();
    }
  }, [isLoading, data]);

  if (isLoading) return <Centered title="Loading…" />;
  if (data == null) return <Centered title="Signing in…" />;
  return <Outlet />;
}
