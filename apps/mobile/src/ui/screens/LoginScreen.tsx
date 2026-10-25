import { useEffect } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import * as WebBrowser from 'expo-web-browser';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { OIDC_CLIENT_ID, OIDC_ISSUER, OIDC_REDIRECT_PATH, OIDC_SCHEME, OIDC_SCOPES } from '../../data/auth/oidcConfig';
import { oidc } from '../../data/auth/oidc';
import { logDebug, clearDebugLog, detach } from '@danbro96/lupira-expo-diagnostics/log';
import { useOidcLogin } from '@danbro96/lupira-expo-oidc/useOidcLogin';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { DebugPanel } from '../components/DebugPanel';
import { useAuth } from '../../state/auth-store';
import { usePrefs } from '../../state/prefs-store';
import { radii, spacing, useColors, type Palette } from '../theme';
import { ICONS } from '../icons';

// Required so the auth redirect back into the app dismisses the in-app browser.
WebBrowser.maybeCompleteAuthSession();

export function LoginScreen() {
  const { status, error, retry, signIn, redirectUri } = useOidcLogin({
    oidc,
    scopes: OIDC_SCOPES,
    scheme: OIDC_SCHEME,
    path: OIDC_REDIRECT_PATH,
    onTokens: tokens => useAuth.getState().setSession(tokens),
    log: logDebug,
  });
  const debugEnabled = usePrefs(s => s.debugEnabled);
  const c = useColors();
  const styles = makeStyles(c);

  // Surface the static config once so it can be compared to the Authentik provider.
  useEffect(() => {
    logDebug('config', `issuer=${OIDC_ISSUER} client=${OIDC_CLIENT_ID} redirectUri=${redirectUri}`);
  }, [redirectUri]);

  // Diagnostic: log any deep link that reaches the app (the Authentik redirect should show
  // up here as lupiratasks://...?code=…). If it arrives but auth still 'dismiss'es, the issue
  // is session matching; if it never arrives, the redirect isn't returning to the app's task.
  useEffect(() => {
    detach(Linking.getInitialURL().then(u => { if (u) logDebug('linking:initial', u); }), 'linking:initial');
    const sub = Linking.addEventListener('url', ({ url }) => logDebug('linking:url', url));
    return () => sub.remove();
  }, []);

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
        onPress={() => {
          clearDebugLog();
          signIn().catch(() => toastError('Sign-in failed'));
        }}
        disabled={status !== 'ready'}
        loading={status === 'busy'}
        style={styles.button}
        contentStyle={styles.buttonContent}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {status === 'unavailable' ? (
        <Button title="Retry" variant="text" onPress={retry} style={styles.retry} />
      ) : null}
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
    retry: { marginTop: spacing.sm },
    hint: { marginTop: spacing.md, fontSize: 11, color: c.textDisabled },
  });
