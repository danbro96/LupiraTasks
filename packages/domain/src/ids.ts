import { v7 as uuidv7 } from 'uuid';

/** GUIDv7 for client-generated ids — the API uses it as the idempotency key. */
export function newId(): string {
  return uuidv7();
}
