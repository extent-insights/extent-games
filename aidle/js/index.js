import { API_BASE } from "./config.js";
import { initGameAuthUI } from "../../common/js/game-auth-ui.js";

initGameAuthUI({
    apiBase: API_BASE
});

document.querySelectorAll("[data-difficulty]").forEach(card => {
    card.addEventListener("click", () => {
        const difficulty = card.dataset.difficulty;
        window.location.href = `./game.html?difficulty=${encodeURIComponent(difficulty)}`;
    });
});
