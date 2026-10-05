import type { ListDto, MemberDto, PersonRef } from '@lupira/tasks-api/models';
import type { ClientOp, ListOp } from './ops';

// Pure optimistic patch of a mirrored list doc for `list.*` ops — the list equivalent of the
// item LWW reducer. Returns the patched ListDto, or `null` when the change deletes the list
// locally (the last owner leaving / being removed), mirroring the server's auto-delete cascade.
// Framework-free so it can be unit-tested (see listDoc.test.ts).
//
// Members are keyed by principalId — EXCEPT an invite (memberAdd), where the invitee's principal
// is unknown locally: it upserts a placeholder keyed by email that the next pull replaces with the
// server's authoritative member (with principalId + displayName).

function sameEmail(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function upsertInvite(
  members: readonly MemberDto[],
  email: string,
  role: MemberDto['role'],
  at: string,
  actor: PersonRef | null,
): MemberDto[] {
  if (members.some(m => sameEmail(m.email, email))) {
    return members.map(m => (sameEmail(m.email, email) ? { ...m, role } : m));
  }
  return [...members, { principalId: '', email, displayName: null, role, addedAt: at, addedBy: actor }];
}

export function applyListOp(doc: ListDto, op: ClientOp, actor: PersonRef | null): ListDto | null {
  switch (op.kind) {
    case 'list.rename':
      return { ...doc, name: op.name, updatedAt: op.occurredAt };

    case 'list.recolor':
      return { ...doc, color: op.color, updatedAt: op.occurredAt };

    case 'list.setSimplePriority':
      return { ...doc, simplePriority: op.simplePriority, updatedAt: op.occurredAt };

    // No `updatedAt` bump, matching the server: the caller's screen position is not a change to
    // the list, and bumping it would announce a remote edit to every other member.
    case 'list.reorder':
      return { ...doc, sortOrder: op.sortOrder };

    case 'list.memberAdd':
      return { ...doc, members: upsertInvite(doc.members, op.email, op.role, op.occurredAt, actor), updatedAt: op.occurredAt };

    case 'list.memberRoleChange':
      return {
        ...doc,
        members: doc.members.map(m => (m.principalId === op.principalId ? { ...m, role: op.role } : m)),
        // Keep the caller's own access coherent (owner demoting themselves) so owner-only UI reacts
        // before the next pull; changing another member's role leaves the caller's access untouched.
        access: op.principalId === actor?.principalId ? op.role : doc.access,
        updatedAt: op.occurredAt,
      };

    case 'list.memberRemove':
    case 'list.leave': {
      const target = doc.members.find(m => m.principalId === op.principalId);
      const remaining = doc.members.filter(m => m.principalId !== op.principalId);
      // Last owner leaving/removed → the list is gone for everyone (mirror the server cascade).
      if (target?.role === 'Owner' && !remaining.some(m => m.role === 'Owner')) {
        return null;
      }
      return { ...doc, members: remaining, updatedAt: op.occurredAt };
    }

    case 'list.archive':
      return { ...doc, isArchived: true, updatedAt: op.occurredAt };

    case 'list.restore':
      return { ...doc, isArchived: false, updatedAt: op.occurredAt };

    case 'list.delete':
      return null; // owner-initiated delete removes the list locally (and for everyone on replay)

    default:
      return doc; // item ops + list.create don't patch an existing list doc here
  }
}

/** A best-effort doc for a list created on this device, so it shows before the server has it. `actor` is null
 *  until `/me` resolves the principal id; owner and members stay empty until the next pull then. */
export function createdList(op: Extract<ListOp, { kind: 'list.create' }>, actor: PersonRef | null): ListDto {
  return {
    id: op.listId,
    name: op.name,
    kind: op.listKind,
    color: op.color,
    simplePriority: true,
    owner: actor ?? { principalId: '', email: '', displayName: null },
    access: 'Owner',
    isArchived: false,
    createdAt: op.occurredAt,
    updatedAt: op.occurredAt,
    tags: [],
    members: actor ? [{ principalId: actor.principalId, email: actor.email, displayName: actor.displayName ?? null, role: 'Owner', addedAt: op.occurredAt, addedBy: actor }] : [],
  };
}

/** The list reducer: `null` = no list (not created yet, or deleted locally). */
export function reduceList(doc: ListDto | null, op: ListOp, actor: PersonRef | null): ListDto | null {
  if (op.kind === 'list.create') return doc ?? createdList(op, actor);
  return doc && applyListOp(doc, op, actor);
}
