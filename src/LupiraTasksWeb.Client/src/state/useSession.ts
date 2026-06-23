import { useQuery } from '@tanstack/react-query';
import { getSessionUser } from '../data/api/session';

/** The signed-in user from the BFF cookie session — `null` data means logged out (not an error). */
export function useSession() {
  return useQuery({ queryKey: ['session'], queryFn: getSessionUser, staleTime: Infinity, retry: false });
}
