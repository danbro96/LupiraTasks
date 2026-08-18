import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MuiLink from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
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

  const addForm = useForm<{ email: string; role: ListRole }>({ defaultValues: { email: '', role: 'Editor' } });
  const shareForm = useForm<{ access: ShareAccess }>({ defaultValues: { access: 'ReadWrite' } });
  const email = addForm.watch('email');
  const addRole = addForm.watch('role');
  const shareAccess = shareForm.watch('access');

  const addMut = useMutation({
    mutationFn: () => postListsListIdMembers(listId, { email: email.trim(), role: addRole }),
    onSuccess: () => {
      addForm.resetField('email');
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
    <Dialog open fullWidth maxWidth="sm" onClose={onClose} aria-labelledby="members-panel-title">
      <DialogTitle id="members-panel-title" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        Members and sharing
        <IconButton size="small" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <div className="section-label">MEMBERS</div>
        {members.map(m => {
          const name = m.displayName ?? m.email;
          return (
            <div className="sub-row" key={m.principalId}>
              <span className="list-row-name">{name}</span>
              {isOwner ? (
                <TextField
                  select
                  size="small"
                  label={`Role for ${name}`}
                  value={m.role}
                  sx={{ minWidth: 140 }}
                  onChange={e => roleMut.mutate({ principalId: m.principalId, role: e.target.value as ListRole })}
                >
                  {ROLES.map(r => (
                    <MenuItem key={r} value={r}>
                      {r}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <Chip size="small" variant="outlined" label={m.role} />
              )}
              {isOwner ? (
                <IconButton size="small" aria-label={`Remove ${name}`} onClick={() => removeMut.mutate(m.principalId)}>
                  <DeleteOutlineIcon />
                </IconButton>
              ) : null}
            </div>
          );
        })}

        <form
          className="add-bar"
          onSubmit={addForm.handleSubmit(v => {
            if (v.email.trim()) addMut.mutate();
          })}
        >
          <Controller
            name="email"
            control={addForm.control}
            render={({ field }) => (
              <TextField
                size="small"
                type="email"
                label="Member email"
                value={field.value}
                placeholder="Add member by email"
                sx={{ flex: 1 }}
                inputRef={field.ref}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          <Controller
            name="role"
            control={addForm.control}
            render={({ field }) => (
              <TextField
                select
                size="small"
                label="Role for new member"
                value={field.value}
                sx={{ minWidth: 140 }}
                inputRef={field.ref}
                onChange={field.onChange}
                onBlur={field.onBlur}
              >
                {ROLES.map(r => (
                  <MenuItem key={r} value={r}>
                    {r}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Button type="submit" variant="contained" size="small" disabled={!email.trim() || addMut.isPending}>
            Add
          </Button>
        </form>
        {addMut.isError ? <p className="field-value overdue">Couldn't add that member.</p> : null}

        {isOwner ? (
          <>
            <div className="section-label">SHARE LINKS</div>
            {shares.data && shares.data.length > 0 ? (
              shares.data.map(s => (
                <div className="sub-row" key={s.shareId}>
                  <span className="list-row-name share-url">{s.url}</span>
                  <Chip size="small" variant="outlined" label={s.access === 'ReadWrite' ? 'Edit' : 'Read'} />
                  <MuiLink component="button" type="button" underline="hover" onClick={() => void navigator.clipboard?.writeText(s.url)}>
                    Copy
                  </MuiLink>
                  <IconButton size="small" aria-label="Revoke link" onClick={() => revokeShareMut.mutate(s.shareId)}>
                    <DeleteOutlineIcon />
                  </IconButton>
                </div>
              ))
            ) : (
              <p className="field-value">No active links.</p>
            )}
            <div className="add-bar">
              <Controller
                name="access"
                control={shareForm.control}
                render={({ field }) => (
                  <TextField
                    select
                    size="small"
                    label="Share access"
                    value={field.value}
                    sx={{ minWidth: 140 }}
                    inputRef={field.ref}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  >
                    <MenuItem value="ReadWrite">Can edit</MenuItem>
                    <MenuItem value="Read">Read only</MenuItem>
                  </TextField>
                )}
              />
              <Button variant="contained" size="small" disabled={createShareMut.isPending} onClick={() => createShareMut.mutate()}>
                Create link
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
