// ── auth.js ──────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = "https://ltapmrdbubgvuazlcahj.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0YXBtcmRidWJndnVhemxjYWhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MzQ2MjQsImV4cCI6MjA5MjExMDYyNH0.BKcbMHe3ykhOudWd2IqBpSCpdrRnkesWESw1J1z8Q98";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// Returns the access token string, or null if not logged in
export async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

// Returns the user object, or null if not logged in
export async function getUser() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
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
    provider,  // "google" | "facebook" | "apple"
    options: { redirectTo: window.location.href }
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
