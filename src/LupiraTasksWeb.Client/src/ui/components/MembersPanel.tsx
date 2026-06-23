import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../../data/api/lists';
import type { ListMember, ListRole, ShareAccess } from '../../data/api/listTypes';
import { CloseIcon, TrashIcon } from './icons';

const ROLES: ListRole[] = ['Owner', 'Editor', 'Viewer'];

interface Props {
  listId: string;
  members: ListMember[];
  /** Owner-only controls: change roles, remove members, mint/revoke share links. */
  isOwner: boolean;
  onClose: () => void;
}

/** Members + share-link management for a list (member surface). Any member can add a member;
 *  role changes, removals, and share links are owner-only. */
export function MembersPanel({ listId, members, isOwner, onClose }: Props) {
  const qc = useQueryClient();
  const invalidateList = () => void qc.invalidateQueries({ queryKey: ['list', listId] });
  const invalidateShares = () => void qc.invalidateQueries({ queryKey: ['shares', listId] });

  const [email, setEmail] = useState('');
  const [addRole, setAddRole] = useState<ListRole>('Editor');
  const [shareAccess, setShareAccess] = useState<ShareAccess>('ReadWrite');

  const addMut = useMutation({
    mutationFn: () => api.addMember(listId, { email: email.trim(), role: addRole }),
    onSuccess: () => {
      setEmail('');
      invalidateList();
    },
  });
  const roleMut = useMutation({
    mutationFn: (v: { email: string; role: ListRole }) => api.updateMember(listId, v.email, { role: v.role }),
    onSuccess: invalidateList,
  });
  const removeMut = useMutation({
    mutationFn: (em: string) => api.removeMember(listId, em),
    onSuccess: invalidateList,
  });

  const shares = useQuery({ queryKey: ['shares', listId], queryFn: () => api.getShares(listId), enabled: isOwner });
  const createShareMut = useMutation({
    mutationFn: () => api.createShare(listId, { access: shareAccess }),
    onSuccess: invalidateShares,
  });
  const revokeShareMut = useMutation({
    mutationFn: (shareId: string) => api.revokeShare(listId, shareId),
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
          {members.map(m => (
            <div className="sub-row" key={m.email}>
              <span className="list-row-name">{m.email}</span>
              {isOwner ? (
                <select
                  className="role-select"
                  value={m.role}
                  aria-label={`Role for ${m.email}`}
                  onChange={e => roleMut.mutate({ email: m.email, role: e.target.value as ListRole })}
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
                <button type="button" className="icon-btn" aria-label={`Remove ${m.email}`} onClick={() => removeMut.mutate(m.email)}>
                  <TrashIcon />
                </button>
              ) : null}
            </div>
          ))}

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
