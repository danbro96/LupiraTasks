using System.Text.Json.Nodes;

namespace LupiraTasksBff.OpenApi;

/// <summary>
/// Reconstructs the BFF's own OpenAPI document from the upstream spec it proxies: prefixes the paths
/// with the route the upstream is mounted on, and keeps only the allowlisted operations.
/// </summary>
/// <remarks>
/// On the JSON DOM rather than <c>OpenApiDocument</c>, matching LupiraCalWeb: the typed model exposes
/// referenced nodes read-only, and the result is handed to it once, in <see cref="BffDocumentTransformer"/>.
///
/// Unlike LupiraCalWeb this does NOT retag operations. There is one upstream, so a tag is not needed to
/// separate them — and the tags carry meaning here: apps/web splits its two generated clients on
/// `Shared`, the account-less share-link surface, which retagging would fold into the member client.
/// </remarks>
public static class UpstreamSpecMerger
{
    private static readonly (string Cluster, string Resource)[] Sources = [("tasks-api", "LupiraTasksApi")];

    public static MergeResult Merge(ExposedSurface exposed)
    {
        var notExposed = new List<string>();
        var missing = new List<string>();
        var mergedPaths = new JsonObject();
        var mergedSchemas = new JsonObject();
        string? version = null;
        JsonNode? info = null;

        foreach (var (cluster, resource) in Sources)
        {
            var doc = ReadEmbedded($"LupiraTasksBff.upstream.{resource}.json");
            version ??= doc["openapi"]?.GetValue<string>();
            info ??= doc["info"];

            var prefix = ExposedSurface.ClusterPrefixes[cluster];
            var allowed = new HashSet<string>(exposed.AllFor(cluster), StringComparer.Ordinal);

            var kept = PruneToAllowlist(doc, allowed, cluster, notExposed);
            missing.AddRange(allowed.Select(entry => $"{cluster}  {entry}"));

            var schemas = doc["components"]?["schemas"]?.AsObject() ?? [];
            foreach (var name in ReachableSchemas(kept, schemas).OrderBy(n => n, StringComparer.Ordinal))
            {
                if (schemas[name]?.DeepClone() is { } schema) mergedSchemas[name] ??= schema;
            }

            foreach (var (path, item) in kept.OrderBy(p => p.Key, StringComparer.Ordinal))
            {
                var bffPath = ExposedSurface.BffPath(path);
                var copy = item?.DeepClone();
                // The token left the path, so its path parameter must go too.
                if (copy is JsonObject pathItem && bffPath != path) DropTokenParameter(pathItem);
                mergedPaths[prefix + bffPath] = copy;
            }
        }

        if (missing.Count > 0)
            throw new InvalidOperationException(
                $"exposed.json lists operations no upstream declares:{Environment.NewLine}  {string.Join($"{Environment.NewLine}  ", missing)}");

        var document = new JsonObject
        {
            ["openapi"] = version,
            ["info"] = new JsonObject
            {
                ["title"] = "LupiraTasks BFF",
                ["version"] = info?["version"]?.GetValue<string>() ?? "v1",
            },
            ["paths"] = mergedPaths,
            ["components"] = new JsonObject { ["schemas"] = mergedSchemas },
        };

        return new MergeResult(document, notExposed);
    }

    /// <summary>Drops every operation the allowlist does not name, and removes what it consumed from it.</summary>
    private static JsonObject PruneToAllowlist(
        JsonObject doc, HashSet<string> allowed, string cluster, List<string> notExposed)
    {
        var kept = new JsonObject();
        foreach (var (path, item) in doc["paths"]?.AsObject() ?? [])
        {
            if (item is not JsonObject pathItem) continue;
            var keptItem = new JsonObject();
            foreach (var (verb, node) in pathItem)
            {
                if (node is not JsonObject operation || !operation.ContainsKey("responses"))
                {
                    keptItem[verb] = node?.DeepClone();   // path-level `parameters` and friends
                    continue;
                }

                var entry = $"{verb.ToUpperInvariant()} {path}";
                if (!allowed.Remove(entry))
                {
                    if (operation.ContainsKey("operationId")) notExposed.Add($"{cluster}  {entry}");
                    continue;
                }

                keptItem[verb] = operation.DeepClone();
            }

            if (keptItem.Any(kv => kv.Value is JsonObject o && o.ContainsKey("responses")))
                kept[path] = keptItem;
        }

        return kept;
    }

    private static void DropTokenParameter(JsonObject pathItem)
    {
        foreach (var (_, node) in pathItem)
        {
            if (node is not JsonObject holder || holder["parameters"] is not JsonArray parameters) continue;

            for (var i = parameters.Count - 1; i >= 0; i--)
            {
                if (parameters[i] is JsonObject p
                    && p["name"]?.GetValue<string>() == "token"
                    && p["in"]?.GetValue<string>() == "path")
                {
                    parameters.RemoveAt(i);
                }
            }

            if (parameters.Count == 0) holder.Remove("parameters");
        }
    }

    /// <summary>Schemas the pruned paths still reach, transitively — so a dropped path drops its DTOs.</summary>
    private static HashSet<string> ReachableSchemas(JsonNode paths, JsonObject schemas)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var queue = new Queue<JsonNode>();
        queue.Enqueue(paths);

        while (queue.TryDequeue(out var node))
        {
            switch (node)
            {
                case JsonObject obj:
                    foreach (var (key, value) in obj)
                    {
                        if (key == "$ref" && value?.GetValue<string>() is { } reference)
                        {
                            var name = SchemaName(reference);
                            if (name is not null && seen.Add(name) && schemas[name] is { } target)
                                queue.Enqueue(target);
                        }
                        else if (value is not null)
                        {
                            queue.Enqueue(value);
                        }
                    }

                    break;
                case JsonArray array:
                    foreach (var value in array.Where(v => v is not null)) queue.Enqueue(value!);
                    break;
            }
        }

        return seen;
    }

    private static string? SchemaName(string reference) =>
        reference.StartsWith(RefPrefix, StringComparison.Ordinal) ? reference[RefPrefix.Length..] : null;

    private static JsonObject ReadEmbedded(string resource)
    {
        using var stream = typeof(UpstreamSpecMerger).Assembly.GetManifestResourceStream(resource)
            ?? throw new InvalidOperationException($"Embedded resource {resource} is missing.");
        return JsonNode.Parse(stream)?.AsObject()
            ?? throw new InvalidOperationException($"{resource} is not a JSON object.");
    }

    private const string RefPrefix = "#/components/schemas/";
}
