using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace LupiraTasksBff.IntegrationTests;

/// <summary>
/// In-process upstream the YARP cluster points at during tests: a real Kestrel listener on an ephemeral port
/// that echoes back what the proxy actually sent (path + auth headers), so tests assert observed behavior
/// rather than trusting the transform code. It also counts hits, so a test can prove a request never
/// reached the upstream at all.
/// </summary>
public sealed class StubUpstream : IAsyncDisposable
{
    private readonly WebApplication _app;
    private int _hits;

    public string Address { get; }

    public int Hits => Volatile.Read(ref _hits);

    private StubUpstream(WebApplication app, string address)
    {
        _app = app;
        Address = address;
    }

    public static async Task<StubUpstream> StartAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        var app = builder.Build();

        StubUpstream? self = null;
        app.Map("/{**path}", (HttpContext ctx) =>
        {
            Interlocked.Increment(ref self!._hits);
            return Results.Json(new UpstreamEcho(
                ctx.Request.Path.ToString(),
                ctx.Request.Headers.Authorization.ToString(),
                ctx.Request.Headers["X-Dev-User"].ToString()));
        });

        await app.StartAsync();
        var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();
        self = new StubUpstream(app, address);
        return self;
    }

    public async ValueTask DisposeAsync() => await _app.DisposeAsync();
}

public sealed record UpstreamEcho(string Path, string Authorization, string XDevUser);
