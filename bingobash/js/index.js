import { API_BASE } from "./config.js";
import { initGameAuthUI } from "../../common/js/game-auth-ui.js";

initGameAuthUI({
  apiBase: API_BASE
});

document.getElementById("playGameBtn").addEventListener("click", () => {
  window.location.href = "./game.html?game_id=1";
});
