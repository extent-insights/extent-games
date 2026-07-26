import { authHeaders, getUser } from "./auth.js";

// ── Config ───────────────────────────────────────
import { API_BASE } from "./config.js";

// ── Parse URL params ─────────────────────────────
const params   = new URLSearchParams(window.location.search);
const MODE     = params.get("mode")     || "daily";
const COUNT    = parseInt(params.get("count") || "10");
const CATEGORY = params.get("category") || "";
const PERIOD   = params.get("period")   || "";

// ── Mode config ──────────────────────────────────
const MODE_CONFIG = {
  daily:    { label: "Daily Run",   timed: false, lives: null, endless: false },
  speed:    { label: "Speed Run",   timed: true,  lives: null, endless: false },
  survival: { label: "Survival",    timed: false, lives: 1,    endless: true  },
  challenge:{ label: "Challenge",   timed: false, lives: null, endless: false },
  custom:   { label: "Custom",      timed: false, lives: null, endless: false },
};

const config = MODE_CONFIG[MODE] || MODE_CONFIG.daily;

// ── State ────────────────────────────────────────
let questions     = [];
let currentIndex  = 0;
let score         = 0;
let lives         = config.lives;
let answered      = false;
let timerInterval = null;
let questionStartTime = 0;
let totalTime     = 0;
let correctCount  = 0;

// ── Session ID — unique per game, used for log correlation ───────────────────
const SESSION_ID = (typeof crypto !== "undefined" && crypto.randomUUID)
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2) + Date.now().toString(36);

// ── DOM refs ─────────────────────────────────────
const hudMode      = document.getElementById("hudMode");
const hudProgress  = document.getElementById("hudProgress");
const progressBar  = document.getElementById("progressBar");
const hudLives     = document.getElementById("hudLives");
const livesValue   = document.getElementById("livesValue");
const hudTimer     = document.getElementById("hudTimer");
const timerValue   = document.getElementById("timerValue");
const scoreValue   = document.getElementById("scoreValue");
const qCategory    = document.getElementById("qCategory");
const qPeriod      = document.getElementById("qPeriod");
const questionText = document.getElementById("questionText");
const answerBtns   = document.querySelectorAll(".answer-btn");
const feedback     = document.getElementById("feedback");
const feedbackIcon = document.getElementById("feedbackIcon");
const feedbackText = document.getElementById("feedbackText");
const nextBtn      = document.getElementById("nextBtn");
const endScreen    = document.getElementById("endScreen");
const endIcon      = document.getElementById("endIcon");
const endTitle     = document.getElementById("endTitle");
const endScore     = document.getElementById("endScore");
const endStats     = document.getElementById("endStats");
const shareBtn     = document.getElementById("shareBtn");
const quitBackdrop = document.getElementById("quitBackdrop");

// ── Init HUD ─────────────────────────────────────
hudMode.textContent = config.label;

if (config.lives) {
  hudLives.hidden = false;
  livesValue.textContent = "❤️".repeat(config.lives);
}

if (config.timed)       hudTimer.hidden = false;
if (MODE === "challenge") shareBtn.hidden = false;

// ── Logging ───────────────────────────────────────────────────────────────────
// Events NOT including game state (fired before questions load)
const EVENTS_WITHOUT_GAME_STATE = ["session_start"];

async function logEvent(eventType, extraState = {}) {
  const includeGameState = !EVENTS_WITHOUT_GAME_STATE.includes(eventType);

  // Get user_id if logged in — null for anonymous
  const user = await getUser();

  const payload = {
    event_type:   eventType,
    session_id:   SESSION_ID,
    user_id:      user?.id ?? null,
    browser:      navigator.userAgent,
    device:       /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
    locale:       navigator.language,
    screen_width:  window.screen.width,
    screen_height: window.screen.height,
    game_state: includeGameState ? {
      mode:           MODE,
      category:       CATEGORY || null,
      period:         PERIOD   || null,
      question_index: currentIndex,
      score:          score,
      correct_count:  correctCount,
      total:          config.endless ? null : questions.length,
      lives:          lives,
      ...extraState,
    } : null,
  };

  try {
    await fetch(`${API_BASE}/log_event`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("Logging failed:", err.message);
  }
}

// ── Load questions ────────────────────────────────
async function loadQuestions() {
  await logEvent("session_start");

  try {
    const token = params.get("token");

    // Challenge mode with a server-side token
    if (MODE === "challenge" && token) {
      const res = await fetch(`${API_BASE}/challenges/${token}`);
      if (!res.ok) throw new Error("Challenge not found or expired");
      const challenge = await res.json();

      // Fetch only the pinned question IDs
      const url = new URL(`${API_BASE}/questions`);
      url.searchParams.set("ids", challenge.question_ids.join(","));
      const qRes = await fetch(url, { headers: await authHeaders() });
      let all = await qRes.json();

      // Sort to match the original order
      const idOrder = challenge.question_ids;
      questions = idOrder.map(id => all.find(q => q.id === id)).filter(Boolean);

    } else {
      // Normal game — fetch and shuffle as usual
      const url = new URL(`${API_BASE}/questions`);
      if (CATEGORY) url.searchParams.set("category", CATEGORY);
      if (PERIOD)   url.searchParams.set("period",   PERIOD);
      const res = await fetch(url, { headers: await authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch questions");
      let all = await res.json();
      all = all.sort(() => Math.random() - 0.5);
      questions = config.endless ? all : all.slice(0, COUNT);
    }

    if (questions.length === 0) {
      questionText.textContent = "No questions found.";
      return;
    }

    await logEvent("game_start");
    showQuestion();
  } catch (err) {
    questionText.textContent = `Error loading questions: ${err.message}`;
  }
}

// ── Show question ─────────────────────────────────
function showQuestion() {
  answered = false;
  feedback.hidden = true;
  nextBtn.hidden  = true;
  feedback.className = "feedback";

  const q = questions[currentIndex];
  qCategory.textContent    = q.category;
  qPeriod.textContent      = q.period;
  questionText.textContent = q.question;

  // Build answer array with original letters attached
  const answerPool = ["a", "b", "c", "d"].map(letter => ({
    letter: letter.toUpperCase(),
    text:   q[`answer_${letter}`],
  }));

  // Shuffle the pool
  for (let i = answerPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [answerPool[i], answerPool[j]] = [answerPool[j], answerPool[i]];
  }

  // Assign shuffled answers to buttons A→D and track which button now holds the correct answer
  const displayLetters = ["A", "B", "C", "D"];
  let shuffledCorrect = "";

  answerBtns.forEach((btn, i) => {
    btn.className = "answer-btn";
    btn.disabled  = false;
    btn.dataset.letter = displayLetters[i];   // button position stays A, B, C, D
    btn.querySelector(".answer-text").textContent = answerPool[i].text;

    // If this slot now holds the originally correct answer, record it
    if (answerPool[i].letter === q.correct_answer.toUpperCase()) {
      shuffledCorrect = displayLetters[i];
    }
  });

  // Store the shuffled correct answer on the question object for use in the click handler
  questions[currentIndex]._shuffledCorrect = shuffledCorrect;

  // Progress
  const total   = config.endless ? "∞" : questions.length;
  const current = currentIndex + 1;
  hudProgress.textContent = `${current} / ${total}`;

  if (!config.endless) {
    progressBar.style.width = `${(currentIndex / questions.length) * 100}%`;
  } else {
    progressBar.style.width = "0%";
  }

  if (config.timed) startQuestionTimer();

  // Log that a question was shown
  logEvent("question_shown", {
    question: {
      question_id:    q.id,
      question_index: currentIndex,
      category:       q.category,
      period:         q.period,
    }
  });
}

// ── Timer (speed run) ─────────────────────────────
function startQuestionTimer() {
  clearInterval(timerInterval);
  questionStartTime = Date.now();
  timerValue.className = "";

  timerInterval = setInterval(() => {
    const elapsed = ((Date.now() - questionStartTime) / 1000).toFixed(1);
    timerValue.textContent = `${elapsed}s`;
    if (elapsed >= 15)     timerValue.className = "danger";
    else if (elapsed >= 8) timerValue.className = "warn";
  }, 100);
}

function stopTimer() {
  clearInterval(timerInterval);
  return (Date.now() - questionStartTime) / 1000;
}

// ── Handle answer ─────────────────────────────────
answerBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    if (answered) return;
    answered = true;

    let elapsed = 0;
    if (config.timed) elapsed = stopTimer();

    const chosen  = btn.dataset.letter;
    const correct = questions[currentIndex]._shuffledCorrect;
    const isRight = chosen === correct;
    const q       = questions[currentIndex];

    // Highlight buttons
    answerBtns.forEach(b => {
      b.disabled = true;
      if (b.dataset.letter === correct) b.classList.add("correct");
      if (b === btn && !isRight)        b.classList.add("wrong");
    });

    // Score
    if (isRight) {
      correctCount++;
      if (config.timed) {
        const bonus = Math.max(100, Math.round(1000 - (elapsed * 30)));
        score += bonus;
      } else {
        score += 100;
      }
      scoreValue.textContent = score;
    }

    // Log the answer
    logEvent("answer_selected", {
      question: {
        question_id:    q.id,
        question_index: currentIndex,
        category:       q.category,
        period:         q.period,
        chosen_answer:  chosen,
        correct:        isRight,
        time_taken_s:   config.timed ? parseFloat(elapsed.toFixed(2)) : null,
      }
    });

    // Feedback
    feedback.hidden = false;
    if (isRight) {
      feedback.classList.add("correct");
      feedbackIcon.textContent = "✓";
      feedbackText.textContent = config.timed
        ? `Correct! +${Math.max(100, Math.round(1000 - (elapsed * 30)))} pts (${elapsed.toFixed(1)}s)`
        : "Correct!";
    } else {
      feedback.classList.add("wrong");
      feedbackIcon.textContent = "✗";
      feedbackText.textContent = `Wrong. The answer was ${correct}.`;

      if (config.lives) {
        lives--;
        livesValue.textContent = lives > 0 ? "❤️".repeat(lives) : "💀";
        if (lives <= 0) {
          setTimeout(endGame, 900);
          return;
        }
      }
    }

    const isLast = !config.endless && currentIndex >= questions.length - 1;
    nextBtn.textContent = isLast ? "See results" : "Next question →";
    nextBtn.hidden = false;
  });
});

// ── Next question ─────────────────────────────────
nextBtn.addEventListener("click", () => {
  const isLast = !config.endless && currentIndex >= questions.length - 1;
  if (isLast) {
    endGame();
  } else {
    currentIndex++;
    showQuestion();
  }
});

// ── End game ──────────────────────────────────────
async function endGame() {
  progressBar.style.width = "100%";

  const total    = config.endless ? currentIndex + 1 : questions.length;
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const won      = correctCount === total;

  endIcon.textContent  = won ? "🏆" : correctCount > total / 2 ? "🎉" : "😅";
  endTitle.textContent = won ? "Perfect score!" : "Game over";
  endScore.textContent = `${score} pts`;
  endStats.innerHTML   =
    `${correctCount} of ${total} correct &nbsp;·&nbsp; ${accuracy}% accuracy` +
    (config.timed ? `<br>Avg time per question: coming soon` : "");

  endScreen.hidden = false;

  // Log game end
  await logEvent("game_end", {
    won:           won,
    correct_count: correctCount,
    total:         total,
    score:         score,
  });

  // Save score to DB (silently ignored by backend if anonymous)
  try {
    const headers = await authHeaders();
    await fetch(`${API_BASE}/scores`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        mode:     MODE,
        score:    score,
        total:    total,
        category: CATEGORY || null,
        period:   PERIOD   || null,
      }),
    });
  } catch (err) {
    console.warn("Score not saved:", err.message);
  }
}

// ── Challenge: copy link ──────────────────────────
shareBtn.addEventListener("click", async () => {
  shareBtn.textContent = "Generating link…";
  shareBtn.disabled    = true;

  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/challenges`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        question_ids: questions.map(q => q.id),
        score:        score,
        mode:         MODE,
      }),
    });

    if (!res.ok) throw new Error("Could not create challenge");
    const { token } = await res.json();
    const basePath = window.location.pathname.replace("game.html", "");
    const link = `${window.location.origin}${basePath}game.html?mode=challenge&token=${token}`;

    // Copy to clipboard with HTTP fallback
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(link);
    } else {
      const el = document.createElement("textarea");
      el.value = link;
      el.style.position = "fixed";
      el.style.opacity  = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }

    shareBtn.textContent = "Link copied!";
    setTimeout(() => {
      shareBtn.textContent = "Copy challenge link";
      shareBtn.disabled    = false;
    }, 2000);

  } catch (err) {
    console.warn("Challenge creation failed:", err.message);
    shareBtn.textContent = "Failed — try again";
    shareBtn.disabled    = false;
  }
});

// ── Quit ──────────────────────────────────────────
document.getElementById("quitBtn").addEventListener("click", () => {
  quitBackdrop.hidden = false;
});

document.getElementById("quitCancel").addEventListener("click", () => {
  quitBackdrop.hidden = true;
});

document.getElementById("quitConfirm").addEventListener("click", () => {
  window.location.href = "index.html";
});

// ── Start ─────────────────────────────────────────
loadQuestions();
