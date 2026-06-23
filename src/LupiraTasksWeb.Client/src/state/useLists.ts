import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../data/api/fetcher';
import { createList, getLists } from '../data/api/lists';
import type { CreateListRequest } from '../data/api/listTypes';
import { newId } from '../domain/ids';

const TERMINAL = new Set([400, 401, 403, 404]); // not worth retrying

/** The caller's lists (GET /lists) + a create mutation. The landing screen's data source. */
export function useLists(archived = false) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['lists', { archived }],
    queryFn: () => getLists(archived),
    retry: (count, err) => !(err instanceof ApiError && TERMINAL.has(err.status)) && count < 2,
  });

  const create = useMutation({
    mutationFn: (body: Omit<CreateListRequest, 'id'>) => createList({ id: newId(), ...body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['lists'] }),
  });

  return { query, lists: query.data ?? [], create };
}
