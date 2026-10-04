using System.Security.Claims;
using Lupira.Bff.Auth;
using LupiraTasksBff.Dtos;
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
                GuestExchangeRequest body, HttpContext ctx, IHttpClientFactory clients, LupiraBffAuthOptions auth, CancellationToken ct) =>
            {
                var token = body.Token?.Trim();
                if (string.IsNullOrEmpty(token)) return TypedResults.Unauthorized();

                // Upstream re-reads the link per request; every failure mode there is an opaque 401.
                var http = clients.CreateClient(UpstreamClient.Name);
                using var probe = await http.GetAsync($"/shared/{Uri.EscapeDataString(token)}", ct);
                if (!probe.IsSuccessStatusCode) return TypedResults.Unauthorized();

                var guest = auth.Guest!;
                var identity = new ClaimsIdentity([new Claim(guest.RequiredClaim, token)], guest.SchemeName);
                await ctx.SignInAsync(guest.SchemeName, new ClaimsPrincipal(identity));

                return TypedResults.Ok(new GuestSessionInfo { Active = true });
            })
            .AllowAnonymous()
            .WithName("ExchangeShareToken")
            .WithTags("Guest");

        app.MapPost("/auth/guest/logout", async (HttpContext ctx, LupiraBffAuthOptions auth) =>
            {
                await ctx.SignOutAsync(auth.Guest!.SchemeName);
                return Results.NoContent();
            })
            .AllowAnonymous()
            .ExcludeFromDescription();

        return app;
    }
}
