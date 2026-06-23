using System.Security.Claims;
using LupiraTasksWeb.Auth;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Http.HttpResults;

namespace LupiraTasksWeb.Endpoints;

/// <summary>The auth surface the SPA drives: sign-in challenge, sign-out, and the current-user probe.</summary>
public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app, IHostEnvironment env)
    {
        var group = app.MapGroup("/auth");

        group.MapGet("/login", (string? returnUrl) =>
            {
                var target = SafeReturnUrl(returnUrl);
                return env.IsProduction()
                    ? Results.Challenge(
                        new AuthenticationProperties { RedirectUri = target },
                        [OpenIdConnectDefaults.AuthenticationScheme])
                    : Results.Redirect(target);
            })
            .AllowAnonymous();

        group.MapPost("/logout", () =>
                env.IsProduction()
                    ? Results.SignOut(
                        new AuthenticationProperties { RedirectUri = "/" },
                        [CookieAuthenticationDefaults.AuthenticationScheme, OpenIdConnectDefaults.AuthenticationScheme])
                    : Results.Redirect("/"))
            .AllowAnonymous();

        group.MapGet("/user", Results<Ok<UserInfo>, UnauthorizedHttpResult> (ClaimsPrincipal user) =>
            {
                if (user.Identity?.IsAuthenticated != true)
                    return TypedResults.Unauthorized();

                var groups = user.FindAll("groups").Select(c => c.Value).ToArray();
                return TypedResults.Ok(new UserInfo
                {
                    Email = user.FindFirstValue("email") ?? user.FindFirstValue(ClaimTypes.Email) ?? "",
                    Name = user.FindFirstValue("name") ?? user.FindFirstValue(ClaimTypes.Name),
                    Groups = groups,
                    IsAdmin = groups.Intersect(AuthExtensions.AdminGroups, StringComparer.OrdinalIgnoreCase).Any(),
                });
            })
            .AllowAnonymous();

        return app;
    }

    // Only allow same-site relative redirects back into the SPA.
    private static string SafeReturnUrl(string? returnUrl) =>
        !string.IsNullOrEmpty(returnUrl) && Uri.IsWellFormedUriString(returnUrl, UriKind.Relative) && returnUrl.StartsWith('/')
            ? returnUrl
            : "/";
}

public sealed class UserInfo
{
    public required string Email { get; set; }
    public string? Name { get; set; }
    public required IReadOnlyList<string> Groups { get; set; }
    public required bool IsAdmin { get; set; }
}
