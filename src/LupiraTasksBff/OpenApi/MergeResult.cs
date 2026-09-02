using System.Text.Json.Nodes;

namespace LupiraTasksBff.OpenApi;

/// <param name="Document">The BFF's OpenAPI document.</param>
/// <param name="NotExposed">Upstream operations the allowlist omits — growth nobody has reviewed yet.</param>
public sealed record MergeResult(JsonObject Document, IReadOnlyList<string> NotExposed);
