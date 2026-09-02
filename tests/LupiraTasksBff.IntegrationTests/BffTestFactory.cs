using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace LupiraTasksBff.IntegrationTests;

/// <summary>
/// Hosts the BFF in its Production wiring (cookie + OIDC + bearer, the shipped policy) with the YARP cluster
/// pointed at an in-process stub upstream. The bearer scheme is re-keyed to a local symmetric signing key so
/// tests mint their own tokens, and the OIDC handler gets static metadata so a challenge never leaves the
/// process. No cookie session is established — the redirect-vs-401 behavior still runs, because the OIDC
/// challenge fires for every unauthenticated request.
/// </summary>
public sealed class BffTestFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string Issuer = "https://auth.test/";
    public const string Audience = "lupira-tasks";

    private static readonly SymmetricSecurityKey SigningKey =
        new(Encoding.UTF8.GetBytes("lupira-tasks-bff-integration-test-signing-key-0123456789"));

    public StubUpstream Upstream { get; private set; } = null!;

    public async Task InitializeAsync() => Upstream = await StubUpstream.StartAsync();

    async Task IAsyncLifetime.DisposeAsync()
    {
        await Upstream.DisposeAsync();
        await base.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");
        // UseSetting, not ConfigureAppConfiguration: with minimal hosting the factory's config sources are
        // appended at Build(), AFTER Program.cs top-level code has read values like KeyPath — settings
        // injected this way are visible from the first line.
        builder.UseSetting("ReverseProxy:Clusters:tasks-api:Destinations:primary:Address", Upstream.Address);
        builder.UseSetting("Auth:Oidc:Authority", Issuer);
        builder.UseSetting("Auth:Oidc:ClientId", "lupira-tasks");
        builder.UseSetting("DataProtection:KeyPath", "");
        builder.ConfigureTestServices(services =>
        {
            // Local signing key instead of Authentik discovery.
            services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, o =>
            {
                o.Authority = null;
                o.ConfigurationManager = null;
                o.RequireHttpsMetadata = false;
                o.TokenValidationParameters.ValidIssuer = Issuer;
                o.TokenValidationParameters.ValidAudience = Audience;
                o.TokenValidationParameters.IssuerSigningKey = SigningKey;
            });
            services.PostConfigure<OpenIdConnectOptions>(OpenIdConnectDefaults.AuthenticationScheme, o =>
            {
                o.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(
                    new OpenIdConnectConfiguration
                    {
                        Issuer = Issuer,
                        AuthorizationEndpoint = $"{Issuer}authorize",
                        TokenEndpoint = $"{Issuer}token",
                    });
            });
        });
    }

    /// <summary>Mint a bearer the re-keyed scheme accepts. Pass a wrong audience/issuer to make it rejectable.</summary>
    public static string MintToken(string email = "user@test", string audience = Audience, string issuer = Issuer)
    {
        var handler = new JsonWebTokenHandler();
        return handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = audience,
            Expires = DateTime.UtcNow.AddMinutes(10),
            Subject = new ClaimsIdentity([new Claim("email", email), new Claim("sub", $"test|{email}")]),
            SigningCredentials = new SigningCredentials(SigningKey, SecurityAlgorithms.HmacSha256),
        });
    }
}
