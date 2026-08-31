// ── Config ───────────────────────────────────────
import { API_BASE } from "./config.js";
import { initGameAuthUI } from "../../common/js/game-auth-ui.js";

initGameAuthUI({
  apiBase: API_BASE,
  promptForMissingTag: true
});

const MODES = {
  daily:    { questions: 10, shuffle: true },
  speed:    { questions: 10, shuffle: true },
  survival: { questions: null, shuffle: true },
  challenge:{ questions: 10, shuffle: true },
  custom:   { questions: null, shuffle: true },
};

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
