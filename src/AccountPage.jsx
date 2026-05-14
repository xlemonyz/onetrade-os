import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Flame,
  LayoutGrid,
  Settings,
  ShieldCheck,
  Target,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import {
  formatUsernameError,
  isProfilesTableMissing,
  normalizeUsername,
  validateUsername,
} from "./usernameUtils";

function statusBoxStyle(type = "info") {
  return {
    marginTop: 16,
    fontSize: 13,
    borderRadius: 10,
    padding: "10px 12px",
    border:
      type === "success"
        ? "1px solid #86efac"
        : type === "error"
          ? "1px solid #fecaca"
          : "1px solid #bfdbfe",
    background:
      type === "success"
        ? "#f0fdf4"
        : type === "error"
          ? "#fef2f2"
          : "#eff6ff",
    color:
      type === "success"
        ? "#166534"
        : type === "error"
          ? "#991b1b"
          : "#1e40af",
  };
}

function generateMt5ApiKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `mt5_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `mt5_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export default function AccountPage({ session = null, embedded = false, initialSection = "account" }) {
  const navigate = useNavigate();
  const [settingsSection, setSettingsSection] = useState(initialSection);
  const [usernameInput, setUsernameInput] = useState(session?.user?.user_metadata?.username || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("info");
  const [busy, setBusy] = useState(false);

  const [mt5Busy, setMt5Busy] = useState(false);
  const [mt5Loaded, setMt5Loaded] = useState(
    !isSupabaseConfigured || !supabase || !session?.user?.id
  );
  const [mt5Status, setMt5Status] = useState("");
  const [mt5StatusType, setMt5StatusType] = useState("info");
  const [mt5BrokerName, setMt5BrokerName] = useState("");
  const [mt5AccountNumber, setMt5AccountNumber] = useState("");
  const [mt5ApiKey, setMt5ApiKey] = useState("");
  const [mt5LastSyncAt, setMt5LastSyncAt] = useState("");

  const showStatus = (message, type = "info") => {
    setStatus(message);
    setStatusType(type);
  };

  const showMt5Status = (message, type = "info") => {
    setMt5Status(message);
    setMt5StatusType(type);
  };

  const user = session?.user || null;
  const username =
    user?.user_metadata?.username ||
    user?.user_metadata?.full_name ||
    user?.email ||
    (user?.id ? `User ${user.id.slice(0, 8)}` : "Unknown User");
  const currentUsername = user?.user_metadata?.username || "";
  const sidebarDisplayName = String(
    user?.user_metadata?.full_name ||
      user?.user_metadata?.username ||
      user?.email ||
      "Trader"
  ).trim();
  const sidebarInitials = (() => {
    const parts = sidebarDisplayName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
    return (parts[0] || "T").slice(0, 2).toUpperCase();
  })();

  const mt5FunctionUrl = useMemo(() => {
    const url = import.meta.env.VITE_SUPABASE_URL || "";
    if (!url) return "https://YOUR_PROJECT.functions.supabase.co/mt5-import";
    const hostname = String(url).replace(/^https?:\/\//, "").split("/")[0] || "";
    const projectRef = hostname.split(".")[0] || "";
    if (!projectRef) return "https://YOUR_PROJECT.functions.supabase.co/mt5-import";
    return `https://${projectRef}.functions.supabase.co/mt5-import`;
  }, []);

  useEffect(() => {
    if (settingsSection !== "integrations-mt5") {
      return;
    }

    if (!isSupabaseConfigured || !supabase || !user?.id) {
      return;
    }

    let active = true;
    const loadMt5Connection = async () => {
      setMt5Busy(true);
      const { data, error } = await supabase
        .from("broker_connections")
        .select("id, broker_name, account_number, api_key, last_sync_at")
        .eq("user_id", user.id)
        .eq("platform", "MT5")
        .limit(1)
        .maybeSingle();

      if (!active) return;

      setMt5Busy(false);
      setMt5Loaded(true);

      if (error) {
        showMt5Status(error.message, "error");
        return;
      }

      if (!data) return;

      setMt5BrokerName(data.broker_name || "");
      setMt5AccountNumber(data.account_number || "");
      setMt5ApiKey(data.api_key || "");
      setMt5LastSyncAt(data.last_sync_at || "");
      showMt5Status("Connection loaded.", "success");
    };

    void loadMt5Connection();
    return () => {
      active = false;
    };
  }, [settingsSection, user?.id]);

  const updateUsername = async () => {
    if (!isSupabaseConfigured || !supabase) {
      showStatus("Supabase is not configured. Check your .env file.", "error");
      return;
    }

    if (!user) {
      showStatus("Session missing. Please sign in again.", "error");
      return;
    }

    const usernameValidation = validateUsername(usernameInput);
    if (!usernameValidation.ok) {
      showStatus(usernameValidation.message, "error");
      return;
    }
    const cleanUsername = usernameValidation.username;
    const currentNormalized = normalizeUsername(currentUsername);

    setBusy(true);
    showStatus("Checking username...", "info");

    const { data: ownProfile, error: ownProfileError } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    if (ownProfileError) {
      setBusy(false);
      showStatus(ownProfileError.message, "error");
      return;
    }

    const ownProfileNormalized = normalizeUsername(ownProfile?.username || "");
    if (cleanUsername === currentNormalized && cleanUsername === ownProfileNormalized) {
      setBusy(false);
      showStatus("This is already your current username.", "info");
      return;
    }

    const { data: existingRows, error: checkError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", cleanUsername)
      .limit(1);

    if (checkError) {
      setBusy(false);
      showStatus(
        isProfilesTableMissing(checkError)
          ? "Username uniqueness is not set up yet. Run the username SQL script first."
          : checkError.message,
        "error"
      );
      return;
    }

    const takenByOther = (existingRows || []).some((row) => row.id !== user.id);
    if (takenByOther) {
      setBusy(false);
      showStatus("This username is already taken. Try another one.", "error");
      return;
    }

    showStatus("Saving username...", "info");

    const { error: profileWriteError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          username: cleanUsername,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    if (profileWriteError) {
      setBusy(false);
      showStatus(formatUsernameError(profileWriteError, "Could not save username."), "error");
      return;
    }

    if (cleanUsername === currentNormalized) {
      setBusy(false);
      showStatus("Username saved.", "success");
      setUsernameInput(cleanUsername);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      data: {
        ...(user.user_metadata || {}),
        username: cleanUsername,
      },
    });

    setBusy(false);

    if (error) {
      showStatus(formatUsernameError(error, "Could not update username."), "error");
      return;
    }

    showStatus("Username updated.", "success");
    setUsernameInput(cleanUsername);
  };

  const changePassword = async () => {
    if (!isSupabaseConfigured || !supabase) {
      showStatus("Supabase is not configured. Check your .env file.", "error");
      return;
    }

    if (!user) {
      showStatus("Session missing. Please sign in again.", "error");
      return;
    }

    if (newPassword.length < 6) {
      showStatus("Password must be at least 6 characters.", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      showStatus("Passwords do not match.", "error");
      return;
    }

    setBusy(true);
    showStatus("Updating password...", "info");

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setBusy(false);

    if (error) {
      showStatus(error.message, "error");
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    showStatus("Password changed successfully.", "success");
  };

  const saveMt5Connection = async () => {
    if (!isSupabaseConfigured || !supabase) {
      showMt5Status("Supabase is not configured. Check your .env file.", "error");
      return;
    }

    if (!user?.id) {
      showMt5Status("Session missing. Please sign in again.", "error");
      return;
    }

    const cleanApiKey = (mt5ApiKey || "").trim();
    if (!cleanApiKey) {
      showMt5Status("Generate or enter an API key first.", "error");
      return;
    }

    setMt5Busy(true);
    showMt5Status("Saving MT5 connection...", "info");

    const payload = {
      user_id: user.id,
      platform: "MT5",
      broker_name: (mt5BrokerName || "").trim() || null,
      account_number: (mt5AccountNumber || "").trim() || null,
      api_key: cleanApiKey,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("broker_connections")
      .upsert(payload, { onConflict: "user_id,platform" })
      .select("last_sync_at")
      .single();

    setMt5Busy(false);

    if (error) {
      showMt5Status(error.message, "error");
      return;
    }

    setMt5ApiKey(cleanApiKey);
    setMt5LastSyncAt(data?.last_sync_at || mt5LastSyncAt);
    setMt5Loaded(true);
    showMt5Status("MT5 connection saved.", "success");
  };

  const onGenerateApiKey = () => {
    setMt5ApiKey(generateMt5ApiKey());
    showMt5Status("New API key generated. Save connection to apply.", "info");
  };

  const onRegenerateApiKey = () => {
    if (!confirm("Regenerate API key?\n\nYour EA must be updated with the new key.")) return;
    setMt5ApiKey(generateMt5ApiKey());
    showMt5Status("API key regenerated. Save connection to apply.", "info");
  };

  const onCopyApiKey = async () => {
    if (!mt5ApiKey) {
      showMt5Status("No API key to copy. Generate one first.", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(mt5ApiKey);
      showMt5Status("API key copied.", "success");
    } catch {
      showMt5Status("Could not copy API key. Copy manually.", "error");
    }
  };

  const mt5ConnectionStatus = mt5Busy ? "Checking..." : mt5ApiKey ? "Configured" : "Not configured";
  const mt5LastSyncLabel = mt5LastSyncAt ? new Date(mt5LastSyncAt).toLocaleString() : "--";
  const maskApiKey = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "--";
    if (raw.length <= 12) return `${raw.slice(0, 4)}••••${raw.slice(-2)}`;
    return `${raw.slice(0, 8)}••••••••${raw.slice(-4)}`;
  };
  const mt5MaskedKey = maskApiKey(mt5ApiKey);
  const showAccountSection = settingsSection === "account";
  const showMt5Section = settingsSection === "integrations-mt5";
  const mt5StandaloneView = showMt5Section;
  const sidebarLinks = [
    { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
    { id: "one-trade-rule", label: "One Trade Rule", icon: Target },
    { id: "mindset-check", label: "Mindset Check", icon: ShieldCheck },
    { id: "clean-day", label: "Clean Day", icon: Flame },
    { id: "settings", label: "Settings", icon: Settings, active: true },
  ];

  useEffect(() => {
    if (!initialSection) return;
    const timer = setTimeout(() => setSettingsSection(initialSection), 0);
    return () => clearTimeout(timer);
  }, [initialSection]);

  return (
    <div
      className={`account-root${embedded ? " embedded" : ""}`}
      style={{
        minHeight: embedded ? "100%" : "100vh",
        background: "#f4f6f9",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <style>{`
        .account-root * { box-sizing: border-box; }
        .account-root .app-shell-layout {
          min-height: 100vh;
          display: flex;
          align-items: stretch;
        }
        .account-root .app-sidebar {
          width: 240px;
          border-right: 1px solid #dde7f2;
          background: #ffffff;
          padding: 22px 14px 14px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          position: sticky;
          top: 0;
          height: 100vh;
        }
        .account-root .app-sidebar-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 6px;
        }
        .account-root .app-sidebar-brand-mark {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          background: #2563eb;
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 16px;
        }
        .account-root .app-sidebar-brand-name {
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1.1;
        }
        .account-root .app-sidebar-brand-subtitle {
          font-size: 11px;
          letter-spacing: 0.1em;
          color: #64748b;
          margin-top: 2px;
          text-transform: uppercase;
        }
        .account-root .app-sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .account-root .app-sidebar-link {
          width: 100%;
          border: 1px solid transparent;
          background: transparent;
          border-radius: 10px;
          padding: 9px 10px;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          color: #334155;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          text-align: left;
        }
        .account-root .app-sidebar-link.active {
          background: #eff6ff;
          color: #2563eb;
          border-color: #bfdbfe;
        }
        .account-root .app-sidebar-link:hover {
          color: #2563eb;
          background: #f8fbff;
        }
        .account-root .app-sidebar-main {
          flex: 1;
          min-width: 0;
        }
        .account-root .app-sidebar-user {
          margin-top: auto;
          border: 1px solid #dde7f2;
          border-radius: 10px;
          padding: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          background: #f8fafc;
        }
        .account-root .app-sidebar-user-avatar {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          background: #dbeafe;
          color: #1d4ed8;
          font-size: 12px;
          font-weight: 800;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .account-root .app-sidebar-user-name {
          color: #0f172a;
          font-weight: 700;
          font-size: 13px;
        }
        .account-root .app-sidebar-user-mode {
          color: #64748b;
          font-size: 11px;
          margin-top: 1px;
        }
        .account-root .app-shell-main {
          flex: 1;
          min-width: 0;
        }
        .account-root .settings-page-shell {
          width: 100%;
          max-width: 1280px;
          margin: 0 auto;
          padding: 24px;
        }
        .account-root .settings-main-layout {
          display: grid;
          grid-template-columns: 240px minmax(0, 1fr);
          gap: 20px;
          align-items: start;
        }
        .account-root .settings-side-nav {
          border: 1px solid #e2e6ed;
          border-radius: 14px;
          padding: 12px;
          background: #f8fafc;
        }
        .account-root .settings-content-area {
          border: 1px solid #e2e6ed;
          border-radius: 14px;
          padding: 18px;
          background: #ffffff;
        }
        @media (max-width: 900px) {
          .account-root .app-shell-layout {
            display: block;
          }
          .account-root .app-sidebar {
            position: static;
            height: auto;
            width: 100%;
            border-right: none;
            border-bottom: 1px solid #dde7f2;
          }
          .account-root .settings-page-shell {
            padding: 16px 14px 20px;
          }
          .account-root .settings-main-layout {
            grid-template-columns: 1fr;
            gap: 14px;
          }
          .account-root .settings-content-area {
            padding: 14px;
          }
        }
        .account-root.embedded .app-sidebar {
          display: none;
        }
        .account-root.embedded .app-shell-main {
          width: 100%;
        }
        .account-root.embedded .settings-page-shell {
          max-width: none;
          padding: 0;
        }
        .account-root.embedded .settings-top-back {
          display: none;
        }
      `}</style>
      <div className="app-shell-layout">
        <aside className="app-sidebar" aria-label="Primary">
          <div className="app-sidebar-brand">
            <span className="app-sidebar-brand-mark">1</span>
            <div>
              <div className="app-sidebar-brand-name">OneTrade OS</div>
              <div className="app-sidebar-brand-subtitle">Discipline Dashboard</div>
            </div>
          </div>
          <div className="app-sidebar-nav">
            {sidebarLinks.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`app-sidebar-link${item.active ? " active" : ""}`}
                  onClick={() => (item.id === "settings" ? undefined : navigate("/"))}
                >
                  <Icon size={16} strokeWidth={2.1} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
          <div className="app-sidebar-user">
            <span className="app-sidebar-user-avatar">{sidebarInitials}</span>
            <div style={{ minWidth: 0 }}>
              <div className="app-sidebar-user-name">{sidebarDisplayName}</div>
              <div className="app-sidebar-user-mode">Discipline Mode</div>
            </div>
          </div>
        </aside>
        <main className="app-shell-main">
      <div className="settings-page-shell">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 28, color: "#1e40af" }}>
            {mt5StandaloneView ? "MT5 Auto Sync" : "Settings"}
          </h1>
          <button
            className="settings-top-back"
            type="button"
            onClick={() => navigate("/")}
            style={{
              border: "1px solid #e2e6ed",
              background: "transparent",
              borderRadius: 999,
              padding: "7px 12px",
              color: "#5a6a85",
              cursor: "pointer",
            }}
          >
            {"<-"} Back
          </button>
        </div>

        <div style={{ color: "#5a6a85", marginBottom: 16, fontSize: 14 }}>
          Signed in as <strong style={{ color: "#1a1f2e" }}>{username}</strong>
          {user?.email ? (
            <>
              {" "}
              ({user.email})
            </>
          ) : null}
        </div>
        <div
          className="settings-main-layout"
          style={mt5StandaloneView ? { gridTemplateColumns: "minmax(0, 1fr)" } : undefined}
        >
          {!mt5StandaloneView ? (
            <div className="settings-side-nav">
              <div style={{ fontSize: 12, color: "#8492a6", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Settings
              </div>
              <button
                type="button"
                onClick={() => setSettingsSection("account")}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: `1px solid ${showAccountSection ? "#bfdbfe" : "transparent"}`,
                  background: showAccountSection ? "#eff6ff" : "transparent",
                  borderRadius: 10,
                  padding: "10px 12px",
                  color: showAccountSection ? "#1e40af" : "#334155",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Account Settings
              </button>
            </div>
          ) : null}

          <div className="settings-content-area" style={{ minWidth: 0 }}>
            {showAccountSection && (
              <>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, color: "#1e40af", marginBottom: 8 }}>
                  Account Settings
                </div>
                <div style={{ fontSize: 12, color: "#8492a6", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Username
                </div>
                <div style={{ color: "#5a6a85", marginBottom: 10, fontSize: 13 }}>
                  Current: <strong style={{ color: "#1a1f2e" }}>{currentUsername || "Not set"}</strong>
                </div>
                <input
                  type="text"
                  placeholder="Set or change username"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    marginBottom: 12,
                    borderRadius: 10,
                    border: "1px solid #e2e6ed",
                    fontSize: 14,
                  }}
                />
                <button
                  type="button"
                  onClick={updateUsername}
                  disabled={busy}
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    borderRadius: 10,
                    border: "1px solid #e2e6ed",
                    background: "#fff",
                    color: "#1e40af",
                    fontWeight: 800,
                    cursor: busy ? "not-allowed" : "pointer",
                    marginBottom: 18,
                  }}
                >
                  Save Username
                </button>

                <div style={{ fontSize: 12, color: "#8492a6", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Password & Security
                </div>
                <input
                  type="password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    marginBottom: 12,
                    borderRadius: 10,
                    border: "1px solid #e2e6ed",
                    fontSize: 14,
                  }}
                />
                <input
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    marginBottom: 16,
                    borderRadius: 10,
                    border: "1px solid #e2e6ed",
                    fontSize: 14,
                  }}
                />
                <button
                  type="button"
                  onClick={changePassword}
                  disabled={busy}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "none",
                    background: "#2563eb",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: busy ? "not-allowed" : "pointer",
                  }}
                >
                  Change Password
                </button>

              </>
            )}

            {showMt5Section && (
              <>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, color: "#1e40af", marginBottom: 8 }}>
                  MT5 Auto Sync
                </div>
                <div style={{ color: "#5a6a85", fontSize: 13, lineHeight: 1.65, marginBottom: 14 }}>
                  Add this API key to your MT5 EA settings. Then allow this URL in MT5:
                  {" "}
                  <span style={{ fontFamily: "monospace", color: "#1a1f2e" }}>{mt5FunctionUrl}</span>
                  . In MT5 use: Tools &gt; Options &gt; Expert Advisors &gt; Allow WebRequest for listed URL.
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div
                    style={{
                      border: "1px solid #e2e6ed",
                      borderRadius: 10,
                      padding: "10px 12px",
                      fontSize: 13,
                      color: "#5a6a85",
                      background: "#f8fafc",
                    }}
                  >
                    Status: <strong style={{ color: "#1a1f2e" }}>{mt5ConnectionStatus}</strong>
                  </div>
                  <div
                    style={{
                      border: "1px solid #e2e6ed",
                      borderRadius: 10,
                      padding: "10px 12px",
                      fontSize: 13,
                      color: "#5a6a85",
                      background: "#f8fafc",
                    }}
                  >
                    Last sync: <strong style={{ color: "#1a1f2e" }}>{mt5LastSyncLabel}</strong>
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Broker / Server (optional)"
                  value={mt5BrokerName}
                  onChange={(e) => setMt5BrokerName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    marginBottom: 10,
                    borderRadius: 10,
                    border: "1px solid #e2e6ed",
                    fontSize: 14,
                  }}
                />

                <input
                  type="text"
                  placeholder="MT5 account number (optional)"
                  value={mt5AccountNumber}
                  onChange={(e) => setMt5AccountNumber(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    marginBottom: 10,
                    borderRadius: 10,
                    border: "1px solid #e2e6ed",
                    fontSize: 14,
                  }}
                />

                <div
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    marginBottom: 10,
                    borderRadius: 10,
                    border: "1px solid #e2e6ed",
                    fontSize: 14,
                    fontFamily: "monospace",
                    color: "#1a1f2e",
                    background: "#f8fafc",
                  }}
                >
                  {mt5MaskedKey}
                </div>

                <input
                  type="password"
                  placeholder="MT5 API key (hidden)"
                  value={mt5ApiKey}
                  onChange={(e) => setMt5ApiKey(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    marginBottom: 10,
                    borderRadius: 10,
                    border: "1px solid #e2e6ed",
                    fontSize: 14,
                    fontFamily: "monospace",
                  }}
                />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={onGenerateApiKey}
                    disabled={mt5Busy}
                    style={{
                      border: "1px solid #e2e6ed",
                      background: "#fff",
                      borderRadius: 10,
                      padding: "10px 12px",
                      color: "#1e40af",
                      cursor: mt5Busy ? "not-allowed" : "pointer",
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    Generate API Key
                  </button>
                  <button
                    type="button"
                    onClick={onCopyApiKey}
                    disabled={mt5Busy}
                    style={{
                      border: "1px solid #e2e6ed",
                      background: "#fff",
                      borderRadius: 10,
                      padding: "10px 12px",
                      color: "#1e40af",
                      cursor: mt5Busy ? "not-allowed" : "pointer",
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    Copy API Key
                  </button>
                  <button
                    type="button"
                    onClick={onRegenerateApiKey}
                    disabled={mt5Busy}
                    style={{
                      border: "1px solid #e2e6ed",
                      background: "#fff",
                      borderRadius: 10,
                      padding: "10px 12px",
                      color: "#1e40af",
                      cursor: mt5Busy ? "not-allowed" : "pointer",
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    Regenerate
                  </button>
                </div>

                <button
                  type="button"
                  onClick={saveMt5Connection}
                  disabled={mt5Busy}
                  style={{
                    width: "100%",
                    border: "none",
                    background: "#2563eb",
                    color: "#fff",
                    borderRadius: 10,
                    padding: "11px 14px",
                    fontWeight: 800,
                    cursor: mt5Busy ? "not-allowed" : "pointer",
                  }}
                >
                  Save Connection
                </button>
              </>
            )}
          </div>
        </div>

        {status ? <div style={statusBoxStyle(statusType)}>{status}</div> : null}
        {mt5StandaloneView && mt5Status ? <div style={statusBoxStyle(mt5StatusType)}>{mt5Status}</div> : null}
        {mt5StandaloneView && !mt5Loaded && <div style={statusBoxStyle("info")}>Loading MT5 connection...</div>}
      </div>
      </main>
      </div>
    </div>
  );
}
