namespace LupiraTasksBff.Dtos;

/// <summary>Deliberately not <c>UserInfo</c>: a guest has no email, name or groups.</summary>
public sealed class GuestSessionInfo
{
    public required bool Active { get; set; }
}
