import { API_BASE } from "./config.js";
import { initGameAuthUI } from "../../common/js/game-auth-ui.js";


// ============================================================
// AUTH UI
// ============================================================

initGameAuthUI({
  apiBase: API_BASE
});


// ============================================================
// FIXTURE ELEMENTS
// ============================================================

const fixturesList = document.getElementById("fixturesList");


// ============================================================
// DISPLAY HELPERS
// ============================================================

function formatDate(value) {
  if (!value) return "TBD";

  // Interpret date-only values locally so timezone conversion cannot
  // shift the displayed calendar date.
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatTime(value) {
  if (!value) return "TBD";

  const [hour = "0", minute = "0"] = value.split(":");
  const date = new Date();
  date.setHours(Number(hour), Number(minute), 0, 0);

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function sportDisplay(sportCode) {
  switch ((sportCode || "").toUpperCase()) {
    case "FOOTBALL":
      return "🏈 Football";
    case "BASKETBALL":
      return "🏀 Basketball";
    default:
      return sportCode ? `🏆 ${sportCode}` : "🏆 Sport";
  }
}

function statusLabel(status) {
  switch ((status || "").toUpperCase()) {
    case "LIVE":
      return "LIVE NOW";
    case "COMPLETED":
      return "COMPLETED GAME";
    case "CANCELLED":
      return "CANCELLED";
    case "SCHEDULED":
    default:
      return "UPCOMING GAME";
  }
}

function homeAwayLabels(homeAway) {
  if ((homeAway || "").toUpperCase() === "AWAY") {
    return {
      team: "AWAY",
      opponent: "HOME"
    };
  }

  return {
    team: "HOME",
    opponent: "OPPONENT"
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ============================================================
// GAME CARD RENDERING
// ============================================================

function buildGameCard(game) {
  const sides = homeAwayLabels(game.home_away);
  const status = (game.status || "SCHEDULED").toUpperCase();
  const isCancelled = status === "CANCELLED";
  const disabled = !game.bingo_enabled || isCancelled;

  const buttonLabel =
    status === "COMPLETED"
      ? "View Bingo"
      : status === "CANCELLED"
        ? "Cancelled"
        : "Play Bingo";

  const card = document.createElement("section");
  card.className = `fixture-card status-${status.toLowerCase()}`;
  card.innerHTML = `
    <div class="fixture-top">
      <div>
        <div class="fixture-label">${escapeHtml(statusLabel(game.status))}</div>
        <h2>${escapeHtml(game.team_name || "Bingo Bash Game")}</h2>
      </div>
      <div class="sport-badge">${escapeHtml(sportDisplay(game.sport_code))}</div>
    </div>

    <div class="matchup">
      <div>
        <span class="team-label">${escapeHtml(sides.team)}</span>
        <strong>${escapeHtml(game.school_name || "Team")}</strong>
      </div>
      <div class="versus">VS</div>
      <div class="away">
        <span class="team-label">${escapeHtml(sides.opponent)}</span>
        <strong>${escapeHtml(game.opponent_name || "Opponent")}</strong>
      </div>
    </div>

    <div class="fixture-footer">
      <div><span>Date</span><strong>${escapeHtml(formatDate(game.game_date))}</strong></div>
      <div><span>Kickoff</span><strong>${escapeHtml(formatTime(game.game_time))}</strong></div>
      <button class="play-btn" type="button" ${disabled ? "disabled" : ""}>
        ${escapeHtml(buttonLabel)}${isCancelled ? "" : " <span>→</span>"}
      </button>
    </div>
  `;

  const playButton = card.querySelector(".play-btn");
  if (!disabled) {
    playButton.addEventListener("click", () => {
      window.location.href = `./game.html?game_id=${encodeURIComponent(game.game_id)}`;
    });
  }

  return card;
}

function renderGames(games) {
  fixturesList.replaceChildren();

  if (!Array.isArray(games) || games.length === 0) {
    fixturesList.innerHTML = `
      <section class="fixture-card">
        <div class="fixture-top">
          <div>
            <div class="fixture-label">BINGO BASH</div>
            <h2>No games are currently available.</h2>
          </div>
        </div>
      </section>
    `;
    return;
  }

  for (const game of games) {
    fixturesList.appendChild(buildGameCard(game));
  }
}


// ============================================================
// LOAD PUBLIC GAMES
// ============================================================

async function loadGames() {
  try {
    const response = await fetch(`${API_BASE}/games`);

    if (!response.ok) {
      throw new Error(`Games request failed with status ${response.status}`);
    }

    const games = await response.json();
    renderGames(games);
  } catch (error) {
    console.error("Unable to load Bingo Bash games", error);
    fixturesList.innerHTML = `
      <section class="fixture-card">
        <div class="fixture-top">
          <div>
            <div class="fixture-label">BINGO BASH</div>
            <h2>Games unavailable</h2>
          </div>
        </div>
      </section>
    `;
  }
}


// ============================================================
// INITIALIZE PAGE
// ============================================================

loadGames();
