import { installCookieTransport } from '@danbro96/lupira-web-session/cookieTransport';
import { API_BASE_URL } from '../../config';

/** A dead guest cookie must surface on the share screen, not bounce the visitor into Authentik. */
let guestSession = false;

export function markGuestSession(active: boolean): void {
  guestSession = active;
}

/** Auth rides a BFF cookie session either way — the member's, or the guest session minted from a share
 *  token — so one transport serves both surfaces. Called once, before anything issues a request. */
export function installApiTransports(): void {
  installCookieTransport({ baseUrl: API_BASE_URL, redirectOn401: () => !guestSession });
}
