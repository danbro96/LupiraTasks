import type { UserManagerSettings } from "oidc-client-ts";

/**
 * Placeholder OIDC configuration for oidc-client-ts.
 *
 * Values are read from build-time env (Vite `import.meta.env`) with safe
 * defaults so the skeleton compiles without secrets. This is config only —
 * the UserManager is not wired into the app yet.
 */
export const oidcConfig: UserManagerSettings = {
  authority: import.meta.env.VITE_OIDC_AUTHORITY ?? "https://auth.example.com",
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID ?? "lupira-tasks-web",
  redirect_uri:
    import.meta.env.VITE_OIDC_REDIRECT_URI ??
    `${window.location.origin}/callback`,
  post_logout_redirect_uri:
    import.meta.env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI ??
    window.location.origin,
  response_type: "code",
  scope: import.meta.env.VITE_OIDC_SCOPE ?? "openid profile email",
};
