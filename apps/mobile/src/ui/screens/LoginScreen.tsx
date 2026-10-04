import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { OIDC_CLIENT_ID, OIDC_ISSUER, OIDC_REDIRECT_PATH, OIDC_SCHEME, OIDC_SCOPES } from '../../data/auth/oidcConfig';
import { decodeJwt } from '@danbro96/lupira-expo-oidc/oidc';
import { oidc } from '../../data/auth/oidc';
import { logDebug, clearDebugLog } from '@danbro96/lupira-expo-diagnostics/log';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { DebugPanel } from '../components/DebugPanel';
import { useAuth } from '../../state/auth-store';
import { usePrefs } from '../../state/prefs-store';
import { radii, spacing, useColors, type Palette } from '../theme';
import { ICONS } from '../icons';

// Required so the auth redirect back into the app dismisses the in-app browser.
WebBrowser.maybeCompleteAuthSession();

async function exchangeCodeForSession(
  discovery: AuthSession.DiscoveryDocument,
  request: AuthSession.AuthRequest,
  code: string,
  redirectUri: string,
  setBusy: (busy: boolean) => void,
  setError: (error: string | null) => void,
) {
  setBusy(true);
  setError(null);
  try {
    const tokenEndpoint = discovery.tokenEndpoint;
    logDebug('exchange:start', `endpoint=${tokenEndpoint ?? 'MISSING'} verifier=${!!request.codeVerifier}`);
    if (!tokenEndpoint) {
      setError('Discovery returned no token endpoint.');
      return;
    }
    const token = await oidc.exchangeAuthCode({
      tokenEndpoint,
      code,
      redirectUri,
      codeVerifier: request.codeVerifier,
    });
    logDebug(
      'exchange:ok',
      `accessToken=${!!token.accessToken} idToken=${!!token.idToken} refresh=${!!token.refreshToken} expiresIn=${token.expiresIn ?? 'n/a'}`,
    );
    const claims = decodeJwt(token.idToken ?? token.accessToken);
    const email = (claims.email as string) ?? (claims.preferred_username as string) ?? (claims.sub as string) ?? '';
    const name = (claims.name as string) ?? (claims.given_name as string) ?? undefined;
    logDebug('decode', `email=${email ? 'present' : 'EMPTY'} name=${name ? 'present' : 'none'}`);
    await useAuth.getState().setSession(
      {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: Date.now() + (token.expiresIn ?? 3600) * 1000,
      },
      { sub: email, displayName: name },
    );
    logDebug('setSession', 'authed=true');
  } catch (e) {
    const err = e as { code?: string; description?: string; message?: string };
    logDebug('exchange:error', `${err.code ?? ''} ${err.description ?? ''} ${err.message ?? String(e)}`.trim());
    setError(err.message ?? String(e));
  } finally {
    setBusy(false);
  }
}

export function LoginScreen() {
  const discovery = AuthSession.useAutoDiscovery(OIDC_ISSUER);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: OIDC_SCHEME, path: OIDC_REDIRECT_PATH });
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    { clientId: OIDC_CLIENT_ID, scopes: OIDC_SCOPES, redirectUri, usePKCE: true },
    discovery,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const responseError =
    response?.type === 'error'
      ? (response.error?.message ?? 'Sign-in failed.')
      : response && response.type !== 'success'
        ? `Sign-in did not complete (${response.type}).`
        : null;
  const [shownResponse, setShownResponse] = useState(response);
  if (response !== shownResponse) {
    setShownResponse(response);
    if (responseError) setError(responseError);
  }
  const debugEnabled = usePrefs(s => s.debugEnabled);
  const c = useColors();
  const styles = makeStyles(c);

  // Surface the static config once so it can be compared to the Authentik provider.
  useEffect(() => {
    logDebug('config', `issuer=${OIDC_ISSUER} client=${OIDC_CLIENT_ID} redirectUri=${redirectUri}`);
  }, [redirectUri]);

  useEffect(() => {
    logDebug(discovery ? 'discovery:loaded' : 'discovery:loading', discovery?.tokenEndpoint ?? undefined);
  }, [discovery]);

  useEffect(() => {
    if (request) logDebug('request:ready', `verifier=${!!request.codeVerifier}`);
  }, [request]);

  // Diagnostic: log any deep link that reaches the app (the Authentik redirect should show
  // up here as lupiratasks://...?code=…). If it arrives but auth still 'dismiss'es, the issue
  // is session matching; if it never arrives, the redirect isn't returning to the app's task.
  useEffect(() => {
    void Linking.getInitialURL().then(u => { if (u) logDebug('linking:initial', u); });
    const sub = Linking.addEventListener('url', ({ url }) => logDebug('linking:url', url));
    return () => sub.remove();
  }, []);

  async function handleSignIn() {
    clearDebugLog();
    logDebug('config', `issuer=${OIDC_ISSUER} client=${OIDC_CLIENT_ID} redirectUri=${redirectUri}`);
    logDebug('prompt:open');
    try {
      // createTask:false (Android) keeps the auth tab in the app's task so the redirect can
      // return into it — without this the redirect lands in a separate task and resolves
      // 'dismiss' (expo/expo#23781).
      const result = await promptAsync({ createTask: false });
      logDebug('prompt:result', result.type);
    } catch (e) {
      logDebug('prompt:throw', String(e));
    }
  }

  useEffect(() => {
    if (!response) return;
    logDebug('response', response.type);

    if (response.type === 'error') {
      logDebug('response:error', `${response.error?.code ?? ''} ${responseError}`.trim());
      return;
    }
    if (response.type !== 'success') {
      // dismiss / cancel / locked — no params to exchange. Stop with a visible reason.
      logDebug('response:not-success', response.type);
      return;
    }
    if (!discovery || !request) {
      logDebug('response:guard', `discovery=${!!discovery} request=${!!request}`);
      return;
    }
    logDebug('response:params', `code=${!!response.params.code} state=${!!response.params.state}`);

    void exchangeCodeForSession(discovery, request, response.params.code, redirectUri, setBusy, setError);
  }, [response, responseError, discovery, request, redirectUri]);

  return (
    <View style={styles.container}>
      {/* Code-drawn brand mark (no asset pipeline); swap for the real Lupira SVG logo once
          react-native-svg lands (deferred — needs a dev-client rebuild). */}
      <View style={styles.logo}>
        <MaterialIcons name={ICONS.check} size={52} color={c.onPrimary} />
      </View>
      <Text variant="headlineSmall">Lupira Tasks</Text>
      <Text style={styles.subtitle}>Sign in with your family account.</Text>

      <Button
        title="Sign in with Authentik"
        onPress={() => void handleSignIn()}
        disabled={!request}
        loading={busy}
        style={styles.button}
        contentStyle={styles.buttonContent}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {debugEnabled ? <Text style={styles.hint}>redirect: {redirectUri}</Text> : null}

      <DebugPanel />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: c.bg },
    logo: {
      width: 96,
      height: 96,
      borderRadius: radii.lg + 8,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xl,
    },
    subtitle: { marginTop: spacing.sm, marginBottom: 28, fontSize: 15, color: c.textMuted },
    button: { width: '100%', maxWidth: 360, borderRadius: radii.round },
    buttonContent: { paddingVertical: 8 },
    error: { marginTop: spacing.lg, color: c.danger, textAlign: 'center' },
    hint: { marginTop: spacing.md, fontSize: 11, color: c.textDisabled },
  });
