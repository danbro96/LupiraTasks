using System.Security.Claims;
using LupiraTasksBff.Auth;
using LupiraTasksBff.Upstream;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http.HttpResults;

namespace LupiraTasksBff.Endpoints;

public static class GuestEndpoints
{
    public static IEndpointRouteBuilder MapGuestEndpoints(this IEndpointRouteBuilder app)
    {
        // Trades a share token for the guest cookie, so the token leaves the URL after one request.
        app.MapPost("/auth/guest", async Task<Results<Ok<GuestSessionInfo>, UnauthorizedHttpResult>> (
                GuestExchangeRequest body, HttpContext ctx, IHttpClientFactory clients, CancellationToken ct) =>
            {
                var token = body.Token?.Trim();
                if (string.IsNullOrEmpty(token)) return TypedResults.Unauthorized();

                // Upstream re-reads the link per request; every failure mode there is an opaque 401.
                var http = clients.CreateClient(UpstreamClient.Name);
                using var probe = await http.GetAsync($"/shared/{Uri.EscapeDataString(token)}", ct);
                if (!probe.IsSuccessStatusCode) return TypedResults.Unauthorized();

                var identity = new ClaimsIdentity(
                    [new Claim(GuestSession.TokenClaim, token)], GuestSession.SchemeName);
                await ctx.SignInAsync(GuestSession.SchemeName, new ClaimsPrincipal(identity));

                return TypedResults.Ok(new GuestSessionInfo { Active = true });
            })
            .AllowAnonymous()
            .WithName("ExchangeShareToken")
            .WithTags("Guest");

        app.MapPost("/auth/guest/logout", async (HttpContext ctx) =>
            {
                await ctx.SignOutAsync(GuestSession.SchemeName);
                return Results.NoContent();
            })
            .AllowAnonymous()
            .ExcludeFromDescription();

        return app;
    }
}

public sealed class GuestExchangeRequest
{
    public required string Token { get; set; }
}

/// <summary>Deliberately not <c>UserInfo</c>: a guest has no email, name or groups.</summary>
public sealed class GuestSessionInfo
{
    public required bool Active { get; set; }
}
