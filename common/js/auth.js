// ── auth.js (shared) ──────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// API_BASE differs per game (each game deploys its own backend), so
// it can't be a static import like SUPABASE_URL/KEY above. Each
// game's own js/config.js defines its API_BASE, and index.js calls
// setApiBase() once at startup before any profile/tag calls happen.
let _apiBase = null;

export function setApiBase(url) {
  _apiBase = url;
}

function requireApiBase() {
  if (!_apiBase) {
    throw new Error(
      "API_BASE not set - call setApiBase(API_BASE) from your game's " +
      "config.js before using getProfile/setGamerTag/checkTagAvailable."
    );
  }
  return _apiBase;
}

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
  // Without this, Supabase always sends the confirmation link to the
  // project's Site URL (production) regardless of where signUp() was
  // called from - so local sign-ups would confirm into the prod page.
  // window.location.origin needs to be on the Redirect URLs allow-list
  // in Supabase's Auth settings (see reset.html's redirectTo below,
  // same requirement).
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin }
  });
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
  const redirectTo = `${window.location.origin}${window.location.pathname}`;

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo }
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
export async function getProfile(token = null) {
  const authToken = token ?? (await getAccessToken());
  if (!authToken) return null;
  const res = await fetch(`${requireApiBase()}/profile/me`, {
    headers: { "Authorization": `Bearer ${authToken}` }
  });
  if (!res.ok) return null;
  return res.json();
}

export async function setGamerTag(tag) {
  const headers = { ...(await authHeaders()), "Content-Type": "application/json" };
  const res = await fetch(`${requireApiBase()}/profile/me`, {
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
    `${requireApiBase()}/profile/check-tag?tag=${encodeURIComponent(tag)}`
  );
  if (!res.ok) return false;
  const data = await res.json();
  return data.available === true;
}
