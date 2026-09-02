import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MuiLink from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import {
  removeListMember,
  getGetListQueryKey,
  updateListMember,
  addListMember,
} from '@lupira/tasks-api/query/lists';
import {
  deleteShare,
  getListSharesQueryKey,
  listShares,
  createShare,
} from '@lupira/tasks-api/query/shares';
import type { ListRole, MemberDto, ShareAccess } from '@lupira/tasks-api/models';

const ROLES: ListRole[] = ['Owner', 'Editor', 'Viewer'];

interface Props {
  listId: string;
  members: MemberDto[];
  /** Owner-only controls: change roles, remove members, mint/revoke share links. */
  isOwner: boolean;
  onClose: () => void;
}

/** Members + share-link management for a list (member surface). Any member can add a member;
 *  role changes, removals, and share links are owner-only. */
export function MembersPanel({ listId, members, isOwner, onClose }: Props) {
  const qc = useQueryClient();
  const sharesKey = getListSharesQueryKey(listId);
  const invalidateList = () => void qc.invalidateQueries({ queryKey: getGetListQueryKey(listId) });
  const invalidateShares = () => void qc.invalidateQueries({ queryKey: sharesKey });

  const addForm = useForm<{ email: string; role: ListRole }>({ defaultValues: { email: '', role: 'Editor' } });
  const shareForm = useForm<{ access: ShareAccess }>({ defaultValues: { access: 'ReadWrite' } });
  const email = addForm.watch('email');
  const addRole = addForm.watch('role');
  const shareAccess = shareForm.watch('access');

  const addMut = useMutation({
    mutationFn: () => addListMember(listId, { email: email.trim(), role: addRole }),
    onSuccess: () => {
      addForm.resetField('email');
      invalidateList();
    },
  });
  const roleMut = useMutation({
    mutationFn: (v: { principalId: string; role: ListRole }) => updateListMember(listId, v.principalId, { role: v.role }),
    onSuccess: invalidateList,
  });
  const removeMut = useMutation({
    mutationFn: (principalId: string) => removeListMember(listId, principalId),
    onSuccess: invalidateList,
  });

  const shares = useQuery({ queryKey: sharesKey, queryFn: () => listShares(listId), enabled: isOwner });
  const createShareMut = useMutation({
    mutationFn: () => createShare(listId, { access: shareAccess }),
    onSuccess: invalidateShares,
  });
  const revokeShareMut = useMutation({
    mutationFn: (shareId: string) => deleteShare(listId, shareId),
    onSuccess: invalidateShares,
  });

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onClose} aria-labelledby="members-panel-title">
      <DialogTitle id="members-panel-title">
        Members and sharing
        <IconButton aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="overline" component="div" sx={{ display: 'block', color: 'text.subtle', p: '16px 16px 8px' }}>MEMBERS</Typography>
        {members.map(m => {
          const name = m.displayName ?? m.email;
          return (
            <Box key={m.principalId} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <Typography component="span" sx={{ flex: 1, fontSize: 16, overflowWrap: 'anywhere' }}>{name}</Typography>
              {isOwner ? (
                <TextField
                  select
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
                <Chip variant="outlined" label={m.role} />
              )}
              {isOwner ? (
                <IconButton aria-label={`Remove ${name}`} onClick={() => removeMut.mutate(m.principalId)}>
                  <DeleteOutlineIcon />
                </IconButton>
              ) : null}
            </Box>
          );
        })}

        <Box
          component="form"
          sx={{ display: 'flex', gap: 1, p: '12px 16px' }}
          onSubmit={addForm.handleSubmit(v => {
            if (v.email.trim()) addMut.mutate();
          })}
        >
          <Controller
            name="email"
            control={addForm.control}
            render={({ field }) => (
              <TextField
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
          <Button type="submit" variant="contained" disabled={!email.trim() || addMut.isPending}>
            Add
          </Button>
        </Box>
        {addMut.isError ? (
          <Alert severity="error" variant="outlined">
            Couldn't add that member.
          </Alert>
        ) : null}

        {isOwner ? (
          <>
            <Typography variant="overline" component="div" sx={{ display: 'block', color: 'text.subtle', p: '16px 16px 8px' }}>SHARE LINKS</Typography>
            {shares.data && shares.data.length > 0 ? (
              shares.data.map(s => (
                <Box key={s.shareId} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography component="span" variant="caption" sx={{ flex: 1, color: 'text.secondary', overflowWrap: 'anywhere', wordBreak: 'break-all' }}>{s.url}</Typography>
                  <Chip variant="outlined" label={s.access === 'ReadWrite' ? 'Edit' : 'Read'} />
                  <MuiLink component="button" type="button" onClick={() => void navigator.clipboard?.writeText(s.url)}>
                    Copy
                  </MuiLink>
                  <IconButton aria-label="Revoke link" onClick={() => revokeShareMut.mutate(s.shareId)}>
                    <DeleteOutlineIcon />
                  </IconButton>
                </Box>
              ))
            ) : (
              <Typography component="p" sx={{ m: 0, pb: 1, color: 'text.secondary' }}>No active links.</Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1, p: '12px 16px' }}>
              <Controller
                name="access"
                control={shareForm.control}
                render={({ field }) => (
                  <TextField
                    select
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
              <Button variant="contained" disabled={createShareMut.isPending} onClick={() => createShareMut.mutate()}>
                Create link
              </Button>
            </Box>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
