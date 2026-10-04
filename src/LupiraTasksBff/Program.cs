using Lupira.Bff.Auth;
using Lupira.Bff.OpenApi;
using Lupira.Bff.Proxy;
using Lupira.Depz;
using Lupira.Depz.Yarp;
using Lupira.Hosting.Defaults;
using Lupira.Hosting.Health;
using Lupira.Hosting.Observability;
using LupiraTasksBff.Endpoints;
using LupiraTasksBff.Upstream;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

if (builder.TryPrintLupiraBffRoutes(args)) return;

builder.AddLupiraDefaults(o =>
{
    o.StrictNumbers = false;
    o.CaseInsensitiveProperties = true;
    o.StatusCodePages = false;
});

builder.AddLupiraBffProxy();
builder.AddLupiraBffAuth(o =>
{
    o.EnableOidc = true;
    o.EnableBearer = true;
    o.Audience = "lupira-tasks";
    o.CookieName = "__Host-lupira-tasks";
    o.AdminGroups = ["tasks-admins", "platform-admins"];
    o.DevGroups = ["tasks-admins"];
    o.Guest = new LupiraGuestSessionOptions { CookieName = "__Host-lupira-tasks-guest", RequiredClaim = "share-token" };
});

builder.Services.AddLupiraHealth();
builder.Services.AddUpstreamClient(builder.Configuration);

builder.Services.AddLupiraDepz(o =>
{
    builder.Configuration.GetSection(DepzOptions.SectionName).Bind(o);
    o.ServiceName = "lupira-tasks-web";
    o.MeterName = "LupiraTasksBff.Depz";
    o.MetricPrefix = "tasksweb";
});
builder.Services.AddLupiraDepzYarpTargets(o => o.ServiceNames["tasks-api"] = "lupira-tasks-api");

builder.Services.AddLupiraBffOpenApi(o =>
{
    o.Title = "LupiraTasks BFF";
    o.SortPaths = true;
    o.SecurityFor = operation => operation.Group.Name == "guest" ? ["GuestCookie"] : ["Cookie", "Bearer"];
    o.Upstreams.Add(new UpstreamSpec { Cluster = "tasks-api", Name = "LupiraTasksApi" });
    o.SecuritySchemes["Cookie"] = BffSecuritySchemes.Cookie("__Host-lupira-tasks", "Member session cookie minted by the BFF's OIDC login.");
    o.SecuritySchemes["Bearer"] = BffSecuritySchemes.Bearer("Authentik access token from the mobile app; audience must include lupira-tasks.");
    o.SecuritySchemes["GuestCookie"] = BffSecuritySchemes.Cookie("__Host-lupira-tasks-guest", "Account-less share session, minted by POST /auth/guest from a share token.");
});

builder.AddLupiraTelemetry("lupira-tasks-web");

var app = builder.Build();

app.UseLupiraDefaults();

if (app.Environment.IsProduction())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.MapLupiraHealth();
app.MapDepz();

app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

app.MapLupiraAuthEndpoints();
app.MapGuestEndpoints();
// Authenticated: the document is the whole internal API map, and the clients read the committed
// file rather than this endpoint.
app.MapOpenApi("/openapi/{documentName}.json").RequireAuthorization();
app.MapScalarApiReference("/scalar").RequireAuthorization();

app.MapLupiraBffProxy();

// SPA shell — served anonymously so the account-less share surface (/s/:token) loads without a session.
// The SPA's own guard plus the member proxy route enforce auth for everything else.
app.MapFallbackToFile("index.html");

app.Run();

// Exposes the implicit Program entry point to the integration test assembly (WebApplicationFactory<Program>).
public partial class Program;
