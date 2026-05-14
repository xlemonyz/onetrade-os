export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

export function validateUsername(value) {
  const username = normalizeUsername(value);

  if (!username) {
    return { ok: false, username: "", message: "Username cannot be empty." };
  }

  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      username,
      message: "Username must be 3-20 chars (a-z, 0-9, _ only).",
    };
  }

  return { ok: true, username, message: "" };
}

export function isProfilesTableMissing(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("profiles") && message.includes("does not exist");
}

export function formatUsernameError(error, fallback = "Could not update username.") {
  const message = String(error?.message || "");
  const lower = message.toLowerCase();

  if (error?.code === "23505" || lower.includes("duplicate key") || lower.includes("unique")) {
    return "This username is already taken. Try another one.";
  }

  if (isProfilesTableMissing(error)) {
    return "Username setup is missing in Supabase. Run the username SQL setup first.";
  }

  return message || fallback;
}
