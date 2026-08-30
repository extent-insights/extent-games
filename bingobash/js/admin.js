import { API_BASE } from "./config.js";
import { authHeaders, getUser } from "../../common/js/auth.js";
import { initGameAuthUI } from "../../common/js/game-auth-ui.js";

initGameAuthUI({ apiBase: API_BASE });

const statusEl = document.getElementById("adminStatus");
const gamesEl = document.getElementById("adminGames");

// ============================================================
// ADMIN DISPLAY HELPERS
// ============================================================

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function formatGameDate(game) {
  const date = new Date(`${game.game_date}T${game.game_time || "00:00:00"}`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: game.game_time ? "numeric" : undefined,
    minute: game.game_time ? "2-digit" : undefined,
  }).format(date);
}

function actionsFor(status) {
  if (status === "SCHEDULED") {
    return `<button data-next-status="LIVE" class="admin-action primary">GO LIVE</button>
            <button data-next-status="CANCELLED" class="admin-action danger">CANCEL GAME</button>`;
  }
  if (status === "LIVE") {
    return `<button data-next-status="COMPLETED" class="admin-action primary">COMPLETE GAME</button>
            <button data-next-status="CANCELLED" class="admin-action danger">CANCEL GAME</button>`;
  }
  return `<span class="admin-terminal">No further status changes</span>`;
}

function renderGames(games) {
  gamesEl.innerHTML = games.map(game => `
    <article class="admin-game-card" data-game-id="${game.game_id}">
      <div class="admin-game-copy">
        <span class="live-pill status-${escapeHtml(game.status.toLowerCase())}">${escapeHtml(game.status)}</span>
        <h2>${escapeHtml(game.school_name)} vs ${escapeHtml(game.opponent_name)}</h2>
        <p>${escapeHtml(formatGameDate(game))} · ${escapeHtml(game.home_away)}</p>
      </div>
      <div class="admin-game-actions">${actionsFor(game.status)}</div>
    </article>`).join("");

  gamesEl.querySelectorAll("button[data-next-status]").forEach(button => {
    button.addEventListener("click", async () => {
      const card = button.closest(".admin-game-card");
      const gameId = Number(card.dataset.gameId);
      const nextStatus = button.dataset.nextStatus;
      const verb = nextStatus === "LIVE" ? "take this game LIVE" : nextStatus === "COMPLETED" ? "complete this game" : "cancel this game";
      if (!window.confirm(`Are you sure you want to ${verb}?`)) return;
      await changeStatus(gameId, nextStatus);
    });
  });
}

// ============================================================
// ADMIN API
// ============================================================

async function loadGames() {
  const user = await getUser();
  if (!user) {
    statusEl.textContent = "Sign in with an authorized Bingo administrator account.";
    gamesEl.hidden = true;
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/admin/games`, { headers: await authHeaders() });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Server returned ${response.status}`);
    }
    const games = await response.json();
    statusEl.hidden = true;
    gamesEl.hidden = false;
    renderGames(games);
  } catch (error) {
    statusEl.hidden = false;
    statusEl.textContent = error.message;
    gamesEl.hidden = true;
  }
}

async function changeStatus(gameId, status) {
  try {
    const response = await fetch(`${API_BASE}/admin/games/${gameId}/status`, {
      method: "PUT",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Server returned ${response.status}`);
    }
    await loadGames();
  } catch (error) {
    window.alert(error.message);
  }
}

window.addEventListener("auth:changed", loadGames);
loadGames();
