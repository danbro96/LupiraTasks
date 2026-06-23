import { useQuery } from '@tanstack/react-query';
import { getMe } from '../data/api/lists';

/** The signed-in user's provisioned profile (GET /me). Cached for the session; rarely changes. */
export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: getMe, staleTime: Infinity });
}
