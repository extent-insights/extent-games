// ── Config ───────────────────────────────────────
import { API_BASE } from "./config.js";
import { initGameAuthUI } from "../../common/js/game-auth-ui.js";

initGameAuthUI({
  apiBase: API_BASE,
  promptForMissingTag: true
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
