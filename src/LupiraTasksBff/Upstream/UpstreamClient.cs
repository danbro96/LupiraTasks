namespace LupiraTasksBff.Upstream;

/// <summary>The upstream API, for the few calls the BFF makes itself rather than proxying.</summary>
internal static class UpstreamClient
{
    public const string Name = "tasks-api";

    public static IServiceCollection AddUpstreamClient(this IServiceCollection services, IConfiguration configuration)
    {
        // The proxy's own cluster config, so one place says where the upstream lives.
        var address = configuration
            .GetSection($"ReverseProxy:Clusters:{Name}:Destinations")
            .GetChildren()
            .Select(destination => destination["Address"])
            .FirstOrDefault(a => !string.IsNullOrWhiteSpace(a))
            ?? throw new InvalidOperationException($"No destination address configured for cluster '{Name}'.");

        services.AddHttpClient(Name, http => http.BaseAddress = new Uri(address));
        return services;
    }
}
