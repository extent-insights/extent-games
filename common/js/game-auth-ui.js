import { getUser, signOut, supabase, getProfile, setApiBase } from "./auth.js";
import { openAuthModal, openSetTagModal } from "./auth-modal.js";

export function initGameAuthUI({ apiBase, ids = {} } = {}) {
  if (apiBase) setApiBase(apiBase);
  const el = (key, fallback) => document.getElementById(ids[key] || fallback);
  const btnAuth = el("openAuth", "btnOpenAuth");
  const userChip = el("userChip", "userChip");
  const userEmail = el("userEmail", "userEmail");
  const btnSignOut = el("signOut", "btnSignOut");
  const btnEditTag = el("editTag", "btnEditTag");
  if (!btnAuth || !userChip || !userEmail || !btnSignOut || !btnEditTag) return;

  async function refresh() {
    const user = await getUser();
    if (!user) { btnAuth.hidden = false; userChip.hidden = true; return; }
    btnAuth.hidden = true; userChip.hidden = false;
    try {
      const profile = await getProfile();
      userEmail.textContent = profile?.gamer_tag || user.email;
    } catch (err) {
      console.error("[AUTH] Failed to load profile:", err);
      userEmail.textContent = user.email;
    }
  }
  btnAuth.addEventListener("click", openAuthModal);
  btnEditTag.addEventListener("click", openSetTagModal);
  btnSignOut.addEventListener("click", async () => { await signOut(); await refresh(); });
  window.addEventListener("auth:changed", refresh);
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session) { btnAuth.hidden = false; userChip.hidden = true; return; }
    btnAuth.hidden = true; userChip.hidden = false;
    try {
      const profile = await getProfile(session.access_token);
      userEmail.textContent = profile?.gamer_tag || session.user.email;
    } catch { userEmail.textContent = session.user.email; }
  });
  refresh().catch(err => console.error("[AUTH] Initial refresh failed:", err));
}
