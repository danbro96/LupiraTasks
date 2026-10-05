import { ListRole } from '@lupira/tasks-api/models';
import { useAuth } from '../../state/auth-store';
import { useList } from '../../state/lists';

/**
 * The current user's role on a list: `undefined` if not a member / list not in the mirror,
 * `null` while the mirror hasn't been read yet — callers must not render "view-only" for that.
 */
export function useMyRole(listId: string): ListRole | undefined | null {
  const { list, loaded } = useList(listId);
  const me = useAuth(s => s.principalId);
  if (!loaded) return null;
  if (!list || !me) return undefined;
  // Server-authoritative role (`list.access`), gated on membership so an optimistic self-leave —
  // the mirror lingers minus-me until the next pull — correctly drops edit rights.
  return list.members.some(m => m.principalId === me) ? list.access : undefined;
}

/** Whether a role may modify list contents (add/edit/complete/delete items). Viewers cannot. */
export function canEditWithRole(role: ListRole | undefined | null): boolean {
  return role === ListRole.Owner || role === ListRole.Editor;
}
