using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lupira.Depz;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace LupiraTasksBff.IntegrationTests;

public sealed class DepzTests(BffTestFactory factory) : IClassFixture<BffTestFactory>
{
    private HttpClient Client() => factory.CreateClient(new WebApplicationFactoryClientOptions
    {
        AllowAutoRedirect = false,
        BaseAddress = new Uri("https://localhost"),
    });

    [Theory]
    [InlineData(null)]
    [InlineData("wrong-key")]
    public async Task Without_the_probe_key_is_401_not_a_login_challenge_or_the_spa(string? key)
    {
        var client = Client();
        if (key is not null) client.DefaultRequestHeaders.Add(ProbeKeyFilter.HeaderName, key);

        var res = await client.GetAsync("/depz");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task With_the_probe_key_serves_the_report_anonymously()
    {
        var client = Client();
        client.DefaultRequestHeaders.Add(ProbeKeyFilter.HeaderName, BffTestFactory.ProbeKey);

        var res = await client.GetAsync("/depz");

        res.EnsureSuccessStatusCode();
        var report = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("lupira-tasks-web", report.GetProperty("service").GetString());
    }
}
