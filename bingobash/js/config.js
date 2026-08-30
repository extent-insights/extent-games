// Bingo Bash backend URL. Supabase configuration is shared across all games.
const isLocalDev =
    window.location.hostname === "192.168.1.30"
    || window.location.hostname === "localhost"
    || window.location.hostname === "127.0.0.1"
    || window.location.hostname === "www.extent-games.com"
    || window.location.hostname === "extent-games.com";

const configuredProductionBase = window.EXTENT_CONFIG?.bingoBashApiBase;

export const API_BASE = isLocalDev
  ? "http://192.168.1.30:8003"
  : (configuredProductionBase || "https://extent-games-bingobash.onrender.com");

export const IS_LOCAL_DEV = isLocalDev;
