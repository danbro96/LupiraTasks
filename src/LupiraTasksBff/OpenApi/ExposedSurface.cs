using System.Text.Json;
using System.Text.Json.Serialization;

namespace LupiraTasksBff.OpenApi;

/// <summary>
/// Every <c>VERB /path</c> the BFF forwards. A positive list, so an endpoint the upstream grows later
/// stays invisible until someone adds a line.
/// </summary>
public sealed class ExposedSurface
{
    /// <summary>Where each upstream is mounted on the BFF.</summary>
    public static readonly IReadOnlyDictionary<string, string> ClusterPrefixes = new Dictionary<string, string>
    {
        ["tasks-api"] = "/api",
    };

    /// <summary>Member-authenticated operations (the Default policy).</summary>
    [JsonPropertyName("operations")]
    public Dictionary<string, List<string>> Operations { get; init; } = [];

    /// <summary>The account-less share-link surface (the Anonymous policy), which never carries a token.</summary>
    [JsonPropertyName("anonymous")]
    public Dictionary<string, List<string>> Anonymous { get; init; } = [];

    /// <summary>
    /// Every allowlisted operation for a cluster, whichever policy group it sits in. The document
    /// describes both surfaces — only the route table cares which policy each one gets.
    /// </summary>
    public IEnumerable<string> AllFor(string cluster) =>
        (Operations.GetValueOrDefault(cluster) ?? []).Concat(Anonymous.GetValueOrDefault(cluster) ?? []);

    public static ExposedSurface Load()
    {
        using var stream = typeof(ExposedSurface).Assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"Embedded resource {ResourceName} is missing.");
        return JsonSerializer.Deserialize<ExposedSurface>(stream)
            ?? throw new InvalidOperationException($"{ResourceName} did not deserialize.");
    }

    private const string ResourceName = "LupiraTasksBff.exposed.json";
}
