using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace LupiraTasksWeb.Auth;

/// <summary>
/// Non-production auth: authenticates every request as the configured local user (<c>Dev:User</c>) so
/// the member surface is usable without an Authentik round-trip. Member API calls are forwarded with an
/// <c>X-Dev-User</c> header (see the YARP transform in Program.cs), which LupiraTasksApi's dev handler accepts.
/// </summary>
internal sealed class DevAuthHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IConfiguration configuration)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "Dev";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var email = configuration["Dev:User"] ?? "dev@localhost";
        var claims = new List<Claim>
        {
            new("sub", "dev|" + email),
            new("email", email),
            new("name", email),
        };

        var groups = configuration.GetSection("Dev:Groups").Get<string[]>() ?? ["tasks-admins"];
        foreach (var g in groups)
            claims.Add(new Claim("groups", g));

        var identity = new ClaimsIdentity(claims, SchemeName, nameType: "email", roleType: "groups");
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
