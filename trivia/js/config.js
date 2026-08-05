// js/config.js
export const SUPABASE_URL     = "https://ltapmrdbubgvuazlcahj.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_JjuYMBAY1vmfDbK7R8LvIw_515XdBjo";

// Switches automatically based on where this file is being served from,
// so it doesn't need manual edits when moving between local dev and production.
const isLocalDev = window.location.hostname === "192.168.1.30"
                 || window.location.hostname === "localhost";

export const API_BASE = isLocalDev
  ? "http://192.168.1.30:8000"
  : "https://extent-games-backend.onrender.com";
