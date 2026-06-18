import { v7 as uuidv7 } from 'uuid';

/** GUIDv7 for client-generated item ids — the API uses it as the idempotency key.
 *  Mirrors the mobile app's `newId()` (src/domain/ops.ts), which also uses uuid v7. */
export function newId(): string {
  return uuidv7();
}
