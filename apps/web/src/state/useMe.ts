import { useGetMe } from '@lupira/tasks-api/query/me';

/** The signed-in user's provisioned profile (GET /me). Cached for the session; rarely changes. */
export function useMe() {
  return useGetMe({ query: { staleTime: Infinity } });
}
