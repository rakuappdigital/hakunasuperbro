// Hakuna Superbro — Sahil Koşusu
// Basit canvas tabanlı Mario-vari platform oyunu (tek bölüm)

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

// Not: önceki sürümde tüm sahneyi küçültüp büyüterek "16-bit" görünüm
// veren bir efekt vardı; tabela/diyalog yazılarını okunmaz hale
// getirdiği için kaldırıldı. Piksel sanatı hissi artık doğrudan
// şekillerin kendisinden (düz renkler, keskin kenarlar) geliyor.
function presentPixelated() {}

const GROUND_Y = 430;
const GRAVITY = 1900;
const MOVE_SPEED = 260;
const RUN_SPEED = 380;
const JUMP_V = -640;
const BIG_JUMP_V = -700;

// ---------- Seviye verisi (prosedürel, orijinalin 2 katı uzunlukta) ----------
const LEVEL_END = 17160;
const GOAL_X = 16900;
const GREETER_X = GOAL_X - 250;

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
    if (groundSegs[s].x2 >= GREETER_X - 300 && groundSegs[s].x1 <= GOAL_X) {
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
  // Çift zıplamayla güvenle ulaşılabilecek yükseklik aralığı (~90-170px)
  const py = GROUND_Y - 90 - ((Math.abs(seg.x1) * 37) % 80);
  const pw = 120 + ((Math.abs(seg.x1) * 13) % 60);
  platforms.push({ x: px, y: py, w: pw, h: 22 });
}
// Bazı platformlar kırılabilir (kutu olmayanların bir kısmı)
platforms.forEach((p, i) => { p.breakable = i % 4 === 1; p.broken = false; });

// Tabelalar: tüm yola eşit yayılmış
const signTexts = ["FERAH MAHALLESİ", "KÜPLÜCE", "BURHANİYE", "BEYLERBEYİ", "KUZGUNCUK"];
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
  .map(p => ({ x: p.x + p.w / 2 - 20, y: p.y - 55, w: 40, h: 40, used: false }));

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
  { x: LEVEL_END * 0.18, type: "camlica_mosque" },
  { x: LEVEL_END * 0.30, type: "camlica_tower" },
  { x: LEVEL_END * 0.42, type: "beylerbeyi_stadium" },
  { x: LEVEL_END * 0.54, type: "beylerbeyi_palace" },
  { x: LEVEL_END * 0.66, type: "kuzguncuk_houses" },
  { x: LEVEL_END * 0.80, type: "kuzguncuk_houses" },
  { x: LEVEL_END * 0.90, type: "kuzguncuk_houses" },
];

// Motosiklet: tek seferlik, 10 saniyeliğine hız artışı verir
const moto = (() => {
  const targetX = LEVEL_END * 0.2;
  const seg = groundSegs.find(s => targetX >= s.x1 + 80 && targetX <= s.x2 - 80) || groundSegs[3];
  const x = Math.max(seg.x1 + 80, Math.min(targetX, seg.x2 - 80));
  return { x, w: 50, h: 28, used: false };
})();

// Cep telefonları: alınca "video çekme" ara sahnesi başlatır (yolda 3 tane)
function nearestGroundX(targetX) {
  let best = targetX, bestDist = Infinity;
  for (const s of groundSegs) {
    if (s.x2 - s.x1 < 200) continue;
    const clamped = Math.max(s.x1 + 60, Math.min(targetX, s.x2 - 60));
    const dist = Math.abs(clamped - targetX);
    if (dist < bestDist) { bestDist = dist; best = clamped; }
  }
  return best;
}

const phones = [0.12, 0.45, 0.75].map((frac) => ({
  x: nearestGroundX(LEVEL_END * frac),
  w: 20, h: 30, used: false,
}));

// Susamlı simit paralar: yolun genelinde küçük kümeler halinde
const coins = [];
for (const seg of groundSegs) {
  const segLen = seg.x2 - seg.x1;
  if (segLen < 400) continue;
  const baseX = seg.x1 + segLen * 0.68;
  for (let i = 0; i < 4; i++) {
    coins.push({
      x: baseX + i * 24,
      y: GROUND_Y - 96 - Math.sin((i / 3) * Math.PI) * 26,
      w: 18, h: 18, collected: false,
    });
  }
}

// Dev borular: "5 YILDIZLI MEKAN" bonus odasına açılır
// (üstlerinin platformlarla çakışmamasına dikkat edilir, yoksa oyuncu
// boruya hiç inemez)
const PIPE_THEMES = [
  {
    name: "HASİP USTA'NIN YERİ",
    stars: 1,
    bg: "kebap",
    review: "1 YILDIZLI YORUM GÖRSELİ: ürünler kötüydü, umarım ustaya kayyum atanır ya da kendinizi cimer'e örgütüüyesi diye bildirmeyi düşünüyorum :)",
    itemType: "kebap",
    menu: [["Adana Kebap", "180₺"], ["Lahmacun", "60₺"], ["Ayran", "20₺"], ["Salata", "40₺"], ["Baklava", "90₺"]],
  },
  {
    name: "EKOOZ",
    stars: 5,
    bg: "bar",
    review: "Mekan çok güzeldi, kıvırcık garson da gayet iyiydi. Son içtiğim ve 19 sularından gelen kırmızı kokteyl özellikle müthişti.",
    itemType: "cocktail",
    menu: [["Kırmızı Kokteyl", "120₺"], ["Mavi Kokteyl", "110₺"], ["Yeşil Kokteyl", "100₺"], ["Sarı Kokteyl", "115₺"], ["Servis", "Ücretsiz"]],
  },
  {
    name: "VUVU",
    stars: 4,
    bg: "kahve",
    review: "4 YILDIZLI YORUM GÖRSELİ: mekandaki her şey güzeldi, kahvaltı içmek için tekrar geleceğiz OĞUZ. yine de mekanın logosundaki kuşa e vikvik konuşan dallamatör müşteriye kıl oldum",
    itemType: "coffee",
    menu: [["Filtre Kahve", "70₺"], ["Latte", "85₺"], ["Kahvaltı Tabağı", "150₺"], ["Çay", "30₺"], ["Kruvasan", "55₺"]],
  },
];

const pipes = [0.24, 0.5, 0.76].map((frac, i) => {
  const targetX = LEVEL_END * frac;
  const w = 58;
  const baseX = nearestGroundX(targetX);
  const seg = groundSegs.find(s => baseX >= s.x1 - 1 && baseX <= s.x2 + 1) || groundSegs[0];
  const clearOf = (cx) =>
    cx >= seg.x1 + 20 && cx + w <= seg.x2 - 20 &&
    !platforms.some(p => cx < p.x + p.w + 25 && cx + w > p.x - 25);
  let x = Math.max(seg.x1 + 40, Math.min(seg.x2 - w - 40, baseX));
  if (!clearOf(x)) {
    const segLen = seg.x2 - seg.x1;
    const candidates = [
      seg.x1 + 30,
      seg.x2 - w - 30,
      seg.x1 + segLen * 0.15,
      seg.x1 + segLen * 0.85,
      seg.x1 + segLen * 0.6,
    ];
    const found = candidates.find(clearOf);
    if (found !== undefined) x = found;
  }
  return { x, y: GROUND_Y - 72, w, h: 72, theme: PIPE_THEMES[i] };
});

// Kontrol noktaları: geçilince bayrak açılır, yeni doğuş noktası olur
const checkpoints = [];
for (let x = 1000; x < GOAL_X - 400; x += 1000) {
  checkpoints.push({ x: nearestGroundX(x), reached: false, pop: 0 });
}

// Uçan düşmanlar: sahil üstünde devriye gezen kısa boylu güvercinler
const flyingEnemyDefs = [];
for (const seg of groundSegs) {
  const segLen = seg.x2 - seg.x1;
  if (segLen < 600 || seg.x1 > GOAL_X - 700 || seg.x1 < 400) continue;
  if (Math.floor(seg.x1 / 900) % 2 !== 0) continue;
  flyingEnemyDefs.push({
    x: seg.x1 + segLen * 0.5, x1: seg.x1 + 60, x2: seg.x2 - 60,
    baseY: GROUND_Y - 170 - (seg.x1 % 60),
  });
}

// Gizli bonuslar: platformların üstünde, çift zıplama gerektiren yükseklikte
const secrets = platforms
  .filter((_, i) => i % 3 === 1)
  .map(p => ({ x: p.x + p.w / 2 - 9, y: p.y - 45, w: 18, h: 18, collected: false }));

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
  for (const p of pipes) rects.push(p);
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
  crouching: false, crouchFullH: 0,
};

function setCrouch(isCrouch) {
  if (isCrouch === player.crouching) return;
  const oldH = player.h;
  if (isCrouch) {
    player.crouchFullH = player.h;
    player.h = Math.round(player.h * 0.6);
  } else {
    player.h = player.crouchFullH || player.h;
  }
  player.y += (oldH - player.h);
  player.crouching = isCrouch;
}

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

function foodShielded() {
  return player.big && player.beerTimer > 0;
}

function growPlayer() {
  // Yiyecek etkisi 5 saniye sürer; bu süre boyunca düşmanlar etki edemez.
  // Tekrar yiyeceğe dokununca süre yenilenir.
  player.beerTimer = 5;
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
    playHurtSound();
    triggerShake(0.2, 6);
    revertGrowth();
    player.invincible = 2;
  } else {
    loseLife();
  }
}

function killEnemy(en) {
  en.dead = true;
  combo += 1;
  comboTimer = 1.4;
  const bonus = 50 * (combo - 1);
  score += 100 + bonus;
  updateHud();
  playStompSound();
  spawnParticles(en.x + en.w / 2, en.y + en.h / 2, 8, "#3a3a3a");
  triggerShake(0.12, 3);
  if (combo > 1) {
    comboPopups.push({ x: en.x + en.w / 2, y: en.y, text: "x" + combo + " KOMBO!", timer: 0.9 });
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

let flyingEnemies = [];
function resetFlyingEnemies() {
  flyingEnemies = flyingEnemyDefs.map(e => ({
    x: e.x, x1: e.x1, x2: e.x2, baseY: e.baseY, y: e.baseY,
    w: 20, h: 14, vx: 75, dead: false, bobT: Math.random() * 10,
  }));
}
resetFlyingEnemies();

// ---------- Uçan yiyecekler (power-up) ----------
let items = [];
let foodNotify = null;
let bonusNotify = null;

// ---------- Kombo ----------
let combo = 0;
let comboTimer = 0;
let comboPopups = [];

// ---------- Parçacıklar & ekran sarsıntısı ----------
let particles = [];
let shakeTime = 0;
let shakeMag = 0;
function triggerShake(duration, magnitude) {
  shakeTime = Math.max(shakeTime, duration);
  shakeMag = Math.max(shakeMag, magnitude);
}
function spawnParticles(x, y, count, color) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 120;
    particles.push({
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 40,
      life: 0.4 + Math.random() * 0.3, maxLife: 0.7, color, size: 2 + Math.random() * 2,
    });
  }
}

// ---------- Ses efektleri (WebAudio, dosya gerekmez) ----------
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}
function beep(freq, duration, type, volume, startDelay, freqEnd) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type || "sine";
  const t0 = audioCtx.currentTime + (startDelay || 0);
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);
  gain.gain.setValueAtTime(volume || 0.2, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + duration);
}
function playJumpSound() { beep(340, 0.14, "square", 0.12, 0, 620); }
function playCollectSound() { beep(700, 0.09, "square", 0.12, 0); beep(1000, 0.1, "square", 0.12, 0.08); }
function playStompSound() { beep(180, 0.1, "square", 0.16, 0, 70); }
function playHurtSound() { beep(220, 0.22, "sawtooth", 0.14, 0, 70); }
function playCheckpointSound() { beep(660, 0.1, "sine", 0.14, 0); beep(880, 0.14, "sine", 0.14, 0.1); }
function playSecretSound() { beep(520, 0.08, "sine", 0.14, 0); beep(780, 0.08, "sine", 0.14, 0.07); beep(1040, 0.14, "sine", 0.14, 0.14); }
function playBreakSound() { beep(140, 0.12, "sawtooth", 0.16, 0, 55); }
function playPipeSound() { beep(200, 0.08, "square", 0.14, 0, 400); beep(400, 0.1, "square", 0.12, 0.08, 200); }
function playHeartSound() { beep(500, 0.1, "sine", 0.12, 0); beep(750, 0.12, "sine", 0.12, 0.08); }

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
let manX = GREETER_X;
let endingPhase = "none"; // none | hearts | dialogue1 | manwalk | done
let heartsThrown = 0;
let heartTimer = 0;
let hearts = [];
let manThrowFlash = 0;
const spiderman = { x: nearestGroundX(LEVEL_END * 0.58), phase: "idle", t: 0 };
let phoneTimer = 0;
let phoneAnimT = 0;
let phonePhase = "recording"; // recording | sending
let phoneSendTimer = 0;
let prevGameState = "playing";
let downHeld = false;
let simitCount = 0;
let bonusRoom = null;

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const overlayButtons = document.getElementById("overlay-buttons");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const motoEl = document.getElementById("moto");
const simitEl = document.getElementById("simit");
const sendBtn = document.getElementById("send-btn");

const BONUS_ROOM_FOOD_COUNT = 7;

function enterPipe(p) {
  playCheckpointSound();
  const theme = p.theme || PIPE_THEMES[1];
  const floorY = 460;
  const exitPipe = { x: W - 150, y: floorY - 70, w: 58, h: 70 };
  const roomSolids = [
    { x: -50, y: floorY, w: W + 100, h: 120 },
    exitPipe,
  ];
  const roomItems = [];
  for (let i = 0; i < BONUS_ROOM_FOOD_COUNT; i++) {
    const rx = 130 + i * 90;
    const ry = floorY - 90 - (i % 3) * 46;
    const item = { x: rx, y: ry, w: 22, h: 30, collected: false, bobT: Math.random() * 10 };
    if (theme.itemType === "cocktail") {
      item.cocktail = COCKTAIL_TYPES[Math.floor(Math.random() * COCKTAIL_TYPES.length)];
    } else if (theme.itemType === "coffee") {
      item.coffee = true;
      item.w = 22; item.h = 26;
    } else {
      item.kebap = true;
      item.w = 30; item.h = 20;
    }
    roomItems.push(item);
  }
  const reviewPhone = { x: W - 260, y: floorY - 36, w: 20, h: 30, used: false };
  bonusRoom = {
    theme,
    solids: roomSolids,
    items: roomItems,
    exitPipe,
    reviewPhone,
    reviewing: false,
    reviewT: 0,
    floorY,
    returnX: player.x,
    returnRespawnX: player.respawnX,
  };
  player.x = 60;
  player.y = floorY - player.h;
  player.vx = 0; player.vy = 0;
  if (player.crouching) setCrouch(false);
  player.jumpsUsed = 0;
  camX = 0;
  gameState = "bonusroom";

  bgMusic.pause();
  pipeMusic.currentTime = 0;
  pipeMusic.play().catch(() => {});
}

function exitBonusRoom() {
  player.x = bonusRoom.returnX + 60;
  player.y = GROUND_Y - player.h;
  player.respawnX = bonusRoom.returnRespawnX;
  player.vx = 0; player.vy = 0;
  if (player.crouching) setCrouch(false);
  player.jumpsUsed = 0;
  bonusRoom = null;
  gameState = "playing";
  camX = Math.max(0, Math.min(player.x - W / 2 + player.w / 2, LEVEL_END - W + 250));

  pipeMusic.pause();
  bgMusic.play().catch(() => {});
}

function startPhoneCutscene(ph) {
  ph.used = true;
  prevGameState = gameState;
  gameState = "phonecutscene";
  phoneTimer = 5;
  phoneAnimT = 0;
  phonePhase = "recording";
  sendBtn.classList.remove("hidden");
}

function sendPhoneVideo() {
  phonePhase = "sending";
  phoneSendTimer = 1.6;
  sendBtn.classList.add("hidden");
}

function endPhoneCutscene() {
  gameState = prevGameState;
  sendBtn.classList.add("hidden");
  score += 100;
  updateHud();
}

sendBtn.addEventListener("click", () => {
  if (gameState === "phonecutscene" && phonePhase === "recording") sendPhoneVideo();
  else if (gameState === "bonusroom" && bonusRoom && bonusRoom.reviewing) closeReview();
});

function closeReview() {
  bonusRoom.reviewing = false;
  sendBtn.classList.add("hidden");
}

function loseLife() {
  playHurtSound();
  triggerShake(0.25, 7);
  combo = 0; comboTimer = 0;
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
  simitEl.textContent = "🥯 " + simitCount;
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
    text: "Bİ ŞEYLER YAPALIM MI?",
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
const pipeMusic = new Audio("mariooo.mp3");
pipeMusic.loop = true;

function startGame() {
  ensureAudio();
  score = 0; lives = 3;
  player.big = false; player.w = BASE_W; player.h = BASE_H;
  player.respawnX = 0;
  player.riding = false; player.rideTimer = 0; player.glow = 0; player.beerTimer = 0;
  dialogueState = "none"; dialogueTimer = 0;
  manX = GREETER_X;
  endingPhase = "none";
  heartsThrown = 0; heartTimer = 0; hearts = []; manThrowFlash = 0;
  spiderman.phase = "idle"; spiderman.t = 0;
  respawnPlayer();
  boxes.forEach(b => b.used = false);
  moto.used = false;
  phones.forEach(ph => ph.used = false);
  sendBtn.classList.add("hidden");
  items = [];
  foodNotify = null;
  bonusNotify = null;
  combo = 0; comboTimer = 0; comboPopups = [];
  particles = [];
  shakeTime = 0; shakeMag = 0;
  checkpoints.forEach(c => { c.reached = false; c.pop = 0; });
  secrets.forEach(s => s.collected = false);
  coins.forEach(c => c.collected = false);
  platforms.forEach(p => p.broken = false);
  simitCount = 0;
  bonusRoom = null;
  downHeld = false;
  if (player.crouching) setCrouch(false);
  resetEnemies();
  resetFlyingEnemies();
  camX = 0;
  winTimer = 0;
  gameState = "playing";
  updateHud();
  overlay.classList.add("hidden");
  pipeMusic.pause();
  bgMusic.currentTime = 0;
  bgMusic.play().catch(() => {});
}

setOverlay({
  title: "HAZIR MISIN?",
  text: "Çamlıca'dan Üsküdar'a koş!<br/>Ok tuşları / A-D: hareket, Space / W: zıpla<br/>Havada tekrar bas: çift zıplama!",
  buttons: [{ label: "BAŞLA", onClick: startGame }],
});

// ---------- Güncelleme ----------
let lastTime = performance.now();
function update(dt) {
  if (gameState === "phonecutscene") {
    phoneAnimT += dt;
    if (phonePhase === "recording") {
      phoneTimer -= dt;
      if (phoneTimer <= 0) sendPhoneVideo();
    } else {
      phoneSendTimer -= dt;
      if (phoneSendTimer <= 0) endPhoneCutscene();
    }
    return;
  }

  if (gameState === "bonusroom") {
    if (bonusRoom.reviewing) {
      bonusRoom.reviewT += dt;
      return;
    }

    const down = keys["ArrowDown"] || keys["KeyS"];
    const left = keys["ArrowLeft"] || keys["KeyA"] || touchLeft;
    const right = keys["ArrowRight"] || keys["KeyD"] || touchRight;
    const jumpKey = keys["Space"] || keys["ArrowUp"] || keys["KeyW"] || touchJump;

    player.vx = 0;
    if (!player.crouching) {
      if (left) { player.vx = -MOVE_SPEED; player.facing = -1; }
      if (right) { player.vx = MOVE_SPEED; player.facing = 1; }
    }
    if (Math.abs(player.vx) > 5 && player.onGround) {
      player.animT += dt * (7 + Math.abs(player.vx) / 90);
    } else if (player.onGround) {
      player.animT += dt * 1.4;
    }

    if (jumpKey && !jumpHeld && player.jumpsUsed < 2 && !player.crouching) {
      player.vy = JUMP_V;
      player.jumpsUsed++;
      player.onGround = false;
      playJumpSound();
    }
    jumpHeld = jumpKey;

    player.vy += GRAVITY * dt;
    if (player.vy > 1200) player.vy = 1200;

    player.x += player.vx * dt;
    player.x = Math.max(10, Math.min(player.x, W - 10 - player.w));
    resolveCollisions("x", bonusRoom.solids);

    player.y += player.vy * dt;
    player.onGround = false;
    resolveCollisions("y", bonusRoom.solids);

    if (down && player.onGround && !player.crouching) setCrouch(true);
    else if (!down && player.crouching) setCrouch(false);

    const ep = bonusRoom.exitPipe;
    const onExitPipe = player.onGround &&
      player.x + player.w > ep.x + 6 && player.x < ep.x + ep.w - 6 &&
      Math.abs(player.y + player.h - ep.y) < 8;
    if (down && !downHeld && onExitPipe) {
      playPipeSound();
      exitBonusRoom();
      downHeld = down;
      return;
    }
    downHeld = down;

    for (const it of bonusRoom.items) {
      if (it.collected) continue;
      it.bobT += dt;
      if (rectsOverlap(playerRect(), { x: it.x, y: it.y, w: it.w, h: it.h })) {
        it.collected = true;
        score += 150;
        updateHud();
        playCollectSound();
        spawnParticles(it.x + it.w / 2, it.y + it.h / 2, 10, "#ffe07a");
      }
    }

    const rp = bonusRoom.reviewPhone;
    if (!rp.used && rectsOverlap(playerRect(), { x: rp.x, y: rp.y, w: rp.w, h: rp.h })) {
      rp.used = true;
      bonusRoom.reviewing = true;
      bonusRoom.reviewT = 0;
      playPipeSound();
      sendBtn.classList.remove("hidden");
    }
    return;
  }

  if (gameState !== "playing") return;

  // checkpoint ilerlemesi
  if (player.x - 40 > player.respawnX) player.respawnX = Math.max(player.respawnX, Math.floor(player.x / 400) * 400);

  // Final: kalp fırlatma + karşılaşma diyaloğu
  if (endingPhase === "none" && player.x + player.w >= GREETER_X - 260) {
    endingPhase = "hearts";
    heartsThrown = 0;
    heartTimer = 0.6;
  }
  const heartHeights = [GROUND_Y - 95, GROUND_Y - 55, GROUND_Y - 18];
  if (endingPhase === "hearts") {
    heartTimer -= dt;
    if (heartTimer <= 0 && heartsThrown < 5) {
      hearts.push({
        x: manX - 10,
        y: heartHeights[heartsThrown % heartHeights.length],
        vx: -230,
        w: 34, h: 30,
      });
      heartsThrown++;
      heartTimer = 0.9;
      manThrowFlash = 0.35;
      playHeartSound();
    }
    if (heartsThrown >= 5 && hearts.length === 0) {
      endingPhase = "dialogue1";
    }
  }
  if (manThrowFlash > 0) manThrowFlash -= dt;
  for (const h of hearts) h.x += h.vx * dt;
  for (const h of hearts) {
    if (!h.hit && rectsOverlap(playerRect(), { x: h.x - h.w / 2, y: h.y - h.h / 2, w: h.w, h: h.h })) {
      h.hit = true;
      spawnParticles(h.x, h.y, 8, "#ff5577");
      triggerShake(0.08, 2);
    }
  }
  hearts = hearts.filter(h => !h.hit && h.x > player.x - 400);

  if (endingPhase === "dialogue1" && dialogueState === "none" && player.x + player.w >= GREETER_X - 15) {
    dialogueState = "line1";
    dialogueTimer = 0;
  }
  if (dialogueState === "line1" || dialogueState === "line2") {
    dialogueTimer += dt;
    if (dialogueState === "line1" && dialogueTimer > 2.6) { dialogueState = "line2"; dialogueTimer = 0; }
    else if (dialogueState === "line2" && dialogueTimer > 2.6) {
      dialogueState = "done";
      endingPhase = "manwalk";
    }
  }
  if (endingPhase === "manwalk") {
    const targetX = GOAL_X - 80;
    if (manX < targetX) {
      manX += 90 * dt;
    } else {
      endingPhase = "done";
    }
  }
  const dialogueFreeze = dialogueState === "line1" || dialogueState === "line2";
  const spidermanFreeze = spiderman.phase !== "idle" && spiderman.phase !== "done";
  const freeze = dialogueFreeze || spidermanFreeze;

  const down = !freeze && (keys["ArrowDown"] || keys["KeyS"]);
  const left = !freeze && !player.crouching && (keys["ArrowLeft"] || keys["KeyA"] || touchLeft);
  const right = !freeze && !player.crouching && (keys["ArrowRight"] || keys["KeyD"] || touchRight);
  const jumpKey = !freeze && !player.crouching && (keys["Space"] || keys["ArrowUp"] || keys["KeyW"] || touchJump);
  const running = keys["ShiftLeft"] || keys["ShiftRight"];

  if (!player.riding) {
    if (down && player.onGround && !player.crouching) setCrouch(true);
    else if (!down && player.crouching) setCrouch(false);
  }

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
    playJumpSound();
  }
  jumpHeld = jumpKey;

  player.vy += GRAVITY * dt;
  if (player.vy > 1200) player.vy = 1200;

  // X hareketi + çarpışma
  player.x += player.vx * dt;
  if (player.x < -190) player.x = -190;
  resolveCollisions("x");

  // Y hareketi + çarpışma
  const wasRising = player.vy < 0;
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
        const food = FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)];
        items.push({ x: b.x + b.w / 2 - 14, y: b.y - 36, w: 28, h: 34, vx: 90, vy: -220, phase: "pop", food });
        score += 50;
        updateHud();
      }
    }
  }

  // Kırılabilir platformlara alttan vurma
  for (const p of platforms) {
    if (!p.breakable || p.broken) continue;
    const pr = playerRect();
    const xOverlap = pr.x + pr.w > p.x && pr.x < p.x + p.w;
    if (wasRising && xOverlap && Math.abs(pr.y - (p.y + p.h)) < 6) {
      p.broken = true;
      player.vy = 40;
      score += 20;
      updateHud();
      playBreakSound();
      spawnParticles(p.x + p.w / 2, p.y + p.h / 2, 14, "#b98a52");
      triggerShake(0.15, 3);
    }
  }

  // Simit paraları toplama
  for (const c of coins) {
    if (c.collected) continue;
    if (rectsOverlap(playerRect(), { x: c.x, y: c.y, w: c.w, h: c.h })) {
      c.collected = true;
      simitCount++;
      score += 10;
      updateHud();
      playCollectSound();
    }
  }

  // Boruya girme
  for (const p of pipes) {
    const onPipe = player.onGround &&
      player.x + player.w > p.x + 6 && player.x < p.x + p.w - 6 &&
      Math.abs(player.y + player.h - p.y) < 8;
    if (down && !downHeld && onPipe) {
      playPipeSound();
      enterPipe(p);
      downHeld = down;
      return;
    }
  }
  downHeld = down;

  // Spider-Man kamesi
  if (spiderman.phase === "idle" && player.x < spiderman.x && spiderman.x - player.x < 220) {
    spiderman.phase = "sensing";
    spiderman.t = 0;
  }
  if (spiderman.phase === "sensing") {
    spiderman.t += dt;
    if (spiderman.t > 1.1) { spiderman.phase = "down"; spiderman.t = 0; }
  } else if (spiderman.phase === "down") {
    spiderman.t += dt;
    if (spiderman.t > 1) { spiderman.phase = "hang"; spiderman.t = 0; }
  } else if (spiderman.phase === "hang") {
    spiderman.t += dt;
    if (spiderman.t > 2.6) { spiderman.phase = "up"; spiderman.t = 0; }
  } else if (spiderman.phase === "up") {
    spiderman.t += dt;
    if (spiderman.t > 1) spiderman.phase = "done";
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

  // Telefonu alma
  for (const ph of phones) {
    if (ph.used) continue;
    const phr = { x: ph.x, y: GROUND_Y - ph.h, w: ph.w, h: ph.h };
    if (rectsOverlap(playerRect(), phr)) {
      startPhoneCutscene(ph);
      return;
    }
  }

  // Kontrol noktaları
  for (const c of checkpoints) {
    if (!c.reached && player.x >= c.x) {
      c.reached = true;
      c.pop = 0.6;
      player.respawnX = Math.max(player.respawnX, c.x);
      playCheckpointSound();
      spawnParticles(c.x, GROUND_Y - 70, 10, "#ffcc00");
    }
  }

  // Gizli bonuslar
  for (const s of secrets) {
    if (s.collected) continue;
    if (rectsOverlap(playerRect(), { x: s.x, y: s.y, w: s.w, h: s.h })) {
      s.collected = true;
      score += 300;
      updateHud();
      playSecretSound();
      spawnParticles(s.x + s.w / 2, s.y + s.h / 2, 14, "#7fd1e0");
      bonusNotify = { text: "GİZLİ BONUS! +300", timer: 1.8 };
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
      if (player.riding) {
        killEnemy(en);
      } else if (stomping) {
        player.vy = JUMP_V * 0.55;
        killEnemy(en);
      } else if (player.invincible <= 0 && !foodShielded()) {
        shrinkPlayer();
      }
    }
  }
  enemies = enemies.filter(e => !e.dead || e._t !== undefined);

  // Uçan düşmanları (güvercinler) güncelle
  for (const en of flyingEnemies) {
    if (en.dead) continue;
    en.bobT += dt;
    en.x += en.vx * dt;
    if (en.x < en.x1) { en.x = en.x1; en.vx = Math.abs(en.vx); }
    if (en.x + en.w > en.x2) { en.x = en.x2 - en.w; en.vx = -Math.abs(en.vx); }
    en.y = en.baseY + Math.sin(en.bobT * 1.6) * 26;

    const er = { x: en.x, y: en.y, w: en.w, h: en.h };
    const pr = playerRect();
    if (rectsOverlap(pr, er)) {
      const stomping = player.vy > 0 && (pr.y + pr.h) - er.y < 16;
      if (player.riding || stomping) {
        if (!player.riding) player.vy = JUMP_V * 0.5;
        killEnemy(en);
      } else if (player.invincible <= 0 && !foodShielded()) {
        shrinkPlayer();
      }
    }
  }
  flyingEnemies = flyingEnemies.filter(e => !e.dead);

  // Item (yiyecek) güncelle
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
      foodNotify = { food: it.food, timer: 2.2 };
      playCollectSound();
      spawnParticles(it.x + it.w / 2, it.y + it.h / 2, 10, "#ffe07a");
      triggerShake(0.1, 2);
    }
  }
  items = items.filter(i => !i.collected && i.x < player.x + 1400);
  if (foodNotify && foodNotify.timer > 0) foodNotify.timer -= dt;
  if (bonusNotify && bonusNotify.timer > 0) bonusNotify.timer -= dt;

  // Kombo süresi
  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) combo = 0;
  }
  for (const p of comboPopups) { p.timer -= dt; p.y -= 30 * dt; }
  comboPopups = comboPopups.filter(p => p.timer > 0);

  // Kontrol noktası pop animasyonu
  for (const c of checkpoints) if (c.pop > 0) c.pop -= dt;

  // Parçacıklar
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 500 * dt;
    p.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);

  // Ekran sarsıntısı
  if (shakeTime > 0) shakeTime -= dt; else shakeMag = 0;

  // Kamera
  camX = Math.max(0, player.x - W / 2 + player.w / 2);
  camX = Math.min(camX, LEVEL_END - W + 250);
}

function resolveCollisions(axis, solidsList) {
  const list = solidsList || solids;
  const pr = playerRect();
  for (const s of list) {
    if (s.broken) continue;
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
    const isNear = lm.type === "beylerbeyi_palace" || lm.type === "kuzguncuk_houses" || lm.type === "beylerbeyi_stadium";
    const factor = isNear ? 0.55 : 0.15;
    const lx = (lm.x - camX) * factor + (W / 2) * (1 - factor);
    if (lx < -260 || lx > W + 260) continue;
    if (lm.type === "camlica_tower") drawCamlicaTower(lx);
    else if (lm.type === "camlica_mosque") drawCamlicaMosque(lx);
    else if (lm.type === "beylerbeyi_palace") drawBeylerbeyiPalace(lx);
    else if (lm.type === "kuzguncuk_houses") drawKuzguncukHouses(lx);
    else if (lm.type === "beylerbeyi_stadium") drawBeylerbeyiStadium(lx);
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

function drawBeylerbeyiStadium(x) {
  const baseY = GROUND_Y - 6;
  const w = 170, h = 50;
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(x, baseY + 4, w * 0.55, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // stant gövdesi (gri beton, kavisli üst)
  ctx.fillStyle = "#9a9ea3";
  ctx.beginPath();
  ctx.moveTo(x - w / 2, baseY);
  ctx.quadraticCurveTo(x, baseY - h - 10, x + w / 2, baseY);
  ctx.closePath();
  ctx.fill();

  // oturma sırası çizgileri
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + i * 10, baseY);
    ctx.quadraticCurveTo(x, baseY - h - 10 + i * 8, x + w / 2 - i * 10, baseY);
    ctx.stroke();
  }

  // saha (yeşil şerit, giriş boşluğundan görünen)
  ctx.fillStyle = "#4fa85e";
  ctx.fillRect(x - w / 2 + 16, baseY - 10, w - 32, 10);
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - w / 2 + 16, baseY - 10, w - 32, 10);

  // projektör direkleri
  for (const dx of [-w / 2 + 8, w / 2 - 8]) {
    ctx.fillStyle = "#555";
    ctx.fillRect(x + dx - 2, baseY - h - 40, 4, 40);
    ctx.fillStyle = "#ddd";
    ctx.fillRect(x + dx - 10, baseY - h - 46, 20, 8);
  }
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

// ---------- Yerel dekor: büfe / ağaç / dürümcü / tofaş ----------
const propTypes = ["bufe", "tofas", "durum", "tree", "tree"];
const props = [];
for (let x = 260, i = 0; x < LEVEL_END - 400; x += 380, i++) {
  props.push({ x, type: propTypes[i % propTypes.length] });
}

function drawProps() {
  for (const p of props) {
    const x = p.x - camX;
    if (x < -90 || x > W + 90) continue;
    if (p.type === "bufe") drawBufe(x);
    else if (p.type === "tree") drawTree(x);
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

function drawTree(x) {
  const baseY = GROUND_Y;
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(x, baseY + 2, 22, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // gövde
  ctx.fillStyle = "#6b4423";
  ctx.fillRect(x - 4, baseY - 30, 8, 30);
  // yapraklar
  ctx.fillStyle = "#3f8f4c";
  ctx.beginPath();
  ctx.arc(x, baseY - 42, 18, 0, Math.PI * 2);
  ctx.arc(x - 14, baseY - 32, 13, 0, Math.PI * 2);
  ctx.arc(x + 14, baseY - 32, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4fa85e";
  ctx.beginPath();
  ctx.arc(x - 6, baseY - 48, 10, 0, Math.PI * 2);
  ctx.fill();
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
    if (p.broken) continue;
    const x = p.x - camX;
    if (x + p.w < 0 || x > W) continue;
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.ellipse(x + p.w / 2, GROUND_Y + 4, p.w * 0.4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    const grad = ctx.createLinearGradient(x, p.y, x, p.y + p.h);
    grad.addColorStop(0, p.breakable ? "#c97a5a" : "#c9986a");
    grad.addColorStop(1, p.breakable ? "#8a4a30" : "#8a6136");
    ctx.fillStyle = grad;
    ctx.fillRect(x, p.y, p.w, p.h);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(x, p.y, p.w, 3);
    ctx.fillStyle = p.breakable ? "#5a2c18" : "#6b4a28";
    ctx.fillRect(x, p.y + p.h - 4, p.w, 4);
    if (p.breakable) {
      ctx.strokeStyle = "rgba(60,25,10,0.55)";
      ctx.lineWidth = 1;
      for (let bx = 8; bx < p.w; bx += 15) {
        ctx.beginPath();
        ctx.moveTo(x + bx, p.y + 2);
        ctx.lineTo(x + bx, p.y + p.h - 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(x + 2, p.y + p.h / 2);
      ctx.lineTo(x + p.w - 2, p.y + p.h / 2);
      ctx.stroke();
    }
  }
}

function drawCoin(c) {
  const x = c.x - camX;
  if (x + c.w < 0 || x > W) return;
  const bob = Math.sin(performance.now() / 260 + c.x) * 3;
  drawFoodIcon("simit", x + c.w / 2, c.y + c.h / 2 + bob, c.w, c.h);
}

function drawPipeShape(x, y, w, h, shadowY, showSign, label) {
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(x + w / 2, shadowY, w * 0.55, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0, "#2f9e4f");
  grad.addColorStop(0.5, "#3fc266");
  grad.addColorStop(1, "#237a3c");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y + 14, w, h - 14);
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(x + 6, y + 14, 6, h - 14);

  // ağız (lip)
  ctx.fillStyle = "#2f9e4f";
  ctx.fillRect(x - 6, y, w + 12, 18);
  ctx.strokeStyle = "#1c5c2c";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 6, y, w + 12, 18);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(x - 2, y + 3, 8, 12);

  if (!showSign) return;

  // tabela
  const text = label || "5 YILDIZLI MEKAN";
  let fontSize = 11;
  ctx.font = `bold ${fontSize}px Trebuchet MS`;
  const maxTextW = 190;
  while (ctx.measureText(text).width > maxTextW && fontSize > 7) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px Trebuchet MS`;
  }
  const tw = ctx.measureText(text).width;
  const bw = tw + 20, bh = 22;
  const bx = x + w / 2 - bw / 2, by = y - bh - 14;
  ctx.fillStyle = "#0033a0";
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(text, x + w / 2, by + 15);
  ctx.fillStyle = "#888";
  ctx.fillRect(x + w / 2 - 2, by + bh, 4, 14);
}

function drawPipe(p) {
  const x = p.x - camX;
  if (x + p.w < 0 || x > W) return;
  const stars = p.theme ? "★".repeat(p.theme.stars) : "★★★★★";
  const label = p.theme ? `${p.theme.name} (${stars})` : "5 YILDIZLI MEKAN";
  drawPipeShape(x, p.y, p.w, p.h, GROUND_Y + 3, true, label);
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

const FOOD_TYPES = ["simit", "durum", "pogaca", "midye", "kumpir"];
const FOOD_NAMES = { simit: "Simit", durum: "Dürüm", pogaca: "Poğaça", midye: "Midye Dolma", kumpir: "Kumpir" };

const COCKTAIL_TYPES = ["red", "blue", "green", "yellow"];
const COCKTAIL_COLORS = { red: "#e0304f", blue: "#2f8fe0", green: "#4fae5a", yellow: "#e0b830" };

function drawKebapIcon(cx, cy, w, h) {
  const x = cx - w / 2, y = cy - h / 2;
  // şiş
  ctx.strokeStyle = "#c9c9c9";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, cy);
  ctx.lineTo(x + w, cy);
  ctx.stroke();
  // et parçaları
  const chunkColors = ["#8a4a2a", "#a5592f", "#7a3f24"];
  for (let i = 0; i < 4; i++) {
    const ccx = x + 6 + i * (w - 12) / 3;
    ctx.fillStyle = chunkColors[i % chunkColors.length];
    ctx.beginPath();
    ctx.ellipse(ccx, cy, 7, h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // biber
  ctx.fillStyle = "#3a8f3a";
  ctx.beginPath();
  ctx.ellipse(x + w - 4, cy - 4, 5, 8, 0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawCoffeeIcon(cx, cy, w, h) {
  const x = cx - w / 2, y = cy - h / 2;
  // buhar
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 3, y - 2);
  ctx.quadraticCurveTo(cx - 8, y - 8, cx - 3, y - 14);
  ctx.moveTo(cx + 3, y - 2);
  ctx.quadraticCurveTo(cx + 8, y - 8, cx + 3, y - 14);
  ctx.stroke();
  // fincan
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(x + 2, y + 4);
  ctx.lineTo(x + w - 2, y + 4);
  ctx.lineTo(x + w - 5, y + h);
  ctx.lineTo(x + 5, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#5a3420";
  ctx.beginPath();
  ctx.ellipse(cx, y + 6, w * 0.42, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // kulp
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x + w + 1, y + h * 0.5, 4.5, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.stroke();
  // tabak
  ctx.fillStyle = "#eee";
  ctx.beginPath();
  ctx.ellipse(cx, y + h + 2, w * 0.6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawCocktailIcon(type, cx, cy, w, h) {
  const color = COCKTAIL_COLORS[type] || "#e0304f";
  const x = cx - w / 2, y = cy - h / 2;

  if (type === "red") {
    // martini kadehi
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(cx, y + h * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 3);
    ctx.lineTo(x + w - 3, y + 3);
    ctx.lineTo(cx, y + h * 0.48);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, y + h * 0.5);
    ctx.lineTo(cx, y + h * 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.3, y + h);
    ctx.lineTo(cx + w * 0.3, y + h);
    ctx.stroke();
  } else if (type === "blue") {
    // uzun bardak
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + h * 0.25, w - 4, h * 0.73);
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.7, y - 6);
    ctx.lineTo(x + w * 0.55, y + h * 0.3);
    ctx.stroke();
  } else if (type === "green") {
    // kısa tumbler
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(x, y + h * 0.2, w, h * 0.8);
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + h * 0.4, w - 4, h * 0.58);
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y + h * 0.2, w, h * 0.8);
    ctx.fillStyle = "#e0d030";
    ctx.beginPath();
    ctx.arc(x + w * 0.78, y + h * 0.28, 3.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // hurricane kupa
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(x + w * 0.15, y);
    ctx.quadraticCurveTo(x - w * 0.12, y + h * 0.5, x + w * 0.2, y + h);
    ctx.lineTo(x + w * 0.8, y + h);
    ctx.quadraticCurveTo(x + w * 1.12, y + h * 0.5, x + w * 0.85, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.22, y + h * 0.32);
    ctx.lineTo(x + w * 0.78, y + h * 0.32);
    ctx.lineTo(x + w * 0.72, y + h);
    ctx.lineTo(x + w * 0.28, y + h);
    ctx.closePath();
    ctx.fill();
  }
}

// Yiyecek ikonunu (cx,cy) merkezli, w x h boyutunda çizer.
// Hem dünyadaki küçük item hem de sağ üstteki büyük bildirim için kullanılır.
function drawFoodIcon(food, cx, cy, w, h) {
  const x = cx - w / 2, y = cy - h / 2;

  if (food === "simit") {
    // simit: susamlı halka
    ctx.strokeStyle = "#a8672c";
    ctx.lineWidth = w * 0.25;
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#f0dca0";
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * w * 0.4, cy + Math.sin(a) * w * 0.4, Math.max(1.3, w * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (food === "durum") {
    // dürüm: lavaş sarma
    ctx.fillStyle = "#e8d9a8";
    ctx.beginPath();
    ctx.moveTo(x + w * 0.07, y + h - h * 0.07);
    ctx.lineTo(x + w - w * 0.07, y + h * 0.18);
    ctx.lineTo(x + w - w * 0.22, y + h * 0.06);
    ctx.lineTo(x + w * 0.07, y + h - h * 0.24);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#6b8f3a";
    ctx.fillRect(x + w * 0.35, y + h * 0.35, w * 0.3, h * 0.12);
    ctx.fillStyle = "#c0392b";
    ctx.fillRect(x + w * 0.3, y + h * 0.5, w * 0.35, h * 0.12);
  } else if (food === "pogaca") {
    // poğaça: susamlı kubbe
    ctx.fillStyle = "#e0b060";
    ctx.beginPath();
    ctx.arc(cx, cy + h * 0.12, w * 0.42, Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = "#c8933e";
    ctx.fillRect(cx - w * 0.42, cy + h * 0.09, w * 0.84, h * 0.15);
    ctx.fillStyle = "#f5e3b0";
    const r = Math.max(1.3, w * 0.05);
    ctx.beginPath();
    ctx.arc(cx, cy - h * 0.06, r, 0, Math.PI * 2);
    ctx.arc(cx - w * 0.18, cy, r, 0, Math.PI * 2);
    ctx.arc(cx + w * 0.18, cy, r, 0, Math.PI * 2);
    ctx.fill();
  } else if (food === "midye") {
    // midye dolma: iki kabuk yarısı
    ctx.fillStyle = "#3a5a7a";
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.14, cy + h * 0.06, w * 0.32, h * 0.34, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4d7095";
    ctx.beginPath();
    ctx.ellipse(cx + w * 0.14, cy - h * 0.03, w * 0.32, h * 0.34, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8c96a";
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.22, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c0392b";
    ctx.beginPath();
    ctx.arc(cx - w * 0.1, cy - h * 0.03, Math.max(1.2, w * 0.04), 0, Math.PI * 2);
    ctx.fill();
  } else {
    // kumpir: dolgulu patates
    ctx.fillStyle = "#c8933e";
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.18, w * 0.42, h * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f5e3b0";
    ctx.beginPath();
    ctx.ellipse(cx, cy - h * 0.06, w * 0.4, h * 0.26, 0, Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = "#e0b83a";
    ctx.beginPath();
    ctx.arc(cx - w * 0.18, cy - h * 0.12, Math.max(2, w * 0.06), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c0392b";
    ctx.beginPath();
    ctx.arc(cx + w * 0.14, cy - h * 0.09, Math.max(1.6, w * 0.05), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4fa85e";
    ctx.beginPath();
    ctx.arc(cx + w * 0.04, cy - h * 0.18, Math.max(1.4, w * 0.045), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawItem(it) {
  const x = it.x - camX;
  if (x + it.w < 0 || x > W) return;
  const cx = x + it.w / 2, cy = it.y + it.h / 2;

  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(cx, it.y + it.h + 2, it.w * 0.45, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  drawFoodIcon(it.food, cx, cy, it.w, it.h);
}

function drawFoodNotify() {
  if (!foodNotify || foodNotify.timer <= 0) return;
  const boxW = 132, boxH = 108;
  const bx = W - boxW - 16, by = 46;
  ctx.save();
  ctx.globalAlpha = Math.min(1, foodNotify.timer * 2);
  ctx.fillStyle = "rgba(15,15,25,0.85)";
  roundRect(bx, by, boxW, boxH, 10);
  ctx.fill();
  ctx.strokeStyle = "#ffcc00";
  ctx.lineWidth = 2;
  ctx.stroke();
  drawFoodIcon(foodNotify.food, bx + boxW / 2, by + 44, 62, 72);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText(FOOD_NAMES[foodNotify.food] + "!", bx + boxW / 2, by + boxH - 12);
  ctx.restore();
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

function drawHint(x, y, text) {
  const bob = Math.sin(performance.now() / 220) * 4;
  ctx.font = "bold 12px Trebuchet MS";
  ctx.textAlign = "center";
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

function drawPhoneIcon(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(0, 17, 14, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#151515";
  roundRect(-10, -18, 20, 36, 5);
  ctx.fill();
  ctx.fillStyle = "#7fd1e0";
  ctx.fillRect(-8, -14, 16, 24);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(-8, -14, 6, 24);
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(0, 14, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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

function drawHeart(x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#ff4d6d";
  ctx.beginPath();
  ctx.moveTo(0, size * 0.35);
  ctx.bezierCurveTo(size * 0.6, -size * 0.5, size * 1.3, size * 0.25, 0, size * 1.1);
  ctx.bezierCurveTo(-size * 1.3, size * 0.25, -size * 0.6, -size * 0.5, 0, size * 0.35);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.ellipse(-size * 0.3, size * 0.1, size * 0.18, size * 0.1, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHeartsLayer() {
  for (const h of hearts) {
    const x = h.x - camX;
    if (x < -40 || x > W + 40) continue;
    drawHeart(x, h.y, 14);
  }
}

function drawSpidermanCameo() {
  const x = spiderman.x - camX;
  if (x < -100 || x > W + 100) return;

  if (spiderman.phase === "sensing") {
    const px = player.x - camX + player.w / 2;
    drawSpeechBubble(px, player.y - 6, "HİSSEDİYORUM...");
    return;
  }

  const hangDrop = 130;
  let drop;
  if (spiderman.phase === "down") drop = hangDrop * Math.min(1, spiderman.t / 1);
  else if (spiderman.phase === "hang") drop = hangDrop;
  else drop = hangDrop * Math.max(0, 1 - spiderman.t / 1);

  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, drop);
  ctx.stroke();

  ctx.save();
  ctx.translate(x, drop);
  ctx.rotate(Math.PI);
  ctx.fillStyle = "#c0392b";
  ctx.fillRect(-9, 0, 18, 26);
  ctx.fillStyle = "#1c3a8a";
  ctx.fillRect(-14, 4, 6, 16);
  ctx.fillRect(8, 4, 6, 16);
  ctx.fillStyle = "#c0392b";
  ctx.beginPath();
  ctx.arc(0, 30, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#8a1f18";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-9, 8); ctx.lineTo(9, 8);
  ctx.moveTo(-9, 16); ctx.lineTo(9, 16);
  ctx.moveTo(-5, 22); ctx.lineTo(5, 22);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(-3, 30, 4, 3, -0.3, 0, Math.PI * 2);
  ctx.ellipse(4, 30, 4, 3, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (spiderman.phase === "hang") {
    drawSpeechBubble(x, drop - 44, "FİLMİM GAYET GÜZEL VE 10 ÜZERİNDEN EN AZ 8!!");
  }
}

function drawManGreeter(x) {
  const baseY = GROUND_Y;
  const bob = Math.sin(performance.now() / 400) * 3;
  const y = baseY - 84 + bob * 0.2;

  // gölge
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(x, baseY + 2, 16, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // bacaklar (eşofman altı, lacivert)
  ctx.fillStyle = "#1b2a4a";
  ctx.fillRect(x - 6, y + 58, 5, 18);
  ctx.fillRect(x + 1, y + 58, 5, 18);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x - 7, y + 74, 7, 5);
  ctx.fillRect(x, y + 74, 7, 5);

  // gövde (siyah tişört)
  ctx.fillStyle = "#161616";
  ctx.fillRect(x - 12, y + 22, 24, 38);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x - 12, y + 22, 24, 5);

  // kollar (kalp fırlatırken sol kol öne doğru uzanır)
  const throwing = manThrowFlash > 0;
  const throwT = throwing ? manThrowFlash / 0.35 : 0;
  ctx.fillStyle = "#161616";
  if (throwing) {
    const armY = y + 30 - throwT * 10;
    ctx.fillRect(x - 24 - throwT * 6, armY, 14 + throwT * 6, 5);
    ctx.fillStyle = "#e0ac69";
    ctx.fillRect(x - 26 - throwT * 6, armY - 1, 5, 7);
  } else {
    ctx.fillRect(x - 16, y + 26 + bob * 0.5, 5, 20);
    ctx.fillStyle = "#e0ac69";
    ctx.fillRect(x - 16, y + 44 + bob * 0.5, 5, 5);
  }
  ctx.fillStyle = "#161616";
  ctx.fillRect(x + 11, y + 26 + bob * 0.5, 5, 20);
  ctx.fillStyle = "#e0ac69";
  ctx.fillRect(x + 11, y + 44 + bob * 0.5, 5, 5);

  // kafa
  const headCX = x, headCY = y + 10;
  ctx.fillStyle = "#e0ac69";
  ctx.beginPath();
  ctx.arc(headCX, headCY, 10.5, 0, Math.PI * 2);
  ctx.fill();

  // gözlük
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(headCX - 4, headCY, 3.4, 0, Math.PI * 2);
  ctx.arc(headCX + 4, headCY, 3.4, 0, Math.PI * 2);
  ctx.moveTo(headCX - 0.8, headCY);
  ctx.lineTo(headCX + 0.8, headCY);
  ctx.stroke();

  // kasket (şapka)
  ctx.fillStyle = "#1b2a4a";
  ctx.beginPath();
  ctx.arc(headCX, headCY - 1, 11.5, Math.PI, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = "#14213d";
  ctx.beginPath();
  ctx.ellipse(headCX + 8, headCY - 1, 6, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawGoal() {
  const gx = GOAL_X - 60 - camX;
  const baseY = GROUND_Y - 4;

  // yoldan adaya taş geçit
  ctx.fillStyle = "#9a9a8a";
  ctx.fillRect(gx - 46, baseY - 6, 46, 10);

  // kayalık ada temeli
  ctx.fillStyle = "#8a8f78";
  ctx.beginPath();
  ctx.ellipse(gx + 45, baseY + 4, 66, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6f7460";
  ctx.fillRect(gx, baseY - 14, 90, 16);

  // Kız Kulesi gövdesi (taş)
  const towerGrad = ctx.createLinearGradient(gx + 10, baseY - 150, gx + 80, baseY - 150);
  towerGrad.addColorStop(0, "#b6935f");
  towerGrad.addColorStop(0.5, "#e6cf9f");
  towerGrad.addColorStop(1, "#b6935f");
  ctx.fillStyle = towerGrad;
  ctx.fillRect(gx + 12, baseY - 150, 66, 138);

  // pencereler
  ctx.fillStyle = "#3a2a1a";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(gx + 27 + i * 17, baseY - 108, 8, 14);
  }

  // üst kornis + kırmızı konik çatı
  ctx.fillStyle = "#efe6d3";
  ctx.fillRect(gx + 4, baseY - 160, 82, 12);
  ctx.beginPath();
  ctx.moveTo(gx, baseY - 160);
  ctx.lineTo(gx + 45, baseY - 212);
  ctx.lineTo(gx + 90, baseY - 160);
  ctx.closePath();
  ctx.fillStyle = "#a83232";
  ctx.fill();

  // fener ışığı
  ctx.fillStyle = "rgba(255,240,180,0.45)";
  ctx.beginPath();
  ctx.arc(gx + 45, baseY - 166, 11, 0, Math.PI * 2);
  ctx.fill();

  // bayrak direği + Türk bayrağı
  ctx.fillStyle = "#999";
  ctx.fillRect(gx + 43, baseY - 236, 3, 24);
  const flagY = gameState === "win" ? Math.max(baseY - 236, baseY - 40 - winTimer * 120) : baseY - 232;
  ctx.fillStyle = "#e30a17";
  ctx.beginPath();
  ctx.moveTo(gx + 46, flagY);
  ctx.lineTo(gx + 78, flagY + 8);
  ctx.lineTo(gx + 46, flagY + 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(gx + 56, flagY + 8, 3, 0, Math.PI * 2);
  ctx.fill();

  // etiket
  ctx.fillStyle = "#0033a0";
  ctx.fillRect(gx - 15, baseY - 200, 120, 22);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.strokeRect(gx - 15, baseY - 200, 120, 22);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText("KIZ KULESİ", gx + 45, baseY - 184);
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

function drawSelfieFace(cx, cy, scale, tilt, mouthOpen) {
  const headR = 16 * scale;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);

  // omuz/gövde ipucu (kırmızı eşofman üstü)
  ctx.fillStyle = "#c0392b";
  ctx.beginPath();
  ctx.ellipse(0, headR * 1.9, headR * 1.6, headR * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // yüz
  ctx.fillStyle = "#e0ac69";
  ctx.beginPath();
  ctx.arc(0, 0, headR, 0, Math.PI * 2);
  ctx.fill();

  // kıvırcık saç
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
    ctx.arc(dx * headR, dy * headR, r * headR, 0, Math.PI * 2);
    ctx.fill();
  });

  // gözler
  ctx.fillStyle = "#2a1a12";
  ctx.beginPath();
  ctx.arc(-headR * 0.3, headR * 0.05, headR * 0.1, 0, Math.PI * 2);
  ctx.arc(headR * 0.3, headR * 0.05, headR * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // konuşurken açılıp kapanan ağız
  ctx.fillStyle = "#7a2e22";
  ctx.beginPath();
  ctx.ellipse(0, headR * 0.5, headR * 0.22, headR * (0.06 + mouthOpen * 0.16), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function wrapTextLines(text, maxWidth) {
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
  return lines;
}

function drawReviewScreen() {
  const theme = bonusRoom.theme || PIPE_THEMES[1];
  const reviewText = theme.review;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fillRect(0, 0, W, H);

  const pw = 230, ph = 380;
  const px = W / 2 - pw / 2, py = H / 2 - ph / 2;

  ctx.fillStyle = "#0a0a0a";
  roundRect(px, py, pw, ph, 28);
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 3;
  ctx.stroke();

  const sx = px + 10, sy = py + 24, sw = pw - 20, sh = ph - 48;
  ctx.fillStyle = "#161616";
  roundRect(sx, sy, sw, sh, 14);
  ctx.fill();

  // yıldızlar
  ctx.fillStyle = "#ffd700";
  ctx.font = "bold 24px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText("★".repeat(theme.stars) + "☆".repeat(5 - theme.stars), sx + sw / 2, sy + 44);
  ctx.fillStyle = "#aaa";
  ctx.font = "bold 11px Trebuchet MS";
  ctx.fillText("GOOGLE YORUMU", sx + sw / 2, sy + 64);

  // daktilo efektli metin
  const revealCount = Math.min(reviewText.length, Math.floor(bonusRoom.reviewT * 24));
  const shown = reviewText.slice(0, revealCount);
  ctx.font = "13px Trebuchet MS";
  ctx.fillStyle = "#eee";
  ctx.textAlign = "left";
  const lines = wrapTextLines(shown, sw - 32);
  lines.forEach((line, i) => {
    ctx.fillText(line, sx + 16, sy + 96 + i * 20);
  });
  const lastLineWidth = lines.length ? ctx.measureText(lines[lines.length - 1]).width : 0;
  if (revealCount < reviewText.length && Math.floor(performance.now() / 300) % 2 === 0) {
    const cursorY = sy + 96 + Math.max(0, lines.length - 1) * 20;
    ctx.fillRect(sx + 16 + lastLineWidth + 2, cursorY - 11, 7, 13);
  }

  ctx.restore();
}

function drawPhoneCutscene() {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, W, H);

  const pw = 220, ph = 380;
  const px = W / 2 - pw / 2, py = H / 2 - ph / 2;

  // telefon çerçevesi
  ctx.fillStyle = "#0a0a0a";
  roundRect(px, py, pw, ph, 28);
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 3;
  ctx.stroke();

  // ekran
  const sx = px + 10, sy = py + 26, sw = pw - 20, sh = ph - 52;
  ctx.save();
  ctx.beginPath();
  roundRect(sx, sy, sw, sh, 14);
  ctx.clip();

  const faceCX = sx + sw / 2;
  const faceCY = sy + sh / 2 + 10;

  if (phonePhase === "recording") {
    const skyG = ctx.createLinearGradient(sx, sy, sx, sy + sh);
    skyG.addColorStop(0, "#5fa8dc");
    skyG.addColorStop(1, "#bfe0f0");
    ctx.fillStyle = skyG;
    ctx.fillRect(sx, sy, sw, sh);

    const tilt = Math.sin(phoneAnimT * 2.2) * 0.22;
    const mouthOpen = (Math.sin(phoneAnimT * 7) + 1) / 2;
    drawSelfieFace(faceCX, faceCY, 2.6, tilt, mouthOpen);
  } else {
    ctx.fillStyle = "#12203a";
    ctx.fillRect(sx, sy, sw, sh);

    // gönderme animasyonu: dönen kağıt uçak
    const spin = phoneAnimT * 4;
    ctx.save();
    ctx.translate(faceCX, faceCY - 20);
    ctx.rotate(spin);
    ctx.fillStyle = "#7fd1e0";
    ctx.beginPath();
    ctx.moveTo(-16, 10);
    ctx.lineTo(16, 0);
    ctx.lineTo(-16, -10);
    ctx.lineTo(-8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // yükleniyor noktaları
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 3; i++) {
      const bob = Math.sin(phoneAnimT * 6 + i * 1.4) * 4;
      ctx.beginPath();
      ctx.arc(faceCX - 16 + i * 16, faceCY + 40 + bob, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();

  if (phonePhase === "recording") {
    // REC göstergesi
    if (Math.sin(performance.now() / 180) > 0) {
      ctx.fillStyle = "#ff3b3b";
      ctx.beginPath();
      ctx.arc(sx + 16, sy + 16, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px Trebuchet MS";
    ctx.textAlign = "left";
    ctx.fillText("REC " + Math.max(0, Math.ceil(phoneTimer)) + "sn", sx + 26, sy + 20);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText("Video kaydediliyor...", faceCX, py + ph - 16);
  } else {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText("DOĞUŞ'A GÖNDERİLİYOR...", faceCX, py + ph - 16);
  }

  ctx.fillStyle = "#444";
  ctx.beginPath();
  ctx.arc(px + pw / 2, py + 14, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawCheckpoint(c) {
  const x = c.x - camX;
  if (x < -40 || x > W + 40) return;
  const poleH = 70;
  const scale = 1 + (c.pop > 0 ? Math.sin(((0.6 - c.pop) / 0.6) * Math.PI) * 0.3 : 0);
  ctx.fillStyle = "#888";
  ctx.fillRect(x - 2, GROUND_Y - poleH, 4, poleH);
  ctx.save();
  ctx.translate(x, GROUND_Y - poleH + 8);
  ctx.scale(scale, scale);
  ctx.fillStyle = c.reached ? "#ffcc00" : "#666";
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(24, -2);
  ctx.lineTo(0, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFlyingEnemy(en) {
  const x = en.x - camX;
  if (x + en.w < 0 || x > W) return;
  const flap = Math.sin(en.bobT * 12);

  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.beginPath();
  ctx.ellipse(x + en.w / 2, GROUND_Y + 2, en.w * 0.35, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x + en.w / 2, en.y + en.h / 2);
  ctx.scale(en.vx < 0 ? 1 : -1, 1);
  // kanat
  ctx.fillStyle = "#6b7480";
  ctx.beginPath();
  ctx.moveTo(-1, 0);
  ctx.lineTo(-en.w * 0.55, -en.h * 0.9 * flap - 2);
  ctx.lineTo(2, 3);
  ctx.closePath();
  ctx.fill();
  // gövde
  ctx.fillStyle = "#8892a0";
  ctx.beginPath();
  ctx.ellipse(0, 0, en.w * 0.42, en.h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  // kafa
  ctx.fillStyle = "#a4adb8";
  ctx.beginPath();
  ctx.arc(en.w * 0.38, -en.h * 0.18, en.h * 0.3, 0, Math.PI * 2);
  ctx.fill();
  // gaga
  ctx.fillStyle = "#e0a030";
  ctx.beginPath();
  ctx.moveTo(en.w * 0.6, -en.h * 0.18);
  ctx.lineTo(en.w * 0.8, -en.h * 0.12);
  ctx.lineTo(en.w * 0.6, -en.h * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSecret(s) {
  const x = s.x - camX + s.w / 2, y = s.y + s.h / 2;
  if (x < -30 || x > W + 30) return;
  const pulse = 0.85 + Math.sin(performance.now() / 150) * 0.15;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(performance.now() / 900);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = "#ffd700";
  ctx.strokeStyle = "#c8960a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a1 = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const a2 = a1 + Math.PI / 5;
    ctx.lineTo(Math.cos(a1) * 9, Math.sin(a1) * 9);
    ctx.lineTo(Math.cos(a2) * 4, Math.sin(a2) * 4);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawParticlesLayer() {
  for (const p of particles) {
    const x = p.x - camX, y = p.y;
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawComboPopupsLayer() {
  ctx.textAlign = "center";
  ctx.font = "bold 14px Trebuchet MS";
  for (const p of comboPopups) {
    ctx.globalAlpha = Math.max(0, p.timer / 0.9);
    ctx.strokeStyle = "#7a4a00";
    ctx.lineWidth = 3;
    const x = p.x - camX, y = p.y;
    ctx.strokeText(p.text, x, y);
    ctx.fillStyle = "#ffcc00";
    ctx.fillText(p.text, x, y);
  }
  ctx.globalAlpha = 1;
}

function drawBonusNotify() {
  if (!bonusNotify || bonusNotify.timer <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, bonusNotify.timer * 2);
  ctx.font = "bold 20px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillStyle = "#000";
  ctx.fillText(bonusNotify.text, W / 2 + 2, 82);
  ctx.fillStyle = "#ffd700";
  ctx.fillText(bonusNotify.text, W / 2, 80);
  ctx.restore();
}

const THEME_STYLE = {
  kebap: { wall: "#1e1210", accent: "#e0763a", light: "rgba(255,150,80,0.85)" },
  bar: { wall: "#0b0b0f", accent: "#d4af37", light: "rgba(255,210,120,0.85)" },
  kahve: { wall: "#241a12", accent: "#c9974a", light: "rgba(255,205,140,0.8)" },
};

function drawThemeDecor(bg, accent) {
  if (bg === "kebap") {
    // döner şiş
    const dx = W - 90, dy = 96;
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(dx, dy - 55);
    ctx.lineTo(dx, dy + 55);
    ctx.stroke();
    ctx.fillStyle = "#8a4a2a";
    ctx.beginPath();
    ctx.moveTo(dx - 24, dy - 44);
    ctx.lineTo(dx + 24, dy - 44);
    ctx.lineTo(dx + 15, dy + 44);
    ctx.lineTo(dx - 15, dy + 44);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#c9763a";
    for (let yy = dy - 40; yy < dy + 40; yy += 8) ctx.fillRect(dx - 19, yy, 38, 3);
  } else if (bg === "kahve") {
    // kahve çekirdekleri
    for (let i = 0; i < 6; i++) {
      const bx = W - 60 - (i % 3) * 28, by = 66 + Math.floor(i / 3) * 22;
      ctx.fillStyle = "#3a2214";
      ctx.beginPath();
      ctx.ellipse(bx, by, 8, 6, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1a0e08";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx - 5, by);
      ctx.lineTo(bx + 5, by);
      ctx.stroke();
    }
  }
}

function drawBonusRoomScene() {
  const theme = bonusRoom.theme || PIPE_THEMES[1];
  const style = THEME_STYLE[theme.bg] || THEME_STYLE.bar;

  ctx.fillStyle = style.wall;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, bonusRoom.floorY);
    ctx.stroke();
  }

  // tavan ışıkları
  for (let x = 60; x < W; x += 140) {
    const glow = ctx.createRadialGradient(x, 40, 2, x, 40, 34);
    glow.addColorStop(0, style.light);
    glow.addColorStop(1, "rgba(255,210,120,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 34, 6, 68, 68);
    ctx.fillStyle = "#ffd27a";
    ctx.beginPath();
    ctx.arc(x, 40, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  drawThemeDecor(theme.bg, style.accent);

  // başlık
  ctx.fillStyle = style.accent;
  ctx.font = "bold 20px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText(`${"★".repeat(theme.stars)} ${theme.name}`, W / 2, 108);

  // menü panosu
  const menuX = 36, menuY = 140, menuW = 220, menuH = 158;
  ctx.fillStyle = "rgba(20,20,25,0.88)";
  ctx.fillRect(menuX, menuY, menuW, menuH);
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(menuX, menuY, menuW, menuH);
  ctx.fillStyle = style.accent;
  ctx.font = "bold 13px Trebuchet MS";
  ctx.textAlign = "left";
  ctx.fillText("MENÜ", menuX + 14, menuY + 22);
  ctx.font = "11px Trebuchet MS";
  theme.menu.forEach(([name, price], i) => {
    const yy = menuY + 44 + i * 20;
    ctx.fillStyle = "#eee";
    ctx.textAlign = "left";
    ctx.fillText(name, menuX + 14, yy);
    ctx.fillStyle = style.accent;
    ctx.textAlign = "right";
    ctx.fillText(price, menuX + menuW - 14, yy);
  });

  // zemin
  ctx.fillStyle = "#1c1c22";
  ctx.fillRect(0, bonusRoom.floorY, W, H - bonusRoom.floorY);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, bonusRoom.floorY);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.fillStyle = style.accent;
  ctx.fillRect(0, bonusRoom.floorY, W, 3);

  // ürünler (küçük taburelerin üstünde, fiyat etiketiyle)
  for (const it of bonusRoom.items) {
    if (it.collected) continue;
    const bobY = it.y + Math.sin(it.bobT * 2) * 4;
    ctx.fillStyle = "#3a2a1c";
    ctx.fillRect(it.x - 4, bonusRoom.floorY - 6, it.w + 8, 6);
    if (it.cocktail) drawCocktailIcon(it.cocktail, it.x + it.w / 2, bobY + it.h / 2, it.w, it.h);
    else if (it.coffee) drawCoffeeIcon(it.x + it.w / 2, bobY + it.h / 2, it.w, it.h);
    else drawKebapIcon(it.x + it.w / 2, bobY + it.h / 2, it.w, it.h);
    ctx.fillStyle = style.accent;
    ctx.font = "bold 10px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText("+150", it.x + it.w / 2, bobY - 6);
  }

  // inceleme telefonu
  const rp = bonusRoom.reviewPhone;
  if (!rp.used) {
    drawPhoneIcon(rp.x + rp.w / 2, rp.y + rp.h / 2, 1);
    drawHint(rp.x + rp.w / 2, rp.y - 12, "İncelemeyi oku");
  }

  const ep = bonusRoom.exitPipe;
  drawPipeShape(ep.x, ep.y, ep.w, ep.h, bonusRoom.floorY + 3, false);
  drawHint(ep.x + ep.w / 2, ep.y - 6, "Çıkmak için üstüne çık, sonra aşağı bas");

  drawPlayer();
  drawParticlesLayer();

  if (bonusRoom.reviewing) drawReviewScreen();
}

function draw() {
  if (gameState === "bonusroom") {
    drawBonusRoomScene();
    return;
  }
  ctx.save();
  if (shakeTime > 0) {
    ctx.translate((Math.random() - 0.5) * 2 * shakeMag, (Math.random() - 0.5) * 2 * shakeMag);
  }

  drawBackground();
  drawGround();
  drawProps();
  for (const c of checkpoints) drawCheckpoint(c);
  for (const s of signs) drawSign(s.x, s.text);
  drawPlatforms();
  for (const b of boxes) drawBox(b);
  for (const c of coins) if (!c.collected) drawCoin(c);
  for (const p of pipes) drawPipe(p);
  for (const s of secrets) if (!s.collected) drawSecret(s);
  if (!moto.used) {
    const mx = moto.x - camX;
    if (mx > -80 && mx < W + 80) drawMotoIcon(mx + moto.w / 2, GROUND_Y - 2, 1);
    if (Math.abs(player.x - moto.x) < 220) {
      drawHint(mx + moto.w / 2, GROUND_Y - moto.h - 6, "Motora binebilirsin");
    }
  }
  for (const ph of phones) {
    if (ph.used) continue;
    const phx = ph.x - camX;
    if (phx > -60 && phx < W + 60) drawPhoneIcon(phx + ph.w / 2, GROUND_Y - ph.h / 2, 1);
    if (Math.abs(player.x - ph.x) < 200) {
      drawHint(phx + ph.w / 2, GROUND_Y - ph.h - 16, "Telefonu alabilirsin");
    }
  }
  for (const en of enemies) if (!en.dead) drawEnemy(en);
  for (const en of flyingEnemies) if (!en.dead) drawFlyingEnemy(en);
  for (const it of items) drawItem(it);
  drawGoal();
  drawManGreeter(manX - camX);
  drawHeartsLayer();
  if (spiderman.phase !== "idle" && spiderman.phase !== "done") drawSpidermanCameo();
  if (player.riding) {
    drawMotoIcon(player.x - camX + player.w / 2, player.y + player.h - 4, 1.05);
  }
  drawPlayer();
  drawParticlesLayer();
  drawComboPopupsLayer();

  if (dialogueState === "line1") {
    drawSpeechBubble(player.x - camX + player.w / 2, player.y - 4, "NEDEN LOVEBOMBING YAPIYORSUN?");
  } else if (dialogueState === "line2") {
    drawSpeechBubble(manX - camX, GROUND_Y - 88, "YAPMIYORUM?");
  }

  ctx.restore();

  drawFoodNotify();
  drawBonusNotify();

  if (gameState === "phonecutscene") drawPhoneCutscene();
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
