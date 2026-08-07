// Hakuna Superbro — Sahil Koşusu
// Basit canvas tabanlı Mario-vari platform oyunu (tek bölüm)

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

const GROUND_Y = 430;
const GRAVITY = 1900;
const MOVE_SPEED = 260;
const RUN_SPEED = 380;
const JUMP_V = -640;
const BIG_JUMP_V = -700;

// ---------- Seviye verisi ----------
// Zemin parçaları (aralarında çukurlar var)
const groundSegs = [
  { x1: -200, x2: 900 },
  { x1: 980, x2: 1700 },
  { x1: 1820, x2: 2600 },
  { x1: 2700, x2: 3500 },
  { x1: 3620, x2: 4500 },
  { x1: 4600, x2: 5500 },
  { x1: 5600, x2: 6600 },
];

const platforms = [
  { x: 620, y: 300, w: 140, h: 22 },
  { x: 1150, y: 330, w: 120, h: 22 },
  { x: 1980, y: 280, w: 160, h: 22 },
  { x: 2820, y: 320, w: 140, h: 22 },
  { x: 3080, y: 250, w: 120, h: 22 },
  { x: 3750, y: 300, w: 160, h: 22 },
  { x: 4700, y: 280, w: 140, h: 22 },
  { x: 5750, y: 320, w: 160, h: 22 },
];

const signs = [
  { x: 480, text: "BOSTANCI" },
  { x: 1550, text: "MALTEPE" },
  { x: 2650, text: "KARTAL" },
  { x: 3950, text: "PENDİK" },
  { x: 5250, text: "TUZLA" },
];

const boxes = [
  { x: 660, y: 250, used: false },
  { x: 2020, y: 230, used: false },
  { x: 3110, y: 200, used: false },
  { x: 4740, y: 230, used: false },
  { x: 5790, y: 270, used: false },
].map(b => ({ ...b, w: 40, h: 40 }));

const enemyDefs = [
  { x: 700, x1: 600, x2: 850 },
  { x: 1250, x1: 1150, x2: 1650 },
  { x: 2100, x1: 1900, x2: 2500 },
  { x: 3000, x1: 2800, x2: 3400 },
  { x: 3900, x1: 3700, x2: 4400 },
  { x: 4900, x1: 4700, x2: 5400 },
  { x: 5900, x1: 5700, x2: 6400 },
];

const LEVEL_END = 6600;
const GOAL_X = 6500;

// ---------- Yardımcılar ----------
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function solidRectsAt() {
  const rects = [];
  for (const g of groundSegs) {
    rects.push({ x: g.x1, y: GROUND_Y, w: g.x2 - g.x1, h: 300 });
  }
  for (const p of platforms) rects.push(p);
  return rects;
}
const solids = solidRectsAt();

// ---------- Oyuncu ----------
const player = {
  x: 0, y: GROUND_Y - 44, vx: 0, vy: 0,
  w: 30, h: 44, big: false, onGround: false,
  facing: 1, invincible: 0, dead: false,
  respawnX: 0,
};

function playerRect() {
  return { x: player.x, y: player.y, w: player.w, h: player.h };
}

function respawnPlayer() {
  player.x = player.respawnX;
  player.y = GROUND_Y - player.h;
  player.vx = 0; player.vy = 0;
  player.invincible = 2;
}

function growPlayer() {
  if (player.big) return;
  player.big = true;
  player.w = 36;
  const oldH = player.h;
  player.h = 64;
  player.y -= (player.h - oldH);
}

function shrinkPlayer() {
  if (player.big) {
    player.big = false;
    const oldH = player.h;
    player.h = 44;
    player.y += (oldH - player.h);
    player.w = 30;
    player.invincible = 2;
  } else {
    loseLife();
  }
}

// ---------- Düşmanlar ----------
let enemies = [];
function resetEnemies() {
  enemies = enemyDefs.map(e => ({
    x: e.x, x1: e.x1, x2: e.x2, y: GROUND_Y - 34,
    w: 26, h: 34, vx: 60, dead: false, walkT: Math.random() * 10,
  }));
}
resetEnemies();

// ---------- Uçan biralar (power-up) ----------
let items = [];

// ---------- Kamera ----------
let camX = 0;

// ---------- Girdi ----------
const keys = {};
window.addEventListener("keydown", e => {
  keys[e.code] = true;
  if (["Space", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
});
window.addEventListener("keyup", e => { keys[e.code] = false; });

let touchLeft = false, touchRight = false, touchJump = false;
function bindTouch(id, onDown, onUp) {
  const el = document.getElementById(id);
  const down = ev => { ev.preventDefault(); onDown(); };
  const up = ev => { ev.preventDefault(); onUp(); };
  el.addEventListener("touchstart", down, { passive: false });
  el.addEventListener("touchend", up, { passive: false });
  el.addEventListener("mousedown", down);
  el.addEventListener("mouseup", up);
  el.addEventListener("mouseleave", up);
}
bindTouch("tc-left", () => touchLeft = true, () => touchLeft = false);
bindTouch("tc-right", () => touchRight = true, () => touchRight = false);
bindTouch("tc-jump", () => touchJump = true, () => touchJump = false);

// ---------- Oyun durumu ----------
let score = 0, lives = 3;
let gameState = "menu"; // menu | playing | win | dead
let jumpHeld = false;
let winTimer = 0;

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const overlayButtons = document.getElementById("overlay-buttons");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");

function loseLife() {
  lives -= 1;
  updateHud();
  if (lives <= 0) {
    gameState = "dead";
    setOverlay({
      title: "KAYBETTİN",
      text: "Sahil senden zorluymuş. Tekrar dene!",
      buttons: [{ label: "TEKRAR DENE", onClick: startGame }],
    });
  } else {
    respawnPlayer();
  }
}

function updateHud() {
  scoreEl.textContent = "SKOR: " + score;
  livesEl.textContent = "CAN: " + lives;
}

function setOverlay({ title = "", text = "", buttons = [], marioFont = false }) {
  overlayTitle.textContent = title;
  overlayTitle.classList.toggle("mario-font", marioFont);
  overlayText.innerHTML = text;
  overlayText.classList.toggle("mario-font", marioFont);
  overlayButtons.innerHTML = "";
  for (const b of buttons) {
    const btn = document.createElement("button");
    btn.className = "overlay-btn" + (b.danger ? " danger" : "");
    btn.textContent = b.label;
    btn.addEventListener("click", b.onClick);
    overlayButtons.appendChild(btn);
  }
  overlay.classList.remove("hidden");
}

function showWinStep1() {
  setOverlay({
    title: "TEBRİKLER!",
    text: "BU YOLU GELENE KADAR EBEM S*KİLDİ",
    marioFont: true,
    buttons: [{ label: "DEVAM ET", onClick: showWinStep2 }],
  });
}

function showWinStep2() {
  setOverlay({
    title: "",
    text: "BİRA İÇMEYE GİDELİM Mİ?",
    marioFont: true,
    buttons: [
      { label: "TAMAM", onClick: () => { window.location.href = "https://ayarlayici.vercel.app"; } },
      { label: "HAYIR", onClick: showWinStep3, danger: true },
    ],
  });
}

function showWinStep3() {
  setOverlay({
    title: "",
    text: "",
    buttons: [{ label: "TEKRAR OYNA", onClick: startGame }],
  });
}

function startGame() {
  score = 0; lives = 3;
  player.big = false; player.w = 30; player.h = 44;
  player.respawnX = 0;
  respawnPlayer();
  boxes.forEach(b => b.used = false);
  items = [];
  resetEnemies();
  camX = 0;
  winTimer = 0;
  gameState = "playing";
  updateHud();
  overlay.classList.add("hidden");
}

setOverlay({
  title: "HAKUNA SUPERBRO",
  text: "Bostancı'dan Tuzla Marina'ya koş!<br/>Ok tuşları / A-D: hareket, Space / W: zıpla",
  buttons: [{ label: "BAŞLA", onClick: startGame }],
});

// ---------- Güncelleme ----------
let lastTime = performance.now();
function update(dt) {
  if (gameState !== "playing") return;

  // checkpoint ilerlemesi
  if (player.x - 40 > player.respawnX) player.respawnX = Math.max(player.respawnX, Math.floor(player.x / 400) * 400);

  const left = keys["ArrowLeft"] || keys["KeyA"] || touchLeft;
  const right = keys["ArrowRight"] || keys["KeyD"] || touchRight;
  const jumpKey = keys["Space"] || keys["ArrowUp"] || keys["KeyW"] || touchJump;
  const running = keys["ShiftLeft"] || keys["ShiftRight"];

  const speed = running ? RUN_SPEED : MOVE_SPEED;
  player.vx = 0;
  if (left) { player.vx = -speed; player.facing = -1; }
  if (right) { player.vx = speed; player.facing = 1; }

  if (jumpKey && player.onGround && !jumpHeld) {
    player.vy = player.big ? BIG_JUMP_V : JUMP_V;
    player.onGround = false;
  }
  jumpHeld = jumpKey;

  player.vy += GRAVITY * dt;
  if (player.vy > 1200) player.vy = 1200;

  // X hareketi + çarpışma
  player.x += player.vx * dt;
  if (player.x < -190) player.x = -190;
  resolveCollisions("x");

  // Y hareketi + çarpışma
  player.y += player.vy * dt;
  player.onGround = false;
  resolveCollisions("y");

  // Kutulara alttan vurma
  for (const b of boxes) {
    if (b.used) continue;
    const br = { x: b.x, y: b.y, w: b.w, h: b.h };
    const pr = playerRect();
    if (player.vy < 0 && rectsOverlap(pr, br)) {
      const headY = pr.y;
      if (headY < b.y + b.h && headY > b.y - 6) {
        b.used = true;
        player.vy = 40;
        items.push({ x: b.x + b.w / 2 - 14, y: b.y - 36, w: 28, h: 34, vx: 90, vy: -220, phase: "pop" });
        score += 50;
        updateHud();
      }
    }
  }

  // Çukura düşme
  if (player.y > H + 100) {
    loseLife();
    return;
  }

  // Hedefe ulaşma
  if (player.x + player.w / 2 >= GOAL_X && gameState === "playing") {
    gameState = "win";
    winTimer = 0;
  }

  // invincibility
  if (player.invincible > 0) player.invincible -= dt;

  // Düşmanları güncelle
  for (const en of enemies) {
    if (en.dead) continue;
    en.walkT += dt;
    en.x += en.vx * dt;
    if (en.x < en.x1) { en.x = en.x1; en.vx = Math.abs(en.vx); }
    if (en.x + en.w > en.x2) { en.x = en.x2 - en.w; en.vx = -Math.abs(en.vx); }

    const er = { x: en.x, y: en.y, w: en.w, h: en.h };
    const pr = playerRect();
    if (rectsOverlap(pr, er)) {
      const stomping = player.vy > 0 && (pr.y + pr.h) - er.y < 18;
      if (stomping) {
        en.dead = true;
        player.vy = JUMP_V * 0.55;
        score += 100;
        updateHud();
      } else if (player.invincible <= 0) {
        shrinkPlayer();
      }
    }
  }
  enemies = enemies.filter(e => !e.dead || e._t !== undefined);

  // Item (bira) güncelle
  for (const it of items) {
    if (it.phase === "pop") {
      it.y += it.vy * dt;
      it.vy += GRAVITY * 2 * dt;
      if (it.vy >= 0) { it.phase = "roam"; it.vy = 0; }
    } else {
      it.vy += GRAVITY * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      // basit zemin çarpışması
      for (const s of solids) {
        const ir = { x: it.x, y: it.y, w: it.w, h: it.h };
        if (rectsOverlap(ir, s) && it.y + it.h - it.vy * dt <= s.y + 1) {
          it.y = s.y - it.h;
          it.vy = 0;
        }
      }
    }
    if (rectsOverlap(playerRect(), { x: it.x, y: it.y, w: it.w, h: it.h })) {
      growPlayer();
      score += 200;
      updateHud();
      it.collected = true;
    }
  }
  items = items.filter(i => !i.collected && i.x < player.x + 1400);

  // Kamera
  camX = Math.max(0, player.x - W / 2 + player.w / 2);
  camX = Math.min(camX, LEVEL_END - W + 250);
}

function resolveCollisions(axis) {
  const pr = playerRect();
  for (const s of solids) {
    if (!rectsOverlap(pr, s)) continue;
    if (axis === "x") {
      if (player.vx > 0) player.x = s.x - player.w;
      else if (player.vx < 0) player.x = s.x + s.w;
    } else {
      if (player.vy > 0) {
        player.y = s.y - player.h;
        player.vy = 0;
        player.onGround = true;
      } else if (player.vy < 0) {
        player.y = s.y + s.h;
        player.vy = 0;
      }
    }
    pr.x = player.x; pr.y = player.y;
  }
}

// ---------- Çizim ----------
function drawBackground() {
  // gökyüzü
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#5fb8ea");
  sky.addColorStop(0.6, "#a9e0f5");
  sky.addColorStop(1, "#dff3ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // güneş
  ctx.fillStyle = "#fff3b0";
  ctx.beginPath();
  ctx.arc(W - 100, 90, 42, 0, Math.PI * 2);
  ctx.fill();

  // uzak yaka siluetleri (Anadolu yakası binaları), paralaks
  const parX = -camX * 0.15;
  ctx.fillStyle = "#8fb9d6";
  for (let i = 0; i < 40; i++) {
    const bx = (i * 140 + parX) % (W + 300) - 150;
    const bh = 40 + ((i * 37) % 70);
    ctx.fillRect(bx, GROUND_Y - 40 - bh, 60, bh);
  }

  // deniz
  const seaY = GROUND_Y + 6;
  ctx.fillStyle = "#1c6fa8";
  ctx.fillRect(0, seaY, W, H - seaY);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  const waveOff = (-camX * 0.4) % 40;
  for (let y = seaY + 14; y < H; y += 22) {
    ctx.beginPath();
    for (let x = -40; x < W + 40; x += 40) {
      ctx.moveTo(x + waveOff, y);
      ctx.quadraticCurveTo(x + 20 + waveOff, y - 8, x + 40 + waveOff, y);
    }
    ctx.stroke();
  }
}

function drawGround() {
  for (const g of groundSegs) {
    const x1 = g.x1 - camX, x2 = g.x2 - camX;
    if (x2 < 0 || x1 > W) continue;
    ctx.fillStyle = "#d9c48a";
    ctx.fillRect(x1, GROUND_Y, x2 - x1, H - GROUND_Y);
    ctx.fillStyle = "#3fae52";
    ctx.fillRect(x1, GROUND_Y, x2 - x1, 12);
    ctx.fillStyle = "#2f8f40";
    for (let x = x1; x < x2; x += 18) {
      ctx.fillRect(x, GROUND_Y, 4, 10);
    }
  }
}

function drawPlatforms() {
  for (const p of platforms) {
    const x = p.x - camX;
    if (x + p.w < 0 || x > W) continue;
    ctx.fillStyle = "#b98a52";
    ctx.fillRect(x, p.y, p.w, p.h);
    ctx.fillStyle = "#8a6136";
    ctx.fillRect(x, p.y + p.h - 5, p.w, 5);
  }
}

function drawSign(x, text) {
  const sx = x - camX;
  if (sx < -100 || sx > W + 100) return;
  // direk
  ctx.fillStyle = "#888";
  ctx.fillRect(sx - 4, GROUND_Y - 90, 8, 90);
  // tabela (mavi, Türkiye tarzı)
  ctx.fillStyle = "#0033a0";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.fillRect(sx - 75, GROUND_Y - 150, 150, 54);
  ctx.strokeRect(sx - 75, GROUND_Y - 150, 150, 54);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 18px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText(text, sx, GROUND_Y - 118);
}

function drawBox(b) {
  const x = b.x - camX;
  if (x + b.w < 0 || x > W) return;
  if (b.used) {
    ctx.fillStyle = "#8a8a8a";
    ctx.fillRect(x, b.y, b.w, b.h);
    ctx.strokeStyle = "#555";
    ctx.strokeRect(x, b.y, b.w, b.h);
    return;
  }
  // WhatsApp tarzı yeşil yuvarlak kutu
  const r = 8;
  ctx.fillStyle = "#25d366";
  roundRect(x, b.y, b.w, b.h, r);
  ctx.fill();
  // telefon ikonu (basit)
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x + b.w / 2, b.y + b.h / 2, 9, 0.3, Math.PI * 1.6);
  ctx.lineTo(x + b.w / 2, b.y + b.h / 2);
  ctx.fill();
  // hafif bounce hissi için üst parlama
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(x + 3, b.y + 3, b.w - 6, 4);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawItem(it) {
  const x = it.x - camX;
  if (x + it.w < 0 || x > W) return;
  // Efes tarzı bira kutusu: gümüş gövde + yeşil bant
  ctx.fillStyle = "#cfd8dc";
  ctx.fillRect(x, it.y, it.w, it.h);
  ctx.fillStyle = "#1f7a3d";
  ctx.fillRect(x, it.y + it.h * 0.35, it.w, it.h * 0.3);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 8px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText("EFES", x + it.w / 2, it.y + it.h * 0.55 + 3);
  ctx.fillStyle = "#9aa5aa";
  ctx.fillRect(x + 2, it.y - 3, it.w - 4, 3);
}

function drawEnemy(en) {
  const x = en.x - camX;
  if (x + en.w < 0 || x > W) return;
  const bob = Math.sin(en.walkT * 10) * 2;
  // kısa boylu adam: pantolon, gömlek, kafa
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(x + 4, en.y + 18 + bob, en.w - 8, en.h - 18);
  ctx.fillStyle = "#c0392b";
  ctx.fillRect(x + 2, en.y + 8 + bob, en.w - 4, 14);
  ctx.fillStyle = "#e0ac69";
  ctx.beginPath();
  ctx.arc(x + en.w / 2, en.y + 6 + bob, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#222";
  ctx.fillRect(x + en.w / 2 - 6, en.y + 2 + bob, 12, 4);
}

function drawGoal() {
  const gx = GOAL_X - 60 - camX;
  // Tuzla Marina yapısı: kule + iskele
  ctx.fillStyle = "#e8e2d6";
  ctx.fillRect(gx, GROUND_Y - 220, 90, 220);
  ctx.fillStyle = "#3a6ea5";
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(gx + 8, GROUND_Y - 200 + i * 32, 74, 16);
  }
  // çatı
  ctx.fillStyle = "#c0392b";
  ctx.beginPath();
  ctx.moveTo(gx - 10, GROUND_Y - 220);
  ctx.lineTo(gx + 45, GROUND_Y - 260);
  ctx.lineTo(gx + 100, GROUND_Y - 220);
  ctx.closePath();
  ctx.fill();
  // tabela: TUZLA MARİNA
  ctx.fillStyle = "#0033a0";
  ctx.fillRect(gx - 20, GROUND_Y - 245, 130, 26);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.strokeRect(gx - 20, GROUND_Y - 245, 130, 26);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText("TUZLA MARİNA", gx + 45, GROUND_Y - 227);

  // bayrak direği
  ctx.fillStyle = "#999";
  ctx.fillRect(gx + 130, GROUND_Y - 260, 6, 260);
  const flagY = gameState === "win" ? Math.max(GROUND_Y - 260, GROUND_Y - 40 - winTimer * 120) : GROUND_Y - 250;
  ctx.fillStyle = "#ffcc00";
  ctx.beginPath();
  ctx.moveTo(gx + 136, flagY);
  ctx.lineTo(gx + 170, flagY + 10);
  ctx.lineTo(gx + 136, flagY + 20);
  ctx.closePath();
  ctx.fill();

  // yatlar
  ctx.fillStyle = "#fff";
  ctx.fillRect(gx - 130, GROUND_Y - 20, 50, 14);
  ctx.fillStyle = "#3a6ea5";
  ctx.beginPath();
  ctx.moveTo(gx - 130, GROUND_Y - 20);
  ctx.lineTo(gx - 105, GROUND_Y - 40);
  ctx.lineTo(gx - 105, GROUND_Y - 20);
  ctx.fill();
}

function drawPlayer() {
  const x = player.x - camX;
  const y = player.y;
  if (player.invincible > 0 && Math.floor(player.invincible * 12) % 2 === 0) return;

  const w = player.w, h = player.h;
  const legH = h * 0.4;
  const bodyH = h * 0.4;
  const headR = w * 0.42;

  ctx.save();
  ctx.translate(x + w / 2, 0);
  ctx.scale(player.facing, 1);
  ctx.translate(-w / 2, 0);

  // eşofman altı (bacaklar) - lacivert
  ctx.fillStyle = "#1b2a4a";
  ctx.fillRect(2, y + h - legH, w * 0.35, legH);
  ctx.fillRect(w - w * 0.35 - 2, y + h - legH, w * 0.35, legH);

  // ayakkabı
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, y + h - 6, w * 0.4, 6);
  ctx.fillRect(w * 0.6, y + h - 6, w * 0.4, 6);

  // eşofman üstü (gövde) - kırmızı, beyaz şerit
  const bodyY = y + h - legH - bodyH;
  ctx.fillStyle = "#c0392b";
  ctx.fillRect(0, bodyY, w, bodyH);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, bodyY + bodyH * 0.4, w, 4);

  // kollar
  ctx.fillStyle = "#c0392b";
  ctx.fillRect(-4, bodyY + 4, 6, bodyH * 0.6);
  ctx.fillRect(w - 2, bodyY + 4, 6, bodyH * 0.6);

  // kafa
  const headCX = w / 2, headCY = bodyY - headR + 4;
  ctx.fillStyle = "#e0ac69";
  ctx.beginPath();
  ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
  ctx.fill();

  // sakal
  ctx.fillStyle = "#4a3626";
  ctx.beginPath();
  ctx.arc(headCX, headCY + headR * 0.35, headR * 0.9, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.fill();

  // gözlük
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(headCX - headR * 0.4, headCY - 2, headR * 0.32, 0, Math.PI * 2);
  ctx.arc(headCX + headR * 0.4, headCY - 2, headR * 0.32, 0, Math.PI * 2);
  ctx.moveTo(headCX - headR * 0.08, headCY - 2);
  ctx.lineTo(headCX + headR * 0.08, headCY - 2);
  ctx.stroke();

  // saç
  ctx.fillStyle = "#3a2a1c";
  ctx.beginPath();
  ctx.arc(headCX, headCY - headR * 0.3, headR * 1.02, Math.PI, 2 * Math.PI);
  ctx.fill();

  ctx.restore();
}

function draw() {
  drawBackground();
  drawGround();
  for (const s of signs) drawSign(s.x, s.text);
  drawPlatforms();
  for (const b of boxes) drawBox(b);
  for (const en of enemies) if (!en.dead) drawEnemy(en);
  for (const it of items) drawItem(it);
  drawGoal();
  drawPlayer();
}

// ---------- Ana döngü ----------
function loop(t) {
  const dt = Math.min((t - lastTime) / 1000, 0.033);
  lastTime = t;

  if (gameState === "win") {
    winTimer += dt;
    if (winTimer > 2.4) {
      gameState = "menu";
      showWinStep1();
    }
  }

  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
