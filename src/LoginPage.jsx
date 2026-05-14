import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

export default function LoginPage({ onLogin }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("info");
  const [busy, setBusy] = useState(false);
  const showStatus = (message, type = "info") => {
    setStatus(message);
    setStatusType(type);
  };

  const signIn = async () => {
    if (!isSupabaseConfigured || !supabase) {
      showStatus("Supabase is not configured. Check your .env file.", "error");
      return;
    }

    if (!email || !password) {
      showStatus("Enter email and password.", "error");
      return;
    }

    setBusy(true);
    showStatus("Signing in...", "info");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setBusy(false);

    if (error) {
      showStatus(error.message, "error");
      return;
    }

    showStatus("Signed in.", "success");
    onLogin?.();
  };

  const forgotPassword = async () => {
    if (!isSupabaseConfigured || !supabase) {
      showStatus("Supabase is not configured. Check your .env file.", "error");
      return;
    }

    if (!email) {
      showStatus("Enter your email first, then click Forgot Password.", "error");
      return;
    }

    setBusy(true);
    showStatus("Sending reset link...", "info");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setBusy(false);

    if (error) {
      showStatus(error.message, "error");
      return;
    }

    showStatus("Reset link sent. Check your email.", "success");
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
          Welcome Back
        </h1>

        <p style={{ color: "#8492a6", textAlign: "center", marginBottom: 24 }}>
          Sign in to your trading journal
        </p>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
          onClick={forgotPassword}
          disabled={busy}
          style={{
            background: "transparent",
            border: "none",
            color: "#1e40af",
            fontSize: 13,
            fontWeight: 700,
            cursor: busy ? "not-allowed" : "pointer",
            marginBottom: 14,
            padding: 0,
            textAlign: "left",
          }}
        >
          Forgot Password?
        </button>

        <button
          onClick={signIn}
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
            marginBottom: 10,
          }}
        >
          Sign In
        </button>

        <button
          type="button"
          onClick={() => navigate("/signup")}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #e2e6ed",
            background: "#fff",
            color: "#1e40af",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Go to Sign Up
        </button>

        {status && (
          <div
            style={{
              marginTop: 16,
              textAlign: "center",
              fontSize: 13,
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
        )}
      </div>
    </div>
  );
}
