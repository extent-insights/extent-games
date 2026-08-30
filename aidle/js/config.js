// AIDLE backend URL. Supabase configuration remains shared in
// ../../common/js/supabase-config.js.
//
// Production can override the backend without rebuilding this file by loading
// a tiny script before game.js that sets:
//   window.EXTENT_CONFIG = { aidleApiBase: "https://..." };
const isLocalDev =
    window.location.hostname === "192.168.1.30"
    || window.location.hostname === "localhost"
    || window.location.hostname === "127.0.0.1"
    || window.location.hostname === "www.extent-games.com"
    || window.location.hostname === "extent-games.com";

const configuredProductionBase = window.EXTENT_CONFIG?.aidleApiBase;

export const API_BASE = isLocalDev
  ? "http://192.168.1.30:8002"
  : (configuredProductionBase || "https://extent-games-aidle.onrender.com");

export const IS_LOCAL_DEV = isLocalDev;
