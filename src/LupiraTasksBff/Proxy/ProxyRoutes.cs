using System.Globalization;
using System.Text.RegularExpressions;
using LupiraTasksBff.Auth;
using LupiraTasksBff.OpenApi;

namespace LupiraTasksBff.Proxy;

/// <summary>
/// Builds <c>ReverseProxy:Routes</c> from <c>exposed.json</c> — one exact template per path, methods
/// pinned — as a configuration source.
/// </summary>
/// <remarks>
/// Fed to <c>AddInMemoryCollection</c> so YARP's <c>LoadFromConfig</c> and the <c>ApiPrefixes</c> fence
/// read it as they read appsettings. A config source rather than <c>LoadFromMemory</c> because that
/// takes the clusters with it, and those are hand-maintained.
///
/// <see cref="ExposedSurface.BffPath"/> is shared with the merger, so the proxy and the published
/// document cannot disagree about where the token segment goes.
/// </remarks>
internal static partial class ProxyRoutes
{
    /// <summary>Each group is a routing class: the share surface answers to its own cookie scheme.</summary>
    private static readonly (string Group, string Policy)[] Policies =
        [("operations", "Default"), ("guest", GuestSession.PolicyName)];

    internal static IEnumerable<KeyValuePair<string, string?>> Build(ExposedSurface exposed)
    {
        var settings = new Dictionary<string, string?>(StringComparer.Ordinal);
        var seen = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var (group, policy) in Policies)
        {
            var clusters = group == "operations" ? exposed.Operations : exposed.Guest;

            foreach (var (cluster, operations) in clusters.OrderBy(c => c.Key, StringComparer.Ordinal))
            {
                var prefix = ExposedSurface.ClusterPrefixes.TryGetValue(cluster, out var p)
                    ? p
                    : throw new InvalidOperationException($"No BFF prefix for cluster {cluster}.");

                var byPath = new SortedDictionary<string, SortedSet<string>>(StringComparer.Ordinal);
                foreach (var operation in operations)
                {
                    var (verb, upstream) = Split(operation);
                    var path = ExposedSurface.BffPath(upstream);
                    if (!byPath.TryGetValue(path, out var verbs)) byPath[path] = verbs = new(StringComparer.Ordinal);
                    verbs.Add(verb);
                }

                foreach (var (path, verbs) in byPath)
                {
                    var key = Key($"{cluster}{path}".Replace("{", string.Empty, StringComparison.Ordinal)
                        .Replace("}", string.Empty, StringComparison.Ordinal));
                    if (seen.TryGetValue(key, out var prior))
                        throw new InvalidOperationException($"Route key collision: {key} ({prior} vs {cluster}{path}).");
                    seen[key] = $"{cluster}{path}";

                    var route = $"ReverseProxy:Routes:{key}";
                    settings[$"{route}:ClusterId"] = cluster;
                    settings[$"{route}:AuthorizationPolicy"] = policy;
                    settings[$"{route}:Match:Path"] = prefix + path;
                    settings[$"{route}:Transforms:0:PathRemovePrefix"] = prefix;

                    var index = 0;
                    foreach (var verb in verbs)
                        settings[$"{route}:Match:Methods:{index++.ToString(CultureInfo.InvariantCulture)}"] = verb;
                }
            }
        }

        return settings;
    }

    private static (string Verb, string Path) Split(string entry)
    {
        var parts = entry.Split(' ', 2, StringSplitOptions.TrimEntries);
        return parts.Length == 2
            ? (parts[0], parts[1])
            : throw new InvalidOperationException($"exposed.json entry '{entry}' is not 'VERB /path'.");
    }

    private static string Key(string raw) => NonAlphanumeric().Replace(raw, "-").TrimEnd('-');

    [GeneratedRegex("[^a-zA-Z0-9]+")]
    private static partial Regex NonAlphanumeric();
}
