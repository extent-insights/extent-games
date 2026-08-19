// js/config.js — Trivia Smash backend URL.
//
// Supabase configuration is shared across all games in
// ../../common/js/supabase-config.js. This file only chooses the
// game-specific backend endpoint.
const isLocalDev =
    window.location.hostname === "192.168.1.30"
    || window.location.hostname === "localhost"
    || window.location.hostname === "127.0.0.1"
    || window.location.hostname === "www.extent-games.com"
    || window.location.hostname === "extent-games.com";

export const API_BASE = isLocalDev
  ? "http://192.168.1.30:8000"
  : "https://extent-games-backend.onrender.com";
