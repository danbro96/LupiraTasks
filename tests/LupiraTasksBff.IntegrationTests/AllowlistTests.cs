using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace LupiraTasksBff.IntegrationTests;

/// <summary>
/// The proxy is an allowlist: only the VERB+path pairs in packages/api/exposed.json reach the upstream.
/// The vitest cross-check in that package proves the config files agree; these prove the running app
/// behaves — that a miss 404s instead of serving the SPA shell, and that the account-less share surface
/// never carries the member's token.
/// </summary>
public sealed class AllowlistTests(BffTestFactory factory) : IClassFixture<BffTestFactory>
{
    // https, because the session cookies are SecurePolicy.Always and an http client would accept them
    // but never send them back — and production is https-only anyway.
    private HttpClient Client() => factory.CreateClient(new WebApplicationFactoryClientOptions
    {
        AllowAutoRedirect = false,
        BaseAddress = new Uri("https://localhost"),
    });

    [Fact]
    public async Task Allowlisted_path_proxies_with_the_api_prefix_stripped()
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization = new("Bearer", BffTestFactory.MintToken());

        var res = await client.GetAsync("/api/lists");

        res.EnsureSuccessStatusCode();
        var echo = await res.Content.ReadFromJsonAsync<UpstreamEcho>();
        Assert.Equal("/lists", echo!.Path);
    }

    [Theory]
    // Not in the allowlist: the agent/MCP-facing surface the two clients never call.
    [InlineData("/api/items")]
    [InlineData("/api/lists/11111111-1111-1111-1111-111111111111/items/22222222-2222-2222-2222-222222222222/relations")]
    [InlineData("/api/pingz")]
    // Never a browser surface: these answer to a device key, a service credential or the agent's bearer.
    [InlineData("/api/dav-backend/u/someone@example.com/collections")]
    [InlineData("/api/mcp")]
    [InlineData("/api/.well-known/oauth-protected-resource")]
    // Upstream infrastructure that has no business behind the family session.
    [InlineData("/api/openapi/v1.json")]
    [InlineData("/api/scalar")]
    public async Task Unlisted_path_is_404_and_never_reaches_the_upstream(string path)
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization = new("Bearer", BffTestFactory.MintToken());
        var before = factory.Upstream.Hits;

        var res = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        Assert.Equal(before, factory.Upstream.Hits);
    }

    [Fact]
    public async Task Wrong_verb_on_an_allowlisted_path_is_404_not_the_spa_shell()
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization = new("Bearer", BffTestFactory.MintToken());
        var before = factory.Upstream.Hits;

        // GET and POST /api/lists are allowlisted; PUT is not.
        var res = await client.PutAsync("/api/lists", new StringContent("{}"));

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        Assert.Equal(before, factory.Upstream.Hits);
        Assert.NotEqual("text/html", res.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Guest_exchange_replays_the_token_upstream_without_a_member_credential()
    {
        var client = Client();

        var exchange = await client.PostAsync("/auth/guest", JsonContent.Create(new { token = "some-token" }));
        exchange.EnsureSuccessStatusCode();

        var res = await client.GetAsync("/api/share");

        res.EnsureSuccessStatusCode();
        var echo = await res.Content.ReadFromJsonAsync<UpstreamEcho>();
        // The token left the URL at the exchange and comes back from the cookie here.
        Assert.Equal("/shared/some-token", echo!.Path);
        // Attaching a member token would widen the link to that member.
        Assert.Empty(echo.Authorization);
        Assert.Empty(echo.XDevUser);
    }

    [Fact]
    public async Task Guest_exchange_is_refused_when_the_upstream_rejects_the_token()
    {
        factory.Upstream.Reject.Add("/shared/dead-token");
        try
        {
            var res = await Client().PostAsync("/auth/guest", JsonContent.Create(new { token = "dead-token" }));

            Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
            res.Headers.TryGetValues("Set-Cookie", out var cookies);
            Assert.DoesNotContain("__Host-lupira-tasks-guest", string.Join(';', cookies ?? []));
        }
        finally
        {
            factory.Upstream.Reject.Remove("/shared/dead-token");
        }
    }

    [Fact]
    public async Task Share_surface_is_unreachable_without_the_guest_cookie()
    {
        var before = factory.Upstream.Hits;

        var res = await Client().GetAsync("/api/share");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal(before, factory.Upstream.Hits);
    }

    [Fact]
    public async Task Guest_cookie_does_not_reach_a_member_route()
    {
        var client = Client();
        (await client.PostAsync("/auth/guest", JsonContent.Create(new { token = "some-token" }))).EnsureSuccessStatusCode();

        var before = factory.Upstream.Hits;
        var res = await client.GetAsync("/api/lists");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal(before, factory.Upstream.Hits);
    }

    [Fact]
    public async Task Redeem_stays_member_authed_despite_sitting_next_to_the_share_surface()
    {
        var before = factory.Upstream.Hits;

        var res = await Client().PostAsync("/api/shares/redeem", JsonContent.Create(new { token = "x" }));

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal(before, factory.Upstream.Hits);
    }

    [Fact]
    public async Task Unauthenticated_member_call_is_401_not_a_redirect_to_authentik()
    {
        var res = await Client().GetAsync("/api/lists");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Null(res.Headers.Location);
    }

    [Fact]
    public async Task Caller_bearer_is_forwarded_verbatim()
    {
        var token = BffTestFactory.MintToken("mobile@test");
        var client = Client();
        client.DefaultRequestHeaders.Authorization = new("Bearer", token);

        var res = await client.GetAsync("/api/me");

        res.EnsureSuccessStatusCode();
        var echo = await res.Content.ReadFromJsonAsync<UpstreamEcho>();
        Assert.Equal($"Bearer {token}", echo!.Authorization);
    }

    [Fact]
    public async Task Wrong_audience_bearer_is_rejected()
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization =
            new("Bearer", BffTestFactory.MintToken(audience: "someone-else"));

        var res = await client.GetAsync("/api/lists");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }
}
