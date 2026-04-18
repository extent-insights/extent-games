//
import { getUser } from "./auth.js";
import { openAuthModal } from "./auth-modal.js";

// Gate the entire form — redirect anonymous users
async function checkAccess() {
  const user = await getUser();
  if (!user) {
    // Hide the form content, show a message with a sign-in prompt
    document.getElementById("formContent").hidden = true;
    document.getElementById("accessGate").hidden  = false;
    document.getElementById("btnGateSignin").addEventListener("click", openAuthModal);
    window.addEventListener("auth:changed", async () => {
      const u = await getUser();
      if (u) {
        document.getElementById("formContent").hidden = false;
        document.getElementById("accessGate").hidden  = true;
      }
    });
  }
}

checkAccess();

// ── Config ───────────────────────────────────────────
const API_BASE = "http://192.168.1.30:8000";

// ── Shared: answer options ───────────────────────────
const LETTERS = ["A", "B", "C", "D"];
const PLACEHOLDERS = [
  "First answer option…",
  "Second answer option…",
  "Third answer option…",
  "Fourth answer option…",
];

function buildAnswerRows(containerId, radioName) {
  const block = document.getElementById(containerId);
  block.innerHTML = "";
  LETTERS.forEach((letter, i) => {
    const row = document.createElement("label");
    row.className = "answer-row";
    row.setAttribute("for", `${radioName}_${letter}`);
    row.innerHTML = `
      <div class="letter-badge">${letter}</div>
      <input class="answer-input" type="text"
        id="${radioName}_answer_${letter.toLowerCase()}"
        placeholder="${PLACEHOLDERS[i]}" maxlength="200" autocomplete="off" />
      <div class="radio-wrap">
        <input class="radio-btn" type="radio" name="${radioName}" id="${radioName}_${letter}" value="${letter}" />
        <div class="radio-visual"></div>
      </div>`;
    block.appendChild(row);
  });
}

buildAnswerRows("answersBlock",     "correct_answer");
buildAnswerRows("editAnswersBlock", "edit_correct_answer");

// Ensure modals are closed on load regardless of HTML state
document.getElementById("modalBackdrop").hidden  = true;
document.getElementById("deleteBackdrop").hidden = true;

// ── Shared: toast ────────────────────────────────────
let toastTimer;
function showToast(msg, type = "success") {
  const toast = document.getElementById("toast");
  document.getElementById("toastMsg").textContent = msg;
  document.getElementById("toastIcon").textContent = type === "success" ? "✅" : "❌";
  toast.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = ""; }, 3200);
}

// ── Tabs ─────────────────────────────────────────────
let filtersWired = false;

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.tab;
    document.getElementById("tab-add").hidden    = target !== "add";
    document.getElementById("tab-manage").hidden = target !== "manage";
    if (target === "manage") {
      wireFilters();
      loadQuestions();
    }
  });
});

// Wire filter listeners only once, only after manage tab is opened
function wireFilters() {
  if (filtersWired) return;
  filtersWired = true;
  ["filterCategory", "filterPeriod", "filterSearch"].forEach(id => {
    document.getElementById(id).addEventListener("input", renderList);
  });
}

// ── Tab 1: Add question ──────────────────────────────
const qField   = document.getElementById("question");
const qCounter = document.getElementById("qCounter");
qField.addEventListener("input", () => {
  const len = qField.value.length;
  qCounter.textContent = `${len} / 400`;
  qCounter.classList.toggle("warn", len > 350);
});

document.getElementById("triviaForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const category     = document.getElementById("category").value.trim();
  const period       = document.getElementById("period").value.trim();
  const question     = qField.value.trim();
  const answer_a     = document.getElementById("correct_answer_answer_a").value.trim();
  const answer_b     = document.getElementById("correct_answer_answer_b").value.trim();
  const answer_c     = document.getElementById("correct_answer_answer_c").value.trim();
  const answer_d     = document.getElementById("correct_answer_answer_d").value.trim();
  const correctRadio = document.querySelector('input[name="correct_answer"]:checked');

  if (!category || !period || !question || !answer_a || !answer_b || !answer_c || !answer_d) {
    showToast("Please fill in all fields.", "error"); return;
  }
  if (!correctRadio) {
    showToast("Select the correct answer.", "error"); return;
  }

  const btn = document.getElementById("submitBtn");
  const lbl = document.getElementById("btnLabel");
  const spn = document.getElementById("spinner");
  btn.disabled = true; lbl.textContent = "Saving…"; spn.style.display = "block";

  try {
    const res = await fetch(`${API_BASE}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, category, period, answer_a, answer_b, answer_c, answer_d,
        correct_answer: correctRadio.value }),
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Server error");
    const data = await res.json();
    showToast(`Question #${data.id} saved!`, "success");
    document.getElementById("triviaForm").reset();
    qCounter.textContent = "0 / 400";
  } catch (err) {
    showToast(err.message || "Could not connect to server.", "error");
  } finally {
    btn.disabled = false; lbl.textContent = "Save question"; spn.style.display = "none";
  }
});

// ── Tab 2: Manage questions ──────────────────────────
let allQuestions = [];

async function loadQuestions() {
  document.getElementById("questionList").innerHTML = '<div class="list-empty">Loading…</div>';
  try {
    const res = await fetch(`${API_BASE}/questions`);
    if (!res.ok) throw new Error("Failed to load");
    allQuestions = await res.json();
    renderList();
  } catch (err) {
    document.getElementById("questionList").innerHTML =
      `<div class="list-empty">Could not load questions — ${err.message}</div>`;
  }
}

function renderList() {
  const catFilter    = document.getElementById("filterCategory").value;
  const periodFilter = document.getElementById("filterPeriod").value;
  const search       = document.getElementById("filterSearch").value.toLowerCase().trim();

  const filtered = allQuestions.filter(q => {
    if (catFilter    && q.category !== catFilter)  return false;
    if (periodFilter && q.period   !== periodFilter) return false;
    if (search       && !q.question.toLowerCase().includes(search)) return false;
    return true;
  });

  const meta = document.getElementById("resultsMeta");
  meta.textContent = filtered.length === allQuestions.length
    ? `${allQuestions.length} questions`
    : `${filtered.length} of ${allQuestions.length} questions`;

  const list = document.getElementById("questionList");
  if (filtered.length === 0) {
    list.innerHTML = '<div class="list-empty">No questions match your filters.</div>';
    return;
  }

  list.innerHTML = filtered.map(q => `
    <div class="q-item" data-id="${q.id}">
      <div class="q-item-meta">
        <span class="q-badge">${q.category}</span>
        <span class="q-badge">${q.period}</span>
        <span class="q-badge">#${q.id}</span>
      </div>
      <div class="q-text">${q.question}</div>
      <div class="q-actions">
        <button class="btn-edit"   data-id="${q.id}">Edit</button>
        <button class="btn-delete" data-id="${q.id}">Delete</button>
      </div>
    </div>
  `).join("");

  // Attach listeners via event delegation — no onclick attributes
  list.querySelectorAll(".btn-edit").forEach(btn => {
    btn.addEventListener("click", () => openEdit(Number(btn.dataset.id)));
  });
  list.querySelectorAll(".btn-delete").forEach(btn => {
    btn.addEventListener("click", () => openDelete(Number(btn.dataset.id)));
  });
}

// ── Edit modal ───────────────────────────────────────
function openEdit(id) {
  const q = allQuestions.find(q => q.id === id);
  if (!q) return;
  document.getElementById("editId").value = q.id;
  setSelectValue("editCategory", q.category);
  setSelectValue("editPeriod",   q.period);
  document.getElementById("editQuestion").value = q.question;
  LETTERS.forEach(letter => {
    document.getElementById(`edit_correct_answer_answer_${letter.toLowerCase()}`).value =
      q[`answer_${letter.toLowerCase()}`];
  });
  const radio = document.querySelector(`input[name="edit_correct_answer"][value="${q.correct_answer}"]`);
  if (radio) radio.checked = true;
  document.getElementById("modalBackdrop").hidden = false;
}

function setSelectValue(id, value) {
  const sel = document.getElementById(id);
  for (const opt of sel.options) {
    if (opt.value === value) { sel.value = value; return; }
  }
}

function closeEdit() {
  document.getElementById("modalBackdrop").hidden = true;
  document.getElementById("editForm").reset();
}

document.getElementById("modalClose").addEventListener("click",  closeEdit);
document.getElementById("modalCancel").addEventListener("click", closeEdit);
document.getElementById("modalBackdrop").addEventListener("click", e => {
  if (e.target === e.currentTarget) closeEdit();
});

document.getElementById("editForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id           = document.getElementById("editId").value;
  const category     = document.getElementById("editCategory").value.trim();
  const period       = document.getElementById("editPeriod").value.trim();
  const question     = document.getElementById("editQuestion").value.trim();
  const answer_a     = document.getElementById("edit_correct_answer_answer_a").value.trim();
  const answer_b     = document.getElementById("edit_correct_answer_answer_b").value.trim();
  const answer_c     = document.getElementById("edit_correct_answer_answer_c").value.trim();
  const answer_d     = document.getElementById("edit_correct_answer_answer_d").value.trim();
  const correctRadio = document.querySelector('input[name="edit_correct_answer"]:checked');

  if (!category || !period || !question || !answer_a || !answer_b || !answer_c || !answer_d) {
    showToast("Please fill in all fields.", "error"); return;
  }
  if (!correctRadio) {
    showToast("Select the correct answer.", "error"); return;
  }

  const btn = document.getElementById("editSubmitBtn");
  const lbl = document.getElementById("editBtnLabel");
  const spn = document.getElementById("editSpinner");
  btn.disabled = true; lbl.textContent = "Saving…"; spn.style.display = "block";

  try {
    const res = await fetch(`${API_BASE}/questions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, category, period, answer_a, answer_b, answer_c, answer_d,
        correct_answer: correctRadio.value }),
    });
    if (!res.ok) throw new Error((await res.json()).detail || "Server error");
    showToast("Question updated!", "success");
    closeEdit();
    await loadQuestions();
  } catch (err) {
    showToast(err.message || "Could not save changes.", "error");
  } finally {
    btn.disabled = false; lbl.textContent = "Save changes"; spn.style.display = "none";
  }
});

// ── Delete modal ─────────────────────────────────────
let pendingDeleteId = null;

function openDelete(id) {
  const q = allQuestions.find(q => q.id === id);
  if (!q) return;
  pendingDeleteId = id;
  document.getElementById("deletePreview").textContent = q.question;
  document.getElementById("deleteBackdrop").hidden = false;
}

function closeDelete() {
  document.getElementById("deleteBackdrop").hidden = true;
  pendingDeleteId = null;
}

document.getElementById("deleteClose").addEventListener("click",  closeDelete);
document.getElementById("deleteCancel").addEventListener("click", closeDelete);
document.getElementById("deleteBackdrop").addEventListener("click", e => {
  if (e.target === e.currentTarget) closeDelete();
});

document.getElementById("deleteConfirm").addEventListener("click", async () => {
  if (!pendingDeleteId) return;
  try {
    const res = await fetch(`${API_BASE}/questions/${pendingDeleteId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed");
    showToast("Question deleted.", "success");
    closeDelete();
    await loadQuestions();
  } catch (err) {
    showToast(err.message || "Could not delete.", "error");
  }
});

