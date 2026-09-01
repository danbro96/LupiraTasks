using Duende.AccessTokenManagement.OpenIdConnect;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;

namespace LupiraTasksBff.Auth;

/// <summary>
/// SSO gate for the member surface. Two front doors share one authorization policy: browsers run Authentik
/// OIDC (Authorization Code + PKCE) with a server-side cookie session and Duende token management (production;
/// non-production auto-authenticates a local user via <see cref="DevAuthHandler"/>), while native callers (the
/// mobile app) present an Authentik-minted JWT bearer that is validated here and forwarded verbatim upstream.
/// Authorization is per-route: the member proxy route uses the default (authenticated) policy; the
/// account-less share surface and the SPA shell are anonymous, so there is no global fallback policy.
/// </summary>
internal static class AuthExtensions
{
    /// <summary>Authentik groups that mark a caller as admin (reported by /auth/user).</summary>
    public static readonly string[] AdminGroups = ["tasks-admins", "platform-admins"];

    private static readonly string[] DefaultScopes =
        ["openid", "profile", "email", "groups", "offline_access"];

    public static void AddTasksAuth(this WebApplicationBuilder builder)
    {
        var services = builder.Services;
        services.AddHttpContextAccessor();

        AuthenticationBuilder auth;
        string interactiveScheme;
        if (builder.Environment.IsProduction())
        {
            auth = AddOidc(builder);
            interactiveScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        }
        else
        {
            auth = services.AddAuthentication(DevAuthHandler.SchemeName)
                .AddScheme<AuthenticationSchemeOptions, DevAuthHandler>(DevAuthHandler.SchemeName, null);
            interactiveScheme = DevAuthHandler.SchemeName;
        }

        // DefaultPolicy = authenticated via the interactive scheme OR a bearer — referenced by the member
        // YARP route ("Default"). The bearer scheme is added only when an authority is configured.
        var hasBearer = AddBearer(builder, auth);
        var schemes = hasBearer
            ? new[] { interactiveScheme, JwtBearerDefaults.AuthenticationScheme }
            : [interactiveScheme];
        services.AddAuthorizationBuilder().SetDefaultPolicy(
            new AuthorizationPolicyBuilder(schemes).RequireAuthenticatedUser().Build());
    }

    /// <summary>JWT bearer for native clients (the mobile app's Authentik public client). The token's audience
    /// must include this backend's (<c>lupira-tasks</c>) — the mobile client requests the tasks audience scope,
    /// so one token satisfies both the BFF and the proxied API.</summary>
    private static bool AddBearer(WebApplicationBuilder builder, AuthenticationBuilder auth)
    {
        var authority = builder.Configuration["Auth:Bearer:Authority"] ?? builder.Configuration["Auth:Oidc:Authority"];
        if (string.IsNullOrWhiteSpace(authority)) return false;   // bare dev config — interactive scheme only
        var audience = builder.Configuration["Auth:Bearer:Audience"] ?? "lupira-tasks";

        auth.AddJwtBearer(o =>
        {
            o.Authority = authority;
            o.MapInboundClaims = false;
            o.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
            o.TokenValidationParameters.ValidAudience = audience;
            o.TokenValidationParameters.NameClaimType = "email";
            o.TokenValidationParameters.RoleClaimType = "groups";
        });
        return true;
    }

    private static AuthenticationBuilder AddOidc(WebApplicationBuilder builder)
    {
        var oidc = builder.Configuration.GetSection("Auth:Oidc");
        var scopes = oidc.GetSection("Scopes").Get<string[]>() is { Length: > 0 } configured
            ? configured
            : DefaultScopes;

        var auth = builder.Services.AddAuthentication(o =>
            {
                o.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
                o.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
            })
            .AddCookie(o =>
            {
                o.Cookie.Name = "__Host-lupira-tasks";
                o.Cookie.HttpOnly = true;
                o.Cookie.SecurePolicy = CookieSecurePolicy.Always;
                o.Cookie.SameSite = SameSiteMode.Lax;
                o.SlidingExpiration = true;
                o.ExpireTimeSpan = TimeSpan.FromHours(8);
                // XHR calls want a 401 to react to, not an HTML redirect to Authentik.
                o.Events.OnRedirectToLogin = ctx => ApiAware(ctx, StatusCodes.Status401Unauthorized);
                o.Events.OnRedirectToAccessDenied = ctx => ApiAware(ctx, StatusCodes.Status403Forbidden);
            })
            .AddOpenIdConnect(o =>
            {
                o.Authority = oidc["Authority"];
                o.ClientId = oidc["ClientId"];
                // The shared `lupira-tasks` client is public (PKCE, no secret); the BFF's protection is
                // holding tokens server-side, not client auth. A secret is set only if one is configured
                // (a dedicated confidential client) — otherwise this stays a public PKCE client.
                var clientSecret = oidc["ClientSecret"];
                if (!string.IsNullOrWhiteSpace(clientSecret)) o.ClientSecret = clientSecret;
                o.ResponseType = "code";
                o.UsePkce = true;
                o.SaveTokens = true;
                o.GetClaimsFromUserInfoEndpoint = true;
                o.MapInboundClaims = false;
                o.RequireHttpsMetadata = true;
                o.TokenValidationParameters.NameClaimType = "email";
                o.TokenValidationParameters.RoleClaimType = "groups";
                o.Scope.Clear();
                foreach (var s in scopes) o.Scope.Add(s);
                // OIDC is the challenge scheme, so unauthenticated /api/* lands here. XHRs want a 401 to
                // react to (authedFetch then routes to /auth/login), not a 302 to Authentik. Full-page
                // flows like /auth/login are not under /api and still redirect.
                o.Events.OnRedirectToIdentityProvider = context =>
                {
                    if (context.Request.Path.StartsWithSegments("/api"))
                    {
                        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                        context.HandleResponse();
                    }

                    return Task.CompletedTask;
                };
            });

        // Keeps the forwarded LupiraTasksApi access token fresh via the refresh token (offline_access).
        builder.Services.AddOpenIdConnectAccessTokenManagement();
        return auth;
    }

    private static Task ApiAware<T>(RedirectContext<T> ctx, int statusCode)
        where T : AuthenticationSchemeOptions
    {
        if (ctx.Request.Path.StartsWithSegments("/api"))
        {
            ctx.Response.StatusCode = statusCode;
            return Task.CompletedTask;
        }

        ctx.Response.Redirect(ctx.RedirectUri);
        return Task.CompletedTask;
    }
}
