using LupiraTasksBff.Endpoints;
using Xunit;

namespace LupiraTasksBff.UnitTests;

public class AuthEndpointsTests
{
    [Theory]
    [InlineData("/ok", "/ok")]
    [InlineData("/a?b=c", "/a?b=c")]
    [InlineData("//evil.com", "/")]
    [InlineData("/\\evil.com", "/")]
    [InlineData("/\\\\evil.com", "/")]
    [InlineData("/\t/evil.com", "/")]
    [InlineData("/\n/evil.com", "/")]
    [InlineData("https://evil.com", "/")]
    [InlineData("javascript:alert(1)", "/")]
    [InlineData("evil.com", "/")]
    [InlineData("", "/")]
    [InlineData(null, "/")]
    // Still encoded after query decoding, so the browser keeps them as path data on this host.
    [InlineData("/%2F%2Fevil.com", "/%2F%2Fevil.com")]
    [InlineData("/%5Cevil.com", "/%5Cevil.com")]
    public void Login_only_returns_to_a_same_site_path(string? returnUrl, string expected) =>
        Assert.Equal(expected, AuthEndpoints.SafeReturnUrl(returnUrl));
}
