import { API_BASE } from "./config.js";
import { authHeaders, getUser } from "../../common/js/auth.js";
import { initGameAuthUI } from "../../common/js/game-auth-ui.js";

initGameAuthUI({ apiBase: API_BASE });

const params = new URLSearchParams(window.location.search);
const GAME_ID = Number(params.get("game_id") || 1);
const GUEST_STORAGE_KEY = "extent_bingobash_guest_id";
const UNDO_HOLD_MS = 2000;
const STATUS_POLL_MS = 60_000;
const STATUS_POLL_WINDOW_MS = 15 * 60_000;

const board = document.getElementById("bingoBoard");
const boardSection = document.getElementById("boardSection");
const statusMessage = document.getElementById("statusMessage");
const participantSetup = document.getElementById("participantSetup");
const rosterChoices = document.getElementById("rosterChoices");
const participantNameInput = document.getElementById("participantName");
const participantPreview = document.getElementById("participantPreview");
const startBingoBtn = document.getElementById("startBingoBtn");
const setupError = document.getElementById("setupError");
const welcomeBackdrop = document.getElementById("welcomeBackdrop");
const enterGameBtn = document.getElementById("enterGameBtn");
const changeSupportBtn = document.getElementById("changeSupportBtn");
const helpBtn = document.getElementById("helpBtn");
const leadersBtn = document.getElementById("leadersBtn");
const leaderboardBackdrop = document.getElementById("leaderboardBackdrop");
const leaderboardCloseBtn = document.getElementById("leaderboardCloseBtn");
const leaderboardList = document.getElementById("leaderboardList");
const leaderboardStatus = document.getElementById("leaderboardStatus");
const leaderboardCount = document.getElementById("leaderboardCount");
const leaderboardMeta = document.getElementById("leaderboardMeta");
const gameStatusPill = document.getElementById("gameStatusPill");
const gameStateBackdrop = document.getElementById("gameStateBackdrop");
const gameStateTitle = document.getElementById("gameStateTitle");
const gameStateMessage = document.getElementById("gameStateMessage");
const gameStateIcon = document.getElementById("gameStateIcon");
const gameStateCloseBtn = document.getElementById("gameStateCloseBtn");

let cardState = null;
let setupState = null;
let selectedRosterId = null;
let completingTile = false;
let undoHold = null;
let statusPollTimer = null;
let fitFrame = null;
let leaderboardPollTimer = null;
const LEADERBOARD_POLL_MS = 30_000;

// ============================================================
// GUEST UUID + REQUEST HEADERS
// ============================================================

function createUuidV4() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, "0"));
    return [hex.slice(0,4),hex.slice(4,6),hex.slice(6,8),hex.slice(8,10),hex.slice(10,16)].map(x=>x.join("")).join("-");
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.floor(Math.random()*16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getGuestId() {
  let guestId = localStorage.getItem(GUEST_STORAGE_KEY);
  if (!guestId) {
    guestId = createUuidV4();
    localStorage.setItem(GUEST_STORAGE_KEY, guestId);
  }
  return guestId;
}

async function bingoHeaders() {
  const user = await getUser();
  if (user) return await authHeaders();
  return { "X-Bingo-Guest-Id": getGuestId() };
}

// ============================================================
// DISPLAY HELPERS
// ============================================================

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function displaySchoolName(name) {
  if (!name) return "";
  return name.replace(/\s+High\s+School\s*$/i, "").trim();
}

function formatGameDate(dateString, timeString) {
  const date = new Date(`${dateString}T${timeString || "00:00:00"}`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: timeString ? "numeric" : undefined,
    minute: timeString ? "2-digit" : undefined,
  }).format(date);
}

function scheduledStartMs(source) {
  if (!source?.game_date) return null;
  const value = new Date(`${source.game_date}T${source.game_time || "00:00:00"}`).getTime();
  return Number.isFinite(value) ? value : null;
}

function gameStatus() {
  return String(cardState?.game_status || setupState?.game_status || "SCHEDULED").toUpperCase();
}

function isGameLive() {
  return gameStatus() === "LIVE";
}

// ============================================================
// GAME STATUS UI + MODAL
// ============================================================

function updateGameStatusUI(status) {
  const normalized = String(status || "SCHEDULED").toUpperCase();
  gameStatusPill.textContent = normalized === "LIVE" ? "● LIVE" : normalized;
  gameStatusPill.className = `live-pill status-${normalized.toLowerCase()}`;
  document.querySelector(".game-page")?.classList.toggle("game-readonly", normalized !== "LIVE");
}

function showGameStateModal(status = gameStatus()) {
  const normalized = String(status).toUpperCase();
  const copy = {
    SCHEDULED: ["⏱️", "Game Not Started Yet", "Your Bingo card is ready, but this game is not LIVE yet. You can review your card now and start marking tiles when the game goes LIVE."],
    COMPLETED: ["🏁", "Game Complete", "This game has ended. Your final Bingo card is now read-only."],
    CANCELLED: ["✕", "Game Cancelled", "This game has been cancelled. Your Bingo card is read-only."],
  }[normalized] || ["ℹ️", "Game Unavailable", "This game is not available for live play right now."];
  [gameStateIcon.textContent, gameStateTitle.textContent, gameStateMessage.textContent] = copy;
  gameStateBackdrop.hidden = false;
}

function showHelpModal() {
  welcomeBackdrop.hidden = false;
}

helpBtn.addEventListener("click", showHelpModal);
gameStateCloseBtn.addEventListener("click", () => { gameStateBackdrop.hidden = true; });

// ============================================================
// GAME LEADERBOARD
// ============================================================

function leaderboardRankLabel(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return String(rank);
}

function leaderboardAchievement(entry) {
  if (entry.blackout_awarded) return "BLACKOUT";
  if (entry.bingo_awarded) return "BINGO";
  return "";
}

function renderLeaderboard(data) {
  const entries = Array.isArray(data.entries) ? data.entries : [];
  leaderboardStatus.hidden = true;
  leaderboardCount.textContent = `${data.player_count ?? entries.length} player${(data.player_count ?? entries.length) === 1 ? "" : "s"}`;
  leaderboardMeta.textContent = `${String(data.status || gameStatus()).toUpperCase()} · Current game`;
  if (!entries.length) {
    leaderboardList.innerHTML = '<div class="leaderboard-empty">No players have joined this game yet.</div>';
    return;
  }
  leaderboardList.innerHTML = entries.map(entry => {
    const current = Number(entry.game_player_id) === Number(cardState?.game_player_id);
    const support = entry.supported_last_name
      ? `Supporting #${escapeHtml(entry.supported_jersey_number ?? "")} ${escapeHtml(entry.supported_last_name)}`.trim()
      : "";
    const achievement = leaderboardAchievement(entry);
    return `<div class="leaderboard-row rank-${entry.rank}${current ? " current-player" : ""}">
      <div class="leaderboard-rank">${leaderboardRankLabel(entry.rank)}</div>
      <div class="leaderboard-player">
        <div class="leaderboard-name">${escapeHtml(entry.participant_name)}${current ? " · You" : ""}</div>
        <div class="leaderboard-support">${support}</div>
        <div class="leaderboard-detail"><span>${entry.tiles_completed}/24 tiles</span>${achievement ? `<span class="leaderboard-badge">${achievement}</span>` : ""}</div>
      </div>
      <div class="leaderboard-score"><strong>${entry.total_points_earned}</strong><span>PTS</span></div>
    </div>`;
  }).join("");
}

async function loadLeaderboard({ silent = false } = {}) {
  if (!silent) { leaderboardStatus.hidden = false; leaderboardStatus.textContent = "Loading standings…"; }
  try {
    const response = await fetch(`${API_BASE}/games/${GAME_ID}/leaderboard`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Server returned ${response.status}`);
    }
    renderLeaderboard(await response.json());
  } catch (error) {
    if (!silent) {
      leaderboardStatus.hidden = false;
      leaderboardStatus.textContent = `Couldn't load standings: ${error.message}`;
      leaderboardList.innerHTML = "";
    }
  }
}

function stopLeaderboardPolling() {
  if (leaderboardPollTimer) window.clearInterval(leaderboardPollTimer);
  leaderboardPollTimer = null;
}

async function openLeaderboard() {
  leaderboardBackdrop.hidden = false;
  await loadLeaderboard();
  stopLeaderboardPolling();
  if (gameStatus() === "LIVE") {
    leaderboardPollTimer = window.setInterval(() => loadLeaderboard({ silent: true }), LEADERBOARD_POLL_MS);
  }
}

function closeLeaderboard() {
  leaderboardBackdrop.hidden = true;
  stopLeaderboardPolling();
}

leadersBtn.addEventListener("click", openLeaderboard);
leaderboardCloseBtn.addEventListener("click", closeLeaderboard);
leaderboardBackdrop.addEventListener("click", event => { if (event.target === leaderboardBackdrop) closeLeaderboard(); });

// ============================================================
// SUMMARY
// ============================================================

function updateSummary(card) {
  const schoolName = displaySchoolName(card.school_name);
  const opponentName = displaySchoolName(card.opponent_name);
  document.getElementById("gameTitle").textContent = `${schoolName} vs ${opponentName}`;
  document.getElementById("gameMeta").textContent = `${card.home_away} · ${formatGameDate(card.game_date, card.game_time)}`;

  const displayName = card.participant_name || (card.player_tag.startsWith("Guest_") ? "Guest" : card.player_tag);
  document.getElementById("participantDisplayName").textContent = displayName;
  document.getElementById("supportedPlayer").textContent = card.supported_last_name
    ? `#${card.supported_jersey_number ?? ""} ${card.supported_last_name}`.trim() : "";
  document.getElementById("participantIdentity").hidden = !card.supported_roster_id;
  document.getElementById("scoreValue").textContent = card.total_points_earned;
  document.getElementById("scoreMax").textContent = `/ ${card.total_available_points}`;
  document.getElementById("tilesValue").textContent = card.tiles_completed;
  document.getElementById("bingoValue").textContent = card.blackout_awarded ? "BLACKOUT" : (card.bingo_awarded ? "YES!" : "—");
  updateGameStatusUI(card.game_status);
}

// ============================================================
// PARTICIPANT SETUP FLOW
// ============================================================

function rosterPlayerLabel(player) {
  const number = player.jersey_number != null ? `#${player.jersey_number}` : "";
  return `${number} ${player.last_name}`.trim();
}

function updateParticipantPreview() {
  const selected = setupState?.roster.find(player => player.roster_id === selectedRosterId);
  if (!selected) {
    participantPreview.textContent = "Choose a player to continue.";
    startBingoBtn.disabled = true;
    return;
  }
  const name = participantNameInput.value.trim();
  participantPreview.textContent = name ? `Display: ${name} — Supporting ${rosterPlayerLabel(selected)}` : `Supporting ${rosterPlayerLabel(selected)}`;
  startBingoBtn.disabled = false;
}

function renderRoster(setup) {
  rosterChoices.innerHTML = setup.roster.map(player => {
    const checked = player.roster_id === selectedRosterId;
    const first = escapeHtml(player.first_name || "");
    const last = escapeHtml(player.last_name || "");
    const jersey = player.jersey_number != null ? `#${escapeHtml(player.jersey_number)}` : "";
    return `<button type="button" class="roster-choice${checked ? " selected" : ""}" data-roster-id="${player.roster_id}">
      <span class="roster-jersey">${jersey}</span>
      <span class="roster-person"><strong>${last}</strong><small>${first}</small></span>
      <span class="roster-radio" aria-hidden="true"></span>
    </button>`;
  }).join("");
  rosterChoices.querySelectorAll(".roster-choice").forEach(button => {
    button.addEventListener("click", () => {
      selectedRosterId = Number(button.dataset.rosterId);
      rosterChoices.querySelectorAll(".roster-choice").forEach(item => item.classList.toggle("selected", item === button));
      updateParticipantPreview();
    });
  });
}

function showParticipantSetup(setup, force = false) {
  setupState = setup;
  selectedRosterId = setup.supported_roster_id;
  participantNameInput.value = setup.participant_name || "";
  document.getElementById("rosterTitle").textContent = `${displaySchoolName(setup.school_name).toUpperCase()} ROSTER`;
  renderRoster(setup);
  updateParticipantPreview();
  participantSetup.hidden = false;
  document.querySelector(".game-page").classList.add("setup-obscured");
  if (force) participantNameInput.focus({ preventScroll: true });
}

function hideParticipantSetup() {
  participantSetup.hidden = true;
  document.querySelector(".game-page").classList.remove("setup-obscured");
}

async function loadParticipantSetup({ force = false } = {}) {
  setupError.hidden = true;
  const response = await fetch(`${API_BASE}/games/${GAME_ID}/setup`, { headers: await bingoHeaders() });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Server returned ${response.status}`);
  }
  const setup = await response.json();
  setupState = setup;
  updateGameStatusUI(setup.game_status);
  configureStatusPolling(setup);

  if (["COMPLETED", "CANCELLED"].includes(String(setup.game_status).toUpperCase()) && !setup.setup_complete) {
    hideParticipantSetup();
    showGameStateModal(setup.game_status);
    statusMessage.hidden = false;
    statusMessage.textContent = setup.game_status === "CANCELLED"
      ? "This Bingo game was cancelled."
      : "This Bingo game has already ended.";
    return false;
  }

  if (force || !setup.setup_complete) {
    showParticipantSetup(setup, force);
    return false;
  }
  return true;
}

async function saveParticipantSetup() {
  if (!selectedRosterId) return;
  startBingoBtn.disabled = true;
  setupError.hidden = true;
  try {
    const response = await fetch(`${API_BASE}/games/${GAME_ID}/setup`, {
      method: "PUT",
      headers: { ...(await bingoHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ participant_name: participantNameInput.value.trim() || null, supported_roster_id: selectedRosterId }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Server returned ${response.status}`);
    }
    setupState = await response.json();
    hideParticipantSetup();
    showHelpModal();
  } catch (error) {
    setupError.textContent = error.message;
    setupError.hidden = false;
    startBingoBtn.disabled = false;
  }
}

async function enterGame() {
  welcomeBackdrop.hidden = true;
  if (!cardState) await loadCard();
}

participantNameInput.addEventListener("input", updateParticipantPreview);
startBingoBtn.addEventListener("click", saveParticipantSetup);
enterGameBtn.addEventListener("click", enterGame);
changeSupportBtn.addEventListener("click", async () => {
  try { await loadParticipantSetup({ force: true }); }
  catch (error) { showToast(error.message, true); }
});

// ============================================================
// FIVE-LINE TILE MARKUP
// ============================================================

function tileMarkup(tile) {
  const completed = tile.completed ? " completed" : "";
  if (tile.tile_type === "FREE") {
    return `<button class="bingo-tile tile-free" data-tile-id="${tile.card_tile_id}" disabled>
      <span class="free-star">★</span><span class="free-text">FREE</span>
    </button>`;
  }

  const eventText = escapeHtml(tile.event_name || tile.display_text || "");
  if (tile.tile_type === "PLAYER") {
    const number = tile.jersey_number != null ? `#${escapeHtml(tile.jersey_number)}` : "";
    const name = escapeHtml(tile.last_name || tile.first_name || "Player");
    return `<button class="bingo-tile tile-player${completed}" data-tile-id="${tile.card_tile_id}" data-completed="${tile.completed ? "true" : "false"}">
      <span class="tile-number">${number}</span>
      <span class="tile-name">${name}</span>
      <span class="tile-event">${eventText}</span>
      <span class="tile-points"><strong>${tile.tile_points}</strong><span>PTS</span></span>
      ${tile.completed ? '<span class="completed-x" aria-hidden="true"></span>' : ""}
    </button>`;
  }

  return `<button class="bingo-tile tile-team${completed}" data-tile-id="${tile.card_tile_id}" data-completed="${tile.completed ? "true" : "false"}">
    <span class="tile-team-name">${escapeHtml(displaySchoolName(cardState.school_name))}</span>
    <span class="tile-event">${eventText}</span>
    <span class="tile-points"><strong>${tile.tile_points}</strong><span>PTS</span></span>
    ${tile.completed ? '<span class="completed-x" aria-hidden="true"></span>' : ""}
  </button>`;
}

// ============================================================
// TRUE TEXT FITTING BY TILE REGION
// ============================================================

function elementOverflows(element) {
  return !!element && (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1);
}

function fitTextToContainer(element, maxSize, minSize) {
  if (!element || element.clientWidth <= 0 || element.clientHeight <= 0) return;
  let low = minSize, high = maxSize, best = minSize;
  element.style.fontSize = `${maxSize}px`;
  if (!elementOverflows(element)) return;
  for (let i = 0; i < 8; i += 1) {
    const size = (low + high) / 2;
    element.style.fontSize = `${size}px`;
    if (elementOverflows(element)) high = size;
    else { best = size; low = size; }
  }
  element.style.fontSize = `${best}px`;
}

function fitBingoTile(tile) {
  const compact = tile.clientWidth < 105;
  if (tile.classList.contains("tile-free")) {
    fitTextToContainer(tile.querySelector(".free-star"), compact ? 18 : 24, 11);
    fitTextToContainer(tile.querySelector(".free-text"), compact ? 23 : 40, 13);
    return;
  }
  if (tile.classList.contains("tile-player")) {
    fitTextToContainer(tile.querySelector(".tile-number"), compact ? 14 : 22, compact ? 9 : 11);
    fitTextToContainer(tile.querySelector(".tile-name"), compact ? 13 : 21, compact ? 8 : 10);
    fitTextToContainer(tile.querySelector(".tile-event"), compact ? 13 : 20, compact ? 8 : 10);
  } else {
    fitTextToContainer(tile.querySelector(".tile-team-name"), compact ? 13 : 21, compact ? 8 : 10);
    fitTextToContainer(tile.querySelector(".tile-event"), compact ? 13 : 20, compact ? 8 : 10);
  }
  fitTextToContainer(tile.querySelector(".tile-points"), compact ? 21 : 32, compact ? 11 : 14);
}

function fitAllBingoTiles() {
  if (fitFrame) cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => {
    board.querySelectorAll(".bingo-tile").forEach(fitBingoTile);
    fitFrame = null;
  });
}

const bingoBoardObserver = new ResizeObserver(fitAllBingoTiles);
bingoBoardObserver.observe(board);

// ============================================================
// BOARD RENDERING + GAME STATE GATE
// ============================================================

function renderBoard(card) {
  board.innerHTML = card.tiles.map(tileMarkup).join("");
  boardSection.hidden = false;
  statusMessage.hidden = true;

  board.querySelectorAll(".bingo-tile:not(.tile-free)").forEach(button => {
    button.addEventListener("click", () => {
      if (!isGameLive()) { showGameStateModal(); return; }
      const suppressUntil = Number(button.dataset.suppressClickUntil || 0);
      if (Date.now() < suppressUntil || button.dataset.completed === "true") return;
      completeTile(Number(button.dataset.tileId), button);
    });
    button.addEventListener("pointerdown", event => startUndoHold(event, button));
    button.addEventListener("pointerup", cancelUndoHold);
    button.addEventListener("pointercancel", cancelUndoHold);
    button.addEventListener("pointerleave", cancelUndoHold);
    button.addEventListener("contextmenu", event => { if (button.dataset.completed === "true") event.preventDefault(); });
  });
  fitAllBingoTiles();
}

async function loadCard() {
  try {
    const response = await fetch(`${API_BASE}/games/${GAME_ID}/card`, { headers: await bingoHeaders() });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Server returned ${response.status}`);
    }
    cardState = await response.json();
    updateSummary(cardState);
    renderBoard(cardState);
    configureStatusPolling(cardState);
  } catch (error) {
    console.error("[BINGO] Card load failed:", error);
    statusMessage.hidden = false;
    statusMessage.textContent = `Couldn't load your card: ${error.message}`;
  }
}

// ============================================================
// SCHEDULED GAME POLLING (ONLY WITHIN 15 MINUTES)
// ============================================================

function stopStatusPolling() {
  if (statusPollTimer) window.clearInterval(statusPollTimer);
  statusPollTimer = null;
}

function configureStatusPolling(source) {
  stopStatusPolling();
  const status = String(source?.game_status || source?.status || "").toUpperCase();
  if (status !== "SCHEDULED") return;
  const kickoff = scheduledStartMs(source);
  if (kickoff == null) return;
  const msUntilKickoff = kickoff - Date.now();
  if (msUntilKickoff > STATUS_POLL_WINDOW_MS) {
    window.setTimeout(() => configureStatusPolling(source), Math.min(msUntilKickoff - STATUS_POLL_WINDOW_MS, 2_147_000_000));
    return;
  }
  statusPollTimer = window.setInterval(refreshGameStatus, STATUS_POLL_MS);
}

async function refreshGameStatus() {
  try {
    const response = await fetch(`${API_BASE}/games/${GAME_ID}/status`);
    if (!response.ok) return;
    const state = await response.json();
    const previous = gameStatus();
    if (setupState) setupState.game_status = state.status;
    if (cardState) cardState.game_status = state.status;
    updateGameStatusUI(state.status);
    if (state.status !== "SCHEDULED") stopStatusPolling();
    if (previous !== "LIVE" && state.status === "LIVE") showToast("The game is LIVE — Bingo Bash is ready!");
    if (state.status === "COMPLETED" || state.status === "CANCELLED") showGameStateModal(state.status);
  } catch (_) {
    // Polling failures are intentionally silent; the next poll can recover.
  }
}

// ============================================================
// COMPLETE TILE
// ============================================================

async function completeTile(tileId, button) {
  if (!isGameLive()) { showGameStateModal(); return; }
  if (completingTile) return;
  completingTile = true;
  button.classList.add("pending");
  try {
    const response = await fetch(`${API_BASE}/games/${GAME_ID}/tiles/${tileId}/complete`, { method: "POST", headers: await bingoHeaders() });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Server returned ${response.status}`);
    }
    const result = await response.json();
    button.classList.remove("pending"); button.classList.add("completed"); button.dataset.completed = "true";
    if (!button.querySelector(".completed-x")) button.insertAdjacentHTML("beforeend", '<span class="completed-x" aria-hidden="true"></span>');
    Object.assign(cardState, {
      total_points_earned: result.total_points_earned,
      tile_points_earned: result.tile_points_earned,
      tiles_completed: result.tiles_completed,
      bingo_awarded: cardState.bingo_awarded || result.bingo_achieved,
      blackout_awarded: cardState.blackout_awarded || result.blackout_achieved,
    });
    const tile = cardState.tiles.find(item => item.card_tile_id === tileId);
    if (tile) { tile.completed = true; tile.points_awarded = result.points_awarded; }
    updateSummary(cardState);
    if (!leaderboardBackdrop.hidden) loadLeaderboard({ silent: true });
    if (result.blackout_awarded_now) showToast("BLACKOUT! Every square completed.");
    else if (result.bingo_awarded_now) showToast("BINGO! You completed a line.");
    else if (result.newly_completed) showToast(`+${result.points_awarded} points`);
  } catch (error) {
    button.classList.remove("pending");
    showToast(error.message, true);
  } finally { completingTile = false; }
}

// ============================================================
// TWO-SECOND LONG-PRESS UNDO
// ============================================================

function startUndoHold(event, button) {
  if (button.dataset.completed !== "true" || completingTile) return;
  if (!isGameLive()) { showGameStateModal(); return; }
  cancelUndoHold();
  event.preventDefault();
  try { button.setPointerCapture(event.pointerId); } catch (_) {}
  button.classList.add("undo-hold");
  undoHold = {
    button, pointerId: event.pointerId,
    timer: window.setTimeout(() => {
      const tileId = Number(button.dataset.tileId);
      button.dataset.suppressClickUntil = String(Date.now() + 1000);
      cancelUndoHold();
      undoTile(tileId, button);
    }, UNDO_HOLD_MS),
  };
}

function cancelUndoHold() {
  if (!undoHold) return;
  window.clearTimeout(undoHold.timer);
  undoHold.button.classList.remove("undo-hold");
  try { if (undoHold.button.hasPointerCapture?.(undoHold.pointerId)) undoHold.button.releasePointerCapture(undoHold.pointerId); } catch (_) {}
  undoHold = null;
}

async function undoTile(tileId, button) {
  if (!isGameLive()) { showGameStateModal(); return; }
  if (completingTile || button.dataset.completed !== "true") return;
  completingTile = true;
  button.classList.add("pending");
  try {
    const response = await fetch(`${API_BASE}/games/${GAME_ID}/tiles/${tileId}/complete`, { method: "DELETE", headers: await bingoHeaders() });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Server returned ${response.status}`);
    }
    const result = await response.json();
    button.classList.remove("pending", "completed", "undo-hold");
    button.dataset.completed = "false";
    button.querySelector(".completed-x")?.remove();
    Object.assign(cardState, {
      total_points_earned: result.total_points_earned,
      tile_points_earned: result.tile_points_earned,
      bingo_bonus_points: result.bingo_bonus_points,
      blackout_bonus_points: result.blackout_bonus_points,
      tiles_completed: result.tiles_completed,
      bingo_awarded: result.bingo_achieved,
      blackout_awarded: result.blackout_achieved,
      card_status: result.card_status,
    });
    const tile = cardState.tiles.find(item => item.card_tile_id === tileId);
    if (tile) { tile.completed = false; tile.points_awarded = 0; }
    updateSummary(cardState);
    if (!leaderboardBackdrop.hidden) loadLeaderboard({ silent: true });
    fitBingoTile(button);
    if (result.was_completed) showToast(`Undone: -${result.points_removed} points`);
  } catch (error) {
    button.classList.remove("pending", "undo-hold");
    showToast(error.message, true);
  } finally { completingTile = false; }
}

// ============================================================
// TOASTS + INITIALIZATION
// ============================================================

function showToast(message, isError = false) {
  document.querySelector(".game-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = `game-toast${isError ? " error" : ""}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 250); }, 2200);
}

async function initializeGame() {
  stopStatusPolling();
  try {
    const ready = await loadParticipantSetup();
    if (ready) await loadCard();
  } catch (error) {
    console.error("[BINGO] Setup load failed:", error);
    statusMessage.hidden = false;
    statusMessage.textContent = `Couldn't start Bingo: ${error.message}`;
  }
}

window.addEventListener("auth:changed", initializeGame);
initializeGame();
