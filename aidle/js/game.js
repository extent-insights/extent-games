import { API_BASE, IS_LOCAL_DEV } from "./config.js";
import { initGameAuthUI } from "../../common/js/game-auth-ui.js";
import { createTelemetryClient } from "../../common/js/telemetry.js";

initGameAuthUI({
    apiBase: API_BASE,
    promptForMissingTag: true
});

const telemetry = createTelemetryClient({
    apiBase: API_BASE,
    game: "aidle"
});

// ── Game ──────────────────────────────────────────
async function initGame() {
    const WORD_SIZE = 5;
    const MAX_GUESSES = 6;
    const ENTER_KEY = "ENTER";
    const BACK_KEY = "BACK";
    const COLOR_PRIORITY = { "": 0, absent: 1, present: 2, repeated: 2, correct: 3, repeated_correct: 4 };

    const clockEl = document.getElementById("clock");
    const gameBoard = document.getElementById("game-board");
    const keyboard = document.getElementById("keyboard");
    const message = document.getElementById("message");
    const playerRaceStatus = document.getElementById("playerRaceStatus");
    const aiRaceStatus = document.getElementById("aiRaceStatus");
    const aiReveal = document.getElementById("aiReveal");
    const debugTargetPanel = document.getElementById("debugTargetPanel");
    const debugTargetWord = document.getElementById("debugTargetWord");
    const debugRestartTarget = document.getElementById("debugRestartTarget");
    const debugClearTarget = document.getElementById("debugClearTarget");

    // Frontend visibility is convenience only. The backend independently
    // enforces APP_ENV + AIDLE_DEBUG_FORCE_WORD before honoring a target.
    if (IS_LOCAL_DEV && debugTargetPanel) {
        debugTargetPanel.hidden = false;
    }

    if (debugTargetWord) {
        debugTargetWord.addEventListener("input", () => {
            debugTargetWord.value = debugTargetWord.value
                .toUpperCase()
                .replace(/[^A-Z]/g, "")
                .slice(0, WORD_SIZE);
        });
    }

    if (debugRestartTarget) {
        debugRestartTarget.addEventListener("click", () => {
            const word = (debugTargetWord?.value || "").trim().toUpperCase();
            if (word.length !== WORD_SIZE) {
                showMessage(`Enter a ${WORD_SIZE}-letter target word`);
                return;
            }
            const next = new URL(window.location.href);
            next.searchParams.set("target", word);
            window.location.assign(next.toString());
        });
    }

    if (debugClearTarget) {
        debugClearTarget.addEventListener("click", () => {
            const next = new URL(window.location.href);
            next.searchParams.delete("target");
            window.location.assign(next.toString());
        });
    }

    let dictionary = [];
    let gameToken = null;
    let currentRow = 0;
    let currentWord = "";
    let gameOver = false;
    const params = new URLSearchParams(window.location.search);
    const requestedDifficulty = (params.get("difficulty") || "medium").toLowerCase();
    const difficulty = ["easy", "medium", "hard"].includes(requestedDifficulty)
        ? requestedDifficulty
        : "medium";
    const gameDifficulty = document.getElementById("gameDifficulty");
    if (gameDifficulty) gameDifficulty.textContent = `${difficulty.toUpperCase()} AI`;
    const requestedTarget = IS_LOCAL_DEV
        ? (params.get("target") || "").trim().toUpperCase()
        : "";
    if (debugTargetWord && requestedTarget) {
        debugTargetWord.value = requestedTarget;
    }

    let aiState = { difficulty, turn: 0, solved: false, candidates_remaining: 0 };
    let playerConfig = { green: true, yellow: true, gray: true, repeated: false };
    const keyStates = {};

    updateClock();
    setInterval(updateClock, 1000);

    function updateClock() {
        clockEl.textContent = new Date().toLocaleTimeString();
    }

    function getGameState() {
        const tiles = [...gameBoard.querySelectorAll(".board-row")].map(row =>
            [...row.querySelectorAll(".tile")].map(tile => ({
                letter: tile.querySelector("span").dataset.letter,
                status: [...tile.classList].find(c => ["correct", "present", "absent", "repeated", "repeated_correct"].includes(c)) || null
            }))
        );

        const correctPosition = Array(WORD_SIZE).fill(null);
        const correctLetter = Array(WORD_SIZE).fill(null);
        const usedLetters = [];

        tiles.slice(0, currentRow).forEach(row => {
            row.forEach((tile, i) => {
                if (!tile.letter) return;
                if (!usedLetters.includes(tile.letter)) usedLetters.push(tile.letter);
                if (tile.status === "correct" || tile.status === "repeated_correct") correctPosition[i] = tile.letter;
                if (tile.status === "present" || tile.status === "repeated") correctLetter[i] = tile.letter;
            });
        });

        return {
            guess_number: currentRow,
            current_guess: currentWord || null,
            correct_position: correctPosition,
            correct_letter: correctLetter,
            used_letters: usedLetters,
        };
    }

    const EVENTS_WITHOUT_GAME_STATE = ["session_start"];

    async function logEvent(eventType, extraState = {}) {
        if (!gameToken) return;
        const includeGameState = !EVENTS_WITHOUT_GAME_STATE.includes(eventType);

        return telemetry.track(
            eventType,
            includeGameState ? { ...getGameState(), ...extraState } : {}
        );
    }

    try {
        const startParams = new URLSearchParams({
            word_size: String(WORD_SIZE),
            difficulty,
        });
        if (requestedTarget) {
            startParams.set("target", requestedTarget);
        }

        const res = await fetch(`${API_BASE}/start?${startParams.toString()}`);
        if (!res.ok) throw new Error(`Start failed (${res.status})`);
        const data = await res.json();
        dictionary = data.dictionary;
        gameToken = data.token;
        telemetry.setSessionId(gameToken);
        playerConfig = data.player_config || playerConfig;
        aiState = data.ai || aiState;
        updateRaceStatus();
        console.log(`AIDLE started (${difficulty}), dictionary loaded:`, dictionary.length);
    } catch (err) {
        console.error("Failed to start AIDLE:", err);
        showMessage("Unable to start game. Please refresh.");
        gameOver = true;
        return;
    }

    createBoard();
    createKeyboard();
    await logEvent("session_start");
    await logEvent("game_start", { ai_difficulty: difficulty });

    function getTiles(rowIndex) {
        return gameBoard.children[rowIndex].querySelectorAll(".tile");
    }

    function updateRaceStatus() {
        if (playerRaceStatus) {
            playerRaceStatus.textContent = `${currentRow} / ${MAX_GUESSES} guesses`;
        }
        if (aiRaceStatus) {
            const turn = aiState?.turn ?? 0;
            const candidates = aiState?.candidates_remaining ?? 0;
            const mode = (aiState?.difficulty || difficulty).toUpperCase();
            if (aiState?.solved) {
                aiRaceStatus.textContent = `${mode} · Solved on guess ${turn}`;
            } else if (turn === 0) {
                aiRaceStatus.textContent = `${mode} · ${candidates.toLocaleString()} possibilities`;
            } else {
                aiRaceStatus.textContent = `${mode} · Guess ${turn} · ${candidates.toLocaleString()} left`;
            }
        }
    }

    function visualStatus(evaluation, repeated, repeatedEnabled) {
        if (!repeatedEnabled || !repeated) return evaluation;
        if (evaluation === "correct") return "repeated_correct";
        if (evaluation === "present") return "repeated";
        return evaluation;
    }

    function revealAIHistory(history = []) {
        if (!aiReveal || !history.length) return;
        aiReveal.innerHTML = "";
        const title = document.createElement("div");
        title.className = "ai-reveal-title";
        title.textContent = "AIDLE AI SOLUTION PATH";
        aiReveal.appendChild(title);

        history.forEach(turn => {
            const row = document.createElement("div");
            row.className = "ai-history-row";

            const num = document.createElement("div");
            num.className = "ai-turn-number";
            num.textContent = turn.turn;

            const tiles = document.createElement("div");
            tiles.className = "ai-word-tiles";
            [...turn.guess].forEach((letter, i) => {
                const tile = document.createElement("div");
                const aiUsesRepeated = Boolean(aiState?.profile?.clues?.repeated);
                const repeated = Boolean(turn.repeated?.[i]);
                const visual = visualStatus(turn.feedback[i], repeated, aiUsesRepeated);
                tile.className = `ai-mini-tile ${visual}`;
                tile.textContent = letter;
                tiles.appendChild(tile);
            });

            const remaining = document.createElement("div");
            remaining.className = "ai-candidate-count";
            remaining.textContent = `${turn.candidates_remaining} left`;

            row.append(num, tiles, remaining);
            aiReveal.appendChild(row);
        });
        aiReveal.hidden = false;
    }

    function createBoard() {
        for (let i = 0; i < MAX_GUESSES; i++) {
            const row = document.createElement("div");
            row.classList.add("board-row");

            for (let j = 0; j < WORD_SIZE; j++) {
                const tile = document.createElement("div");
                tile.classList.add("tile");
                const span = document.createElement("span");
                span.dataset.letter = "";
                tile.appendChild(span);
                row.appendChild(tile);
            }
            gameBoard.appendChild(row);
        }
    }

    function createKeyboard() {
        const rows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
        rows.forEach((rowKeys, rowIndex) => {
            const rowDiv = document.createElement("div");
            rowDiv.classList.add("keyboard-row");

            if (rowIndex === 2) rowDiv.appendChild(createKey(ENTER_KEY, true));
            rowKeys.split("").forEach(letter => rowDiv.appendChild(createKey(letter)));
            if (rowIndex === 2) rowDiv.appendChild(createKey(BACK_KEY, true));

            keyboard.appendChild(rowDiv);
        });
    }

    function createKey(letter, special = false) {
        const key = document.createElement("button");
        key.textContent = letter === BACK_KEY ? "⌫" : letter;
        key.dataset.key = letter;
        key.classList.add(special ? "special-key" : "key");
        key.addEventListener("click", () => handleKey(letter));
        return key;
    }

    document.addEventListener("keydown", (e) => {
        const target = e.target;
        const isEditable =
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            target?.isContentEditable;

        if (isEditable) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        if (e.key === "Enter") handleKey(ENTER_KEY);
        else if (e.key === "Backspace") handleKey(BACK_KEY);
        else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
    });

    function handleKey(letter) {
        if (gameOver) return;
        const tiles = getTiles(currentRow);

        if (letter === BACK_KEY) {
            if (currentWord.length === 0) return;
            currentWord = currentWord.slice(0, -1);
            const tile = tiles[currentWord.length];
            tile.querySelector("span").dataset.letter = "";
            tile.classList.remove("filled");
            message.textContent = "";
        } else if (letter === ENTER_KEY) {
            if (currentWord.length < WORD_SIZE) {
                showMessage("Not enough letters");
                shakeRow(currentRow);
                return;
            }
            checkWord();
        } else if (currentWord.length < WORD_SIZE) {
            const tile = tiles[currentWord.length];
            tile.querySelector("span").dataset.letter = letter;
            tile.classList.add("filled");
            tile.classList.remove("pop");
            void tile.offsetWidth;
            tile.classList.add("pop");
            currentWord += letter;
        }
    }

    function isGuessValid() {
        return dictionary.some(w => w.toUpperCase() === currentWord);
    }

    async function checkWord() {
        if (!isGuessValid()) {
            await logEvent("invalid_word");
            showMessage("Not a valid word!");
            shakeRow(currentRow);
            return;
        }

        const tiles = getTiles(currentRow);
        let response;
        let data;
        try {
            response = await fetch(`${API_BASE}/guess`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Game-Token": gameToken
                },
                body: JSON.stringify({ guess: currentWord })
            });
            data = await response.json();
        } catch (err) {
            showMessage("Network error, try again");
            return;
        }

        if (!response.ok) {
            showMessage(data?.detail || "Guess could not be submitted");
            shakeRow(currentRow);
            return;
        }

        aiState = data.ai || aiState;

        await logEvent("guess_submitted", {
            guess: currentWord,
            guesses_remaining: data.guesses_remaining,
            ai_turn: aiState.turn,
            ai_solved: aiState.solved,
            ai_candidates_remaining: aiState.candidates_remaining,
            ai_difficulty: aiState.difficulty || difficulty,
        });

        const result = data.result;
        const resultDetail = data.result_detail || result.map(status => ({ evaluation: status, repeated: false }));
        playerConfig = data.player_config || playerConfig;
        resultDetail.forEach((detail, i) => {
            const status = visualStatus(detail.evaluation, detail.repeated, Boolean(playerConfig.repeated));
            const tile = tiles[i];
            const delay = i * 80;
            setTimeout(() => {
                tile.classList.add("flip");
                setTimeout(() => tile.classList.add(status), 200);
            }, delay);
            updateKey(currentWord[i], status);
        });

        const totalDelay = (WORD_SIZE - 1) * 80 + 400;
        const submittedWord = currentWord;
        gameOver = true;

        setTimeout(async () => {
            const completedTurn = currentRow + 1;
            currentRow = completedTurn;
            updateRaceStatus();

            if (data.game_over) {
                revealAIHistory(data.ai?.history || []);
                await logEvent("game_end", {
                    won: data.outcome === "player",
                    outcome: data.outcome,
                    target_word: data.answer,
                    guesses_remaining: data.guesses_remaining,
                    final_guess: submittedWord,
                    ai_turn: aiState.turn,
                    ai_solved: aiState.solved,
                    ai_candidates_remaining: aiState.candidates_remaining,
                    ai_difficulty: aiState.difficulty || difficulty,
                });

                if (data.outcome === "player") {
                    showMessage(`You beat AIDLE AI! The word was ${data.answer}.`);
                } else if (data.outcome === "ai") {
                    showMessage(`AIDLE AI wins. The word was ${data.answer}.`);
                } else if (data.outcome === "tie") {
                    showMessage(`Tie! You both solved ${data.answer} on guess ${completedTurn}.`);
                } else {
                    showMessage(`Neither solved it. The word was ${data.answer}.`);
                }
                endGame();
            } else {
                currentWord = "";
                gameOver = false;
            }
        }, totalDelay);
    }

    function updateKey(letter, status) {
        const current = keyStates[letter] ?? "";
        if ((COLOR_PRIORITY[status] ?? 0) <= (COLOR_PRIORITY[current] ?? 0)) return;

        keyStates[letter] = status;
        const keyEl = keyboard.querySelector(`[data-key="${letter}"]`);
        if (!keyEl) return;

        keyEl.classList.remove("absent", "present", "correct", "repeated", "repeated_correct");
        keyEl.classList.add(status);
    }

    function showMessage(text) {
        message.textContent = text;
    }

    function shakeRow(rowIndex) {
        const row = gameBoard.children[rowIndex];
        row.classList.remove("shake");
        void row.offsetWidth;
        row.classList.add("shake");
        row.addEventListener("animationend", () => row.classList.remove("shake"), { once: true });
    }

    function endGame() {
        gameOver = true;
        let btn = document.getElementById("play-again");
        if (!btn) {
            btn = document.createElement("button");
            btn.id = "play-again";
            btn.textContent = "Play again";
            btn.addEventListener("click", () => location.reload());
            gameBoard.parentElement.insertBefore(btn, keyboard);
        }
        btn.style.display = "block";
    }
}

initGame().catch(err => {
    console.error("[AIDLE] Game initialization failed:", err);
    const message = document.getElementById("message");
    if (message) message.textContent = "Unable to initialize game. Please refresh.";
});
