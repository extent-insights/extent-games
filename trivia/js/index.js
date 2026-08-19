// ── Config ───────────────────────────────────────
import { API_BASE } from "./config.js";

import { getUser, signOut, supabase, getProfile, setApiBase } from "../../common/js/auth.js";
import { openAuthModal, closeAuthModal, openSetTagModal } from "../../common/js/auth-modal.js";

// auth.js's getProfile/setGamerTag/checkTagAvailable need to know
// which backend to call - inject Trivia Smash's API_BASE before
// anything else runs.
setApiBase(API_BASE);


const MODES = {
  daily:    { questions: 10, shuffle: true },
  speed:    { questions: 10, shuffle: true },
  survival: { questions: null, shuffle: true },
  challenge:{ questions: 10, shuffle: true },
  custom:   { questions: null, shuffle: true },
};

// ── Auth UI ───────────────────────────────────────
const btnAuth    = document.getElementById("btnOpenAuth");
const userChip   = document.getElementById("userChip");
const userEmail  = document.getElementById("userEmail");
const btnSignOut = document.getElementById("btnSignOut");
const btnEditTag = document.getElementById("btnEditTag");

async function refreshAuthUI() {
  const user = await getUser();
  if (user) {
    btnAuth.hidden  = true;
    userChip.hidden = false;
    try {
      const profile = await getProfile();
      userEmail.textContent = profile?.gamer_tag || user.email;
    } catch (err) {
      console.error("[AUTH] Failed to load profile:", err);
      userEmail.textContent = user.email;
    }
  } else {
    btnAuth.hidden  = false;
    userChip.hidden = true;
  }
}

btnAuth.addEventListener("click", openAuthModal);
btnEditTag.addEventListener("click", openSetTagModal);
btnSignOut.addEventListener("click", async () => {
  await signOut();
  refreshAuthUI();
});

// Re-check auth state after modal closes or social redirect resolves
window.addEventListener("auth:changed", refreshAuthUI);

// 
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    btnAuth.hidden  = false;
    userChip.hidden = true;
    return;
  }

  // session is guaranteed valid here — use it directly
  btnAuth.hidden  = true;
  userChip.hidden = false;

  // Fetch profile using the token we know exists. Authentication remains
  // usable even if the profile API is temporarily unavailable.
  let profile = null;
  try {
    profile = await getProfile(session.access_token);
    userEmail.textContent = profile?.gamer_tag || session.user.email;
  } catch (err) {
    console.error("[AUTH] Failed to load profile:", err);
    userEmail.textContent = session.user.email;
  }

  if (!profile?.gamer_tag && !sessionStorage.getItem("tagPromptShown")) {
    sessionStorage.setItem("tagPromptShown", "1");
    openSetTagModal();
  }
});

// ── Mode cards ────────────────────────────────────
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
