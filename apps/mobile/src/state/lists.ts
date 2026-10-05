import { useQuery } from '@tanstack/react-query';
import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import type { ListDto } from '@lupira/tasks-api/models';
import { sortActiveLists, sortArchivedLists } from '@lupira/tasks-domain/listOrder';
import { allLists } from '../data/queries/lists';
import { TASK_LIST } from '../domain/ops';
import { mirrorDb } from '../sync/engine';

const NONE: ListDto[] = [];

const listsQuery = mirrorQuery([TASK_LIST], async () => allLists(await mirrorDb()));

const active = (lists: ListDto[]) => sortActiveLists(lists.filter(l => !l.isArchived));
const archived = (lists: ListDto[]) => sortArchivedLists(lists.filter(l => l.isArchived));

export function useLists(): { lists: ListDto[] } {
  return { lists: useQuery({ ...listsQuery, select: active }).data ?? NONE };
}

export function useArchivedLists(): { lists: ListDto[] } {
  return { lists: useQuery({ ...listsQuery, select: archived }).data ?? NONE };
}

/** One active list; `loaded` is false until the first read, so "unknown" never reads as "not a member". */
export function useList(listId: string): { list: ListDto | undefined; loaded: boolean } {
  const { data } = useQuery({ ...listsQuery, select: active });
  return { list: data?.find(l => l.id === listId), loaded: data !== undefined };
}
