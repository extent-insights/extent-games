// ── Config ──────────────────────────────────────────
const API_BASE = "http://localhost:8000"; // change to your deployed URL

// ── Build answer rows ───────────────────────────────
const letters = ["A", "B", "C", "D"];
const placeholders = [
  "First answer option…",
  "Second answer option…",
  "Third answer option…",
  "Fourth answer option…",
];
const answersBlock = document.getElementById("answersBlock");

letters.forEach((letter, i) => {
  const row = document.createElement("label");
  row.className = "answer-row";
  row.setAttribute("for", `radio_${letter}`);
  row.innerHTML = `
    <div class="letter-badge">${letter}</div>
    <input
      class="answer-input"
      type="text"
      id="answer_${letter.toLowerCase()}"
      name="answer_${letter.toLowerCase()}"
      placeholder="${placeholders[i]}"
      maxlength="200"
      required
      autocomplete="off"
    />
    <div class="radio-wrap">
      <input class="radio-btn" type="radio" name="correct_answer" id="radio_${letter}" value="${letter}" />
      <div class="radio-visual"></div>
    </div>
  `;
  answersBlock.appendChild(row);
});

// ── Char counter ────────────────────────────────────
const qField   = document.getElementById("question");
const qCounter = document.getElementById("qCounter");

qField.addEventListener("input", () => {
  const len = qField.value.length;
  qCounter.textContent = `${len} / 400`;
  qCounter.classList.toggle("warn", len > 350);
});

// ── Toast ───────────────────────────────────────────
let toastTimer;

function showToast(msg, type = "success") {
  const toast = document.getElementById("toast");
  document.getElementById("toastMsg").textContent = msg;
  document.getElementById("toastIcon").textContent = type === "success" ? "✅" : "❌";
  toast.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = ""; }, 3200);
}

// ── Form reset ──────────────────────────────────────
function resetForm() {
  document.getElementById("triviaForm").reset();
  qCounter.textContent = "0 / 400";
}

// ── Submit ──────────────────────────────────────────
document.getElementById("triviaForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const category     = document.getElementById("category").value.trim();
  const decade       = document.getElementById("decade").value.trim();
  const question     = document.getElementById("question").value.trim();
  const answer_a     = document.getElementById("answer_a").value.trim();
  const answer_b     = document.getElementById("answer_b").value.trim();
  const answer_c     = document.getElementById("answer_c").value.trim();
  const answer_d     = document.getElementById("answer_d").value.trim();
  const correctRadio = document.querySelector('input[name="correct_answer"]:checked');

  if (!category || !decade || !question || !answer_a || !answer_b || !answer_c || !answer_d) {
    showToast("Please fill in all fields.", "error");
    return;
  }
  if (!correctRadio) {
    showToast("Select the correct answer.", "error");
    return;
  }

  const payload = {
    question,
    category,
    decade,
    answer_a,
    answer_b,
    answer_c,
    answer_d,
    correct_answer: correctRadio.value,
  };

  const btn     = document.getElementById("submitBtn");
  const label   = document.getElementById("btnLabel");
  const spinner = document.getElementById("spinner");
  btn.disabled          = true;
  label.textContent     = "Saving…";
  spinner.style.display = "block";

  try {
    const res = await fetch(`${API_BASE}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Server error");
    }

    const data = await res.json();
    showToast(`Question #${data.id} saved!`, "success");
    resetForm();
  } catch (err) {
    showToast(err.message || "Could not connect to server.", "error");
  } finally {
    btn.disabled          = false;
    label.textContent     = "Save question";
    spinner.style.display = "none";
  }
});
