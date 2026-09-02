using System.Text;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.Extensions.Logging;
using Microsoft.OpenApi;

namespace LupiraTasksBff.OpenApi;

/// <summary>
/// Fills the BFF's OpenAPI document from the upstream it proxies — YARP routes carry no schemas of
/// their own, so nothing would describe the surface.
/// </summary>
public sealed class BffDocumentTransformer(ILogger<BffDocumentTransformer> logger) : IOpenApiDocumentTransformer
{
    public async Task TransformAsync(
        OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
    {
        var merged = UpstreamSpecMerger.Merge(ExposedSurface.Load());

        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(merged.Document.ToJsonString()));
        var read = await OpenApiDocument.LoadAsync(stream, "json", cancellationToken: cancellationToken);
        if (read.Diagnostic?.Errors.Count > 0)
            throw new InvalidOperationException(
                $"Filtered document is invalid: {string.Join("; ", read.Diagnostic.Errors.Select(e => e.Message))}");

        var source = read.Document!;
        document.Info = source.Info;

        // Additive: a path the framework already found came from an endpoint declared in C#, and that
        // wins. Declaring an endpoint and dropping its exposed.json line is how one leaves the proxy.
        document.Paths ??= [];
        document.Components ??= new OpenApiComponents();
        document.Components.Schemas ??= new Dictionary<string, IOpenApiSchema>(StringComparer.Ordinal);

        var shadowed = new List<string>();
        foreach (var (path, item) in source.Paths)
        {
            if (document.Paths.ContainsKey(path)) shadowed.Add(path);
            else document.Paths[path] = item;
        }

        foreach (var (name, schema) in source.Components?.Schemas ?? new Dictionary<string, IOpenApiSchema>())
            document.Components.Schemas.TryAdd(name, schema);

        if (shadowed.Count > 0)
            logger.LogWarning(
                "OpenAPI: {Count} proxied path(s) are also declared in C# and can leave exposed.json: {Paths}",
                shadowed.Count, string.Join(", ", shadowed));
        if (merged.NotExposed.Count > 0)
            logger.LogInformation("OpenAPI: {Count} upstream operation(s) not exposed — add to exposed.json to publish", merged.NotExposed.Count);

        logger.LogInformation("OpenAPI: {Paths} paths, {Schemas} schemas", document.Paths.Count, document.Components.Schemas.Count);
    }
}
