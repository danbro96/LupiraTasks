import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { exchangeShareToken } from '@lupira/tasks-api/query/guest';
import { markGuestSession } from '../data/api/fetcher';

/**
 * Trades the share token for the guest cookie, once, so it leaves the URL. Idempotent — the BFF
 * re-validates upstream and re-issues the cookie — so a remount is harmless.
 */
export function useGuestSession(token: string) {
  const query = useQuery({
    queryKey: ['guest', token],
    queryFn: () => exchangeShareToken({ token }),
    retry: false,
    staleTime: Infinity,
  });

  // Suppresses the member 401 redirect: a dead guest cookie belongs on this screen, not in Authentik.
  useEffect(() => {
    if (query.isSuccess) markGuestSession(true);
    return () => markGuestSession(false);
  }, [query.isSuccess]);

  return query;
}
