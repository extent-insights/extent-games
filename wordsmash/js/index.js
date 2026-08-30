// ── Config ───────────────────────────────────────
import { API_BASE } from "./config.js";
import { getUser, signOut, supabase, getProfile, setApiBase } from "../../common/js/auth.js";
import { openAuthModal, closeAuthModal, openSetTagModal } from "../../common/js/auth-modal.js";

// auth.js's getProfile/setGamerTag/checkTagAvailable need to know
// which backend to call - inject Word Smash's API_BASE before
// anything else runs.
setApiBase(API_BASE);

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
// Word Smash only has three fixed modes - no per-mode question count
// or custom category/period selects like Trivia's "Custom" card, so
// this is just mode -> URL param, no MODES config object needed.
document.querySelectorAll(".mode-card").forEach(card => {
  card.addEventListener("click", () => startMode(card.dataset.mode));
});

function startMode(mode) {
  const params = new URLSearchParams({ mode });
  window.location.href = `game.html?${params.toString()}`;
}
