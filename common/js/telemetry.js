// ── Shared telemetry client ──────────────────────────────────────────────────
import { getUser } from "./auth.js";

const ANONYMOUS_ID_KEY = "extent_telemetry_anonymous_id";
const RETRY_QUEUE_KEY = "extent_telemetry_retry_queue_v1";
const MAX_QUEUED_EVENTS = 100;


// ── Identifiers ──────────────────────────────────────────────────────────────
function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // RFC 4122 version 4 fallback for browsers without randomUUID().
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}


function getAnonymousId() {
  try {
    const existing = localStorage.getItem(ANONYMOUS_ID_KEY);
    if (existing) return existing;

    const created = newId();
    localStorage.setItem(ANONYMOUS_ID_KEY, created);
    return created;
  } catch (_) {
    // Privacy modes can disable localStorage. The event still remains usable
    // within this page load, but cannot be joined across later visits.
    return newId();
  }
}


// ── Retry queue ──────────────────────────────────────────────────────────────
function readQueue() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RETRY_QUEUE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}


function writeQueue(queue) {
  try {
    localStorage.setItem(
      RETRY_QUEUE_KEY,
      JSON.stringify(queue.slice(-MAX_QUEUED_EVENTS))
    );
  } catch (_) {
    // Telemetry must never prevent gameplay when storage is unavailable.
  }
}


function queueFailedEvent(endpoint, payload) {
  const queue = readQueue();
  if (!queue.some(item => item.payload?.event_id === payload.event_id)) {
    queue.push({ endpoint, payload });
    writeQueue(queue);
  }
}


async function send(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  });

  if (!response.ok) {
    throw new Error(`Telemetry request failed (${response.status})`);
  }

  return response.json().catch(() => ({ logged: true }));
}


async function flushRetryQueue() {
  const queue = readQueue();
  if (!queue.length) return;

  const remaining = [];
  for (const item of queue) {
    try {
      await send(item.endpoint, item.payload);
    } catch (_) {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
}


// ── Client factory ───────────────────────────────────────────────────────────
export function createTelemetryClient({ apiBase, game }) {
  if (!apiBase || !game) {
    throw new Error("Telemetry requires both apiBase and game");
  }

  const endpoint = `${apiBase.replace(/\/$/, "")}/log_event`;
  const sessionId = newId();
  const anonymousId = getAnonymousId();
  let gameSessionId = null;
  let cachedUserId;

  async function resolveUserId() {
    if (cachedUserId !== undefined) return cachedUserId;
    try {
      const user = await getUser();
      cachedUserId = user?.id ?? null;
    } catch (_) {
      cachedUserId = null;
    }
    return cachedUserId;
  }

  async function log(eventName, properties = {}) {
    const payload = {
      event_id: newId(),
      event_name: eventName,
      event_version: 1,
      occurred_at: new Date().toISOString(),
      game,
      session_id: sessionId,
      game_session_id: gameSessionId,
      user_id: await resolveUserId(),
      anonymous_id: anonymousId,
      browser: navigator.userAgent,
      device: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
      locale: navigator.language,
      screen_width: window.screen.width,
      screen_height: window.screen.height,
      properties,
    };

    try {
      const result = await send(endpoint, payload);
      return { sent: true, eventId: payload.event_id, result };
    } catch (error) {
      queueFailedEvent(endpoint, payload);
      console.warn("Telemetry queued for retry:", error.message);
      return { sent: false, eventId: payload.event_id, error };
    }
  }

  function setGameSessionId(value) {
    gameSessionId = value == null ? null : String(value);
  }

  // Retry once at startup and whenever connectivity returns. Event IDs make
  // replay safe even when the original response was lost after persistence.
  void flushRetryQueue();
  window.addEventListener("online", () => { void flushRetryQueue(); });

  return {
    log,
    setGameSessionId,
    getSessionId: () => sessionId,
    flush: flushRetryQueue,
  };
}
