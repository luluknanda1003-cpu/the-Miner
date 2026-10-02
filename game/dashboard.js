// ================= FILE PENGHUBUNG: DASHBOARD <-> GAME =================
// File ini KHUSUS mengatur layar dasbor (start screen + pemilihan karakter)
// dan menyalakan game yang ada di game.js. Variabel `gameStarted` dipakai
// bersama oleh game.js untuk menentukan kapan fisika, gerakan, dan gambar
// dijalankan. Karakter yang dipilih dikirim ke game.js lewat onGameStart(char).

let gameStarted = false;
window.selectedCharacter = null;

function initDashboard() {
  const dashboard = document.getElementById("dashboard");
  const startBtn = document.getElementById("startBtn");
  const hudEl = document.getElementById("hud");
  const hotbarEl = document.getElementById("hotbar");
  const charCards = document.querySelectorAll(".char-card");

  // ----- pemilihan karakter: Aron atau Junet -----
  charCards.forEach((card) => {
    card.addEventListener("click", () => {
      charCards.forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      window.selectedCharacter = card.dataset.char;
      startBtn.disabled = false;
    });
  });

  startBtn.addEventListener("click", () => {
    if (gameStarted || !window.selectedCharacter) return;
    gameStarted = true;
    dashboard.classList.add("hidden");
    hudEl.style.display = "block";
    hotbarEl.style.display = "flex";
    document.getElementById("levelLabel").style.display = "block";
    if (typeof onGameStart === "function") onGameStart(window.selectedCharacter);
  });
}

window.addEventListener("DOMContentLoaded", initDashboard);
