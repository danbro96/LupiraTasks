import { useQuery } from '@tanstack/react-query';
import { onlineQuery } from '@danbro96/lupira-expo-query/onlineQuery';
import type { ShareAccess, ShareDto } from '@lupira/tasks-api/models';
import { createShare, deleteShare, listShares } from '@lupira/tasks-api/fetch/shares';
import { ONLINE_ROOT, queryClient } from '../sync/queryClient';

// Public share links are immediate server calls, not list changes, so they bypass the sync engine.

const sharesKey = (listId: string) => [ONLINE_ROOT, 'shares', listId] as const;

export function useShareLinks(listId: string) {
  return useQuery(onlineQuery(sharesKey(listId), () => listShares(listId)));
}

export async function createShareLink(listId: string, access: ShareAccess): Promise<ShareDto> {
  const share = await createShare(listId, { access });
  queryClient.setQueryData<ShareDto[]>(sharesKey(listId), prev => [share, ...(prev ?? [])]);
  return share;
}

export async function revokeShareLink(listId: string, shareId: string): Promise<void> {
  await deleteShare(listId, shareId);
  queryClient.setQueryData<ShareDto[]>(sharesKey(listId), prev => prev?.filter(s => s.shareId !== shareId));
}
