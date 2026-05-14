import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import {
  formatUsernameError,
  isProfilesTableMissing,
  validateUsername,
} from "./usernameUtils";

export default function SignupPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("info");
  const [busy, setBusy] = useState(false);
  const showStatus = (message, type = "info") => {
    setStatus(message);
    setStatusType(type);
  };

  const signUp = async () => {
    if (!isSupabaseConfigured || !supabase) {
      showStatus("Supabase is not configured. Check your .env file.", "error");
      return;
    }

    const usernameValidation = validateUsername(username);
    if (!usernameValidation.ok || !email || !password) {
      if (!usernameValidation.ok) {
        showStatus(usernameValidation.message, "error");
      } else {
        showStatus("Enter username, email and password.", "error");
      }
      return;
    }
    const cleanUsername = usernameValidation.username;

    setBusy(true);
    showStatus("Checking username...", "info");

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

    if ((existingRows || []).length > 0) {
      setBusy(false);
      showStatus("This username is already taken. Try another one.", "error");
      return;
    }

    showStatus("Creating account...", "info");

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: cleanUsername,
        },
      },
    });

    setBusy(false);

    if (error) {
      showStatus(formatUsernameError(error, "Could not create account."), "error");
      return;
    }

    showStatus("Account created. Please sign in now.", "success");
    setTimeout(() => navigate("/login"), 700);
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
          Create Account
        </h1>

        <p style={{ color: "#8492a6", textAlign: "center", marginBottom: 24 }}>
          Create your new journal account
        </p>

        <input
          type="text"
          placeholder="Username (a-z, 0-9, _)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
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
          onClick={signUp}
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
          Sign Up
        </button>

        <button
          type="button"
          onClick={() => navigate("/login")}
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
          Go to Sign In
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
