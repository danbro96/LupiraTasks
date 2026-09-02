using System.Text.RegularExpressions;
using LupiraTasksBff.OpenApi;
using LupiraTasksBff.Proxy;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace LupiraTasksBff.UnitTests;

/// <summary>
/// The route table is computed from <c>exposed.json</c> at startup: the allowlist and the route table
/// must agree, and the keys must be shaped the way YARP's <c>LoadFromConfig</c> and the
/// <c>ApiPrefixes</c> fence read them.
/// </summary>
public class ProxyRoutesTests
{
    private const string Prefix = "/api";
    private static readonly ExposedSurface Exposed = ExposedSurface.Load();

    /// <summary>Reads the generated keys back exactly as the app does.</summary>
    private static IConfigurationSection Routes() =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(ProxyRoutes.Build(Exposed))
            .Build()
            .GetSection("ReverseProxy:Routes");

    [Fact]
    public void Every_allowlisted_operation_is_routed_exactly_once()
    {
        var routed = Routes().GetChildren()
            .SelectMany(route => route.GetSection("Match:Methods").GetChildren()
                .Select(m => $"{m.Value} {route["Match:Path"]}"))
            .ToList();

        var allowlisted = new[] { Exposed.Operations, Exposed.Guest }
            .SelectMany(group => group.SelectMany(c => c.Value))
            .Select(op =>
            {
                var parts = op.Split(' ', 2);
                return $"{parts[0]} {Prefix}{ExposedSurface.BffPath(parts[1])}";
            })
            .ToList();

        Assert.Equal(allowlisted.Count, routed.Count);
        Assert.Empty(allowlisted.Except(routed, StringComparer.Ordinal));
    }

    [Fact]
    public void There_is_no_catch_all_and_every_route_pins_its_verbs()
    {
        foreach (var route in Routes().GetChildren())
        {
            // Tasks proxies no file subtree, so unlike cal-web there is no legitimate wildcard at all.
            Assert.DoesNotContain("**", route["Match:Path"]!, StringComparison.Ordinal);
            Assert.NotEmpty(route.GetSection("Match:Methods").GetChildren());
        }
    }

    [Fact]
    public void Only_the_share_surface_gets_the_guest_policy()
    {
        // POST /shares/redeem is member-authed and one letter from the account-less /share surface; a
        // prefix rule instead of exact templates would silently downgrade its auth.
        var byPath = Routes().GetChildren().ToDictionary(r => r["Match:Path"]!, r => r["AuthorizationPolicy"]!);

        foreach (var (path, policy) in byPath)
        {
            var isShare = path == $"{Prefix}/share" || path.StartsWith($"{Prefix}/share/", StringComparison.Ordinal);
            Assert.Equal(isShare ? "Guest" : "Default", policy);
        }

        Assert.Equal("Default", byPath[$"{Prefix}/shares/redeem"]);
    }

    [Fact]
    public void Nothing_routes_the_dav_seam_mcp_or_the_probe_and_doc_endpoints()
    {
        // These answer to a different credential than the family session, or aren't a browser surface.
        var forbidden = new Regex(@"^/api/(dav-backend|mcp|\.well-known|pingz|livez|readyz|openapi|scalar)(/|$)");

        var offending = Routes().GetChildren().Select(r => r["Match:Path"]!).Where(p => forbidden.IsMatch(p)).ToList();

        Assert.Empty(offending);
    }

    [Fact]
    public void Guest_routes_drop_the_token_segment()
    {
        var guest = Routes().GetChildren()
            .Where(r => r["AuthorizationPolicy"] == "Guest")
            .Select(r => r["Match:Path"]!)
            .ToList();

        Assert.NotEmpty(guest);
        // Program.cs replays the token from the guest cookie, so it must not survive in the template.
        Assert.All(guest, path => Assert.DoesNotContain("{token}", path, StringComparison.Ordinal));
    }

    [Fact]
    public void A_colliding_allowlist_throws_rather_than_dropping_a_route()
    {
        var colliding = new ExposedSurface
        {
            Operations = new() { ["tasks-api"] = ["GET /items/{id}", "GET /items-id"] },
        };

        Assert.Throws<InvalidOperationException>(() => ProxyRoutes.Build(colliding).ToList());
    }
}
