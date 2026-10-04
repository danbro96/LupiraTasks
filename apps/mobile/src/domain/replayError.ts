import { ApiError } from '@danbro96/lupira-http/apiError';
import { classifyReplayError as classifyOutcome } from '@danbro96/lupira-sync-core/replayError';

// Pure decision table for "an outbox op's replay threw — now what?". Extracted from
// runDrain (outbox.ts) so the branch matrix is named, documented, and unit-testable without
// SQLite/the API. runDrain just applies the returned decision.
//
//   401            → pause:  stop draining, leave the row pending, surface nothing (re-auth first)
//   4xx (≠401,429) → park:   mark parked, surface the conflict, continue to the next op
//   0 (network)    → retry:  keep pending, stop, mark server unreachable, retry next trigger
//   429/5xx        → retry:  keep pending, stop, retry next trigger
//   non-HTTP error → park:   a client bug fails identically every time, so park (don't wedge)

export interface ReplayDecision {
  /** Semantic outcome (drives the debug log + reasoning). */
  outcome: 'pause' | 'park' | 'retry';
  /** Stop the drain loop after this op (break) vs move on to the next (continue). */
  stop: boolean;
  /** Persist the row at this status; null = leave the row untouched (pause). */
  rowStatus: 'parked' | 'pending' | null;
  /** Error string to persist on the outbox row; null when not persisting. */
  rowError: string | null;
  /** Short message to surface via setLastError; null = leave the banner message as-is. */
  lastError: string | null;
  /** Mark the server unreachable (transport failure, status 0). */
  serverUnreachable: boolean;
  /** Debug log tag, mirroring the original inline logs. */
  logTag: 'replay:401' | 'replay:parked' | 'replay:retry' | 'replay:bug';
}

export function classifyReplayError(e: unknown, opKind: string): ReplayDecision {
  const { outcome } = classifyOutcome(e);
  if (outcome === 'pause') {
    return { outcome, stop: true, rowStatus: null, rowError: null, lastError: null, serverUnreachable: false, logTag: 'replay:401' };
  }
  if (outcome === 'retry') {
    const err = e as ApiError;
    return {
      outcome,
      stop: true,
      rowStatus: 'pending',
      rowError: String(err),
      lastError: err.message,
      serverUnreachable: err.status === 0,
      logTag: 'replay:retry',
    };
  }
  if (e instanceof ApiError) {
    return {
      outcome,
      stop: false,
      rowStatus: 'parked',
      rowError: `${e.status} ${e.message}`,
      lastError: `${opKind}: ${e.status} ${String(e.message).slice(0, 120)}`,
      serverUnreachable: false,
      logTag: 'replay:parked',
    };
  }
  return { outcome, stop: false, rowStatus: 'parked', rowError: String(e), lastError: String(e), serverUnreachable: false, logTag: 'replay:bug' };
}
