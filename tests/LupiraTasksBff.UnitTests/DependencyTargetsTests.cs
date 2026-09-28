using LupiraTasksBff.Dependencies;
using LupiraTasksBff.OpenApi;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace LupiraTasksBff.UnitTests;

public class DependencyTargetsTests
{
    private static IConfiguration Clusters(params (string Cluster, string Address)[] clusters) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(clusters.Select(c =>
                KeyValuePair.Create<string, string?>($"ReverseProxy:Clusters:{c.Cluster}:Destinations:primary:Address", c.Address)))
            .Build();

    [Fact]
    public void Each_cluster_is_one_anonymous_readyz_target_under_its_registry_name()
    {
        var target = Assert.Single(DependencyTargets.From(Clusters(("tasks-api", "http://lupira-tasks-api:8080"))));

        Assert.Equal("lupira-tasks-api", target.Name);
        Assert.Equal("http://lupira-tasks-api:8080", target.BaseUrl);
        Assert.Equal("readyz", target.ProbePath);
        Assert.Null(target.TokenUrl);
        Assert.Null(target.ClientId);
        Assert.Null(target.ClientSecret);
        Assert.Null(target.Scope);
        Assert.Null(target.DevUser);
    }

    [Fact]
    public void Every_cluster_the_allowlist_routes_to_has_a_registry_name()
    {
        var exposed = ExposedSurface.Load();
        var clusters = exposed.Operations.Keys.Concat(exposed.Guest.Keys).Distinct()
            .Select(cluster => (cluster, "http://upstream"))
            .ToArray();

        Assert.Equal(clusters.Length, DependencyTargets.From(Clusters(clusters)).Count);
    }

    [Fact]
    public void An_unmapped_cluster_throws_rather_than_reporting_an_unknown_name()
    {
        Assert.Throws<InvalidOperationException>(() => DependencyTargets.From(Clusters(("geo-api", "http://geo"))));
    }
}
