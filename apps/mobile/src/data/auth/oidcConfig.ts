// Authentik OIDC client config for the app's own public PKCE client — no secret.
// The provider must run Global issuer mode, or the token's `iss` won't match what the BFF and
// tasks-api validate (see DevOps/APIs/lupira-tasks-api/deployment.md Part 2).

// No trailing slash — Authentik 2026.8 404s the doubled slash expo-auth-session would produce.
export const OIDC_ISSUER = 'https://auth.lupira.com/application/o/lupira-tasks-mobile';

/** The app's own client, separate from the BFF's `lupira-tasks`. */
export const OIDC_CLIENT_ID = 'lupira-tasks-mobile';

/** `lupira-tasks-aud` widens `aud` to `lupira-tasks` so one token satisfies the BFF and the API.
 *  `groups` drives admin; `offline_access` requests a refresh token. */
export const OIDC_SCOPES = [
  'openid', 'email', 'profile', 'groups', 'offline_access', 'lupira-tasks-aud',
];

/** App scheme (app.json `scheme`) — the redirect URI is `<scheme>://...`. */
export const OIDC_SCHEME = 'lupiratasks';

/**
 * Redirect path. A bare `lupiratasks://` has an empty authority that gets normalized to
 * `lupiratasks:` on redirect, so expo-auth-session can't match the callback (→ 'dismiss').
 * A non-empty path keeps the URI stable: `lupiratasks://oauthredirect`.
 * NOTE: this exact URI must be registered as an allowed redirect URI on the Authentik provider.
 */
export const OIDC_REDIRECT_PATH = 'oauthredirect';
