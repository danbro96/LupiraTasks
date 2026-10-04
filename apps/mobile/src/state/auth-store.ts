import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as Sentry from '@sentry/react-native';
import { DEFAULT_API_URL, DEFAULT_AUTH_MODE, type AuthMode } from '../config';
import { setAuthPort } from '../data/api/authProvider';
import { getDb } from '../data/db/expoDb';
import { adoptDbOwner } from '../data/mirror';
import { bumpMirror } from '../sync/syncStatus';
import { createTokenRefresher, secureSessionStore } from '@danbro96/lupira-expo-oidc/tokenSession';
import { oidc } from '../data/auth/oidc';
import { useSyncStatus } from '../sync/syncStatus';
import { toast } from '@danbro96/lupira-expo-feedback/toast';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

/**
 * Attach a PSEUDONYMOUS Sentry identity so events can be correlated per-user without storing the
 * raw email (sendDefaultPii is false). The id is a SHA-256 hash of the email; null clears it.
 * Fire-and-forget — events fired before the hash resolves just lack the id.
 */
async function setSentryUser(email: string | null): Promise<void> {
  if (!email) {
    Sentry.setUser(null);
    return;
  }
  try {
    const id = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, email);
    Sentry.setUser({ id });
  } catch {
    // Hashing failed (unlikely) — leave the identity unset rather than risk leaking the email.
  }
}

const KEY_API_URL = 'lupira.tasks.apiUrl';
const KEY_AUTH_MODE = 'lupira.tasks.authMode';
const sessionStore = secureSessionStore('lupira.tasks');
const KEY_USER_SUB = 'lupira.tasks.userSub';
const KEY_USER_NAME = 'lupira.tasks.userName';
const KEY_USER_PRINCIPAL = 'lupira.tasks.userPrincipalId';

export type AuthUser = {
  /** The caller's email (= OIDC subject convention; used for display + invite dedup + Sentry hash). */
  sub: string;
  /** The caller's internal principal id — the actor for optimistic apply. From `/me`; absent until
   *  the first profile pull (the JWT carries no principal claim). */
  principalId?: string;
  displayName?: string;
  /** From the server `/me` profile; in-memory only (re-fetched each launch). */
  isAdmin?: boolean;
};

export type Session = {
  accessToken: string;
  refreshToken?: string | null;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
};

type AuthState = {
  loaded: boolean;
  apiUrl: string;
  authMode: AuthMode;
  token: string | null; // access token — read by the api mutator
  refreshToken: string | null;
  expiresAt: number | null;
  user: AuthUser | null;
};

type AuthActions = {
  load: () => Promise<void>;
  /** Clears the session: a token minted for one backend is meaningless against another. */
  setBackend: (urls: Record<string, string>, authMode: AuthMode) => Promise<void>;
  setSession: (session: Session, user: AuthUser) => Promise<void>;
  /** Merge server profile fields (from `/me`) into the cached user; persists displayName + principalId. */
  updateProfile: (profile: { principalId?: string; displayName?: string | null; isAdmin?: boolean }) => Promise<void>;
  /** Wipe the session. `reason: 'expired'` surfaces a toast (involuntary logout); a plain
   *  call (deliberate sign-out) stays silent. */
  clearSession: (opts?: { reason?: 'expired' }) => Promise<void>;
  /** Refresh the access token if it's expired/near-expiry; returns the live access token.
   *  `force: true` bypasses the freshness check (reactive refresh after a server 401) and, when
   *  the session is definitively un-refreshable, clears it rather than handing back a dead token.
   *  `sentToken` (forced callers) is the token the 401'd request sent — if the session token has
   *  already changed since, the refresh is skipped and the current token returned. */
  refreshIfNeeded: (opts?: { force?: boolean; sentToken?: string }) => Promise<string | null>;
};

export const useAuth = create<AuthState & AuthActions>((set, get) => ({
  loaded: false,
  apiUrl: DEFAULT_API_URL,
  authMode: DEFAULT_AUTH_MODE,
  token: null,
  refreshToken: null,
  expiresAt: null,
  user: null,

  setBackend: async (urls, authMode) => {
    await useAuth.getState().clearSession();
    const url = urls.api;
    set({ apiUrl: url, authMode });
    await SecureStore.setItemAsync(KEY_API_URL, url);
    await SecureStore.setItemAsync(KEY_AUTH_MODE, authMode);
    logDebug('auth', `backend → ${url} (${authMode})`);
  },

  load: async () => {
    const [apiUrl, authMode, session, userSub, userName, userPrincipal] = await Promise.all([
      SecureStore.getItemAsync(KEY_API_URL),
      SecureStore.getItemAsync(KEY_AUTH_MODE),
      sessionStore.load(),
      SecureStore.getItemAsync(KEY_USER_SUB),
      SecureStore.getItemAsync(KEY_USER_NAME),
      SecureStore.getItemAsync(KEY_USER_PRINCIPAL),
    ]);
    set({
      loaded: true,
      apiUrl: apiUrl || DEFAULT_API_URL,
      authMode: (authMode as AuthMode | null) ?? DEFAULT_AUTH_MODE,
      token: session.token,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt || null,
      user: userSub ? { sub: userSub, displayName: userName ?? undefined, principalId: userPrincipal ?? undefined } : null,
    });
    void setSentryUser(userSub ?? null);
    // Stamp DB ownership for the restored account (no-op if already stamped; an install that
    // predates ownership stamping adopts without wiping).
    if (userSub) void getDb().then(db => adoptDbOwner(db, userSub));
  },

  setSession: async (session, user) => {
    // A different account than the one this device's DB belongs to must adopt (wipe) it BEFORE
    // any state flips: the onSignIn subscriber below fires synchronously inside set() and
    // immediately drains the outbox — the previous account's un-pushed ops must be gone by then.
    // Same-sub calls (token rotation) skip straight through, keeping rotation DB-free.
    if (get().user?.sub !== user.sub) {
      try {
        await adoptDbOwner(await getDb(), user.sub);
        bumpMirror(); // a wipe must drop the previous account's lists from the in-memory store
      } catch (e) {
        // The sign-in itself must not be blocked by a local-DB failure — record it loudly.
        logDebug('auth:adopt-db-error', e instanceof Error ? e.message : String(e));
        Sentry.captureException(e, { tags: { area: 'auth' } });
      }
    }
    // In-memory state first: a rotated refresh token must survive even if persistence fails —
    // the old one is already invalid server-side, so losing the new one here would strand the
    // session (the next refresh would replay a dead token → definitive 400 → forced logout).
    set({
      token: session.accessToken,
      refreshToken: session.refreshToken ?? null,
      expiresAt: session.expiresAt,
      user,
    });
    void setSentryUser(user.sub);
    try {
      await Promise.all([
        sessionStore.save({ token: session.accessToken, refreshToken: session.refreshToken ?? null, expiresAt: session.expiresAt }),
        SecureStore.setItemAsync(KEY_USER_SUB, user.sub),
        user.displayName
          ? SecureStore.setItemAsync(KEY_USER_NAME, user.displayName)
          : SecureStore.deleteItemAsync(KEY_USER_NAME),
        user.principalId
          ? SecureStore.setItemAsync(KEY_USER_PRINCIPAL, user.principalId)
          : SecureStore.deleteItemAsync(KEY_USER_PRINCIPAL),
      ]);
    } catch (e) {
      // The live session is intact in memory; only the persisted copy is stale. A restart could
      // replay an already-rotated refresh token, so leave a trace.
      logDebug('auth:persist-error', e instanceof Error ? e.message : String(e));
    }
  },

  updateProfile: async ({ principalId, displayName, isAdmin }) => {
    const cur = get().user;
    if (!cur) return;
    if (displayName !== undefined) {
      if (displayName) await SecureStore.setItemAsync(KEY_USER_NAME, displayName);
      else await SecureStore.deleteItemAsync(KEY_USER_NAME);
    }
    if (principalId) await SecureStore.setItemAsync(KEY_USER_PRINCIPAL, principalId);
    set({
      user: {
        ...cur,
        principalId: principalId ?? cur.principalId,
        displayName: displayName === undefined ? cur.displayName : (displayName ?? undefined),
        isAdmin: isAdmin === undefined ? cur.isAdmin : isAdmin,
      },
    });
  },

  clearSession: async opts => {
    // Involuntary logout (expired/revoked session) tells the user why before the screen flips to
    // the sign-in view; a deliberate sign-out passes no reason and stays silent.
    if (opts?.reason === 'expired') toast('Session expired — please sign in again.');
    await Promise.all([
      sessionStore.clear(),
      SecureStore.deleteItemAsync(KEY_USER_SUB),
      SecureStore.deleteItemAsync(KEY_USER_NAME),
      SecureStore.deleteItemAsync(KEY_USER_PRINCIPAL),
    ]);
    set({ token: null, refreshToken: null, expiresAt: null, user: null });
    Sentry.setUser(null);
    // Next signed-in user starts fresh: show the initial-load spinner until their first sync.
    useSyncStatus.getState().setFirstSyncDone(false);
  },

  refreshIfNeeded: opts => refresh(opts),
}));

const refresh = createTokenRefresher({
  // No user means no way to re-seat the session, so a forced refresh signs out instead of rotating.
  read: () => {
    const { token, refreshToken, expiresAt, user } = useAuth.getState();
    return { token, refreshToken: user ? refreshToken : null, expiresAt: expiresAt ?? 0 };
  },
  refreshTokens: refreshToken => oidc.refreshTokens(refreshToken),
  apply: async (t, previous) => {
    const { user, setSession } = useAuth.getState();
    if (!user) return;
    await setSession({ accessToken: t.accessToken, refreshToken: t.refreshToken ?? previous, expiresAt: Date.now() + (t.expiresIn ?? 3600) * 1000 }, user);
  },
  signOut: () => useAuth.getState().clearSession({ reason: 'expired' }),
  log: logDebug,
  onDefinitiveFailure: e => Sentry.captureMessage(`auth: definitive refresh failure — ${e.message}`, 'warning'),
});

// Register the auth capabilities the lower layers (API mutator, offline sync/outbox) depend on,
// so they read the live session through the AuthPort instead of importing this store upward. Runs
// at module load — App.tsx imports the store during bootstrap, before any request can fire.
setAuthPort({
  getApiUrl: () => useAuth.getState().apiUrl,
  getAuthMode: () => useAuth.getState().authMode,
  getToken: () => useAuth.getState().token,
  getActor: () => useAuth.getState().user?.principalId ?? null,
  getSelf: () => {
    const u = useAuth.getState().user;
    return u?.principalId ? { principalId: u.principalId, email: u.sub, displayName: u.displayName ?? null } : null;
  },
  refresh: (force, sentToken) => useAuth.getState().refreshIfNeeded({ force, sentToken }),
  applyProfile: profile => useAuth.getState().updateProfile(profile),
  onSignIn: cb => useAuth.subscribe((state, prev) => { if (!prev.token && state.token) cb(); }),
});
