// The platform AuthPort plus what Tasks' sync engine (actor, profile) and dev transport (auth mode) need;
// registering here registers the platform port too, so the bearer mutator reads the same session.

import { setAuthPort as setPlatformAuthPort, type AuthPort as PlatformAuthPort } from '@danbro96/lupira-http/authPort';
import type { PersonRef } from '@lupira/tasks-api/models';

export interface AuthPort extends PlatformAuthPort {
  getAuthMode: () => 'oidc' | 'dev';
  /** The signed-in user's principal id (matches the server's PersonRef.principalId) — the actor
   *  for optimistic created/completed-by. Null until the first `/me` resolves it. */
  getActor: () => string | null;
  /** The signed-in user's full identity, for the optimistic list-owner/addedBy seed. Null until
   *  the first `/me` resolves the principal id. */
  getSelf: () => PersonRef | null;
  /** Merge a freshly-pulled `/me` profile into the cached session. */
  applyProfile: (profile: { principalId?: string; displayName?: string | null; isAdmin?: boolean }) => Promise<void>;
}

let port: AuthPort | null = null;

/** Registered once by the auth store at module load — before any request can fire. */
export function setAuthPort(p: AuthPort): void {
  port = p;
  setPlatformAuthPort(p);
}

export function authPort(): AuthPort {
  if (!port) throw new Error('AuthPort not registered — import the auth store before using it.');
  return port;
}
