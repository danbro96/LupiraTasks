using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace LupiraTasksWeb.Endpoints;

/// <summary>Liveness (<c>/livez</c>) and readiness (<c>/readyz</c>) probes — process-up only; the BFF's
/// one dependency (LupiraTasksApi) is reachable per-request through the proxy, not polled here.</summary>
public static class HealthChecks
{
    public static IServiceCollection AddAppHealthChecks(this IServiceCollection services)
    {
        services.AddHealthChecks().AddCheck("self", () => HealthCheckResult.Healthy());
        return services;
    }

    public static void MapAppHealthChecks(this IEndpointRouteBuilder app)
    {
        // Polled constantly by the Docker healthcheck — keep it out of HTTP metrics (route cardinality).
        app.MapHealthChecks("/livez").AllowAnonymous().DisableHttpMetrics();
        app.MapHealthChecks("/readyz").AllowAnonymous().DisableHttpMetrics();
    }
}
