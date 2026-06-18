/** Landing for the bare domain. There's no SSO web app yet (v1 is shared-link only), so this just
 *  tells a visitor they need a share link. */
export default function HomePage() {
  return (
    <div className="centered">
      <div className="brand-mark" aria-hidden>
        ✓
      </div>
      <h2>Lupira Tasks</h2>
      <p>Open the share link you were given to view and edit its list — no sign-in needed.</p>
      <p className="hint">A share link looks like <code>/s/&lt;token&gt;</code>.</p>
    </div>
  );
}
