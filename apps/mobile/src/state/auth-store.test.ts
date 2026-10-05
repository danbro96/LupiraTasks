import { describe, it, expect, vi, beforeEach } from 'vitest';

// The session mechanics are covered in @danbro96/lupira-expo-oidc; these pin what Tasks adds on top.
const secure = vi.hoisted(() => new Map<string, string>());
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (k: string) => secure.get(k) ?? null),
  setItemAsync: vi.fn(async (k: string, v: string) => void secure.set(k, v)),
  deleteItemAsync: vi.fn(async (k: string) => void secure.delete(k)),
}));
vi.mock('expo-auth-session', () => ({}));
vi.mock('expo-crypto', () => ({
  digestStringAsync: vi.fn().mockResolvedValue('hashed-id'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));
vi.mock('@sentry/react-native', () => ({ setUser: vi.fn(), captureMessage: vi.fn(), captureException: vi.fn() }));
vi.mock('@danbro96/lupira-expo-feedback/toast', () => ({ toast: vi.fn() }));
vi.mock('@danbro96/lupira-expo-diagnostics/log', () => ({ logDebug: vi.fn() }));
vi.mock('../data/auth/oidc', () => ({ oidc: { refreshTokens: vi.fn() } }));
vi.mock('../sync/engine', () => ({ engine: { wipe: vi.fn().mockResolvedValue(undefined) } }));

import { toast } from '@danbro96/lupira-expo-feedback/toast';
import { authPort } from '../data/api/authProvider';
import { engine } from '../sync/engine';
import { useAuth } from './auth-store';

const PRINCIPAL_KEY = 'lupira.tasks.userPrincipalId';

const jwt = (claims: Record<string, unknown>) =>
  `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.x`;

beforeEach(() => {
  vi.clearAllMocks();
  secure.clear();
  useAuth.setState({ token: 'tok-1', refreshToken: 'ref-1', expiresAt: Date.now() + 3_600_000, user: { sub: 'u@example.com' }, principalId: null, isAdmin: false });
});

describe('profile', () => {
  it('applies the /me profile, persists the principal and exposes it as the actor', async () => {
    await useAuth.getState().applyProfile({ principalId: 'p-1', displayName: 'Ann', isAdmin: true });
    expect(useAuth.getState()).toMatchObject({ principalId: 'p-1', isAdmin: true, user: { sub: 'u@example.com', name: 'Ann' } });
    expect(secure.get(PRINCIPAL_KEY)).toBe('p-1');
    expect(authPort().getActor()).toBe('p-1');
    expect(authPort().getSelf()).toEqual({ principalId: 'p-1', email: 'u@example.com', displayName: 'Ann' });
  });

  it('has no actor until /me resolves the principal', () => {
    expect(authPort().getActor()).toBeNull();
    expect(authPort().getSelf()).toBeNull();
  });

  it('reads the principal back on load', async () => {
    secure.set(PRINCIPAL_KEY, 'p-2');
    await useAuth.getState().load();
    expect(useAuth.getState().principalId).toBe('p-2');
  });
});

describe('sign-out', () => {
  it('toasts only when the session expired, and forgets the principal either way', async () => {
    await useAuth.getState().applyProfile({ principalId: 'p-1' });
    await useAuth.getState().clearSession({ reason: 'expired' });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(useAuth.getState().principalId).toBeNull();
    expect(secure.has(PRINCIPAL_KEY)).toBe(false);

    vi.mocked(toast).mockClear();
    await useAuth.getState().clearSession();
    expect(toast).not.toHaveBeenCalled();
  });
});

describe('account switch', () => {
  it('wipes the local data before a different account signs in, but not on rotation', async () => {
    secure.set('lupira.tasks.userSub', 'u@example.com');
    await useAuth.getState().load();
    await useAuth.getState().setSession({ accessToken: jwt({ email: 'u@example.com' }), refreshToken: 'ref-2', expiresIn: 3600 });
    expect(engine.wipe).not.toHaveBeenCalled();

    await useAuth.getState().clearSession();
    let wipedBeforeSignIn = false;
    const unsubscribe = useAuth.subscribe((s, prev) => {
      if (!prev.token && s.token) wipedBeforeSignIn = vi.mocked(engine.wipe).mock.calls.length > 0;
    });
    await useAuth.getState().setSession({ accessToken: jwt({ email: 'other@example.com' }), expiresIn: 3600 });
    unsubscribe();
    expect(wipedBeforeSignIn).toBe(true);
  });
});
