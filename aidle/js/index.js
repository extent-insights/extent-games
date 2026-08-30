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
    if (!user) {
        btnAuth.hidden = false;
        userChip.hidden = true;
        return;
    }

    btnAuth.hidden = true;
    userChip.hidden = false;
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
btnSignOut.addEventListener("click", async () => {
    await signOut();
    await refreshAuthUI();
});
window.addEventListener("auth:changed", refreshAuthUI);

supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_OUT" || !session) {
        btnAuth.hidden = false;
        userChip.hidden = true;
        return;
    }

    btnAuth.hidden = true;
    userChip.hidden = false;
    try {
        const profile = await getProfile(session.access_token);
        userEmail.textContent = profile?.gamer_tag || session.user.email;
    } catch (err) {
        console.error("[AUTH] Failed to load profile:", err);
        userEmail.textContent = session.user.email;
    }
});

refreshAuthUI().catch(err => console.error("[AUTH] Initial refresh failed:", err));

document.querySelectorAll("[data-difficulty]").forEach(card => {
    card.addEventListener("click", () => {
        const difficulty = card.dataset.difficulty;
        window.location.href = `./game.html?difficulty=${encodeURIComponent(difficulty)}`;
    });
});
