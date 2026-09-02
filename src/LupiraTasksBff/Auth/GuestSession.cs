namespace LupiraTasksBff.Auth;

/// <summary>The share-link session: a cookie holding the token the BFF replays upstream.</summary>
internal static class GuestSession
{
    public const string SchemeName = "Guest";

    public const string PolicyName = "Guest";

    public const string TokenClaim = "share-token";
}
