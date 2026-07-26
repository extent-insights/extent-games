// ── auth-modal.js ─────────────────────────────────
import { signIn, signUp, signOut, signInWithProvider,
         sendPasswordReset, getUser, supabase,
         getProfile, setGamerTag, checkTagAvailable } from "./auth.js";

// ── Inject modal HTML into the page ──────────────
const MODAL_HTML = `
<div id="authBackdrop" class="auth-backdrop" hidden>
  <div class="auth-modal">

    <div id="authStateSignin">
      <h2>Sign in</h2>
      <p>Save your scores and track your streak.</p>

      <button class="auth-social-btn" id="btnGoogle">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      <button class="auth-social-btn" id="btnFacebook">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2">
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
        </svg>
        Continue with Facebook
      </button>

      <div class="auth-divider"><hr><span>or</span><hr></div>

      <div id="authError" class="auth-error" hidden></div>

      <div class="auth-tabs">
        <button class="auth-tab active" id="tabSignin">Sign in</button>
        <button class="auth-tab" id="tabSignup">Create account</button>
      </div>

      <div id="formSignin">
        <input type="email"    id="signinEmail"    class="auth-input" placeholder="Email" />
        <input type="password" id="signinPassword" class="auth-input" placeholder="Password" />
        <button class="auth-submit" id="btnSignin">Sign in</button>
        <div class="auth-link-row">
          <a id="linkForgot">Forgot password?</a>
        </div>
      </div>

      <div id="formSignup" hidden>
        <input type="email"    id="signupEmail"    class="auth-input" placeholder="Email" />
        <input type="password" id="signupPassword" class="auth-input" placeholder="Password (min. 6 chars)" />
        <div class="auth-tag-wrap">
          <input type="text" id="signupTag" class="auth-input" placeholder="Gamer tag (e.g. TriviaMaster)" maxlength="20" autocomplete="off" />
          <span class="auth-tag-hint" id="signupTagHint"></span>
        </div>
        <button class="auth-submit" id="btnSignup">Create account</button>
      </div>

      <button class="auth-close" id="authClose">&#x2715;</button>
    </div>

    <div id="authStateVerify" hidden>
      <h2>Check your email</h2>
      <p>We sent a verification link to <strong id="verifyEmail"></strong>.<br>
         Click it to activate your account, then sign in.</p>
      <button class="auth-submit" id="btnBackToSignin">Back to sign in</button>
    </div>

    <div id="authStateReset" hidden>
      <h2>Reset password</h2>
      <p>Enter your email and we'll send a reset link.</p>
      <input type="email" id="resetEmail" class="auth-input" placeholder="Email" />
      <button class="auth-submit" id="btnSendReset">Send reset link</button>
      <div class="auth-link-row"><a id="linkBackSignin">Back to sign in</a></div>
    </div>

    <div id="authStateSetTag" hidden>
      <h2>Pick your gamer tag</h2>
      <p>Your tag appears on leaderboards. You can change it any time.</p>
      <div id="setTagError" class="auth-error" hidden></div>
      <div class="auth-tag-wrap">
        <input type="text" id="setTagInput" class="auth-input" placeholder="e.g. TriviaMaster" maxlength="20" autocomplete="off" />
        <span class="auth-tag-hint" id="setTagHint"></span>
      </div>
      <button class="auth-submit" id="btnSetTag">Save tag</button>
      <div class="auth-link-row"><a id="linkSkipTag">Skip for now</a></div>
    </div>

  </div>
</div>`;

document.body.insertAdjacentHTML("beforeend", MODAL_HTML);

// ── State helpers ─────────────────────────────────
const ALL_PANELS = ["authStateSignin", "authStateVerify", "authStateReset", "authStateSetTag"];

function showPanel(id) {
  ALL_PANELS.forEach(p => {
    document.getElementById(p).hidden = p !== id;
  });
}

function showError(msg) {
  const el = document.getElementById("authError");
  el.textContent = msg;
  el.hidden = false;
}

function clearError() {
  document.getElementById("authError").hidden = true;
}

function switchTab(tab) {
  document.getElementById("formSignin").hidden  = tab !== "signin";
  document.getElementById("formSignup").hidden  = tab !== "signup";
  document.getElementById("tabSignin").classList.toggle("active", tab === "signin");
  document.getElementById("tabSignup").classList.toggle("active", tab === "signup");
  clearError();
}

// ── Open / close ──────────────────────────────────
export function openAuthModal() {
  document.getElementById("authBackdrop").hidden = false;
  showPanel("authStateSignin");
  switchTab("signin");
}

export function closeAuthModal() {
  document.getElementById("authBackdrop").hidden = true;
}

export function openSetTagModal() {
  document.getElementById("authBackdrop").hidden = false;
  showPanel("authStateSetTag");
  document.getElementById("setTagInput").value   = "";
  document.getElementById("setTagHint").textContent = "";
  document.getElementById("setTagError").hidden  = true;
}

// ── Wire up events ────────────────────────────────
document.getElementById("authClose").addEventListener("click", closeAuthModal);
document.getElementById("authBackdrop").addEventListener("click", e => {
  if (e.target.id === "authBackdrop") closeAuthModal();
});

document.getElementById("tabSignin").addEventListener("click", () => switchTab("signin"));
document.getElementById("tabSignup").addEventListener("click", () => switchTab("signup"));

document.getElementById("btnGoogle").addEventListener("click", async () => {
  try { await signInWithProvider("google"); }
  catch (e) { showError(e.message); }
});

document.getElementById("btnFacebook").addEventListener("click", async () => {
  try { await signInWithProvider("facebook"); }
  catch (e) { showError(e.message); }
});

document.getElementById("btnSignin").addEventListener("click", async () => {
  clearError();
  const email    = document.getElementById("signinEmail").value.trim();
  const password = document.getElementById("signinPassword").value;
  if (!email || !password) { showError("Please fill in all fields."); return; }
  try {
    await signIn(email, password);
    closeAuthModal();
    window.dispatchEvent(new Event("auth:changed"));
  } catch (e) { showError(e.message); }
});

// ── Live tag availability check ───────────────────
let _tagDebounce = null;

function wireTagInput(inputId, hintId) {
  const input = document.getElementById(inputId);
  const hint  = document.getElementById(hintId);

  input.addEventListener("input", () => {
    const val = input.value.trim();
    hint.textContent = "";
    hint.className   = "auth-tag-hint";
    clearTimeout(_tagDebounce);

    if (!val) return;

    if (!/^[A-Za-z0-9_\-]{3,20}$/.test(val)) {
      hint.textContent = "3-20 chars: letters, numbers, _ or -";
      hint.classList.add("auth-tag-hint--error");
      return;
    }

    hint.textContent = "Checking\u2026";
    _tagDebounce = setTimeout(async () => {
      const available = await checkTagAvailable(val);
      if (input.value.trim() !== val) return; // user kept typing
      if (available) {
        hint.textContent = "\u2713 Available";
        hint.classList.add("auth-tag-hint--ok");
      } else {
        hint.textContent = "\u2717 Already taken";
        hint.classList.add("auth-tag-hint--error");
      }
    }, 400);
  });
}

wireTagInput("signupTag",   "signupTagHint");
wireTagInput("setTagInput", "setTagHint");

// ── Sign up ───────────────────────────────────────
document.getElementById("btnSignup").addEventListener("click", async () => {
  clearError();
  const email    = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const tag      = document.getElementById("signupTag").value.trim();

  if (!email || !password) { showError("Please fill in all fields."); return; }
  if (password.length < 6) { showError("Password must be at least 6 characters."); return; }

  if (tag && !/^[A-Za-z0-9_\-]{3,20}$/.test(tag)) {
    showError("Gamer tag must be 3-20 characters (letters, numbers, _ or -).");
    return;
  }

  try {
    await signUp(email, password);

    if (tag) {
      try {
        await setGamerTag(tag);
      } catch {
        // Not yet authenticated (email verification pending) — save for later
        sessionStorage.setItem("pendingGamerTag", tag);
      }
    }

    document.getElementById("verifyEmail").textContent = email;
    showPanel("authStateVerify");
  } catch (e) { showError(e.message); }
});

// ── Forgot / reset password ───────────────────────
document.getElementById("linkForgot").addEventListener("click", () => {
  showPanel("authStateReset");
});

document.getElementById("btnSendReset").addEventListener("click", async () => {
  const email = document.getElementById("resetEmail").value.trim();
  if (!email) { showError("Enter your email."); return; }
  try {
    await sendPasswordReset(email);
    document.getElementById("verifyEmail").textContent = email;
    showPanel("authStateVerify");
  } catch (e) { showError(e.message); }
});

document.getElementById("btnBackToSignin").addEventListener("click", () => {
  showPanel("authStateSignin");
});

document.getElementById("linkBackSignin").addEventListener("click", () => {
  showPanel("authStateSignin");
});

// ── Set-tag panel (existing users without a tag) ──
document.getElementById("btnSetTag").addEventListener("click", async () => {
  const tag   = document.getElementById("setTagInput").value.trim();
  const errEl = document.getElementById("setTagError");
  errEl.hidden = true;

  if (!tag) { errEl.textContent = "Please enter a tag."; errEl.hidden = false; return; }
  if (!/^[A-Za-z0-9_\-]{3,20}$/.test(tag)) {
    errEl.textContent = "3-20 characters: letters, numbers, _ or -";
    errEl.hidden = false;
    return;
  }

  try {
    await setGamerTag(tag);
    closeAuthModal();
    window.dispatchEvent(new Event("auth:changed"));
  } catch (e) {
    errEl.textContent = e.message;
    errEl.hidden = false;
  }
});

document.getElementById("linkSkipTag").addEventListener("click", closeAuthModal);

// ── Apply any pending tag after email verification + sign-in ─────────────────
supabase.auth.onAuthStateChange(async (event) => {
  if (event === "SIGNED_IN") {
    const pending = sessionStorage.getItem("pendingGamerTag");
    if (pending) {
      sessionStorage.removeItem("pendingGamerTag");
      try { await setGamerTag(pending); } catch { /* tag taken or other error */ }
      window.dispatchEvent(new Event("auth:changed"));
    }
  }
});
