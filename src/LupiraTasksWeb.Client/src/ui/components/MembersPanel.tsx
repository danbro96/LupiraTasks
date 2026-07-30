import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteListsListIdMembersPrincipalId,
  getGetListsListIdQueryKey,
  patchListsListIdMembersPrincipalId,
  postListsListIdMembers,
} from '../../data/api/member/lists/lists';
import {
  deleteListsListIdSharesShareId,
  getGetListsListIdSharesQueryKey,
  getListsListIdShares,
  postListsListIdShares,
} from '../../data/api/member/shares/shares';
import type { ListRole, MemberResponse, ShareAccess } from '../../data/api/member/models';
import { CloseIcon, TrashIcon } from './icons';

const ROLES: ListRole[] = ['Owner', 'Editor', 'Viewer'];

interface Props {
  listId: string;
  members: MemberResponse[];
  /** Owner-only controls: change roles, remove members, mint/revoke share links. */
  isOwner: boolean;
  onClose: () => void;
}

/** Members + share-link management for a list (member surface). Any member can add a member;
 *  role changes, removals, and share links are owner-only. */
export function MembersPanel({ listId, members, isOwner, onClose }: Props) {
  const qc = useQueryClient();
  const sharesKey = getGetListsListIdSharesQueryKey(listId);
  const invalidateList = () => void qc.invalidateQueries({ queryKey: getGetListsListIdQueryKey(listId) });
  const invalidateShares = () => void qc.invalidateQueries({ queryKey: sharesKey });

  const [email, setEmail] = useState('');
  const [addRole, setAddRole] = useState<ListRole>('Editor');
  const [shareAccess, setShareAccess] = useState<ShareAccess>('ReadWrite');

  const addMut = useMutation({
    mutationFn: () => postListsListIdMembers(listId, { email: email.trim(), role: addRole }),
    onSuccess: () => {
      setEmail('');
      invalidateList();
    },
  });
  const roleMut = useMutation({
    mutationFn: (v: { principalId: string; role: ListRole }) => patchListsListIdMembersPrincipalId(listId, v.principalId, { role: v.role }),
    onSuccess: invalidateList,
  });
  const removeMut = useMutation({
    mutationFn: (principalId: string) => deleteListsListIdMembersPrincipalId(listId, principalId),
    onSuccess: invalidateList,
  });

  const shares = useQuery({ queryKey: sharesKey, queryFn: () => getListsListIdShares(listId), select: r => r.shares, enabled: isOwner });
  const createShareMut = useMutation({
    mutationFn: () => postListsListIdShares(listId, { access: shareAccess }),
    onSuccess: invalidateShares,
  });
  const revokeShareMut = useMutation({
    mutationFn: (shareId: string) => deleteListsListIdSharesShareId(listId, shareId),
    onSuccess: invalidateShares,
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Members and sharing" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">
          <div className="section-label">MEMBERS</div>
          {members.map(m => {
            const name = m.displayName ?? m.email;
            return (
              <div className="sub-row" key={m.principalId}>
                <span className="list-row-name">{name}</span>
                {isOwner ? (
                  <select
                    className="role-select"
                    value={m.role}
                    aria-label={`Role for ${name}`}
                    onChange={e => roleMut.mutate({ principalId: m.principalId, role: e.target.value as ListRole })}
                  >
                    {ROLES.map(r => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="badge">{m.role}</span>
                )}
                {isOwner ? (
                  <button type="button" className="icon-btn" aria-label={`Remove ${name}`} onClick={() => removeMut.mutate(m.principalId)}>
                    <TrashIcon />
                  </button>
                ) : null}
              </div>
            );
          })}

          <form
            className="add-bar"
            onSubmit={e => {
              e.preventDefault();
              if (email.trim()) addMut.mutate();
            }}
          >
            <input
              className="text-input"
              type="email"
              value={email}
              placeholder="Add member by email"
              aria-label="Member email"
              onChange={e => setEmail(e.target.value)}
            />
            <select className="role-select" value={addRole} aria-label="Role for new member" onChange={e => setAddRole(e.target.value as ListRole)}>
              {ROLES.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button type="submit" className="btn primary" disabled={!email.trim() || addMut.isPending}>
              Add
            </button>
          </form>
          {addMut.isError ? <p className="field-value overdue">Couldn't add that member.</p> : null}

          {isOwner ? (
            <>
              <div className="section-label">SHARE LINKS</div>
              {shares.data && shares.data.length > 0 ? (
                shares.data.map(s => (
                  <div className="sub-row" key={s.shareId}>
                    <span className="list-row-name share-url">{s.url}</span>
                    <span className="badge">{s.access === 'ReadWrite' ? 'Edit' : 'Read'}</span>
                    <button type="button" className="linklike" onClick={() => void navigator.clipboard?.writeText(s.url)}>
                      Copy
                    </button>
                    <button type="button" className="icon-btn" aria-label="Revoke link" onClick={() => revokeShareMut.mutate(s.shareId)}>
                      <TrashIcon />
                    </button>
                  </div>
                ))
              ) : (
                <p className="field-value">No active links.</p>
              )}
              <div className="add-bar">
                <select className="role-select" value={shareAccess} aria-label="Share access" onChange={e => setShareAccess(e.target.value as ShareAccess)}>
                  <option value="ReadWrite">Can edit</option>
                  <option value="Read">Read only</option>
                </select>
                <button type="button" className="btn primary" disabled={createShareMut.isPending} onClick={() => createShareMut.mutate()}>
                  Create link
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
