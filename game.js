// Hakuna Superbro — Sahil Koşusu
// Basit canvas tabanlı Mario-vari platform oyunu (tek bölüm)

const canvas = document.getElementById("game");
const visCtx = canvas.getContext("2d");
visCtx.imageSmoothingEnabled = false;
const W = canvas.width, H = canvas.height;

// Tüm sahne önce tam çözünürlükte bu gizli canvas'a çiziliyor, sonra
// küçültülüp büyük canvas'a piksel sanatı (16-bit) görünümüyle basılıyor.
const renderCanvas = document.createElement("canvas");
renderCanvas.width = W;
renderCanvas.height = H;
const ctx = renderCanvas.getContext("2d");

const PIXEL_SCALE = 3;
const pixelCanvas = document.createElement("canvas");
pixelCanvas.width = Math.round(W / PIXEL_SCALE);
pixelCanvas.height = Math.round(H / PIXEL_SCALE);
const pixelCtx = pixelCanvas.getContext("2d");
pixelCtx.imageSmoothingEnabled = true;

function presentPixelated() {
  pixelCtx.clearRect(0, 0, pixelCanvas.width, pixelCanvas.height);
  pixelCtx.drawImage(renderCanvas, 0, 0, pixelCanvas.width, pixelCanvas.height);
  visCtx.clearRect(0, 0, W, H);
  visCtx.drawImage(pixelCanvas, 0, 0, W, H);
}

const GROUND_Y = 430;
const GRAVITY = 1900;
const MOVE_SPEED = 260;
const RUN_SPEED = 380;
const JUMP_V = -640;
const BIG_JUMP_V = -700;

// ---------- Seviye verisi (prosedürel, orijinalin 2 katı uzunlukta) ----------
const LEVEL_END = 13200;
const GOAL_X = 13000;
const WOMAN_X = GOAL_X - 250;

// Zemin parçaları (aralarında çukurlar var) — çukur genişlikleri orijinaldeki
// gibi zıplanabilir kalsın diye sabit bir örüntüyle üretiliyor.
const groundSegs = [];
{
  const segLens = [700, 820, 680, 900, 760, 840, 720, 880, 700, 800, 760, 820];
  const gapLens = [90, 120, 100, 140, 110, 95, 130, 105, 115, 100, 125, 90];
  let x = -200;
  let i = 0;
  while (x < LEVEL_END + 300) {
    const segLen = segLens[i % segLens.length];
    groundSegs.push({ x1: x, x2: x + segLen });
    x += segLen + gapLens[i % gapLens.length];
    i++;
  }

  // Hedef (Tuzla Marina) ve kadının durduğu alanın altında kesinlikle
  // zemin olsun — üretim rastgele bir çukur bırakmış olabilir.
  for (let s = 0; s < groundSegs.length; s++) {
    if (groundSegs[s].x2 >= WOMAN_X - 300 && groundSegs[s].x1 <= GOAL_X) {
      groundSegs[s].x2 = Math.max(groundSegs[s].x2, LEVEL_END + 300);
      groundSegs.length = s + 1;
      break;
    }
  }
}

// Platformlar: her uzun zemin parçasının üstünde bir tane
const platforms = [];
for (const seg of groundSegs) {
  const segLen = seg.x2 - seg.x1;
  if (segLen < 500) continue;
  const px = seg.x1 + segLen * 0.4;
  const py = GROUND_Y - 100 - ((Math.abs(seg.x1) * 37) % 130);
  const pw = 120 + ((Math.abs(seg.x1) * 13) % 60);
  platforms.push({ x: px, y: py, w: pw, h: 22 });
}

// Tabelalar: tüm yola eşit yayılmış
const signTexts = ["FERHA MAH.", "KÜPLÜCE", "BURHANİYE", "BEYLERBEYİ", "KUZGUNCUK"];
const signs = [];
{
  const usable = groundSegs.filter(s => s.x1 > 0 && s.x1 < GOAL_X - 500 && s.x2 - s.x1 > 300);
  for (let i = 0; i < signTexts.length; i++) {
    const idx = Math.min(usable.length - 1, Math.floor(((i + 0.5) / signTexts.length) * usable.length));
    signs.push({ x: usable[idx].x1 + 130, text: signTexts[i] });
  }
}

// WhatsApp kutuları: platformların bir kısmının üstünde
const boxes = platforms
  .filter((_, i) => i % 2 === 0)
  .map(p => ({ x: p.x + p.w / 2 - 20, y: p.y - 90, w: 40, h: 40, used: false }));

// Düşmanlar: yeterince uzun her zemin parçasında biri, hedefe yakın alan boş
const enemyDefs = [];
for (const seg of groundSegs) {
  const segLen = seg.x2 - seg.x1;
  if (segLen < 450 || seg.x1 > GOAL_X - 700) continue;
  const margin = 70;
  enemyDefs.push({ x: seg.x1 + segLen * 0.3, x1: seg.x1 + margin, x2: seg.x2 - margin });
}

// Arka plan dönüm noktaları: Çamlıca Kulesi/Camii, Beylerbeyi Sarayı, Kuzguncuk evleri
const landmarks = [
  { x: LEVEL_END * 0.08, type: "camlica_tower" },
  { x: LEVEL_END * 0.20, type: "camlica_mosque" },
  { x: LEVEL_END * 0.34, type: "camlica_tower" },
  { x: LEVEL_END * 0.50, type: "beylerbeyi_palace" },
  { x: LEVEL_END * 0.64, type: "kuzguncuk_houses" },
  { x: LEVEL_END * 0.78, type: "kuzguncuk_houses" },
  { x: LEVEL_END * 0.90, type: "kuzguncuk_houses" },
];

// Motosiklet: tek seferlik, 10 saniyeliğine hız artışı verir
const moto = (() => {
  const targetX = LEVEL_END * 0.2;
  const seg = groundSegs.find(s => targetX >= s.x1 + 80 && targetX <= s.x2 - 80) || groundSegs[3];
  const x = Math.max(seg.x1 + 80, Math.min(targetX, seg.x2 - 80));
  return { x, w: 50, h: 28, used: false };
})();

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
const BASE_W = 22, BASE_H = 34;
const GROW_FACTOR = 1.3;

const player = {
  x: 0, y: GROUND_Y - BASE_H, vx: 0, vy: 0,
  w: BASE_W, h: BASE_H, big: false, onGround: false,
  facing: 1, invincible: 0, dead: false,
  respawnX: 0, jumpsUsed: 0, animT: 0,
  riding: false, rideTimer: 0, glow: 0, beerTimer: 0,
};

function playerRect() {
  return { x: player.x, y: player.y, w: player.w, h: player.h };
}

function respawnPlayer() {
  player.x = player.respawnX;
  player.y = GROUND_Y - player.h;
  player.vx = 0; player.vy = 0;
  player.invincible = 2;
  player.jumpsUsed = 0;
}

function growPlayer() {
  // Efes etkisi 3 saniye sürer; tekrar biraya dokununca süre yenilenir
  player.beerTimer = 3;
  player.glow = 1.5;
  if (player.big) return;
  player.big = true;
  const oldH = player.h;
  player.w = Math.round(BASE_W * GROW_FACTOR);
  player.h = Math.round(BASE_H * GROW_FACTOR);
  player.y -= (player.h - oldH);
  player.glow = 3.5;
}

function revertGrowth() {
  if (!player.big) return;
  player.big = false;
  const oldH = player.h;
  player.h = BASE_H;
  player.y += (oldH - player.h);
  player.w = BASE_W;
  player.glow = 0;
  player.beerTimer = 0;
}

function shrinkPlayer() {
  if (player.big) {
    revertGrowth();
    player.invincible = 2;
  } else {
    loseLife();
  }
}

// ---------- Düşmanlar ----------
let enemies = [];
function resetEnemies() {
  enemies = enemyDefs.map(e => ({
    x: e.x, x1: e.x1, x2: e.x2, y: GROUND_Y - 28,
    w: 20, h: 28, vx: 60, dead: false, walkT: Math.random() * 10,
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
let dialogueState = "none"; // none | line1 | line2 | done
let dialogueTimer = 0;

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const overlayButtons = document.getElementById("overlay-buttons");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const motoEl = document.getElementById("moto");

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

const bgMusic = new Audio("mario.mp3");
bgMusic.loop = true;

function startGame() {
  score = 0; lives = 3;
  player.big = false; player.w = BASE_W; player.h = BASE_H;
  player.respawnX = 0;
  player.riding = false; player.rideTimer = 0; player.glow = 0; player.beerTimer = 0;
  dialogueState = "none"; dialogueTimer = 0;
  respawnPlayer();
  boxes.forEach(b => b.used = false);
  moto.used = false;
  items = [];
  resetEnemies();
  camX = 0;
  winTimer = 0;
  gameState = "playing";
  updateHud();
  overlay.classList.add("hidden");
  bgMusic.currentTime = 0;
  bgMusic.play().catch(() => {});
}

setOverlay({
  title: "HAZIR MISIN?",
  text: "Bostancı'dan Tuzla Marina'ya koş!<br/>Ok tuşları / A-D: hareket, Space / W: zıpla<br/>Havada tekrar bas: çift zıplama!",
  buttons: [{ label: "BAŞLA", onClick: startGame }],
});

// ---------- Güncelleme ----------
let lastTime = performance.now();
function update(dt) {
  if (gameState !== "playing") return;

  // checkpoint ilerlemesi
  if (player.x - 40 > player.respawnX) player.respawnX = Math.max(player.respawnX, Math.floor(player.x / 400) * 400);

  // Kadınla karşılaşma diyaloğu
  if (dialogueState === "none" && player.x + player.w >= WOMAN_X - 15) {
    dialogueState = "line1";
    dialogueTimer = 0;
  }
  if (dialogueState === "line1" || dialogueState === "line2") {
    dialogueTimer += dt;
    if (dialogueState === "line1" && dialogueTimer > 2.6) { dialogueState = "line2"; dialogueTimer = 0; }
    else if (dialogueState === "line2" && dialogueTimer > 2.6) { dialogueState = "done"; }
  }
  const dialogueFreeze = dialogueState === "line1" || dialogueState === "line2";

  const left = !dialogueFreeze && (keys["ArrowLeft"] || keys["KeyA"] || touchLeft);
  const right = !dialogueFreeze && (keys["ArrowRight"] || keys["KeyD"] || touchRight);
  const jumpKey = !dialogueFreeze && (keys["Space"] || keys["ArrowUp"] || keys["KeyW"] || touchJump);
  const running = keys["ShiftLeft"] || keys["ShiftRight"];

  const rideMult = player.riding ? 2.3 : 1;
  const speed = (running ? RUN_SPEED : MOVE_SPEED) * rideMult;
  player.vx = 0;
  if (left) { player.vx = -speed; player.facing = -1; }
  if (right) { player.vx = speed; player.facing = 1; }

  if (Math.abs(player.vx) > 5 && player.onGround) {
    player.animT += dt * (player.riding ? 14 : 7 + Math.abs(player.vx) / 90);
  } else if (player.onGround) {
    player.animT += dt * 1.4;
  }

  if (player.riding) {
    player.rideTimer -= dt;
    if (player.rideTimer <= 0) player.riding = false;
  }
  if (player.glow > 0) player.glow -= dt;
  if (player.big && player.beerTimer > 0) {
    player.beerTimer -= dt;
    if (player.beerTimer <= 0) revertGrowth();
  }

  if (jumpKey && !jumpHeld && player.jumpsUsed < 2) {
    const base = player.big ? BIG_JUMP_V : JUMP_V;
    // ikinci (çift) zıplama biraz daha güçlü
    player.vy = player.jumpsUsed === 0 ? base : base * 1.12;
    player.jumpsUsed++;
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

  // Motosiklete binme
  if (!moto.used) {
    const mr = { x: moto.x, y: GROUND_Y - moto.h, w: moto.w, h: moto.h };
    if (rectsOverlap(playerRect(), mr)) {
      moto.used = true;
      player.riding = true;
      player.rideTimer = 10;
    }
  }
  motoEl.textContent = player.riding ? "🏍 " + Math.ceil(player.rideTimer) + "sn" : "";

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
      if (player.riding) {
        en.dead = true;
        score += 100;
        updateHud();
      } else if (stomping) {
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
        player.jumpsUsed = 0;
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
  sky.addColorStop(0, "#4a9fdc");
  sky.addColorStop(0.55, "#8fcdf0");
  sky.addColorStop(1, "#e8f6ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // güneş + hafif ışıma
  ctx.fillStyle = "rgba(255,246,190,0.35)";
  ctx.beginPath();
  ctx.arc(W - 100, 90, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff3b0";
  ctx.beginPath();
  ctx.arc(W - 100, 90, 36, 0, Math.PI * 2);
  ctx.fill();

  // bulutlar (paralaks)
  const cloudX = -camX * 0.08;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (let i = 0; i < 10; i++) {
    const bx = ((i * 260 + cloudX) % (W + 400)) - 200;
    const by = 60 + ((i * 53) % 90);
    drawCloud(bx, by, 0.7 + (i % 3) * 0.2);
  }

  // martılar
  ctx.strokeStyle = "rgba(60,60,60,0.6)";
  ctx.lineWidth = 2;
  const gullX = -camX * 0.2;
  for (let i = 0; i < 6; i++) {
    const bx = ((i * 340 + gullX) % (W + 300)) - 150;
    const by = 130 + ((i * 41) % 60);
    ctx.beginPath();
    ctx.moveTo(bx - 8, by);
    ctx.quadraticCurveTo(bx - 3, by - 6, bx, by);
    ctx.quadraticCurveTo(bx + 3, by - 6, bx + 8, by);
    ctx.stroke();
  }

  // uzak yaka siluetleri (Anadolu yakası apartmanları), paralaks
  const parX = -camX * 0.15;
  const buildingColors = ["#8fb9d6", "#9cc3da", "#7fa9c9", "#a6cbe0"];
  for (let i = 0; i < 40; i++) {
    const bx = (i * 140 + parX) % (W + 300) - 150;
    const bh = 40 + ((i * 37) % 90);
    ctx.fillStyle = buildingColors[i % buildingColors.length];
    ctx.fillRect(bx, GROUND_Y - 40 - bh, 60, bh);
    // pencereler
    ctx.fillStyle = "rgba(255, 244, 180, 0.55)";
    for (let wy = GROUND_Y - 40 - bh + 8; wy < GROUND_Y - 46; wy += 14) {
      for (let wx = bx + 6; wx < bx + 54; wx += 14) {
        if ((wx + wy) % 27 < 14) ctx.fillRect(wx, wy, 6, 8);
      }
    }
  }

  // dönüm noktası yapılar: Çamlıca (uzak tepe), Beylerbeyi Sarayı ve
  // Kuzguncuk evleri (sahile yakın, daha az paralaks) — Çamlıca'dan
  // Kuzguncuk'a sahil hattı
  for (const lm of landmarks) {
    const isNear = lm.type === "beylerbeyi_palace" || lm.type === "kuzguncuk_houses";
    const factor = isNear ? 0.55 : 0.15;
    const lx = (lm.x - camX) * factor + (W / 2) * (1 - factor);
    if (lx < -260 || lx > W + 260) continue;
    if (lm.type === "camlica_tower") drawCamlicaTower(lx);
    else if (lm.type === "camlica_mosque") drawCamlicaMosque(lx);
    else if (lm.type === "beylerbeyi_palace") drawBeylerbeyiPalace(lx);
    else if (lm.type === "kuzguncuk_houses") drawKuzguncukHouses(lx);
  }

  // deniz
  const seaY = GROUND_Y + 6;
  const seaGrad = ctx.createLinearGradient(0, seaY, 0, H);
  seaGrad.addColorStop(0, "#2f86bb");
  seaGrad.addColorStop(1, "#124f7a");
  ctx.fillStyle = seaGrad;
  ctx.fillRect(0, seaY, W, H - seaY);

  // uzakta vapur
  const ferryX = (900 - camX * 0.35) % (LEVEL_END + 900) - 200;
  drawFerry(ferryX, seaY + 18);

  ctx.strokeStyle = "rgba(255,255,255,0.55)";
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

function drawCloud(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.arc(18, -6, 12, 0, Math.PI * 2);
  ctx.arc(-16, -4, 11, 0, Math.PI * 2);
  ctx.arc(6, 4, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFerry(x, y) {
  if (x < -220 || x > W + 220) return;
  ctx.fillStyle = "#e6e6e6";
  ctx.fillRect(x, y, 70, 14);
  ctx.fillStyle = "#c0392b";
  ctx.fillRect(x, y + 12, 70, 4);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x + 14, y - 12, 20, 12);
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(x + 20, y - 22, 5, 12);
}

function drawCamlicaTower(x) {
  const hillTop = GROUND_Y - 40 - 50;
  // tepe
  ctx.fillStyle = "#5a8f4f";
  ctx.beginPath();
  ctx.moveTo(x - 90, GROUND_Y - 40);
  ctx.quadraticCurveTo(x, hillTop - 10, x + 90, GROUND_Y - 40);
  ctx.closePath();
  ctx.fill();

  const baseY = hillTop;
  const towerH = 170;
  // beton şaft
  ctx.fillStyle = "#c7c9cc";
  ctx.fillRect(x - 5, baseY - towerH, 10, towerH);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(x - 5, baseY - towerH, 3, towerH);
  // gözlem/restoran halkası
  ctx.fillStyle = "#9aa0a5";
  ctx.beginPath();
  ctx.ellipse(x, baseY - towerH + 34, 20, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5f6a70";
  ctx.fillRect(x - 20, baseY - towerH + 30, 40, 6);
  // anten
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, baseY - towerH);
  ctx.lineTo(x, baseY - towerH - 30);
  ctx.stroke();
  ctx.fillStyle = "#ff4444";
  ctx.beginPath();
  ctx.arc(x, baseY - towerH - 30, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawCamlicaMosque(x) {
  const hillTop = GROUND_Y - 40 - 30;
  ctx.fillStyle = "#5a8f4f";
  ctx.beginPath();
  ctx.moveTo(x - 130, GROUND_Y - 40);
  ctx.quadraticCurveTo(x, hillTop - 10, x + 130, GROUND_Y - 40);
  ctx.closePath();
  ctx.fill();

  const baseY = hillTop;
  // ana bina
  ctx.fillStyle = "#e4ddce";
  ctx.fillRect(x - 55, baseY - 40, 110, 40);
  // ana kubbe
  ctx.fillStyle = "#8a95a0";
  ctx.beginPath();
  ctx.arc(x, baseY - 40, 40, Math.PI, 2 * Math.PI);
  ctx.fill();
  // küçük kubbeler
  for (const dx of [-38, 38]) {
    ctx.fillStyle = "#8a95a0";
    ctx.beginPath();
    ctx.arc(x + dx, baseY - 26, 16, Math.PI, 2 * Math.PI);
    ctx.fill();
  }
  // minareler (iki yanda ikişer, ince ve uzun)
  for (const dx of [-85, -68, 68, 85]) {
    const mh = Math.abs(dx) === 85 ? 130 : 100;
    ctx.fillStyle = "#d8d2c2";
    ctx.fillRect(x + dx - 3, baseY - mh, 6, mh);
    ctx.fillStyle = "#8a95a0";
    ctx.beginPath();
    ctx.moveTo(x + dx - 5, baseY - mh);
    ctx.lineTo(x + dx + 5, baseY - mh);
    ctx.lineTo(x + dx, baseY - mh - 14);
    ctx.closePath();
    ctx.fill();
  }
}

function drawBeylerbeyiPalace(x) {
  const baseY = GROUND_Y - 8;
  const w = 150, h = 46;
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(x, baseY + 4, w * 0.55, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // ana bina (beyaz)
  ctx.fillStyle = "#f2efe6";
  ctx.fillRect(x - w / 2, baseY - h, w, h);
  // kemerli pencere sırası
  for (let wx = x - w / 2 + 12; wx < x + w / 2 - 12; wx += 16) {
    ctx.fillStyle = "#3a6ea5";
    ctx.beginPath();
    ctx.arc(wx + 5, baseY - h + 20, 5, Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.fillRect(wx, baseY - h + 20, 10, 16);
  }
  // çatı
  ctx.fillStyle = "#8a5a3c";
  ctx.fillRect(x - w / 2 - 4, baseY - h - 6, w + 8, 6);
  // iki yan köşk
  for (const dx of [-w / 2, w / 2]) {
    ctx.fillStyle = "#e8e2d3";
    ctx.fillRect(x + dx - 10, baseY - h - 20, 20, 20);
    ctx.fillStyle = "#8a5a3c";
    ctx.beginPath();
    ctx.moveTo(x + dx - 12, baseY - h - 20);
    ctx.lineTo(x + dx + 12, baseY - h - 20);
    ctx.lineTo(x + dx, baseY - h - 34);
    ctx.closePath();
    ctx.fill();
  }
  // rıhtım
  ctx.fillStyle = "#9a9a9a";
  ctx.fillRect(x - w / 2 - 10, baseY, w + 20, 6);
}

function drawKuzguncukHouses(x) {
  const baseY = GROUND_Y - 4;
  const colors = ["#e07a7a", "#e0c15a", "#7ab5e0", "#7ac98a", "#d99bd9"];
  const hw = 24;
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(x, baseY + 3, hw * 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = -2; i <= 2; i++) {
    const bx = x + i * (hw + 4);
    const h = 34 + (i % 2 === 0 ? 6 : 0);
    ctx.fillStyle = colors[(i + 6) % colors.length];
    ctx.fillRect(bx - hw / 2, baseY - h, hw, h);
    ctx.fillStyle = "#5a4030";
    ctx.beginPath();
    ctx.moveTo(bx - hw / 2 - 3, baseY - h);
    ctx.lineTo(bx + hw / 2 + 3, baseY - h);
    ctx.lineTo(bx, baseY - h - 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillRect(bx - 7, baseY - h + 10, 6, 8);
    ctx.fillRect(bx + 1, baseY - h + 10, 6, 8);
  }
}

function drawGround() {
  for (const g of groundSegs) {
    const x1 = g.x1 - camX, x2 = g.x2 - camX;
    if (x2 < 0 || x1 > W) continue;
    const w = x2 - x1;

    // beton yürüyüş yolu (Maltepe/Bostancı sahil yolu tarzı gri zemin)
    ctx.fillStyle = "#aeb4b8";
    ctx.fillRect(x1, GROUND_Y, w, H - GROUND_Y);

    // kırmızı koşu/bisiklet şeridi (üst kısım)
    ctx.fillStyle = "#a8543c";
    ctx.fillRect(x1, GROUND_Y, w, 16);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.moveTo(x1, GROUND_Y + 8);
    ctx.lineTo(x2, GROUND_Y + 8);
    ctx.stroke();
    ctx.setLineDash([]);

    // beton kaplama derzleri
    ctx.strokeStyle = "rgba(90,95,98,0.6)";
    ctx.lineWidth = 1;
    for (let x = x1; x < x2; x += 46) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 16);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // deniz kenarı korkuluk (beyaz-mavi parapet)
    ctx.fillStyle = "#e8ecee";
    ctx.fillRect(x1, GROUND_Y - 6, w, 6);
    ctx.fillStyle = "#0033a0";
    for (let x = x1; x < x2; x += 34) {
      ctx.fillRect(x, GROUND_Y - 6, 5, 6);
    }
  }
}

// ---------- Yerel dekor: büfe / beltur / dürümcü / tofaş ----------
const propTypes = ["bufe", "tofas", "durum", "beltur"];
const props = [];
for (let x = 260, i = 0; x < LEVEL_END - 400; x += 470, i++) {
  props.push({ x, type: propTypes[i % propTypes.length] });
}

function drawProps() {
  for (const p of props) {
    const x = p.x - camX;
    if (x < -90 || x > W + 90) continue;
    if (p.type === "bufe") drawBufe(x);
    else if (p.type === "beltur") drawBeltur(x);
    else if (p.type === "durum") drawDurumcu(x);
    else if (p.type === "tofas") drawTofas(x);
  }
}

function drawBufe(x) {
  const baseY = GROUND_Y;
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(x, baseY + 2, 26, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e6e2d3";
  ctx.fillRect(x - 20, baseY - 46, 40, 46);
  ctx.fillStyle = "#2f8f40";
  ctx.fillRect(x - 26, baseY - 58, 52, 14);
  ctx.fillStyle = "#7fd1e0";
  ctx.fillRect(x - 15, baseY - 40, 30, 16);
  ctx.fillStyle = "#c0392b";
  ctx.font = "bold 9px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText("BÜFE", x, baseY - 16);
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(x - 6, baseY - 8, 4, 8);
  ctx.fillRect(x + 4, baseY - 8, 4, 8);
}

function drawBeltur(x) {
  const baseY = GROUND_Y;
  // gölge
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(x, baseY + 2, 42, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#0e8a8a";
  ctx.fillRect(x - 38, baseY - 78, 76, 78);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(x - 38, baseY - 78, 30, 78);
  ctx.beginPath();
  ctx.fillStyle = "#0a6e6e";
  ctx.arc(x, baseY - 78, 38, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(x - 38, baseY - 82, 76, 6);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText("BELTUR", x, baseY - 34);
  ctx.fillStyle = "#dff3f3";
  ctx.fillRect(x - 26, baseY - 22, 52, 22);
  ctx.strokeStyle = "#0a6e6e";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 26, baseY - 22, 52, 22);
}

function drawDurumcu(x) {
  const baseY = GROUND_Y;
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(x, baseY + 2, 30, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // tekerlekler
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(x - 16, baseY - 4, 6, 0, Math.PI * 2);
  ctx.arc(x + 16, baseY - 4, 6, 0, Math.PI * 2);
  ctx.fill();
  // gövde
  ctx.fillStyle = "#d94f3d";
  ctx.fillRect(x - 24, baseY - 34, 48, 24);
  ctx.fillStyle = "#f4d35e";
  ctx.fillRect(x - 24, baseY - 34, 48, 6);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 8px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText("DÜRÜM", x, baseY - 18);
  // şemsiye
  ctx.fillStyle = "#c0392b";
  ctx.beginPath();
  ctx.moveTo(x - 30, baseY - 40);
  ctx.lineTo(x + 30, baseY - 40);
  ctx.lineTo(x, baseY - 64);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#888";
  ctx.fillRect(x - 1, baseY - 64, 2, 24);
}

function drawTofas(x) {
  const baseY = GROUND_Y;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(x, baseY + 2, 38, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8d9a0";
  ctx.fillRect(x - 34, baseY - 22, 68, 16);
  ctx.fillStyle = "#d8c88a";
  ctx.beginPath();
  ctx.moveTo(x - 22, baseY - 22);
  ctx.lineTo(x - 14, baseY - 36);
  ctx.lineTo(x + 16, baseY - 36);
  ctx.lineTo(x + 24, baseY - 22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#bcd6e0";
  ctx.fillRect(x - 12, baseY - 34, 12, 10);
  ctx.fillRect(x + 2, baseY - 34, 12, 10);
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(x - 20, baseY - 4, 7, 0, Math.PI * 2);
  ctx.arc(x + 18, baseY - 4, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8a1d1d";
  ctx.fillRect(x - 34, baseY - 10, 68, 4);
}

function drawPlatforms() {
  for (const p of platforms) {
    const x = p.x - camX;
    if (x + p.w < 0 || x > W) continue;
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.ellipse(x + p.w / 2, GROUND_Y + 4, p.w * 0.4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    const grad = ctx.createLinearGradient(x, p.y, x, p.y + p.h);
    grad.addColorStop(0, "#c9986a");
    grad.addColorStop(1, "#8a6136");
    ctx.fillStyle = grad;
    ctx.fillRect(x, p.y, p.w, p.h);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(x, p.y, p.w, 3);
    ctx.fillStyle = "#6b4a28";
    ctx.fillRect(x, p.y + p.h - 4, p.w, 4);
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
  ctx.textAlign = "center";
  let fontSize = 18;
  ctx.font = `bold ${fontSize}px Trebuchet MS`;
  while (ctx.measureText(text).width > 138 && fontSize > 10) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px Trebuchet MS`;
  }
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
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(x + en.w / 2, en.y + en.h + 2, en.w * 0.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
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

function drawMotoHint(x, y) {
  const bob = Math.sin(performance.now() / 220) * 4;
  ctx.font = "bold 12px Trebuchet MS";
  ctx.textAlign = "center";
  const text = "Motora binebilirsin";
  const tw = ctx.measureText(text).width;
  const boxW = tw + 20, boxH = 24;
  const boxX = x - boxW / 2, boxY = y - boxH - 6;

  ctx.fillStyle = "rgba(0,0,0,0.78)";
  roundRect(boxX, boxY, boxW, boxH, 6);
  ctx.fill();
  ctx.strokeStyle = "#ffcc00";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x, boxY + 16);

  // zıplayan aşağı ok
  ctx.fillStyle = "#ffcc00";
  ctx.beginPath();
  ctx.moveTo(x - 7, boxY + boxH + 3 + bob);
  ctx.lineTo(x + 7, boxY + boxH + 3 + bob);
  ctx.lineTo(x, boxY + boxH + 14 + bob);
  ctx.closePath();
  ctx.fill();
}

function drawSpeechBubble(cx, tailY, text) {
  ctx.font = "bold 11px Trebuchet MS";
  const maxWidth = 190;
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const lineH = 15;
  let widest = 0;
  for (const l of lines) widest = Math.max(widest, ctx.measureText(l).width);
  const boxW = widest + 24;
  const boxH = lines.length * lineH + 16;
  const boxX = cx - boxW / 2;
  const boxY = tailY - boxH - 14;

  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 2;
  roundRect(boxX, boxY, boxW, boxH, 8);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - 8, boxY + boxH);
  ctx.lineTo(cx + 8, boxY + boxH);
  ctx.lineTo(cx, boxY + boxH + 13);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.fill();
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#111";
  ctx.textAlign = "center";
  lines.forEach((l, i) => ctx.fillText(l, cx, boxY + 18 + i * lineH));
}

function drawMotoIcon(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // gölge
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(0, 17, 28, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // tekerlekler (siyah lastik + gri jant)
  for (const wx of [-18, 17]) {
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(wx, 12, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7a7a7a";
    ctx.beginPath();
    ctx.arc(wx, 12, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#9a9a9a";
    ctx.lineWidth = 1;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
      ctx.beginPath();
      ctx.moveTo(wx, 12);
      ctx.lineTo(wx + Math.cos(a) * 4.5, 12 + Math.sin(a) * 4.5);
      ctx.stroke();
    }
  }

  // egzoz (krom)
  ctx.fillStyle = "#c3c8cc";
  ctx.fillRect(-28, 6, 12, 4);
  ctx.fillStyle = "#8f9498";
  ctx.fillRect(-28, 9, 12, 1.5);

  // şasi / gövde (siyah)
  ctx.fillStyle = "#151515";
  ctx.beginPath();
  ctx.moveTo(-20, 9);
  ctx.lineTo(-9, -6);
  ctx.lineTo(7, -8);
  ctx.lineTo(17, 7);
  ctx.lineTo(-6, 9);
  ctx.closePath();
  ctx.fill();

  // yakıt deposu
  ctx.fillStyle = "#1c1c1c";
  ctx.beginPath();
  ctx.ellipse(-4, -8, 10, 6, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.ellipse(-6, -10, 4, 2, -0.15, 0, Math.PI * 2);
  ctx.fill();

  // sele
  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(2, -11, 17, 5);
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(2, -11, 17, 1.5);

  // gidon
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(15, -6);
  ctx.lineTo(15, -18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(8, -19);
  ctx.lineTo(21, -19);
  ctx.stroke();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(8, -19, 2, 0, Math.PI * 2);
  ctx.arc(21, -19, 2, 0, Math.PI * 2);
  ctx.fill();

  // ön far
  ctx.fillStyle = "#ffe07a";
  ctx.beginPath();
  ctx.arc(20, -5, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

function drawWomanGreeter(gx) {
  const baseY = GROUND_Y;
  const bob = Math.sin(performance.now() / 400) * 3;
  const x = gx - 190;
  const y = baseY - 84 + bob * 0.2;

  // gölge
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(x, baseY + 2, 16, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // bacaklar
  ctx.fillStyle = "#e0ac69";
  ctx.fillRect(x - 5, y + 58, 4, 18);
  ctx.fillRect(x + 2, y + 58, 4, 18);
  ctx.fillStyle = "#c0392b";
  ctx.fillRect(x - 6, y + 74, 6, 5);
  ctx.fillRect(x + 1, y + 74, 6, 5);

  // elbise (uzun, sarı-turuncu)
  ctx.fillStyle = "#f4a021";
  ctx.beginPath();
  ctx.moveTo(x - 12, y + 60);
  ctx.lineTo(x - 6, y + 22);
  ctx.lineTo(x + 6, y + 22);
  ctx.lineTo(x + 12, y + 60);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(x - 6, y + 30, 12, 4);

  // kollar
  ctx.fillStyle = "#e0ac69";
  ctx.fillRect(x - 12, y + 26 + bob * 0.5, 4, 20);
  ctx.fillRect(x + 8, y + 26 + bob * 0.5, 4, 20);

  // kafa + sarı saç
  ctx.fillStyle = "#e0ac69";
  ctx.beginPath();
  ctx.arc(x, y + 12, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2d24b";
  ctx.beginPath();
  ctx.arc(x, y + 8, 11.5, Math.PI, 2 * Math.PI);
  ctx.fill();
  ctx.fillRect(x - 12, y + 6, 5, 20);
  ctx.fillRect(x + 7, y + 6, 5, 20);

  // yüz detay
  ctx.fillStyle = "#c0392b";
  ctx.fillRect(x - 3, y + 15, 6, 2);
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

function drawLeg(px, py, length, width, angle) {
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle);
  ctx.fillStyle = "#1b2a4a";
  ctx.fillRect(-width / 2, 0, width, length);
  ctx.fillStyle = "#fff";
  ctx.fillRect(-width / 2 - 1, length - 6, width + 4, 6);
  ctx.restore();
}

function drawArm(px, py, length, width, angle) {
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle);
  ctx.fillStyle = "#c0392b";
  ctx.fillRect(-width / 2, 0, width, length);
  ctx.fillStyle = "#e0ac69";
  ctx.fillRect(-width / 2, length - 5, width, 5);
  ctx.restore();
}

function drawPlayer() {
  const x = player.x - camX;
  const y = player.y;
  if (player.invincible > 0 && Math.floor(player.invincible * 12) % 2 === 0) return;

  const w = player.w, h = player.h;
  const legH = h * 0.4;
  const bodyH = h * 0.4;
  const headR = w * 0.42;
  const cx = x + w / 2, cy = y + h / 2;

  // gölge
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(cx, y + h + 2, w * 0.55, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // büyüme parıltısı (ışık halesi)
  if (player.big) {
    const pulse = 0.5 + Math.sin(performance.now() / 180) * 0.15;
    const extra = player.glow > 0 ? player.glow * 6 : 0;
    const r = w * 1.7 + extra;
    const glowGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
    glowGrad.addColorStop(0, `rgba(255,224,120,${0.45 * pulse + (player.glow > 0 ? 0.25 : 0)})`);
    glowGrad.addColorStop(1, "rgba(255,224,120,0)");
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // hareket açıları: koşu sallanışı ve zıplama pozu
  const moving = Math.abs(player.vx) > 5;
  let legL = 0, legR = 0, armL = 0, armR = 0;
  if (!player.onGround) {
    legL = 0.4; legR = -0.55;
    armL = -2.3; armR = -1.0;
  } else if (moving) {
    const s = Math.sin(player.animT);
    legL = s * 0.55;
    legR = -s * 0.55;
    armL = -s * 0.5;
    armR = s * 0.5;
  }

  ctx.save();
  ctx.translate(x + w / 2, 0);
  ctx.scale(player.facing, 1);
  ctx.translate(-w / 2, 0);

  const hipY = y + h - legH;
  const legW = w * 0.32;
  drawLeg(w * 0.72, hipY, legH, legW, legR);
  drawLeg(w * 0.28, hipY, legH, legW, legL);

  // eşofman üstü (gövde) - kırmızı, beyaz şerit
  const bodyY = y + h - legH - bodyH;
  ctx.fillStyle = "#c0392b";
  ctx.fillRect(0, bodyY, w, bodyH);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, bodyY + bodyH * 0.4, w, 4);

  const shoulderY = bodyY + 4;
  const armLen = bodyH * 0.62, armW = w * 0.22;
  drawArm(w + 1, shoulderY, armLen, armW, armR);
  drawArm(-1, shoulderY, armLen, armW, armL);

  // kafa
  const headCX = w / 2, headCY = bodyY - headR + 4;
  ctx.fillStyle = "#e0ac69";
  ctx.beginPath();
  ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
  ctx.fill();

  // kıvırcık saç (kahverengi, karamel vurgulu — referans fotoğraftaki saç stili)
  const hairBase = "#4a2f1f";
  const hairHighlight = "#8a5a35";
  const curls = [
    [-1.15, -0.55, 0.55], [-0.88, -0.98, 0.5], [-0.42, -1.18, 0.52], [0.05, -1.22, 0.54],
    [0.5, -1.12, 0.5], [0.92, -0.88, 0.52], [1.15, -0.48, 0.5], [1.08, 0.05, 0.44],
    [-1.08, 0.05, 0.44], [-0.72, -0.32, 0.4], [0.72, -0.32, 0.4], [0, -0.8, 0.56],
    [-1.2, -0.05, 0.36], [1.2, -0.05, 0.36],
  ];
  curls.forEach(([dx, dy, r], i) => {
    ctx.fillStyle = i % 3 === 0 ? hairHighlight : hairBase;
    ctx.beginPath();
    ctx.arc(headCX + dx * headR, headCY + dy * headR, r * headR, 0, Math.PI * 2);
    ctx.fill();
  });

  // gözler
  ctx.fillStyle = "#2a1a12";
  ctx.beginPath();
  ctx.arc(headCX - headR * 0.3, headCY + headR * 0.05, headR * 0.1, 0, Math.PI * 2);
  ctx.arc(headCX + headR * 0.3, headCY + headR * 0.05, headR * 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function draw() {
  drawBackground();
  drawGround();
  drawProps();
  for (const s of signs) drawSign(s.x, s.text);
  drawPlatforms();
  for (const b of boxes) drawBox(b);
  if (!moto.used) {
    const mx = moto.x - camX;
    if (mx > -80 && mx < W + 80) drawMotoIcon(mx + moto.w / 2, GROUND_Y - 2, 1);
    if (Math.abs(player.x - moto.x) < 220) {
      drawMotoHint(mx + moto.w / 2, GROUND_Y - moto.h - 6);
    }
  }
  for (const en of enemies) if (!en.dead) drawEnemy(en);
  for (const it of items) drawItem(it);
  drawGoal();
  drawWomanGreeter(GOAL_X - 60 - camX);
  if (player.riding) {
    drawMotoIcon(player.x - camX + player.w / 2, player.y + player.h - 4, 1.05);
  }
  drawPlayer();

  if (dialogueState === "line1") {
    drawSpeechBubble(WOMAN_X - camX, GROUND_Y - 88, "Buraya kadar gelmen büyük başarı");
  } else if (dialogueState === "line2") {
    drawSpeechBubble(player.x - camX + player.w / 2, player.y - 4, "Ne demek ama ebem s*kildi gerçekten...");
  }
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
  presentPixelated();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
