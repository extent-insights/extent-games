//// ── Config ───────────────────────────────────────
const API_BASE = "http://192.168.1.30:8000";
//const API_BASE = "https://your-app-name.onrender.com";  // replace 192.168.1.30

import { getUser, signOut, supabase } from "./auth.js";
import { openAuthModal, closeAuthModal } from "./auth-modal.js";

const MODES = {
  daily:    { questions: 10, shuffle: true },
  speed:    { questions: 10, shuffle: true },
  survival: { questions: null, shuffle: true },
  challenge:{ questions: 10, shuffle: true },
  custom:   { questions: null, shuffle: true },
};

// ── Auth UI ───────────────────────────────────────
const btnAuth    = document.getElementById("btnAuth");    // "Sign in" button in your header
const userChip   = document.getElementById("userChip");  // shown when logged in
const userEmail  = document.getElementById("userEmail"); // email label in chip
const btnSignOut = document.getElementById("btnSignOut");

async function refreshAuthUI() {
  const user = await getUser();
  if (user) {
    btnAuth.hidden  = true;
    userChip.hidden = false;
    userEmail.textContent = user.email;
  } else {
    btnAuth.hidden  = false;
    userChip.hidden = true;
  }
}

btnAuth.addEventListener("click", openAuthModal);
btnSignOut.addEventListener("click", async () => {
  await signOut();
  refreshAuthUI();
});

// Re-check auth state after modal closes or social redirect resolves
window.addEventListener("auth:changed", refreshAuthUI);
supabase.auth.onAuthStateChange(() => refreshAuthUI());

// Run on load
refreshAuthUI();

// ── Mode cards (unchanged) ────────────────────────
document.querySelectorAll(".mode-card").forEach(card => {
  card.addEventListener("click", () => startMode(card.dataset.mode));
});

function startMode(mode) {
  const params = new URLSearchParams({ mode });
  if (mode === "custom") {
    const category = document.getElementById("customCategory").value;
    const period   = document.getElementById("customPeriod").value;
    const count    = document.getElementById("customCount").value;
    if (category) params.set("category", category);
    if (period)   params.set("period",   period);
    params.set("count", count);
  } else {
    params.set("count", MODES[mode].questions ?? 10);
  }
  window.location.href = `game.html?${params.toString()}`;
}
