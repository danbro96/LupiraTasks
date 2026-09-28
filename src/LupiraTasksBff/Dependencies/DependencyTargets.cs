namespace LupiraTasksBff.Dependencies;

/// <summary>Roster derived from the same <c>ReverseProxy:Clusters</c> the proxy binds — edges cannot drift.
/// Availability-only: the upstreams take the signed-in user's token, which cannot be probed without a user.</summary>
public static class DependencyTargets
{
    public const string ProbePath = "readyz";

    private static readonly IReadOnlyDictionary<string, string> RegistryNames = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["tasks-api"] = "lupira-tasks-api",
    };

    public static IReadOnlyList<DependencyTarget> From(IConfiguration configuration) =>
        configuration.GetSection("ReverseProxy:Clusters").GetChildren()
            .Select(cluster => new DependencyTarget
            {
                Name = RegistryNames.TryGetValue(cluster.Key, out var name)
                    ? name
                    : throw new InvalidOperationException($"Cluster '{cluster.Key}' has no registry name for /depz."),
                BaseUrl = cluster.GetSection("Destinations").GetChildren()
                    .Select(destination => destination["Address"])
                    .FirstOrDefault(a => !string.IsNullOrWhiteSpace(a)) ?? string.Empty,
                ProbePath = ProbePath,
            })
            .ToList();
}
