using System.Net.Http.Headers;
using System.Text.Json.Serialization;
using Duende.AccessTokenManagement;
using Duende.AccessTokenManagement.OpenIdConnect;
using LupiraTasksBff.Auth;
using LupiraTasksBff.Endpoints;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Yarp.ReverseProxy.Transforms;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// Prod: Authentik OIDC + server-side cookie session (the SPA never holds a token). Dev: a local user.
builder.AddTasksAuth();

// Persist data-protection keys so the auth cookie survives container restarts (mount DataProtection:KeyPath).
var keyPath = builder.Configuration["DataProtection:KeyPath"];
if (!string.IsNullOrWhiteSpace(keyPath))
    builder.Services.AddDataProtection()
        .SetApplicationName("LupiraTasksBff")
        .PersistKeysToFileSystem(new DirectoryInfo(keyPath));

builder.Services.AddAppHealthChecks();

// Reverse proxy to LupiraTasksApi. The member route (default policy) carries the signed-in user's
// access token; /api/shared/* is anonymous and never gets a bearer (account-less surface). Dev forwards
// X-Dev-User instead of a token so the stack runs without Authentik.
var isDev = builder.Environment.IsDevelopment();
var devUser = builder.Configuration["Dev:User"] ?? "dev@localhost";
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .AddTransforms(ctx => ctx.AddRequestTransform(async transform =>
    {
        if (transform.HttpContext.Request.Path.StartsWithSegments("/api/shared"))
            return;

        // Native callers already presented a bearer the API accepts — YARP copies it verbatim.
        if (transform.HttpContext.Request.Headers.Authorization.Count > 0)
            return;

        if (isDev)
        {
            transform.ProxyRequest.Headers.TryAddWithoutValidation("X-Dev-User", devUser);
        }
        else if (transform.HttpContext.User.Identity?.IsAuthenticated == true)
        {
            var token = await transform.HttpContext.GetUserAccessTokenAsync().GetToken();
            var accessToken = token.AccessToken.ToString();
            if (!string.IsNullOrEmpty(accessToken))
                transform.ProxyRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        }
    }));

// OpenTelemetry → platform collector. Env-gated: a no-op without OTEL_EXPORTER_OTLP_ENDPOINT (local
// dev stays silent). Protocol/headers/interval/resource-attrs come from the standard OTEL_* env vars.
var otlpEndpoint = builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"];
if (!string.IsNullOrWhiteSpace(otlpEndpoint))
{
    builder.Services.AddOpenTelemetry()
        .ConfigureResource(r => r.AddService(
            serviceName: "lupira-tasks-web",
            serviceVersion: typeof(Program).Assembly.GetName().Version?.ToString() ?? "0.0.0"))
        .WithTracing(t => t
            .AddAspNetCoreInstrumentation(o =>
            {
                o.RecordException = true;
                // Health probes are polled constantly by docker + devops-monitor; their spans add nothing.
                o.Filter = ctx => ctx.Request.Path != "/livez" && ctx.Request.Path != "/readyz";
            })
            .AddHttpClientInstrumentation()
            .AddOtlpExporter())
        .WithMetrics(m => m
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddRuntimeInstrumentation()
            .AddOtlpExporter());

    builder.Logging.AddOpenTelemetry(o =>
    {
        o.IncludeFormattedMessage = true;
        o.IncludeScopes = true;
        o.AddOtlpExporter();
    });
}

var app = builder.Build();

// Behind the reverse proxy: trust X-Forwarded-* so OIDC redirect URIs and Secure cookies use https.
// cloudflared reaches us from a Docker-bridge IP, not loopback, so the default KnownProxies/KnownNetworks
// allowlist would drop the headers — clear it. Safe only because the container's sole ingress is the tunnel.
var forwardedHeaders = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
};
forwardedHeaders.KnownIPNetworks.Clear();
forwardedHeaders.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeaders);

if (app.Environment.IsProduction())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.MapAppHealthChecks();

app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

app.MapAuthEndpoints(app.Environment);
app.MapReverseProxy();

// A proxied prefix that matched no route is a 404, not the SPA shell. Without this the fallback
// answers 200/text-html for anything under an API prefix, so a removed route and a live one look
// alike from outside. Literal segments outrank this catch-all, so it only fires on a real miss.
foreach (var prefix in ApiPrefixes(app.Configuration))
    app.Map($"{prefix}/{{**rest}}", () => Results.NotFound());

// SPA shell — served anonymously so the account-less share surface (/s/:token) loads without a session.
// The SPA's own guard plus the member proxy route enforce auth for everything else.
app.MapFallbackToFile("index.html");

app.Run();

// The first segment of every proxy route's path, so the fence can't drift from the route table.
static string[] ApiPrefixes(IConfiguration config) =>
    config.GetSection("ReverseProxy:Routes").GetChildren()
        .Select(route => route["Match:Path"])
        .Where(path => !string.IsNullOrWhiteSpace(path))
        .Select(path => $"/{path!.TrimStart('/').Split('/')[0]}")
        .Distinct()
        .ToArray();

// Exposes the implicit Program entry point to the integration test assembly (WebApplicationFactory<Program>).
public partial class Program;
