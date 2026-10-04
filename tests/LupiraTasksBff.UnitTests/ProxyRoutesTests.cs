using System.Text.RegularExpressions;
using Lupira.Bff.Proxy;
using Xunit;

namespace LupiraTasksBff.UnitTests;

public class ProxyRoutesTests
{
    private const string Prefix = "/api";

    private static readonly IReadOnlyList<ProxyRoute> Routes =
        ProxyRoutes.Plan(ExposedSurface.Load(typeof(Program).Assembly));

    [Fact]
    public void There_is_no_catch_all_and_every_route_pins_its_verbs()
    {
        foreach (var route in Routes)
        {
            // Tasks proxies no file subtree, so unlike cal-web there is no legitimate wildcard at all.
            Assert.DoesNotContain("**", route.Path, StringComparison.Ordinal);
            Assert.NotEmpty(route.Verbs);
        }
    }

    [Fact]
    public void Only_the_share_surface_gets_the_guest_policy()
    {
        // POST /shares/redeem is member-authed and one letter from the account-less /share surface; a
        // prefix rule instead of exact templates would silently downgrade its auth.
        foreach (var route in Routes)
        {
            var isShare = route.Path == $"{Prefix}/share" || route.Path.StartsWith($"{Prefix}/share/", StringComparison.Ordinal);
            Assert.Equal(isShare ? "Guest" : "Default", route.Group.Policy);
        }

        Assert.Equal("Default", Routes.Single(r => r.Path == $"{Prefix}/shares/redeem").Group.Policy);
    }

    [Fact]
    public void Nothing_routes_the_dav_seam_mcp_or_the_probe_and_doc_endpoints()
    {
        // These answer to a different credential than the family session, or aren't a browser surface.
        var forbidden = new Regex(@"^/api/(dav-backend|mcp|\.well-known|pingz|livez|readyz|openapi|scalar)(/|$)");

        Assert.DoesNotContain(Routes, r => forbidden.IsMatch(r.Path));
    }

    [Fact]
    public void Guest_routes_drop_the_token_segment()
    {
        var guest = Routes.Where(r => r.Group.Policy == "Guest").ToList();

        Assert.NotEmpty(guest);
        // The proxy replays the token from the guest cookie, so it must not survive in the template.
        Assert.All(guest, route => Assert.DoesNotContain("{token}", route.Path, StringComparison.Ordinal));
    }
}
