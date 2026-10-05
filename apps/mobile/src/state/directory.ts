import { useQuery } from '@tanstack/react-query';
import { onlineQuery } from '@danbro96/lupira-expo-query/onlineQuery';
import type { DirectoryPerson } from '@lupira/tasks-api/models';
import { getUserDirectory } from '@lupira/tasks-api/fetch/users';
import { ONLINE_ROOT } from '../sync/queryClient';

const directoryQuery = onlineQuery([ONLINE_ROOT, 'directory'], async () => {
  const { people } = await getUserDirectory();
  return Object.fromEntries(people.map(p => [p.principalId, p])) as Record<string, DirectoryPerson>;
});

/**
 * Resolves provenance (created/completed-by) principal ids to a display name, else email, else empty. Best
 * effort: until the directory loads, callers fall back to list members, which carry their names inline.
 */
export function useDirectory(): (principalId: string | null | undefined) => string {
  const { data } = useQuery(directoryQuery);
  return principalId => {
    if (!principalId) return '';
    const p = data?.[principalId];
    return p?.displayName ?? p?.email ?? '';
  };
}
