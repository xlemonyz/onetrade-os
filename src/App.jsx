import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

import GoldJournal from "./GoldJournal";
import LoginPage from "./LoginPage";
import SignupPage from "./SignupPage";
import AccountPage from "./AccountPage";
import ResetPasswordPage from "./ResetPasswordPage";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

export default function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured || !supabase);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session || null);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      setAuthReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!authReady) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif" }}>
        Checking session...
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={session || !isSupabaseConfigured ? <Navigate to="/" replace /> : <LoginPage />}
      />

      <Route
        path="/signup"
        element={session || !isSupabaseConfigured ? <Navigate to="/" replace /> : <SignupPage />}
      />

      <Route
        path="/reset-password"
        element={<ResetPasswordPage session={session} />}
      />

      <Route
        path="/account"
        element={session ? <AccountPage session={session} /> : <Navigate to="/login" replace />}
      />

      <Route
        path="/"
        element={session || !isSupabaseConfigured ? <GoldJournal session={session} /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}
