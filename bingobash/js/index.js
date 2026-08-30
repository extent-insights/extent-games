import { getUser, signOut, supabase, getProfile, setApiBase } from "../../common/js/auth.js";
import { openAuthModal, openSetTagModal } from "../../common/js/auth-modal.js";
import { API_BASE } from "./config.js";

setApiBase(API_BASE);

const btnAuth = document.getElementById("btnOpenAuth");
const userChip = document.getElementById("userChip");
const userEmail = document.getElementById("userEmail");
const btnSignOut = document.getElementById("btnSignOut");
const btnEditTag = document.getElementById("btnEditTag");

async function refreshAuthUI() {
  const user = await getUser();
  if (!user) { btnAuth.hidden = false; userChip.hidden = true; return; }
  btnAuth.hidden = true; userChip.hidden = false;
  try {
    const profile = await getProfile();
    userEmail.textContent = profile?.gamer_tag || user.email;
  } catch { userEmail.textContent = user.email; }
}

btnAuth.addEventListener("click", openAuthModal);
btnEditTag.addEventListener("click", openSetTagModal);
btnSignOut.addEventListener("click", async () => { await signOut(); await refreshAuthUI(); });
window.addEventListener("auth:changed", refreshAuthUI);
supabase.auth.onAuthStateChange(() => refreshAuthUI());
refreshAuthUI();

document.getElementById("playGameBtn").addEventListener("click", () => {
  window.location.href = "./game.html?game_id=1";
});
