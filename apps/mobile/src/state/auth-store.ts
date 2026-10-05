import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as Sentry from '@sentry/react-native';
import { createAuthStore, toAuthPort } from '@danbro96/lupira-expo-oidc/authStore';
import { toast } from '@danbro96/lupira-expo-feedback/toast';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import { DEFAULT_API_URL, DEFAULT_AUTH_MODE } from '../config';
import { setAuthPort } from '../data/api/authProvider';
import { oidc } from '../data/auth/oidc';
import { engine } from '../sync/engine';

const KEY_PRINCIPAL = 'lupira.tasks.userPrincipalId';

interface Profile {
  /** The caller's principal id, the actor of optimistic edits. From `/me`: the token carries none. */
  principalId: string | null;
  /** From `/me`; in memory only. */
  isAdmin: boolean;
  applyProfile(profile: { principalId?: string; displayName?: string | null; isAdmin?: boolean }): Promise<void>;
}

export const useAuth = createAuthStore<Profile>({
  keyPrefix: 'lupira.tasks',
  defaultApiUrl: DEFAULT_API_URL,
  defaultAuthMode: DEFAULT_AUTH_MODE,
  oidc,
  log: logDebug,
  // Another account's docs must never show, nor its queued ops replay under the new session.
  onAccountChange: () => engine.wipe(),
  beforeSignOut: async reason => {
    if (reason === 'expired') toast('Session expired — please sign in again.');
    useAuth.setState({ principalId: null, isAdmin: false });
    await SecureStore.deleteItemAsync(KEY_PRINCIPAL);
  },
  onDefinitiveFailure: e => Sentry.captureMessage(`auth: definitive refresh failure — ${e.message}`, 'warning'),
  onLoad: async () => {
    useAuth.setState({ principalId: await SecureStore.getItemAsync(KEY_PRINCIPAL) });
  },
  extend: (set, get) => ({
    principalId: null,
    isAdmin: false,
    async applyProfile({ principalId, displayName, isAdmin }) {
      const user = get().user;
      if (!user) return;
      if (principalId) await SecureStore.setItemAsync(KEY_PRINCIPAL, principalId);
      set({
        principalId: principalId ?? get().principalId,
        isAdmin: isAdmin ?? get().isAdmin,
        user: displayName ? { ...user, name: displayName } : user,
      });
    },
  }),
});

/** A pseudonymous Sentry identity: a SHA-256 of the email, never the email itself (sendDefaultPii is off). */
async function setSentryUser(email: string | null): Promise<void> {
  if (!email) {
    Sentry.setUser(null);
    return;
  }
  try {
    Sentry.setUser({ id: await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, email) });
  } catch {
    // Leave the identity unset rather than risk leaking the email.
  }
}

useAuth.subscribe((s, prev) => {
  if (s.user?.sub !== prev.user?.sub) void setSentryUser(s.user?.sub ?? null);
});

setAuthPort({
  ...toAuthPort(useAuth.getState),
  getAuthMode: () => useAuth.getState().authMode,
  getActor: () => useAuth.getState().principalId,
  getSelf: () => {
    const { principalId, user } = useAuth.getState();
    return principalId && user ? { principalId, email: user.sub, displayName: user.name ?? null } : null;
  },
  applyProfile: profile => useAuth.getState().applyProfile(profile),
});
