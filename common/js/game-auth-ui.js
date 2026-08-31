import { getUser, signOut, supabase, getProfile, setApiBase } from "./auth.js";
import { openAuthModal, openSetTagModal } from "./auth-modal.js";

export function initGameAuthUI({
  apiBase,
  ids = {},
  promptForMissingTag = false,
} = {}) {
  if (apiBase) setApiBase(apiBase);

  const el = (key, fallback) =>
    document.getElementById(ids[key] || fallback);

  const btnAuth = el("openAuth", "btnOpenAuth");
  const userChip = el("userChip", "userChip");
  const userEmail = el("userEmail", "userEmail");
  const btnSignOut = el("signOut", "btnSignOut");
  const btnEditTag = el("editTag", "btnEditTag");

  if (!btnAuth || !userChip || !userEmail || !btnSignOut || !btnEditTag) {
    return;
  }

  let refreshVersion = 0;

  function showSignedOut() {
    btnAuth.hidden = false;
    userChip.hidden = true;
    userEmail.textContent = "";
  }

  function showSignedIn(label) {
    btnAuth.hidden = true;
    userChip.hidden = false;
    userEmail.textContent = label || "";
  }

  async function loadProfileForSession(session, version) {
    if (!session?.user) {
      if (version === refreshVersion) {
        showSignedOut();
      }
      return;
    }

    const fallback = session.user.email || "";
    showSignedIn(fallback);

    try {
      const profile = await getProfile(session.access_token);

      if (version !== refreshVersion) {
        return;
      }

      showSignedIn(profile?.gamer_tag || fallback);

      if (
        promptForMissingTag &&
        !profile?.gamer_tag &&
        !sessionStorage.getItem("tagPromptShown")
      ) {
        sessionStorage.setItem("tagPromptShown", "1");
        openSetTagModal();
      }
    } catch (err) {
      if (version !== refreshVersion) {
        return;
      }

      console.error("[AUTH] Failed to load profile:", err);
      showSignedIn(fallback);
    }
  }

  async function refresh() {
    const version = ++refreshVersion;
    const user = await getUser();

    if (version !== refreshVersion) {
      return;
    }

    if (!user) {
      showSignedOut();
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (version !== refreshVersion) {
      return;
    }

    if (!session) {
      showSignedOut();
      return;
    }

    await loadProfileForSession(session, version);
  }

  btnAuth.addEventListener("click", openAuthModal);
  btnEditTag.addEventListener("click", openSetTagModal);

  btnSignOut.addEventListener("click", async () => {
    ++refreshVersion;
    showSignedOut();
    await signOut();
  });

  window.addEventListener("auth:changed", () => {
    refresh().catch(err =>
      console.error("[AUTH] Refresh failed:", err)
    );
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    const version = ++refreshVersion;

    if (!session) {
      showSignedOut();
      return;
    }

    loadProfileForSession(session, version).catch(err =>
      console.error("[AUTH] Auth state refresh failed:", err)
    );
  });

  refresh().catch(err =>
    console.error("[AUTH] Initial refresh failed:", err)
  );
}
