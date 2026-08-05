// ── auth.js ──────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window._debugSupabase = supabase; // TEMPORARY — remove after debugging

// Returns the access token string, or null if not logged in
export async function getAccessToken() {
  // getSession() reads from localStorage but may return null on first call
  // before the client has fully initialised — refreshSession forces it to resolve
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session.access_token;

  // If nothing in storage, return null — user is genuinely logged out
  return null;
}

// Returns the user object, or null if not logged in
export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

// Auth header object — pass into fetch calls
export async function authHeaders() {
  const token = await getAccessToken();
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

// ── Email sign-up ─────────────────────────────────
export async function signUp(email, password) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

// ── Email sign-in ─────────────────────────────────
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

// ── Social login ──────────────────────────────────
export async function signInWithProvider(provider) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin,
    }
  });
  if (error) throw error;
}

// ── Password reset ────────────────────────────────
export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset.html`
  });
  if (error) throw error;
}

// ── Sign out ──────────────────────────────────────
export async function signOut() {
  await supabase.auth.signOut();
}

// ── Profile / gamer tag ───────────────────────────
import { API_BASE } from "./config.js";

export async function getProfile(token = null) {
  const authToken = token ?? (await getAccessToken());
  if (!authToken) return null;
  const res = await fetch(`${API_BASE}/profile/me`, {
    headers: { "Authorization": `Bearer ${authToken}` }
  });
  if (!res.ok) return null;
  return res.json();
}

export async function setGamerTag(tag) {
  const headers = { ...(await authHeaders()), "Content-Type": "application/json" };
  const res = await fetch(`${API_BASE}/profile/me`, {
    method:  "PUT",
    headers,
    body:    JSON.stringify({ gamer_tag: tag }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to save gamer tag");
  }
  return res.json();
}

export async function checkTagAvailable(tag) {
  const res = await fetch(
    `${API_BASE}/profile/check-tag?tag=${encodeURIComponent(tag)}`
  );
  if (!res.ok) return false;
  const data = await res.json();
  return data.available === true;
}
