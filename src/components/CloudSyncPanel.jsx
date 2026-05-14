export default function CloudSyncPanel({
  configured,
  session,
  busy,
  status,
  onSignOut,
  onPush,
  onLoad,
  theme: G,
}) {
  return (
    <div
      style={{
        background: G.bgCard,
        border: `1px solid ${G.border}`,
        borderRadius: 16,
        padding: "18px 20px",
        marginBottom: 18,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: G.goldLight, marginBottom: 4 }}>
            Supabase Cloud Sync
          </div>
          <div style={{ fontSize: 13, color: G.textMuted, lineHeight: 1.6 }}>
            Auto save this journal to your Supabase database and load it on another device.
          </div>
        </div>
        <span
          style={{
            alignSelf: "flex-start",
            background: session ? G.winBg : configured ? G.goldGlow2 : G.bgCard2,
            color: session ? G.win : configured ? G.goldLight : G.textSub,
            border: `1px solid ${session ? G.win : configured ? G.gold : G.border}33`,
            borderRadius: 999,
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          {session ? "Connected" : configured ? "Ready" : "Not Configured"}
        </span>
      </div>

      {!configured ? (
        <div style={{ fontSize: 13, color: G.textSub, lineHeight: 1.7 }}>
          Add <span style={{ fontFamily: "monospace" }}>VITE_SUPABASE_URL</span> and{" "}
          <span style={{ fontFamily: "monospace" }}>VITE_SUPABASE_ANON_KEY</span> in your app env file, then restart the dev server.
        </div>
      ) : session ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: G.textSub, marginRight: "auto" }}>
            Signed in as <strong>{session.user?.email}</strong>
          </span>
          <button
            type="button"
            onClick={onPush}
            disabled={busy}
            style={{
              background: G.goldGlow2,
              border: `1px solid ${G.gold}`,
              color: G.goldLight,
              padding: "9px 14px",
              borderRadius: 9,
              cursor: busy ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            Push Local to Cloud
          </button>
          <button
            type="button"
            onClick={onLoad}
            disabled={busy}
            style={{
              background: "transparent",
              border: `1px solid ${G.border}`,
              color: G.textSub,
              padding: "9px 14px",
              borderRadius: 9,
              cursor: busy ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Load Cloud
          </button>
          <button
            type="button"
            onClick={onSignOut}
            disabled={busy}
            style={{
              background: G.bgCard2,
              border: `1px solid ${G.border}`,
              color: G.textSub,
              padding: "9px 14px",
              borderRadius: 9,
              cursor: busy ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Sign Out
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: G.textSub, lineHeight: 1.7 }}>
          You are not signed in. Use the login page to connect Supabase Cloud Sync.
        </div>
      )}

      {status && <div style={{ marginTop: 12, fontSize: 12, color: G.textMuted }}>{status}</div>}
    </div>
  );
}
