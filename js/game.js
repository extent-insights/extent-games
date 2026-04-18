//
import { authHeaders, getUser } from "./auth.js";
//
// ── Config ───────────────────────────────────────
const API_BASE = "http://192.168.1.30:8000";

// ── Parse URL params ─────────────────────────────
const params   = new URLSearchParams(window.location.search);
const MODE     = params.get("mode")     || "daily";
const COUNT    = parseInt(params.get("count") || "10");
const CATEGORY = params.get("category") || "";
const PERIOD   = params.get("period")   || "";

// ── Mode config ──────────────────────────────────
const MODE_CONFIG = {
  daily:    { label: "Daily Run",   timed: false, lives: null,  endless: false },
  speed:    { label: "Speed Run",   timed: true,  lives: null,  endless: false },
  survival: { label: "Survival",    timed: false, lives: 1,     endless: true  },
  challenge:{ label: "Challenge",   timed: false, lives: null,  endless: false },
  custom:   { label: "Custom",      timed: false, lives: null,  endless: false },
};

const config = MODE_CONFIG[MODE] || MODE_CONFIG.daily;

// ── State ────────────────────────────────────────
let questions    = [];
let currentIndex = 0;
let score        = 0;
let lives        = config.lives;
let answered     = false;
let timerInterval = null;
let questionStartTime = 0;
let totalTime    = 0;
let correctCount = 0;

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

if (config.timed) {
  hudTimer.hidden = false;
}

if (MODE === "challenge") {
  shareBtn.hidden = false;
}

// ── Load questions ───────────────────────────────
async function loadQuestions() {
  try {
    const url = new URL(`${API_BASE}/questions`);
    if (CATEGORY) url.searchParams.set("category", CATEGORY);
    if (PERIOD)   url.searchParams.set("period",   PERIOD);

    const headers = await authHeaders();  // empty {} if anonymous
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error("Failed to fetch questions");
    let all = await res.json();

    all = all.sort(() => Math.random() - 0.5);
    questions = config.endless ? all : all.slice(0, COUNT);

    if (questions.length === 0) {
      questionText.textContent = "No questions found.";
      return;
    }
    showQuestion();
  } catch (err) {
    questionText.textContent = `Error loading questions: ${err.message}`;
  }
}

// ── Show question ────────────────────────────────
function showQuestion() {
  answered = false;
  feedback.hidden = true;
  nextBtn.hidden  = true;
  feedback.className = "feedback";

  const q = questions[currentIndex];
  qCategory.textContent = q.category;
  qPeriod.textContent   = q.period;
  questionText.textContent = q.question;

  const letters = ["a", "b", "c", "d"];
  answerBtns.forEach((btn, i) => {
    btn.className = "answer-btn";
    btn.disabled  = false;
    btn.querySelector(".answer-text").textContent = q[`answer_${letters[i]}`];
  });

  // Progress
  const total   = config.endless ? "∞" : questions.length;
  const current = currentIndex + 1;
  hudProgress.textContent = `${current} / ${total}`;

  if (!config.endless) {
    progressBar.style.width = `${(currentIndex / questions.length) * 100}%`;
  } else {
    progressBar.style.width = "0%";
  }

  // Timer
  if (config.timed) {
    startQuestionTimer();
  }
}

// ── Timer (speed run) ────────────────────────────
function startQuestionTimer() {
  clearInterval(timerInterval);
  questionStartTime = Date.now();
  timerValue.className = "";

  timerInterval = setInterval(() => {
    const elapsed = ((Date.now() - questionStartTime) / 1000).toFixed(1);
    timerValue.textContent = `${elapsed}s`;

    if (elapsed >= 15) {
      timerValue.className = "danger";
    } else if (elapsed >= 8) {
      timerValue.className = "warn";
    }
  }, 100);
}

function stopTimer() {
  clearInterval(timerInterval);
  return (Date.now() - questionStartTime) / 1000;
}

// ── Handle answer ────────────────────────────────
answerBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    if (answered) return;
    answered = true;

    let elapsed = 0;
    if (config.timed) elapsed = stopTimer();

    const chosen  = btn.dataset.letter;
    const correct = questions[currentIndex].correct_answer;
    const isRight = chosen === correct;

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
        // Speed bonus: max 1000, decays over 30s
        const bonus = Math.max(100, Math.round(1000 - (elapsed * 30)));
        score += bonus;
      } else {
        score += 100;
      }
      scoreValue.textContent = score;
    }

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

      // Survival: lose a life
      if (config.lives) {
        lives--;
        livesValue.textContent = lives > 0 ? "❤️".repeat(lives) : "💀";
        if (lives <= 0) {
          setTimeout(endGame, 900);
          return;
        }
      }
    }

    // Auto-advance or show next button
    const isLast = !config.endless && currentIndex >= questions.length - 1;
    if (isLast) {
      nextBtn.textContent = "See results";
      nextBtn.hidden = false;
    } else {
      nextBtn.textContent = "Next question →";
      nextBtn.hidden = false;
    }
  });
});

// ── Next question ────────────────────────────────
nextBtn.addEventListener("click", () => {
  const isLast = !config.endless && currentIndex >= questions.length - 1;
  if (isLast) {
    endGame();
  } else {
    currentIndex++;
    showQuestion();
  }
});

// ── End game ─────────────────────────────────────
async function endGame() {
  progressBar.style.width = "100%";

  const total    = config.endless ? currentIndex + 1 : questions.length;
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  endIcon.textContent  = correctCount === total ? "🏆" : correctCount > total / 2 ? "🎉" : "😅";
  endTitle.textContent = correctCount === total ? "Perfect score!" : "Game over";
  endScore.textContent = `${score} pts`;
  endStats.innerHTML   =
    `${correctCount} of ${total} correct &nbsp;·&nbsp; ${accuracy}% accuracy` +
    (config.timed ? `<br>Avg time per question: coming soon` : "");

  endScreen.hidden = false;

  // Submit score if logged in — silently skipped by backend if anonymous
  try {
    const headers = await authHeaders();
    await fetch(`${API_BASE}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        mode:     MODE,
        score:    score,
        total:    total,
        category: CATEGORY || null,
        period:   PERIOD   || null,
      })
    });
  } catch (err) {
    console.warn("Score not saved:", err.message);
  }
}
// ── Challenge: copy link ─────────────────────────
shareBtn.addEventListener("click", () => {
  const link = `${window.location.origin}/game.html?mode=challenge&score=${score}&count=${COUNT}`;
  navigator.clipboard.writeText(link).then(() => {
    shareBtn.textContent = "Copied!";
    setTimeout(() => { shareBtn.textContent = "Copy challenge link"; }, 2000);
  });
});

// ── Quit ─────────────────────────────────────────
document.getElementById("quitBtn").addEventListener("click", () => {
  quitBackdrop.hidden = false;
});

document.getElementById("quitCancel").addEventListener("click", () => {
  quitBackdrop.hidden = true;
});

document.getElementById("quitConfirm").addEventListener("click", () => {
  window.location.href = "index.html";
});

// ── Start ────────────────────────────────────────
loadQuestions();
