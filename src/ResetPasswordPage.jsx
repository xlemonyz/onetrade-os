import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

export default function ResetPasswordPage({ session = null }) {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("info");
  const [busy, setBusy] = useState(false);
  const showStatus = (message, type = "info") => {
    setStatus(message);
    setStatusType(type);
  };

  const updatePassword = async () => {
    if (!isSupabaseConfigured || !supabase) {
      showStatus("Supabase is not configured. Check your .env file.", "error");
      return;
    }

    if (!session?.user) {
      showStatus("Please open the reset link from your email again.", "error");
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

    showStatus("Password changed successfully. Redirecting to journal...", "success");
    setTimeout(() => navigate("/", { replace: true }), 900);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f6f9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          border: "1px solid #e2e6ed",
          borderRadius: 20,
          padding: 28,
          boxShadow: "0 20px 60px rgba(15, 23, 42, 0.08)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28, color: "#1e40af", textAlign: "center" }}>
          Reset Password
        </h1>
        <p style={{ color: "#8492a6", textAlign: "center", marginBottom: 24 }}>
          Set your new password from the email reset link.
        </p>

        <input
          type="password"
          placeholder="New Password"
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
          placeholder="Confirm New Password"
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
          onClick={updatePassword}
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
          Update Password
        </button>

        <button
          type="button"
          onClick={() => navigate("/login")}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #e2e6ed",
            background: "#fff",
            color: "#1e40af",
            fontWeight: 700,
            cursor: "pointer",
            marginTop: 10,
          }}
        >
          ← Back to Login
        </button>

        {status ? (
          <div
            style={{
              marginTop: 16,
              fontSize: 13,
              textAlign: "center",
              borderRadius: 10,
              padding: "10px 12px",
              border:
                statusType === "success"
                  ? "1px solid #86efac"
                  : statusType === "error"
                    ? "1px solid #fecaca"
                    : "1px solid #bfdbfe",
              background:
                statusType === "success"
                  ? "#f0fdf4"
                  : statusType === "error"
                    ? "#fef2f2"
                    : "#eff6ff",
              color:
                statusType === "success"
                  ? "#166534"
                  : statusType === "error"
                    ? "#991b1b"
                    : "#1e40af",
            }}
          >
            {status}
          </div>
        ) : null}
      </div>
    </div>
  );
}
