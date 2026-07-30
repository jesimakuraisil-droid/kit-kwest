// ============================================================================
// KIT KWEST — pastel pixel infinite platformer
// ============================================================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

// --- Pixel-art rendering: draw at a lower internal resolution, then let
// the browser upscale it with nearest-neighbor scaling for chunky pixels.
const PIXEL_SCALE = 3;
canvas.width = Math.round(W / PIXEL_SCALE);
canvas.height = Math.round(H / PIXEL_SCALE);
ctx.imageSmoothingEnabled = false;

// ---------------------------------------------------------------------------
// Persistent save data (auto-save). Falls back to in-memory if storage
// is unavailable (e.g. sandboxed preview) so the game still works.
// ---------------------------------------------------------------------------
const SAVE_KEY = "kitkwest-save-v1";
let memoryFallback = {};

function storageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return memoryFallback[key] ?? null;
  }
}
function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    memoryFallback[key] = value;
  }
}

function defaultSave() {
  return {
    coins: 0,
    xp: 0,
    level: 1,
    bestStuds: 0,
    ownedSkins: ["basic_orange"],
    equippedSkin: "basic_orange",
    ownedAccessories: [],
    equippedAccessory: null,
    ownedWeapons: [],
    equippedWeapon: null,
    cheatUnlocked: false,
    stats: {
      correctAnswers: 0,
      gachaSpins: 0,
      bossesDefeated: 0,
      wizardFound: false,
      finalBossDefeated: false,
    },
  };
}

function loadSave() {
  const raw = storageGet(SAVE_KEY);
  if (!raw) return defaultSave();
  try {
    const parsed = JSON.parse(raw);
    return Object.assign(defaultSave(), parsed);
  } catch (e) {
    return defaultSave();
  }
}

let save = loadSave();
let saveDirty = false;

function markDirty() {
  saveDirty = true;
}

function flushSave() {
  if (!saveDirty) return;
  storageSet(SAVE_KEY, JSON.stringify(save));
  saveDirty = false;
}

setInterval(flushSave, 2000);
window.addEventListener("beforeunload", flushSave);

// ---------------------------------------------------------------------------
// Skins — ~100 procedurally described skins across rarity tiers.
// Each skin is a color recipe (body, stripe, accent) + a name + rarity.
// ---------------------------------------------------------------------------
const RARITY_WEIGHTS = { common: 60, rare: 28, epic: 10, legendary: 2 };
const RARITY_COLORS = {
  common: "#b0bec5",
  rare: "#64b5f6",
  epic: "#ba68c8",
  legendary: "#ffd54f",
};

const SKIN_PALETTE = [
  ["#ffab91", "Peach"], ["#ffe082", "Butter"], ["#fff59d", "Lemon"],
  ["#c5e1a5", "Sage"], ["#a5d6a7", "Mint"], ["#80cbc4", "Seafoam"],
  ["#81d4fa", "Sky"], ["#90caf9", "Bluebell"], ["#b39ddb", "Lilac"],
  ["#ce93d8", "Orchid"], ["#f48fb1", "Blush"], ["#ef9a9a", "Coral"],
  ["#bcaaa4", "Cocoa"], ["#eeeeee", "Cloud"], ["#fff176", "Sunbeam"],
  ["#ffcc80", "Apricot"], ["#e6ee9c", "Lime"], ["#80deea", "Aqua"],
  ["#9fa8da", "Periwinkle"], ["#f8bbd0", "Bubblegum"],
];
const SKIN_ACCENTS = [
  ["#ffffff", "Snowy"], ["#5d4037", "Shadow"], ["#212121", "Midnight"],
  ["#ffd54f", "Golden"], ["#ff7043", "Ember"], ["#4dd0e1", "Frost"],
  ["#ec407a", "Rosy"], ["#7e57c2", "Cosmic"], ["#66bb6a", "Fern"],
];

function buildSkinList() {
  const list = [];
  list.push({
    id: "basic_orange",
    name: "Classic Tabby",
    rarity: "common",
    body: "#ff9800",
    stripe: "#e65100",
  });
  let i = 0;
  for (const [body, bodyName] of SKIN_PALETTE) {
    for (const [stripe, stripeName] of SKIN_ACCENTS) {
      if (list.length >= 100) break;
      i++;
      const rarityRoll = i % 17;
      let rarity = "common";
      if (rarityRoll === 0) rarity = "legendary";
      else if (rarityRoll % 5 === 0) rarity = "epic";
      else if (rarityRoll % 2 === 0) rarity = "rare";
      list.push({
        id: `skin_${list.length}`,
        name: `${bodyName} ${stripeName}`,
        rarity,
        body,
        stripe,
      });
    }
    if (list.length >= 100) break;
  }
  return list.slice(0, 100);
}

const ALL_SKINS = buildSkinList();

// Exclusive skin — never in the gacha pool, only granted by the cheat code
const KNIGHT_SKIN = {
  id: "knight_secret",
  name: "Shadow Knight",
  rarity: "mythic",
  body: "#8a8f99",
  stripe: "#4a4f59",
  special: "knight",
};

const SKIN_BY_ID = Object.fromEntries(
  [...ALL_SKINS, KNIGHT_SKIN].map((s) => [s.id, s])
);

function weightedRandomSkin() {
  const pools = { common: [], rare: [], epic: [], legendary: [] };
  for (const s of ALL_SKINS) pools[s.rarity].push(s);
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (const tier of ["common", "rare", "epic", "legendary"]) {
    if (roll < RARITY_WEIGHTS[tier]) {
      const pool = pools[tier].length ? pools[tier] : pools.common;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    roll -= RARITY_WEIGHTS[tier];
  }
  return pools.common[0];
}

// ---------------------------------------------------------------------------
// Trivia question bank (math / science / general knowledge)
// ---------------------------------------------------------------------------
const QUESTIONS = [
  { q: "7 + 8 = ?", a: ["15", "14", "16", "13"], c: 0, cat: "math" },
  { q: "9 x 6 = ?", a: ["45", "54", "56", "63"], c: 1, cat: "math" },
  { q: "12 x 12 = ?", a: ["124", "144", "132", "148"], c: 1, cat: "math" },
  { q: "100 / 4 = ?", a: ["20", "25", "30", "22"], c: 1, cat: "math" },
  { q: "Square root of 81?", a: ["8", "9", "7", "11"], c: 1, cat: "math" },
  { q: "15 - 7 = ?", a: ["9", "7", "8", "6"], c: 2, cat: "math" },
  { q: "What is 2^5?", a: ["16", "32", "64", "10"], c: 1, cat: "math" },
  { q: "13 + 29 = ?", a: ["42", "40", "44", "41"], c: 0, cat: "math" },
  { q: "How many sides does a hexagon have?", a: ["5", "6", "7", "8"], c: 1, cat: "math" },
  { q: "What is the value of pi (rounded)?", a: ["3.10", "3.14", "3.41", "3.16"], c: 1, cat: "math" },
  { q: "Planet closest to the sun?", a: ["Venus", "Earth", "Mercury", "Mars"], c: 2, cat: "science" },
  { q: "What gas do plants absorb?", a: ["Oxygen", "Nitrogen", "Carbon dioxide", "Helium"], c: 2, cat: "science" },
  { q: "How many bones in the human body?", a: ["206", "186", "226", "196"], c: 0, cat: "science" },
  { q: "What is H2O?", a: ["Salt", "Water", "Sugar", "Oxygen"], c: 1, cat: "science" },
  { q: "Which organ pumps blood?", a: ["Lungs", "Liver", "Heart", "Kidney"], c: 2, cat: "science" },
  { q: "What force pulls objects to Earth?", a: ["Magnetism", "Gravity", "Friction", "Tension"], c: 1, cat: "science" },
  { q: "Fastest land animal?", a: ["Lion", "Cheetah", "Horse", "Leopard"], c: 1, cat: "science" },
  { q: "State of matter with no fixed shape or volume?", a: ["Solid", "Liquid", "Gas", "Plasma"], c: 2, cat: "science" },
  { q: "What do bees make?", a: ["Silk", "Honey", "Milk", "Wax only"], c: 1, cat: "science" },
  { q: "Sun is a type of what?", a: ["Planet", "Moon", "Star", "Comet"], c: 2, cat: "science" },
  { q: "Capital of France?", a: ["Rome", "Paris", "Berlin", "Madrid"], c: 1, cat: "gk" },
  { q: "How many continents are there?", a: ["5", "6", "7", "8"], c: 2, cat: "gk" },
  { q: "Largest ocean on Earth?", a: ["Atlantic", "Indian", "Arctic", "Pacific"], c: 3, cat: "gk" },
  { q: "How many days in a leap year?", a: ["365", "366", "364", "367"], c: 1, cat: "gk" },
  { q: "Which animal is known as man's best friend?", a: ["Cat", "Dog", "Horse", "Rabbit"], c: 1, cat: "gk" },
  { q: "How many colors in a rainbow?", a: ["5", "6", "7", "8"], c: 2, cat: "gk" },
  { q: "Currency used in Japan?", a: ["Yen", "Won", "Yuan", "Ringgit"], c: 0, cat: "gk" },
  { q: "How many players on a soccer team (on field)?", a: ["9", "10", "11", "12"], c: 2, cat: "gk" },
  { q: "Which shape has three sides?", a: ["Square", "Triangle", "Circle", "Pentagon"], c: 1, cat: "gk" },
  { q: "What do you call a baby cat?", a: ["Cub", "Kitten", "Pup", "Foal"], c: 1, cat: "gk" },
];

// ---------------------------------------------------------------------------
// Trivia sourcing: a public trivia API (thousands of random questions,
// any category) + infinite procedurally generated math + the local bank
// above as an offline fallback if the network fetch is unavailable.
// ---------------------------------------------------------------------------
let remoteQuestionQueue = [];
let remoteFetchInFlight = false;

function decodeHtmlEntities(str) {
  const ta = document.createElement("textarea");
  ta.innerHTML = str;
  return ta.value;
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function refillQuestionQueue() {
  if (remoteFetchInFlight || remoteQuestionQueue.length > 5) return;
  remoteFetchInFlight = true;
  try {
    const res = await fetch("https://opentdb.com/api.php?amount=25&type=multiple");
    const data = await res.json();
    if (data.results && data.results.length) {
      for (const r of data.results) {
        const options = shuffleArray([r.correct_answer, ...r.incorrect_answers]).map(decodeHtmlEntities);
        remoteQuestionQueue.push({
          q: decodeHtmlEntities(r.question),
          a: options,
          c: options.indexOf(decodeHtmlEntities(r.correct_answer)),
          cat: r.category,
        });
      }
    }
  } catch (e) {
    // Network unavailable (e.g. sandboxed preview) — fall back silently.
  }
  remoteFetchInFlight = false;
}

function generateMathQuestion() {
  const ops = ["+", "-", "×"];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a, b, answer;
  if (op === "+") {
    a = 2 + Math.floor(Math.random() * 60);
    b = 2 + Math.floor(Math.random() * 60);
    answer = a + b;
  } else if (op === "-") {
    a = 10 + Math.floor(Math.random() * 60);
    b = 2 + Math.floor(Math.random() * a);
    answer = a - b;
  } else {
    a = 2 + Math.floor(Math.random() * 12);
    b = 2 + Math.floor(Math.random() * 12);
    answer = a * b;
  }
  const wrongSet = new Set([answer]);
  while (wrongSet.size < 4) {
    const delta = 1 + Math.floor(Math.random() * 8);
    const wrong = Math.random() < 0.5 ? answer + delta : Math.max(0, answer - delta);
    wrongSet.add(wrong);
  }
  const options = shuffleArray(Array.from(wrongSet)).map(String);
  return { q: `${a} ${op} ${b} = ?`, a: options, c: options.indexOf(String(answer)), cat: "math" };
}

function randomQuestion() {
  const roll = Math.random();
  if (roll < 0.3) return generateMathQuestion();
  if (remoteQuestionQueue.length > 0) return remoteQuestionQueue.pop();
  return QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
}

// ---------------------------------------------------------------------------
// Upgrades — timed power-ups bought with coins, last 10 seconds each.
// ---------------------------------------------------------------------------
const UPGRADES = {
  jetpack: { name: "Jetpack Rocket", desc: "Hold jump to fly", cost: 300, duration: 10, color: "#90caf9" },
  car: { name: "Speedy Car", desc: "Fast + smash obstacles", cost: 250, duration: 10, color: "#f48fb1" },
  speedboost: { name: "Speed Boost", desc: "Move much faster", cost: 150, duration: 10, color: "#ffe082" },
  shield: { name: "Shield Bubble", desc: "Immune to everything", cost: 350, duration: 10, color: "#80deea" },
  megajump: { name: "Mega Jump", desc: "Jump much higher", cost: 180, duration: 10, color: "#c5e1a5" },
  doublejump: { name: "Double Jump Charm", desc: "Extra jump mid-air", cost: 220, duration: 10, color: "#ce93d8" },
  luckyclover: { name: "Lucky Clover", desc: "2x coins & xp", cost: 260, duration: 10, color: "#a5d6a7" },
  ninelives: { name: "Nine Lives", desc: "Survive one hit", cost: 400, duration: 10, color: "#ffab91" },
  timefreeze: { name: "Time Freeze", desc: "Saws slow way down", cost: 280, duration: 10, color: "#b39ddb" },
  miniform: { name: "Mini Form", desc: "Shrink to dodge easier", cost: 200, duration: 10, color: "#f8bbd0" },
};

let activeUpgrade = null; // { type, timeLeft }
let airJumped = false; // used by the Double Jump Charm upgrade
let cheatFlying = false; // toggled by double-tap jump, cheat-unlocked only
let lastJumpTapFrame = -999;

// ---------------------------------------------------------------------------
// Weapons — permanent purchases, used to attack the boss at range.
// ---------------------------------------------------------------------------
const WEAPONS = {
  yarncannon: { name: "Yarn Cannon", cost: 300, cooldown: 55, color: "#ffab91" },
  fishbomb: { name: "Fish Bomb", cost: 500, cooldown: 65, color: "#80cbc4" },
  laserwhisker: { name: "Laser Whisker", cost: 800, cooldown: 35, color: "#ef9a9a" },
  boomerang: { name: "Boomerang Toy", cost: 650, cooldown: 45, color: "#ce93d8" },
};

// ---------------------------------------------------------------------------
// Accessories — cosmetic purchases worn on the cat's head.
// ---------------------------------------------------------------------------
const ACCESSORIES = [
  { id: "top_hat", name: "Top Hat", cost: 200, color: "#333333" },
  { id: "bow", name: "Pink Bow", cost: 150, color: "#f06292" },
  { id: "bandana", name: "Bandana", cost: 180, color: "#e53935" },
  { id: "crown", name: "Crown", cost: 600, color: "#ffd54f" },
  { id: "halo", name: "Halo", cost: 500, color: "#fff59d" },
  { id: "party_hat", name: "Party Hat", cost: 220, color: "#7e57c2" },
  { id: "flower", name: "Flower Clip", cost: 160, color: "#ff8fc7" },
  { id: "beanie", name: "Beanie", cost: 190, color: "#4dd0e1" },
];

// ---------------------------------------------------------------------------
// Achievements — computed live from persistent stats, never stored as a
// separate unlocked flag so they can't get out of sync with the save.
// ---------------------------------------------------------------------------
const ACHIEVEMENTS = [
  { name: "First Steps", desc: "Reach 100 studs", check: (s) => s.bestStuds >= 100 },
  { name: "Century Club", desc: "Reach 1,000 studs", check: (s) => s.bestStuds >= 1000 },
  { name: "Marathon Runner", desc: "Reach 5,000 studs", check: (s) => s.bestStuds >= 5000 },
  { name: "Trivia Novice", desc: "Answer 5 questions correctly", check: (s) => s.stats.correctAnswers >= 5 },
  { name: "Trivia Whiz", desc: "Answer 25 questions correctly", check: (s) => s.stats.correctAnswers >= 25 },
  { name: "Boss Slayer", desc: "Defeat a boss", check: (s) => s.stats.bossesDefeated >= 1 },
  { name: "Boss Hunter", desc: "Defeat 5 bosses", check: (s) => s.stats.bossesDefeated >= 5 },
  { name: "Castle Conqueror", desc: "Defeat the Castle Guardian at 100,000 studs", check: (s) => s.stats.finalBossDefeated },
  { name: "Wizard Found", desc: "Find the secret far to the left", check: (s) => s.stats.wizardFound },
  { name: "Collector", desc: "Own 10 cat skins", check: (s) => s.ownedSkins.length >= 10 },
  { name: "Legendary Luck", desc: "Roll a legendary skin", check: (s) => s.ownedSkins.some((id) => SKIN_BY_ID[id]?.rarity === "legendary") },
  { name: "High Roller", desc: "Spin the gacha 10 times", check: (s) => s.stats.gachaSpins >= 10 },
  { name: "Rising Star", desc: "Reach level 10", check: (s) => s.level >= 10 },
];

function activateUpgrade(type) {
  const def = UPGRADES[type];
  if (!def) return false;
  if (activeUpgrade && activeUpgrade.type !== type && activeUpgrade.timeLeft > 0) {
    showToast("Finish your current upgrade first!");
    return false;
  }
  if (save.coins < def.cost) {
    showToast("Not enough coins!");
    return false;
  }
  save.coins -= def.cost;
  activeUpgrade = { type, timeLeft: def.duration };
  markDirty();
  showToast(`${def.name} activated!`);
  return true;
}

// ---------------------------------------------------------------------------
// Input: keyboard + on-screen joystick + jump/pause buttons
// ---------------------------------------------------------------------------
const input = {
  moveX: 0, // -1..1
  jumpQueued: false,
  jumpHeld: false,
};

const keys = {};
window.addEventListener("keydown", (e) => {
  if (e.target && e.target.tagName === "INPUT") return;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
    e.preventDefault();
  }
  if (!keys[e.code]) {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      input.jumpQueued = true;
    }
  }
  keys[e.code] = true;
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") input.jumpHeld = true;
});
window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") input.jumpHeld = false;
});

function keyboardAxis() {
  let x = 0;
  if (keys["ArrowLeft"] || keys["KeyA"]) x -= 1;
  if (keys["ArrowRight"] || keys["KeyD"]) x += 1;
  return x;
}

// --- Virtual joystick (touch + mouse) ---
const joyBase = document.getElementById("joy-base");
const joyKnob = document.getElementById("joy-knob");
let joyActive = false;
let joyPointerId = null;
let joyOrigin = { x: 0, y: 0 };
const JOY_RADIUS = 42;

function joySetKnob(dx, dy) {
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
}

function joyStart(clientX, clientY, pointerId) {
  joyActive = true;
  joyPointerId = pointerId;
  const rect = joyBase.getBoundingClientRect();
  joyOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  joyMove(clientX, clientY);
}
function joyMove(clientX, clientY) {
  if (!joyActive) return;
  let dx = clientX - joyOrigin.x;
  let dy = clientY - joyOrigin.y;
  const dist = Math.hypot(dx, dy);
  if (dist > JOY_RADIUS) {
    dx = (dx / dist) * JOY_RADIUS;
    dy = (dy / dist) * JOY_RADIUS;
  }
  joySetKnob(dx, dy);
  input.moveX = Math.max(-1, Math.min(1, dx / JOY_RADIUS));
}
function joyEnd() {
  joyActive = false;
  joyPointerId = null;
  joySetKnob(0, 0);
  input.moveX = 0;
}

joyBase.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  joyBase.setPointerCapture(e.pointerId);
  joyStart(e.clientX, e.clientY, e.pointerId);
});
joyBase.addEventListener("pointermove", (e) => {
  if (e.pointerId !== joyPointerId) return;
  e.preventDefault();
  joyMove(e.clientX, e.clientY);
});
window.addEventListener("pointerup", (e) => {
  if (e.pointerId === joyPointerId) joyEnd();
});
window.addEventListener("pointercancel", (e) => {
  if (e.pointerId === joyPointerId) joyEnd();
});

// --- Jump button ---
const jumpBtn = document.getElementById("jump-btn");
jumpBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  input.jumpQueued = true;
  input.jumpHeld = true;
});
jumpBtn.addEventListener("pointerup", () => { input.jumpHeld = false; });
jumpBtn.addEventListener("pointercancel", () => { input.jumpHeld = false; });
jumpBtn.addEventListener("pointerleave", () => { input.jumpHeld = false; });

// --- Pause button ---
const pauseBtn = document.getElementById("pause-btn");
pauseBtn.addEventListener("click", () => {
  togglePause();
});

function currentMoveAxis() {
  const kb = keyboardAxis();
  if (kb !== 0) return kb;
  return input.moveX;
}

// ---------------------------------------------------------------------------
// World / physics constants
// ---------------------------------------------------------------------------
const GRAVITY = 0.6;
const BASE_MOVE_SPEED = 4;
const JUMP_FORCE = -12;
const GROUND_Y = 420;
const STUD_SCALE = 0.1; // studs = worldX * STUD_SCALE

function studsFromX(x) {
  return Math.max(0, Math.floor(x * STUD_SCALE));
}

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

const GAME_MODES = {
  easy: { name: "Easy", rampDivisor: 8000, intensity: 0.6 },
  normal: { name: "Normal", rampDivisor: 5000, intensity: 1 },
  hard: { name: "Hard", rampDivisor: 3000, intensity: 1.5 },
  demonic: { name: "Demonic", rampDivisor: 1400, intensity: 2.6 },
};
let gameMode = "normal";

// Special modes inspired by the games in Squid Game — layered on top of the
// normal endless run, each with its own instant-fail rule.
const SQUID_MODES = {
  classic: { name: "Classic", desc: "Standard endless run, no twist" },
  redlight: { name: "Red Light, Green Light", desc: "Freeze the instant it's red" },
  chase: { name: "The Chase", desc: "A guard is closing in — don't stop" },
};
let squidMode = "classic";
let lightPhase = "green";
let lightTimer = 220;
let lightGrace = 0;
let chaserX = 0;

function difficultyAt(studs) {
  const mode = GAME_MODES[gameMode];
  return Math.min(1, studs / mode.rampDivisor);
}

const BIOMES = ["meadow", "desert", "snow", "cave", "candy"];
function biomeColors(biome) {
  switch (biome) {
    case "desert": return { sky1: "#ffe8c9", sky2: "#ffd9a0", ground: "#e0b878", accent: "#c98a4b" };
    case "snow": return { sky1: "#eaf6ff", sky2: "#d0ecff", ground: "#f0f6ff", accent: "#bcd6e8" };
    case "cave": return { sky1: "#d9c9f5", sky2: "#c3aef0", ground: "#a493c9", accent: "#7d69a8" };
    case "candy": return { sky1: "#ffd6ec", sky2: "#ffc1e3", ground: "#ffb3d9", accent: "#f78fc2" };
    case "castle": return { sky1: "#3a2e40", sky2: "#241c2a", ground: "#5a4f5c", accent: "#7a1f2a" };
    default: return { sky1: "#c9f0d8", sky2: "#aee9c9", ground: "#8fd6a8", accent: "#6bbf85" };
  }
}

// ---------------------------------------------------------------------------
// Procedural world generation — entities are generated ahead of the camera
// and pruned once far behind it.
// ---------------------------------------------------------------------------
let world = {
  gaps: [],       // { x, w }
  spikes: [],     // { x, w, h }
  saws: [],       // { x, y, r, minX, maxX, speed, dir }
  platforms: [],  // { x, y, w, h }
  portals: [],    // { x, w, h, used }
  decor: [],      // { x, y, biome, kind }
  gumdrops: [],   // { x, w, h } — candy biome, non-lethal but slows you down
  fallers: [],    // { x, y, vy, kind } — snow icicles / cave rocks
  biomeZones: [], // { startX, endX, biome }
  genX: 0,
  nextPortalX: 900,
  nextBossStuds: 10000,
};

let effectiveBiome = "meadow";
const CASTLE_STUDS = 100000;
let finalBossTriggered = false;
let castleForeshadowed = false;

// ---------------------------------------------------------------------------
// Ambient terrain audio — synthesized with the Web Audio API (no external
// sound files needed). Meadow/desert/snow/candy get a continuous filtered
// wind/rustle bed; caves get periodic water-drip blips instead.
// ---------------------------------------------------------------------------
let audioCtx = null;
let audioUnlocked = false;
let ambientFilter = null;
let ambientGain = null;
let dripTimeoutId = null;

const BIOME_AMBIENCE = {
  meadow: { type: "bandpass", freq: 900, Q: 0.6, gain: 0.16 },   // rustling grass/leaves
  desert: { type: "lowpass", freq: 500, Q: 0.4, gain: 0.14 },    // low wind
  snow: { type: "highpass", freq: 2200, Q: 0.5, gain: 0.12 },    // cold hiss
  candy: { type: "bandpass", freq: 1500, Q: 1, gain: 0.08 },     // faint sparkle bed
  cave: { type: "lowpass", freq: 250, Q: 0.3, gain: 0.05 },      // faint hum + drips
  castle: { type: "lowpass", freq: 180, Q: 0.8, gain: 0.09 },    // ominous low drone
};

function createNoiseBuffer(ctx, seconds) {
  const size = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function ensureAudio() {
  if (audioUnlocked) {
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    return;
  }
  audioUnlocked = true;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = createNoiseBuffer(audioCtx, 2);
    noiseSource.loop = true;
    ambientFilter = audioCtx.createBiquadFilter();
    ambientGain = audioCtx.createGain();
    ambientGain.gain.value = 0;
    noiseSource.connect(ambientFilter).connect(ambientGain).connect(audioCtx.destination);
    noiseSource.start();
    applyBiomeAmbience(effectiveBiome);
    audioCtx.resume().then(() => {
      if (typeof showToast === "function") showToast("Sound on");
    }).catch(() => {
      if (typeof showToast === "function") showToast("Audio blocked by this browser/preview");
    });
  } catch (e) {
    if (typeof showToast === "function") showToast("Audio not supported here");
  }
}

function applyBiomeAmbience(biome) {
  if (!audioCtx || !ambientFilter) return;
  const cfg = BIOME_AMBIENCE[biome] || BIOME_AMBIENCE.meadow;
  const now = audioCtx.currentTime;
  ambientFilter.type = cfg.type;
  ambientFilter.frequency.setTargetAtTime(cfg.freq, now, 0.4);
  ambientFilter.Q.setTargetAtTime(cfg.Q, now, 0.4);
  ambientGain.gain.setTargetAtTime(soundMuted ? 0 : cfg.gain, now, 0.6);

  clearTimeout(dripTimeoutId);
  if (biome === "cave") scheduleDrip();
}

function scheduleDrip() {
  const delay = 1400 + Math.random() * 2600;
  dripTimeoutId = setTimeout(() => {
    playDrip();
    if (effectiveBiome === "cave") scheduleDrip();
  }, delay);
}

function playDrip() {
  if (!audioCtx || soundMuted) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = "sine";
  const freq = 700 + Math.random() * 500;
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.6, now + 0.15);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.16, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}

window.addEventListener("pointerdown", ensureAudio, { once: true });
window.addEventListener("keydown", ensureAudio, { once: true });

let soundMuted = false;
const soundBtn = document.getElementById("sound-btn");
soundBtn.addEventListener("click", () => {
  ensureAudio();
  soundMuted = !soundMuted;
  soundBtn.textContent = soundMuted ? "🔇" : "🔊";
  if (audioCtx && ambientGain) {
    const now = audioCtx.currentTime;
    const cfg = BIOME_AMBIENCE[effectiveBiome] || BIOME_AMBIENCE.meadow;
    ambientGain.gain.setTargetAtTime(soundMuted ? 0 : cfg.gain, now, 0.2);
  }
});

function currentBiomeAt() {
  return effectiveBiome;
}

function resetWorld() {
  world = {
    gaps: [],
    spikes: [],
    saws: [],
    platforms: [],
    portals: [],
    decor: [],
    gumdrops: [],
    fallers: [],
    biomeZones: [],
    genX: 900,
    nextPortalX: 900,
    nextBossStuds: 10000,
  };
  effectiveBiome = "meadow";
  applyBiomeAmbience(effectiveBiome);
  fallerSpawnTimer = 60;
}

function generateAhead(targetX) {
  while (world.genX < targetX) {
    const studs = studsFromX(world.genX);
    const diff = difficultyAt(studs);

    // Portal checkpoint (terrain gate) — sized to match the cat, so it's
    // small enough to jump over/around if you don't want to take it.
    // The terrain itself only changes once a gate is actually answered
    // correctly (see answerQuestion) — skipping one changes nothing.
    if (world.genX >= world.nextPortalX) {
      const w = 30;
      const h = 30;
      const elevated = Math.random() < 0.4;
      const y = elevated ? GROUND_Y - h - (30 + Math.random() * 110) : GROUND_Y - h;
      world.portals.push({ x: world.genX, y, w, h, used: false });
      world.genX += w + 40;
      // Erratic spacing: sometimes clustered close together, sometimes far apart
      world.nextPortalX = world.genX + (Math.random() < 0.25
        ? 120 + Math.random() * 260
        : 400 + Math.random() * 1400);
      continue;
    }

    if (squidMode === "redlight") {
      // Keep this special mode pure: the light rule is the only danger,
      // nothing else competing for attention.
      world.genX += 40;
      continue;
    }

    const intensity = GAME_MODES[gameMode].intensity;
    const biomeHere = currentBiomeAt(world.genX);

    // Candy terrain gets its own unique hazard: sticky gumdrops that slow
    // you down instead of killing you outright.
    if (biomeHere === "candy" && Math.random() < 0.35) {
      world.gumdrops.push({ x: world.genX, w: 26, h: 16 });
      world.genX += 26 + lerp(150, 90, diff) / intensity;
      continue;
    }

    const roll = Math.random();
    if (roll < Math.min(0.6, lerp(0.12, 0.3, diff) * intensity)) {
      // Gap
      const w = lerp(60, 150, diff) * (0.7 + Math.random() * 0.6) * Math.min(1.3, intensity);
      world.gaps.push({ x: world.genX, w });
      // Occasionally bridge with a floating platform for variety
      if (Math.random() < 0.3 / intensity) {
        world.platforms.push({ x: world.genX + w * 0.35, y: GROUND_Y - 70, w: w * 0.3, h: 16 });
      }
      world.genX += w + lerp(180, 130, diff) / intensity;
    } else if (roll < Math.min(0.8, lerp(0.28, 0.55, diff) * intensity)) {
      // Spike patch
      const w = 28 + Math.floor(Math.random() * 2) * 28;
      world.spikes.push({ x: world.genX, w, h: 26 });
      world.genX += w + lerp(220, 140, diff) / intensity;
    } else if (roll < Math.min(0.92, lerp(0.4, 0.7, diff) * intensity)) {
      // Saw obstacle (moving)
      const range = lerp(80, 160, diff);
      const speed = lerp(1, 3.2, diff) * intensity;
      const floating = Math.random() < 0.4;
      const y = floating ? GROUND_Y - 100 - Math.random() * 60 : GROUND_Y - 22;
      world.saws.push({
        x: world.genX + range / 2, y, r: 16,
        minX: world.genX, maxX: world.genX + range,
        speed, dir: 1,
      });
      world.genX += range + lerp(200, 130, diff) / intensity;
    } else {
      // Clear stretch, maybe a floating decorative platform
      if (Math.random() < 0.35) {
        world.platforms.push({
          x: world.genX + 40, y: GROUND_Y - 60 - Math.random() * 80,
          w: 90, h: 16,
        });
      }
      world.genX += lerp(220, 160, diff) + Math.random() * 100;
    }

    // Background decor
    if (Math.random() < 0.5) {
      world.decor.push({ x: world.genX + Math.random() * 100, y: GROUND_Y, kind: Math.floor(Math.random() * 3) });
    }
  }
}

function pruneBehind(x) {
  const margin = 1200;
  const cut = x - margin;
  world.gaps = world.gaps.filter((g) => g.x + g.w > cut);
  world.spikes = world.spikes.filter((s) => s.x + s.w > cut);
  world.saws = world.saws.filter((s) => s.maxX > cut);
  world.platforms = world.platforms.filter((p) => p.x + p.w > cut);
  world.portals = world.portals.filter((p) => p.x + p.w > cut || !p.used);
  world.decor = world.decor.filter((d) => d.x > cut);
  world.gumdrops = world.gumdrops.filter((g) => g.x + g.w > cut);
  world.fallers = world.fallers.filter((f) => f.x > cut);
}

function isGapAt(x) {
  return world.gaps.some((g) => x >= g.x && x <= g.x + g.w);
}

// ---------------------------------------------------------------------------
// Secret path (far left) — fixed, deterministic obstacle corridor.
// ---------------------------------------------------------------------------
function seedSecretPath() {
  let gx = -140;
  let i = 0;
  while (gx > -8200) {
    i++;
    const m = i % 3;
    if (m === 0) world.gaps.push({ x: gx - 70, w: 70 });
    else if (m === 1) world.spikes.push({ x: gx - 100, w: 28, h: 26 });
    else world.saws.push({ x: gx - 140, y: GROUND_Y - 22, r: 16, minX: gx - 180, maxX: gx - 100, speed: 1.8, dir: 1 });
    gx -= 230;
  }
}

// ---------------------------------------------------------------------------
// Player, XP/leveling, rewards
// ---------------------------------------------------------------------------
let player, camX, gameState, currentQuestion, pendingPortal, toastMsg, toastTimer;
let toastQueue = [];
let boss = null;
let bossReturnX = 0;
let weaponCooldownTimer = 0;
let wizardCooldown = false;
let fallerSpawnTimer = 60;
let stickySlowTimer = 0;
const WIZARD_X = -8000;
let sparkles = [];

function xpForLevel(level) {
  return 50 + level * 20;
}

function addRewards(coins, xp) {
  if (activeUpgrade?.type === "luckyclover") {
    coins *= 2;
    xp *= 2;
  }
  save.coins += coins;
  save.xp += xp;
  while (save.xp >= xpForLevel(save.level)) {
    save.xp -= xpForLevel(save.level);
    save.level++;
    if (save.level % 10 === 0) {
      const bonus = 200 * (save.level / 10);
      save.coins += bonus;
      showToast(`Level ${save.level}! Bonus +${bonus} coins`);
    } else {
      showToast(`Level up! Lv.${save.level}`);
    }
  }
  if (studsFromX(player.x) > save.bestStuds) save.bestStuds = studsFromX(player.x);
  markDirty();
}

function showToast(msg) {
  toastQueue.push(msg);
}

function startRun() {
  resetWorld();
  seedSecretPath();
  player = { x: 100, y: 300, w: 30, h: 30, vx: 0, vy: 0, onGround: false, facing: 1 };
  camX = 0;
  boss = null;
  wizardCooldown = false;
  sparkles = [];
  airJumped = false;
  cheatFlying = false;
  finalBossTriggered = false;
  castleForeshadowed = false;
  lightPhase = "green";
  lightTimer = 220;
  lightGrace = 0;
  chaserX = player.x - 260;
  gameState = "playing";
  generateAhead(2000);
}

function moveSpeedNow() {
  let s = BASE_MOVE_SPEED;
  if (activeUpgrade?.type === "speedboost") s *= 2.2;
  else if (activeUpgrade?.type === "car") s *= 1.6;
  if (stickySlowTimer > 0) s *= 0.4;
  return s;
}

function updatePlayer() {
  // Mini Form: dynamically resize the hitbox, keeping feet position stable
  const targetSize = activeUpgrade?.type === "miniform" ? 20 : 30;
  if (player.w !== targetSize) {
    player.y += player.h - targetSize;
    player.w = targetSize;
    player.h = targetSize;
  }

  const axis = currentMoveAxis();
  const speed = moveSpeedNow();
  player.vx = axis * speed;
  if (axis > 0) player.facing = 1;
  else if (axis < 0) player.facing = -1;

  // Red Light, Green Light — freeze completely during red or it's over
  if (squidMode === "redlight") {
    lightTimer--;
    if (lightTimer <= 0) {
      if (lightPhase === "green") {
        lightPhase = "red";
        lightTimer = 90 + Math.random() * 90;
        lightGrace = 20;
      } else {
        lightPhase = "green";
        lightTimer = 180 + Math.random() * 150;
      }
    }
    if (lightGrace > 0) lightGrace--;
    if (lightPhase === "red" && lightGrace <= 0 && (Math.abs(player.vx) > 0.3 || !player.onGround)) {
      triggerGameOver();
      return;
    }
  }

  // The Chase — a guard steadily advances; falling behind means caught
  if (squidMode === "chase") {
    chaserX += BASE_MOVE_SPEED;
    if (chaserX + 26 >= player.x) {
      triggerGameOver();
      return;
    }
  }

  // Double-tap jump to toggle flight — exclusive to players who've entered
  // the cheat code (save.cheatUnlocked)
  let doubleTapTriggered = false;
  if (input.jumpQueued && save.cheatUnlocked) {
    if (frameCount - lastJumpTapFrame < 20) {
      cheatFlying = !cheatFlying;
      doubleTapTriggered = true;
      showToast(cheatFlying ? "Flight on" : "Flight off");
    }
    lastJumpTapFrame = frameCount;
  }

  const jetpack = activeUpgrade?.type === "jetpack" || cheatFlying;
  const megajump = activeUpgrade?.type === "megajump";
  const doublejump = activeUpgrade?.type === "doublejump";
  const jumpForceNow = megajump ? JUMP_FORCE * 1.4 : JUMP_FORCE;

  if (jetpack && input.jumpHeld) {
    player.vy -= 0.9;
    if (player.vy < -8) player.vy = -8;
  } else {
    if (input.jumpQueued && player.onGround && !doubleTapTriggered) {
      player.vy = jumpForceNow;
      player.onGround = false;
      airJumped = false;
    } else if (input.jumpQueued && doublejump && !player.onGround && !airJumped && !doubleTapTriggered) {
      player.vy = jumpForceNow * 0.85;
      airJumped = true;
    }
    player.vy += GRAVITY;
    if (player.vy > 18) player.vy = 18;
  }
  input.jumpQueued = false;

  player.x += player.vx;
  player.y += player.vy;

  // Ground collision (solid unless inside a gap)
  const centerX = player.x + player.w / 2;
  const overGap = isGapAt(centerX);
  player.onGround = false;
  if (!overGap && player.y + player.h >= GROUND_Y) {
    player.y = GROUND_Y - player.h;
    player.vy = 0;
    player.onGround = true;
    airJumped = false;
  }

  // Floating platforms
  for (const p of world.platforms) {
    if (
      player.x + player.w > p.x && player.x < p.x + p.w &&
      player.vy >= 0 &&
      player.y + player.h >= p.y && player.y + player.h - player.vy <= p.y + 10
    ) {
      player.y = p.y - player.h;
      player.vy = 0;
      player.onGround = true;
      airJumped = false;
    }
  }

  // Fell into a gap — instant once truly falling past the ground line with
  // nothing underneath (no more air-steering back onto a ledge).
  if (!player.onGround && player.y > GROUND_Y + 50) {
    triggerGameOver();
    return;
  }
  if (player.y > H + 150) {
    triggerGameOver();
    return;
  }

  const immune = activeUpgrade?.type === "car" || activeUpgrade?.type === "shield";

  // Spikes
  if (!immune) {
    for (const s of world.spikes) {
      if (player.x + player.w > s.x && player.x < s.x + s.w && player.y + player.h > GROUND_Y - s.h) {
        triggerGameOver();
        return;
      }
    }
  }

  // Gumdrops (candy biome) — non-lethal, but stick to you and slow you down
  for (const gum of world.gumdrops) {
    if (
      player.x + player.w > gum.x && player.x < gum.x + gum.w &&
      player.y + player.h > GROUND_Y - gum.h
    ) {
      stickySlowTimer = 45;
    }
  }
  if (stickySlowTimer > 0) stickySlowTimer--;

  // Snow icicles / cave rocks — fall from above ahead of the player
  fallerSpawnTimer--;
  const aheadBiome = currentBiomeAt(camX + W * 0.7);
  if (fallerSpawnTimer <= 0 && (aheadBiome === "snow" || aheadBiome === "cave")) {
    world.fallers.push({
      x: camX + W * 0.5 + Math.random() * W * 0.5,
      y: -20,
      vy: 4 + Math.random() * 2,
      kind: aheadBiome === "snow" ? "icicle" : "rock",
    });
    fallerSpawnTimer = 50 + Math.random() * 50;
  } else if (fallerSpawnTimer <= 0) {
    fallerSpawnTimer = 30;
  }
  for (const f of world.fallers) f.y += f.vy;
  world.fallers = world.fallers.filter((f) => f.y < GROUND_Y + 20);
  if (!immune) {
    for (const f of world.fallers) {
      const dx = centerX - f.x;
      const dy = player.y + player.h / 2 - f.y;
      if (Math.hypot(dx, dy) < 16) {
        triggerGameOver();
        return;
      }
    }
  }
  // Saws
  const sawSpeedMult = activeUpgrade?.type === "timefreeze" ? 0.15 : 1;
  for (const saw of world.saws) {
    saw.x += saw.speed * saw.dir * sawSpeedMult;
    if (saw.x < saw.minX || saw.x > saw.maxX) saw.dir *= -1;
    if (!immune) {
      const dx = centerX - saw.x;
      const dy = player.y + player.h / 2 - saw.y;
      if (Math.hypot(dx, dy) < saw.r + player.w / 2 - 4) {
        triggerGameOver();
        return;
      }
    }
  }

  // Portals (trivia gate) — trigger on touch, no need to stand still
  for (const portal of world.portals) {
    if (portal.used) continue;
    if (
      player.x + player.w > portal.x && player.x < portal.x + portal.w &&
      player.y + player.h > portal.y && player.y < portal.y + portal.h
    ) {
      pendingPortal = portal;
      currentQuestion = randomQuestion();
      gameState = "question";
      renderQuestionScreen();
      return;
    }
  }

  // Boss gate
  const studs = studsFromX(player.x);
  if (!castleForeshadowed && !finalBossTriggered && studs >= CASTLE_STUDS - 3000) {
    castleForeshadowed = true;
    effectiveBiome = "castle";
    applyBiomeAmbience(effectiveBiome);
  }
  if (!finalBossTriggered && studs >= CASTLE_STUDS && player.x > 0) {
    finalBossTriggered = true;
    startBoss(true);
    return;
  }
  if (studs >= world.nextBossStuds && player.x > 0) {
    startBoss(false);
    return;
  }

  // Secret wizard (far, far left)
  if (player.x <= WIZARD_X && !wizardCooldown) {
    wizardCooldown = true;
    for (let i = 0; i < 14; i++) {
      sparkles.push({
        x: WIZARD_X + (Math.random() - 0.5) * 40,
        y: GROUND_Y - 30 + (Math.random() - 0.5) * 40,
        timer: 30 + Math.random() * 20,
      });
    }
    const destStuds = 400 + Math.floor(Math.random() * 4000);
    player.x = destStuds / STUD_SCALE;
    player.y = 300;
    player.vx = 0;
    player.vy = 0;
    save.coins += 50;
    save.stats.wizardFound = true;
    markDirty();
  }
  if (player.x > -6000) wizardCooldown = false;

  // Camera + world streaming
  // Camera dead-zone: the cat moves freely on screen; the camera only
  // catches up once the cat nears the edges of a central "safe band".
  const screenX = player.x - camX;
  const deadLeft = W * 0.28;
  const deadRight = W * 0.6;
  if (screenX < deadLeft) camX = player.x - deadLeft;
  else if (screenX > deadRight) camX = player.x - deadRight;
  generateAhead(camX + W + 1500);
  pruneBehind(camX);

  if (activeUpgrade) {
    activeUpgrade.timeLeft -= 1 / 60;
    if (activeUpgrade.timeLeft <= 0) activeUpgrade = null;
  }
  for (const sp of sparkles) sp.timer--;
  sparkles = sparkles.filter((sp) => sp.timer > 0);
}

function triggerGameOver() {
  if (save.cheatUnlocked) {
    player.vy = Math.min(player.vy, 0);
    return;
  }
  if (activeUpgrade?.type === "ninelives") {
    activeUpgrade = null;
    player.vy = JUMP_FORCE * 0.7;
    player.x = Math.max(0, player.x - 40);
    showToast("Nine Lives saved you!");
    return;
  }
  gameState = "gameover";
  renderGameOverScreen();
}

// ---------------------------------------------------------------------------
// Boss fight
// ---------------------------------------------------------------------------
function startBoss(isFinal) {
  bossReturnX = player.x;
  const arenaX = player.x + 60;
  boss = {
    arenaX,
    isFinal: !!isFinal,
    x: arenaX + 200, y: GROUND_Y - (isFinal ? 90 : 60),
    w: isFinal ? 110 : 70, h: isFinal ? 100 : 60,
    minX: arenaX + 60, maxX: arenaX + (isFinal ? 460 : 340),
    speed: isFinal ? 2.8 : 2.2, dir: 1,
    hp: isFinal ? 15 : 5, maxHp: isFinal ? 15 : 5,
    hitCooldown: 0,
    spawnTimer: 80,
    projectiles: [],
    attacks: [],
    flash: 0,
  };
  weaponCooldownTimer = 0;
  player.x = arenaX;
  player.y = 300;
  player.vx = 0;
  player.vy = 0;
  gameState = "boss";
}

function fireWeapon() {
  if (!boss || gameState !== "boss") return;
  if (!save.equippedWeapon) {
    showToast("Equip a weapon first!");
    return;
  }
  if (weaponCooldownTimer > 0) return;
  const def = WEAPONS[save.equippedWeapon];
  weaponCooldownTimer = def.cooldown;
  boss.attacks.push({
    x: player.x + player.w / 2,
    y: player.y + player.h / 2,
    vx: (boss.x > player.x ? 1 : -1) * 7,
    color: def.color,
  });
}

function updateBoss() {
  const axis = currentMoveAxis();
  player.vx = axis * BASE_MOVE_SPEED;
  if (axis > 0) player.facing = 1;
  else if (axis < 0) player.facing = -1;

  if (input.jumpQueued && player.onGround) {
    player.vy = JUMP_FORCE;
    player.onGround = false;
  }
  input.jumpQueued = false;
  player.vy += GRAVITY;
  if (player.vy > 18) player.vy = 18;

  player.x += player.vx;
  player.x = Math.max(boss.arenaX - 20, Math.min(player.x, boss.arenaX + 420));
  player.y += player.vy;
  player.onGround = false;
  if (player.y + player.h >= GROUND_Y) {
    player.y = GROUND_Y - player.h;
    player.vy = 0;
    player.onGround = true;
  }
  if (player.y > H + 150) {
    triggerGameOver();
    return;
  }

  // Boss movement
  boss.x += boss.speed * boss.dir;
  if (boss.x < boss.minX || boss.x > boss.maxX) boss.dir *= -1;
  if (boss.hitCooldown > 0) boss.hitCooldown--;
  if (boss.flash > 0) boss.flash--;
  if (weaponCooldownTimer > 0) weaponCooldownTimer--;

  const immune = activeUpgrade?.type === "car" || activeUpgrade?.type === "shield";

  // Player weapon attacks
  for (const atk of boss.attacks) atk.x += atk.vx;
  boss.attacks = boss.attacks.filter((atk) => Math.abs(atk.x - player.x) < 500);
  for (const atk of boss.attacks) {
    const dx = boss.x + boss.w / 2 - atk.x;
    const dy = boss.y + boss.h / 2 - atk.y;
    if (Math.hypot(dx, dy) < 30 && boss.hitCooldown === 0) {
      boss.hp--;
      boss.hitCooldown = 25;
      boss.flash = 12;
      atk.hit = true;
      if (boss.hp <= 0) {
        defeatBoss();
        return;
      }
    }
  }
  boss.attacks = boss.attacks.filter((atk) => !atk.hit);

  // Boss projectiles — aimed at the player's position when fired
  boss.spawnTimer--;
  if (boss.spawnTimer <= 0) {
    boss.spawnTimer = Math.max(45, 90 - boss.maxHp - (boss.maxHp - boss.hp) * 10);
    const originX = boss.x + boss.w / 2;
    const originY = boss.y;
    const targetX = player.x + player.w / 2;
    const targetY = player.y + player.h / 2;
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const speed = boss.isFinal ? 5.5 : 4;
    boss.projectiles.push({
      x: originX, y: originY,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
    });
  }
  for (const proj of boss.projectiles) {
    proj.x += proj.vx;
    proj.y += proj.vy;
  }
  boss.projectiles = boss.projectiles.filter((p) => p.y < GROUND_Y + 20 && p.x > boss.arenaX - 200 && p.x < boss.arenaX + 700);

  // Player vs boss body (stomp check)
  const overlapBoss =
    player.x + player.w > boss.x && player.x < boss.x + boss.w &&
    player.y + player.h > boss.y && player.y < boss.y + boss.h;
  if (overlapBoss) {
    const stomping = player.vy > 0 && player.y + player.h - boss.y < 22;
    if (stomping && boss.hitCooldown === 0) {
      boss.hp--;
      boss.hitCooldown = 40;
      boss.flash = 12;
      player.vy = JUMP_FORCE * 0.6;
      if (boss.hp <= 0) {
        defeatBoss();
        return;
      }
    } else if (boss.hitCooldown === 0 && !immune) {
      triggerGameOver();
      return;
    }
  }

  // Projectile hits
  if (!immune) {
    for (const proj of boss.projectiles) {
      const dx = player.x + player.w / 2 - proj.x;
      const dy = player.y + player.h / 2 - proj.y;
      if (Math.hypot(dx, dy) < 16) {
        triggerGameOver();
        return;
      }
    }
  }

  camX = boss.arenaX - 60;
}

function defeatBoss() {
  const wasFinal = boss?.isFinal;
  if (wasFinal) {
    addRewards(5000, 3000);
    save.stats.bossesDefeated++;
    save.stats.finalBossDefeated = true;
    markDirty();
    showToast("The Castle Guardian falls! Kit Kwest complete!");
    // Back to normal after the castle — pick a fresh ordinary biome and
    // give the next regular boss some breathing room
    effectiveBiome = BIOMES[Math.floor(Math.random() * BIOMES.length)];
    applyBiomeAmbience(effectiveBiome);
    world.nextBossStuds = Math.max(world.nextBossStuds, studsFromX(bossReturnX) + 10000);
  } else {
    addRewards(500, 300);
    save.stats.bossesDefeated++;
    markDirty();
    showToast("Boss defeated! +500 coins");
    world.nextBossStuds += 10000;
  }
  player.x = bossReturnX + 200;
  player.y = 300;
  player.vx = 0;
  player.vy = 0;
  boss = null;
  gameState = "playing";
  generateAhead(player.x + W + 1500);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
let frameCount = 0;

function drawBackground(biome) {
  const c = biomeColors(biome);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, c.sky1);
  grad.addColorStop(1, c.sky2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // parallax clouds/blobs
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  for (let i = 0; i < 5; i++) {
    const cx = (((i * 300 - camX * 0.25) % (W + 300)) + (W + 300)) % (W + 300) - 150;
    ctx.beginPath();
    ctx.ellipse(cx, 70 + (i % 3) * 25, 45, 20, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 35, 65 + (i % 3) * 25, 32, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // parallax hill silhouettes (blocky, pixel-stepped) for terrain depth
  ctx.fillStyle = c.accent;
  const hillW = 90;
  const baseOff = -((camX * 0.5) % hillW);
  for (let i = -1; i * hillW + baseOff < W + hillW; i++) {
    const hx = i * hillW + baseOff;
    const hh = 40 + ((i + Math.floor(camX / hillW)) % 3) * 18;
    ctx.fillRect(hx, GROUND_Y - hh, hillW - 6, hh);
  }
}

function drawGroundTexture(x0, x1, biome) {
  const c = biomeColors(biome);
  // Draw ground only where not a gap — walk in slices
  const sliceW = 20;
  for (let gx = x0; gx < x1; gx += sliceW) {
    if (isGapAt(gx + sliceW / 2)) continue;
    const sx = gx - camX;
    ctx.fillStyle = c.ground;
    ctx.fillRect(sx, GROUND_Y, sliceW + 1, H - GROUND_Y);
    ctx.fillStyle = c.accent;
    ctx.fillRect(sx, GROUND_Y, sliceW + 1, 8);
    // texture dots / bricks
    if (biome === "cave") {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      if (Math.floor(gx / sliceW) % 2 === 0) ctx.fillRect(sx + 4, GROUND_Y + 16, 4, 4);
    } else if (biome === "snow") {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillRect(sx + 2, GROUND_Y + 2, sliceW - 4, 4);
    } else if (biome === "desert") {
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.strokeRect(sx, GROUND_Y + 10, sliceW, 10);
    } else if (biome === "candy") {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.arc(sx + sliceW / 2, GROUND_Y + 14, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // meadow grass tufts
      ctx.fillStyle = "#5fa96f";
      ctx.beginPath();
      ctx.moveTo(sx + 2, GROUND_Y);
      ctx.lineTo(sx + 5, GROUND_Y - 6);
      ctx.lineTo(sx + 8, GROUND_Y);
      ctx.fill();
    }
  }
}

function drawDecor() {
  for (const d of world.decor) {
    const sx = d.x - camX;
    if (sx < -50 || sx > W + 50) continue;
    const biome = currentBiomeAt(d.x);
    ctx.save();
    ctx.translate(sx, GROUND_Y);
    if (biome === "desert") {
      ctx.fillStyle = "#8fae5c";
      ctx.fillRect(-3, -30, 6, 30);
      ctx.fillRect(-14, -20, 6, 20);
      ctx.fillRect(8, -16, 6, 16);
    } else if (biome === "snow") {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.moveTo(0, -34);
      ctx.lineTo(14, 0);
      ctx.lineTo(-14, 0);
      ctx.fill();
    } else if (biome === "cave") {
      ctx.fillStyle = "#9d7fd6";
      ctx.beginPath();
      ctx.moveTo(0, -26);
      ctx.lineTo(8, 0);
      ctx.lineTo(-8, 0);
      ctx.fill();
    } else if (biome === "candy") {
      ctx.fillStyle = "#ff8fc7";
      ctx.beginPath();
      ctx.arc(0, -18, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c96a9a";
      ctx.fillRect(-3, -4, 6, 10);
    } else {
      ctx.fillStyle = "#4f9463";
      ctx.beginPath();
      ctx.arc(0, -24, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#7a5a3a";
      ctx.fillRect(-3, -8, 6, 10);
    }
    ctx.restore();
  }
}

function drawSpikes() {
  for (const s of world.spikes) {
    const sx = s.x - camX;
    if (sx < -40 || sx > W + 40) continue;
    const biome = currentBiomeAt(s.x);
    ctx.fillStyle = biome === "desert" ? "#4a7c3f" : biome === "cave" ? "#9d7fd6" : biome === "snow" ? "#b8e2f2" : "#e57373";
    const teeth = Math.max(1, Math.floor(s.w / 14));
    for (let i = 0; i < teeth; i++) {
      const tx = sx + i * 14;
      ctx.beginPath();
      ctx.moveTo(tx, GROUND_Y);
      ctx.lineTo(tx + 7, GROUND_Y - s.h);
      ctx.lineTo(tx + 14, GROUND_Y);
      ctx.closePath();
      ctx.fill();
      if (biome === "desert") {
        ctx.fillStyle = "#3a6230";
        ctx.fillRect(tx + 5, GROUND_Y - s.h * 0.6, 4, 6);
        ctx.fillStyle = "#4a7c3f";
      }
    }
  }
}

function drawGumdrops() {
  for (const gum of world.gumdrops) {
    const sx = gum.x - camX;
    if (sx < -40 || sx > W + 40) continue;
    ctx.fillStyle = "#f06292";
    ctx.beginPath();
    ctx.ellipse(sx + gum.w / 2, GROUND_Y - gum.h / 2, gum.w / 2, gum.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillRect(sx + gum.w * 0.25, GROUND_Y - gum.h * 0.7, 4, 4);
  }
}

function drawFallers() {
  for (const f of world.fallers) {
    const sx = f.x - camX;
    if (sx < -30 || sx > W + 30) continue;
    if (f.kind === "icicle") {
      ctx.fillStyle = "#b8e2f2";
      ctx.beginPath();
      ctx.moveTo(sx - 6, f.y - 10);
      ctx.lineTo(sx + 6, f.y - 10);
      ctx.lineTo(sx, f.y + 10);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = "#7d6a5a";
      ctx.fillRect(sx - 7, f.y - 7, 14, 14);
    }
  }
}

function drawSaws() {
  for (const saw of world.saws) {
    const sx = saw.x - camX;
    if (sx < -40 || sx > W + 40) continue;
    ctx.save();
    ctx.translate(sx, saw.y);
    ctx.rotate((frameCount * 0.15) % (Math.PI * 2));
    ctx.fillStyle = "#b0bec5";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (Math.PI * 2 * i) / 8;
      ctx.lineTo(Math.cos(ang) * saw.r, Math.sin(ang) * saw.r);
      const ang2 = ang + Math.PI / 16;
      ctx.lineTo(Math.cos(ang2) * (saw.r + 6), Math.sin(ang2) * (saw.r + 6));
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#78909c";
    ctx.beginPath();
    ctx.arc(0, 0, saw.r * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawPlatforms() {
  ctx.fillStyle = "#d7c4ec";
  for (const p of world.platforms) {
    const sx = p.x - camX;
    if (sx < -100 || sx > W + 100) continue;
    ctx.fillRect(sx, p.y, p.w, p.h);
    ctx.fillStyle = "#b79ee0";
    ctx.fillRect(sx, p.y, p.w, 5);
    ctx.fillStyle = "#d7c4ec";
  }
}

function drawPortals() {
  for (const portal of world.portals) {
    if (portal.used) continue;
    const sx = portal.x - camX;
    if (sx < -100 || sx > W + 100) continue;
    const glow = 0.5 + 0.5 * Math.sin(frameCount * 0.1);
    ctx.fillStyle = `rgba(186,104,200,${0.35 + glow * 0.3})`;
    ctx.fillRect(sx, portal.y, portal.w, portal.h);
    ctx.strokeStyle = "#8e5aa8";
    ctx.lineWidth = 3;
    ctx.strokeRect(sx, portal.y, portal.w, portal.h);
    ctx.fillStyle = "#fff";
    ctx.font = "14px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.fillText("?", sx + portal.w / 2, portal.y + portal.h / 2 + 8);
  }
}

function drawWizard() {
  const sx = WIZARD_X - camX;
  if (sx < -60 || sx > W + 60) return;
  ctx.save();
  ctx.translate(sx, GROUND_Y);
  const bob = Math.sin(frameCount * 0.06) * 3;
  ctx.translate(0, bob);

  // robe
  ctx.fillStyle = "#6a4fb0";
  ctx.fillRect(-14, -34, 28, 34);
  ctx.fillStyle = "#5a3fa0";
  ctx.fillRect(-14, -10, 28, 10);

  // sleeves
  ctx.fillStyle = "#7a5fc0";
  ctx.fillRect(-20, -26, 7, 16);
  ctx.fillRect(13, -26, 7, 16);

  // head (no face)
  ctx.fillStyle = "#e8c8a0";
  ctx.fillRect(-8, -48, 16, 16);

  // beard
  ctx.fillStyle = "#e6e6e6";
  ctx.fillRect(-8, -38, 16, 10);
  ctx.fillRect(-5, -30, 10, 8);

  // pointed hat
  ctx.fillStyle = "#4a3a90";
  ctx.fillRect(-11, -52, 22, 6);
  ctx.fillRect(-7, -60, 14, 8);
  ctx.fillRect(-3, -68, 6, 8);
  ctx.fillStyle = "#ffd54f";
  ctx.fillRect(-2, -68, 4, 4);

  // staff
  ctx.fillStyle = "#8d6e4a";
  ctx.fillRect(16, -40, 4, 44);
  ctx.fillStyle = "#ffd54f";
  ctx.fillRect(13, -48, 10, 10);

  ctx.restore();
}

function drawSparkles() {
  for (const sp of sparkles) {
    const sxp = sp.x - camX;
    if (sxp < -30 || sxp > W + 30) continue;
    const alpha = Math.max(0, Math.min(1, sp.timer / 30));
    ctx.fillStyle = `rgba(255, 213, 79, ${alpha})`;
    ctx.fillRect(sxp - 3, sp.y - 3, 6, 6);
  }
}

function drawKnightBody() {
  const running = player.onGround && Math.abs(player.vx) > 0.5;
  const runPhase = running ? Math.sin(frameCount * 0.6) : 0;
  const legL = running ? Math.max(0, runPhase) * 4 : 0;
  const legR = running ? Math.max(0, -runPhase) * 4 : 0;
  const capeSway = Math.sin(frameCount * 0.15) * 3;

  // Mythic aura — always-on glow, distinct from ordinary legendary skins
  const auraPulse = 0.15 + 0.08 * Math.sin(frameCount * 0.2);
  ctx.fillStyle = `rgba(160, 120, 255, ${auraPulse})`;
  ctx.beginPath();
  ctx.arc(0, 2, 22, 0, Math.PI * 2);
  ctx.fill();

  // Cape (behind the body, swaying)
  ctx.fillStyle = "#231b2e";
  ctx.beginPath();
  ctx.moveTo(-7, -6);
  ctx.lineTo(-17 + capeSway, 15);
  ctx.lineTo(-3, 15);
  ctx.closePath();
  ctx.fill();

  // Legs (animated while running)
  ctx.fillStyle = "#3a3f49";
  ctx.fillRect(-7, 8 - legL, 6, 10);
  ctx.fillRect(1, 8 - legR, 6, 10);
  ctx.fillStyle = "#1f2228";
  ctx.fillRect(-8, 16 - legL, 8, 3);
  ctx.fillRect(0, 16 - legR, 8, 3);

  // Torso armor plate
  ctx.fillStyle = "#8a8f99";
  ctx.fillRect(-8, -6, 16, 16);
  ctx.fillStyle = "#5a6070";
  ctx.fillRect(-8, -6, 16, 4);
  ctx.fillStyle = "#8a6fd8";
  ctx.fillRect(-2, -2, 4, 5);

  // Arms
  ctx.fillStyle = "#8a8f99";
  ctx.fillRect(-12, -4, 5, 12);
  ctx.fillRect(8, -4, 5, 12);

  // Shield (left hand)
  ctx.fillStyle = "#6a6f79";
  ctx.fillRect(-17, -2, 6, 11);
  ctx.strokeStyle = "#8a6fd8";
  ctx.lineWidth = 1;
  ctx.strokeRect(-17, -2, 6, 11);

  // Sword (right hand)
  ctx.fillStyle = "#c8ccd4";
  ctx.fillRect(12, -15, 3, 17);
  ctx.fillStyle = "#5a4a2a";
  ctx.fillRect(10, 0, 7, 3);

  // Helmet with visor slit and plume
  ctx.fillStyle = "#8a8f99";
  ctx.fillRect(-7, -20, 14, 14);
  ctx.fillStyle = "#4a4f59";
  ctx.fillRect(-7, -20, 14, 4);
  ctx.fillStyle = "#0a0a0e";
  ctx.fillRect(-5, -13, 10, 3);
  ctx.fillStyle = "#8a6fd8";
  ctx.fillRect(-1, -27, 3, 8);

  // Flight glow when the exclusive flying ability is active
  if (cheatFlying) {
    ctx.fillStyle = `rgba(140,180,255,${0.3 + 0.2 * Math.sin(frameCount * 0.3)})`;
    ctx.fillRect(-6, 18 - legL, 5, 8 + Math.sin(frameCount * 0.5) * 3);
    ctx.fillRect(1, 18 - legR, 5, 8 + Math.cos(frameCount * 0.5) * 3);
  }
}

function drawUpgradeEffect() {
  if (cheatFlying && player) {
    const fsx = player.x - camX + player.w / 2;
    const fsy = player.y + player.h / 2;
    ctx.fillStyle = Math.floor(frameCount / 3) % 2 === 0 ? "#7ec8ff" : "#b39ddb";
    ctx.fillRect(fsx - 6, fsy + player.h / 2, 5, 8 + Math.sin(frameCount * 0.5) * 3);
    ctx.fillRect(fsx + 1, fsy + player.h / 2, 5, 8 + Math.cos(frameCount * 0.5) * 3);
  }
  if (!activeUpgrade || !player) return;
  const sx = player.x - camX + player.w / 2;
  const sy = player.y + player.h / 2;
  const type = activeUpgrade.type;
  if (type === "jetpack") {
    ctx.fillStyle = Math.floor(frameCount / 3) % 2 === 0 ? "#ff8a65" : "#ffca28";
    ctx.fillRect(sx - 6, sy + player.h / 2, 5, 8 + Math.sin(frameCount * 0.5) * 3);
    ctx.fillRect(sx + 1, sy + player.h / 2, 5, 8 + Math.cos(frameCount * 0.5) * 3);
  } else if (type === "car") {
    ctx.fillStyle = "#5d4037";
    ctx.beginPath();
    ctx.arc(sx - 10, sy + player.h / 2 + 3, 5, 0, Math.PI * 2);
    ctx.arc(sx + 10, sy + player.h / 2 + 3, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "speedboost") {
    ctx.strokeStyle = "rgba(255,224,130,0.8)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const off = 14 + i * 10;
      ctx.beginPath();
      ctx.moveTo(sx - off * player.facing, sy - 6 + i * 6);
      ctx.lineTo(sx - (off + 10) * player.facing, sy - 6 + i * 6);
      ctx.stroke();
    }
  } else if (type === "shield") {
    ctx.strokeStyle = "rgba(128,222,234,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 26 + Math.sin(frameCount * 0.2) * 2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (type === "timefreeze") {
    ctx.strokeStyle = "rgba(179,157,219,0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - 20, sy - 20, 40, 40);
  }
}

function drawCat() {
  const skin = SKIN_BY_ID[save.equippedSkin] || ALL_SKINS[0];
  const sx = player.x - camX;
  const sy = player.y;
  ctx.save();
  ctx.translate(sx + player.w / 2, sy + player.h / 2);
  ctx.scale(player.facing, 1);
  ctx.imageSmoothingEnabled = false;

  // Squash & stretch: stretch tall going up, squash wide landing/falling fast
  let stretchY = 1;
  if (!player.onGround) {
    stretchY = player.vy < -2 ? 1.12 : player.vy > 6 ? 0.88 : 1;
  } else if (Math.abs(player.vx) > 0.5) {
    stretchY = 1 + Math.sin(frameCount * 0.6) * 0.03;
  }
  ctx.scale(1 / Math.sqrt(stretchY), stretchY);

  if (skin.special === "knight") {
    drawKnightBody();
    ctx.restore();
    return;
  }

  // Running bob: alternating foot lift while moving on the ground
  const running = player.onGround && Math.abs(player.vx) > 0.5;
  const runPhase = running ? Math.sin(frameCount * 0.6) : 0;
  const footL = running ? Math.max(0, runPhase) * 3 : 0;
  const footR = running ? Math.max(0, -runPhase) * 3 : 0;
  const tailWag = Math.sin(frameCount * 0.12) * 2;

  const dark = shadeColor(skin.body, -30);
  const earInner = shadeColor(skin.stripe, 20);

  // tail — three stepped blocks curling up from behind the body, gently wagging
  ctx.fillStyle = skin.body;
  ctx.fillRect(-27, -8 + tailWag, 5, 5);
  ctx.fillRect(-24, -3 + tailWag, 5, 6);
  ctx.fillRect(-19, 2 + tailWag * 0.5, 6, 6);

  // body — single rounded-ish silhouette (pixel-blocked corners)
  ctx.fillStyle = skin.body;
  ctx.fillRect(-13, 0, 4, 10);
  ctx.fillRect(-9, -3, 22, 16);
  ctx.fillRect(9, 0, 4, 10);

  // belly shade
  ctx.fillStyle = dark;
  ctx.fillRect(-9, 9, 22, 4);

  // stripes across the back
  ctx.fillStyle = skin.stripe;
  ctx.fillRect(-6, -3, 5, 4);
  ctx.fillRect(2, -3, 5, 4);

  // head
  ctx.fillStyle = skin.body;
  ctx.fillRect(3, -16, 15, 14);
  ctx.fillRect(1, -13, 2, 9);
  ctx.fillRect(18, -13, 2, 9);

  // ears
  ctx.fillStyle = skin.body;
  ctx.fillRect(4, -21, 5, 6);
  ctx.fillRect(13, -21, 5, 6);
  ctx.fillStyle = earInner;
  ctx.fillRect(5, -19, 3, 3);
  ctx.fillRect(14, -19, 3, 3);

  // feet
  ctx.fillStyle = dark;
  ctx.fillRect(-9, 13 - footL, 7, 4);
  ctx.fillRect(6, 13 - footR, 7, 4);

  // equipped accessory (worn on the head)
  if (save.equippedAccessory) {
    const acc = ACCESSORIES.find((a) => a.id === save.equippedAccessory);
    if (acc) {
      ctx.fillStyle = acc.color;
      if (acc.id === "top_hat") {
        ctx.fillRect(4, -23, 15, 4);
        ctx.fillRect(7, -32, 9, 10);
      } else if (acc.id === "crown") {
        ctx.fillRect(4, -22, 15, 5);
        ctx.fillRect(4, -26, 3, 5);
        ctx.fillRect(9, -28, 3, 7);
        ctx.fillRect(14, -26, 3, 5);
      } else if (acc.id === "halo") {
        ctx.fillRect(4, -28, 15, 3);
      } else if (acc.id === "party_hat") {
        ctx.fillRect(9, -34, 5, 12);
        ctx.fillRect(7, -24, 9, 3);
      } else if (acc.id === "beanie") {
        ctx.fillRect(3, -22, 17, 6);
      } else if (acc.id === "bow" || acc.id === "flower") {
        ctx.fillRect(9, -8, 5, 5);
        ctx.fillRect(6, -9, 4, 3);
        ctx.fillRect(14, -9, 4, 3);
      } else if (acc.id === "bandana") {
        ctx.fillRect(2, -13, 18, 4);
      }
    }
  }

  ctx.restore();
}

// Darken/lighten a hex color by a percentage amount (-100..100)
function shadeColor(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  let r = (num >> 16) + Math.round(2.55 * percent);
  let g = ((num >> 8) & 0x00ff) + Math.round(2.55 * percent);
  let b = (num & 0x0000ff) + Math.round(2.55 * percent);
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}

function drawBoss() {
  if (!boss) return;
  const sx = boss.x - camX;
  const flashOn = boss.flash > 0 && Math.floor(boss.flash / 3) % 2 === 0;

  if (boss.isFinal) {
    // Castle Guardian — dark armored gargoyle-knight, distinct from regular bosses
    const cx = sx + boss.w / 2;
    const cy = boss.y + boss.h / 2;
    ctx.fillStyle = flashOn ? "#ffffff" : "#3a2430";
    ctx.fillRect(sx, boss.y + boss.h * 0.25, boss.w, boss.h * 0.75);
    ctx.fillStyle = flashOn ? "#ffffff" : "#5a1f28";
    ctx.beginPath();
    ctx.arc(cx, boss.y + boss.h * 0.22, boss.w * 0.3, 0, Math.PI * 2);
    ctx.fill();
    // horns
    ctx.fillStyle = "#1a1015";
    ctx.beginPath();
    ctx.moveTo(cx - boss.w * 0.25, boss.y);
    ctx.lineTo(cx - boss.w * 0.12, boss.y - 26);
    ctx.lineTo(cx - boss.w * 0.05, boss.y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + boss.w * 0.25, boss.y);
    ctx.lineTo(cx + boss.w * 0.12, boss.y - 26);
    ctx.lineTo(cx + boss.w * 0.05, boss.y + 4);
    ctx.closePath();
    ctx.fill();
    // glowing eye slit
    const glow = 0.6 + 0.4 * Math.sin(frameCount * 0.15);
    ctx.fillStyle = `rgba(255, 60, 60, ${glow})`;
    ctx.fillRect(cx - 14, boss.y + boss.h * 0.16, 28, 5);
    // shoulder spikes
    ctx.fillStyle = "#1a1015";
    ctx.fillRect(sx - 6, boss.y + boss.h * 0.3, 10, 16);
    ctx.fillRect(sx + boss.w - 4, boss.y + boss.h * 0.3, 10, 16);

    // HP bar (too much HP for individual pips)
    const barW = 140;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(cx - barW / 2, boss.y - 44, barW, 10);
    ctx.fillStyle = "#c62828";
    ctx.fillRect(cx - barW / 2, boss.y - 44, barW * (boss.hp / boss.maxHp), 10);
    ctx.strokeStyle = "#ffd54f";
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - barW / 2, boss.y - 44, barW, 10);
  } else {
    ctx.fillStyle = flashOn ? "#ffffff" : "#7e57c2";
    ctx.beginPath();
    ctx.ellipse(sx + boss.w / 2, boss.y + boss.h / 2, boss.w / 2, boss.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5e35b1";
    ctx.beginPath();
    ctx.moveTo(sx + boss.w / 2 - 18, boss.y - 4);
    ctx.lineTo(sx + boss.w / 2, boss.y - 30);
    ctx.lineTo(sx + boss.w / 2 + 18, boss.y - 4);
    ctx.closePath();
    ctx.fill();
    // HP pips
    for (let i = 0; i < boss.maxHp; i++) {
      ctx.fillStyle = i < boss.hp ? "#ff8fa3" : "rgba(255,255,255,0.3)";
      ctx.beginPath();
      ctx.arc(sx + boss.w / 2 - 20 + i * 20, boss.y - 40, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = "#ffd54f";
  for (const proj of boss.projectiles) {
    ctx.beginPath();
    ctx.arc(proj.x - camX, proj.y, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const atk of boss.attacks) {
    ctx.fillStyle = atk.color;
    ctx.fillRect(atk.x - camX - 5, atk.y - 5, 10, 10);
  }
}

function drawChaser() {
  if (squidMode !== "chase") return;
  const sx = chaserX - camX;
  if (sx < -60 || sx > W + 60) return;
  ctx.save();
  ctx.translate(sx, GROUND_Y);
  ctx.fillStyle = "#2b2b33";
  ctx.fillRect(-14, -46, 28, 46);
  ctx.fillStyle = "#1a1a1f";
  ctx.fillRect(-16, -50, 32, 8);
  ctx.fillStyle = "#c0392b";
  ctx.fillRect(-10, -40, 20, 6);
  ctx.restore();
}

function drawRedLightOverlay() {
  if (squidMode !== "redlight") return;
  if (lightPhase === "red") {
    ctx.fillStyle = "rgba(200, 20, 20, 0.18)";
    ctx.fillRect(0, 0, W, H);
  }
  ctx.textAlign = "center";
  ctx.font = "16px 'Press Start 2P', monospace";
  ctx.fillStyle = lightPhase === "red" ? "#ff5252" : "#69f0ae";
  ctx.fillText(lightPhase === "red" ? "RED LIGHT" : "GREEN LIGHT", W / 2, 40);

  // The doll — faces away during green, turns to watch during red
  ctx.save();
  ctx.translate(W / 2, 90);
  if (lightPhase === "red") ctx.scale(-1, 1);
  ctx.fillStyle = "#f5e6d0";
  ctx.fillRect(-14, -14, 28, 28);
  ctx.fillStyle = "#e53935";
  ctx.fillRect(-16, -30, 32, 18);
  ctx.fillStyle = "#2e7d32";
  ctx.fillRect(-14, 14, 28, 22);
  ctx.restore();
}

function render() {
  ctx.save();
  ctx.scale(1 / PIXEL_SCALE, 1 / PIXEL_SCALE);
  const biome = boss ? (boss.isFinal ? "castle" : "cave") : currentBiomeAt(player.x);
  drawBackground(biome);
  if (!boss) {
    drawDecor();
    drawGroundTexture(camX - 40, camX + W + 40, biome);
    drawPlatforms();
    drawSpikes();
    drawGumdrops();
    drawSaws();
    drawFallers();
    drawPortals();
    drawWizard();
    drawSparkles();
    drawChaser();
  } else {
    drawGroundTexture(camX - 40, camX + W + 40, biome);
    drawBoss();
  }
  drawCat();
  drawUpgradeEffect();
  drawRedLightOverlay();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// DOM screens / menus
// ---------------------------------------------------------------------------
const screens = {
  menu: document.getElementById("screen-menu"),
  pause: document.getElementById("screen-pause"),
  skins: document.getElementById("screen-skins"),
  upgrades: document.getElementById("screen-upgrades"),
  gamemode: document.getElementById("screen-gamemode"),
  weapons: document.getElementById("screen-weapons"),
  accessories: document.getElementById("screen-accessories"),
  achievements: document.getElementById("screen-achievements"),
  question: document.getElementById("screen-question"),
  gameover: document.getElementById("screen-gameover"),
};

function hideAllScreens() {
  for (const el of Object.values(screens)) el.classList.add("hidden");
}
function showScreen(name) {
  hideAllScreens();
  if (screens[name]) screens[name].classList.remove("hidden");
}

let cameFromPause = false;

function togglePause() {
  if (gameState === "playing") {
    gameState = "paused";
    cameFromPause = false;
    showScreen("pause");
  } else if (gameState === "paused") {
    gameState = "playing";
    hideAllScreens();
  }
}

// --- HUD ---
const hudCoins = document.getElementById("hud-coins");
const hudLevel = document.getElementById("hud-level");
const hudStuds = document.getElementById("hud-studs");
const hudXpFill = document.getElementById("hud-xp-fill");
const hudBoss = document.getElementById("hud-boss");
const hudUpgrade = document.getElementById("hud-upgrade");
const toastEl = document.getElementById("toast");

function updateHUD() {
  hudCoins.textContent = `🪙 ${save.coins}`;
  hudLevel.textContent = `Lv.${save.level}`;
  hudStuds.textContent = `${studsFromX(player ? player.x : 0)} studs`;
  const pct = Math.min(100, (save.xp / xpForLevel(save.level)) * 100);
  hudXpFill.style.width = `${pct}%`;
  if (boss) {
    hudBoss.textContent = "⚔ BOSS FIGHT";
  } else if (player) {
    const remaining = Math.max(0, world.nextBossStuds - studsFromX(player.x));
    hudBoss.textContent = `Boss in ${remaining}`;
  } else {
    hudBoss.textContent = "";
  }
  if (activeUpgrade) {
    const def = UPGRADES[activeUpgrade.type];
    hudUpgrade.textContent = `${def.name} ${Math.ceil(activeUpgrade.timeLeft)}s`;
    hudUpgrade.classList.remove("hidden");
  } else {
    hudUpgrade.classList.add("hidden");
  }
  if (toastTimer > 0) {
    toastTimer--;
    toastEl.textContent = toastMsg;
    toastEl.classList.remove("hidden");
  } else if (toastQueue.length > 0) {
    toastMsg = toastQueue.shift();
    toastTimer = 110;
    toastEl.textContent = toastMsg;
    toastEl.classList.remove("hidden");
  } else {
    toastEl.classList.add("hidden");
  }
}

// --- Main menu ---
// --- Game mode selector ---
const modeButtons = document.querySelectorAll(".mode-btn");
modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    gameMode = btn.dataset.mode;
    modeButtons.forEach((b) => b.classList.toggle("mode-selected", b === btn));
  });
});
document.querySelector('.mode-btn[data-mode="normal"]').classList.add("mode-selected");

document.getElementById("btn-play").addEventListener("click", () => {
  hideAllScreens();
  startRun();
});
document.getElementById("btn-menu-skins").addEventListener("click", () => openSkins("menu"));
document.getElementById("btn-menu-upgrades").addEventListener("click", () => openUpgrades("menu"));

// --- Dev cheat code: tap the tiny corner dot, then enter the code ---
const CHEAT_CODE = "ibyazu1209";
const cheatModal = document.getElementById("screen-cheat");
const cheatInput = document.getElementById("cheat-input");

document.getElementById("cheat-btn").addEventListener("click", () => {
  cheatInput.value = "";
  cheatModal.classList.remove("hidden");
  cheatInput.focus();
});

document.getElementById("cheat-cancel").addEventListener("click", () => {
  cheatModal.classList.add("hidden");
});

document.getElementById("cheat-submit").addEventListener("click", submitCheatCode);
cheatInput.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Enter") submitCheatCode();
});

function submitCheatCode() {
  const entered = cheatInput.value.trim().toLowerCase();
  cheatModal.classList.add("hidden");
  if (entered === CHEAT_CODE) {
    save.coins += 99999;
    save.xp = 0;
    save.level += 5;
    for (const s of ALL_SKINS) {
      if (!save.ownedSkins.includes(s.id)) save.ownedSkins.push(s.id);
    }
    if (!save.ownedSkins.includes(KNIGHT_SKIN.id)) save.ownedSkins.push(KNIGHT_SKIN.id);
    save.cheatUnlocked = true;
    markDirty();
    flushSave();
    showToast("Cheat activated! Shadow Knight unlocked");
    updateHUD();
  }
}

// --- Pause menu ---
document.getElementById("btn-resume").addEventListener("click", () => {
  gameState = "playing";
  hideAllScreens();
});
document.getElementById("btn-pause-skins").addEventListener("click", () => openSkins("paused"));
document.getElementById("btn-pause-upgrades").addEventListener("click", () => openUpgrades("paused"));
document.getElementById("btn-quit").addEventListener("click", () => {
  gameState = "menu";
  showScreen("menu");
});

// --- Dev stud teleport — cheat-unlocked users only ---
const teleportModal = document.getElementById("screen-teleport");
const teleportInput = document.getElementById("teleport-input");
const teleportBtn = document.getElementById("btn-pause-teleport");

teleportBtn.addEventListener("click", () => {
  if (!save.cheatUnlocked) return;
  teleportInput.value = "";
  teleportModal.classList.remove("hidden");
  teleportInput.focus();
});
document.getElementById("teleport-cancel").addEventListener("click", () => {
  teleportModal.classList.add("hidden");
});
document.getElementById("teleport-submit").addEventListener("click", submitTeleport);
teleportInput.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Enter") submitTeleport();
});

function submitTeleport() {
  teleportModal.classList.add("hidden");
  if (!save.cheatUnlocked || !player) return;
  const studsTarget = parseInt(teleportInput.value, 10);
  if (isNaN(studsTarget) || studsTarget < 0) return;
  player.x = studsTarget / STUD_SCALE;
  player.y = 300;
  player.vx = 0;
  player.vy = 0;
  camX = player.x - W * 0.35;
  wizardCooldown = false;
  generateAhead(camX + W + 1500);
  pruneBehind(camX);
  gameState = "playing";
  hideAllScreens();
  showToast(`Teleported to ${studsTarget} studs`);
}

// --- Game over ---
document.getElementById("btn-retry").addEventListener("click", () => {
  hideAllScreens();
  startRun();
});
document.getElementById("btn-gameover-menu").addEventListener("click", () => {
  gameState = "menu";
  showScreen("menu");
});

let returnStateAfterSubmenu = "menu";

function openSkins(from) {
  returnStateAfterSubmenu = from;
  gameState = "submenu";
  showScreen("skins");
  setSkinsTab("gacha");
}
function openUpgrades(from) {
  returnStateAfterSubmenu = from;
  gameState = "submenu";
  showScreen("upgrades");
  renderUpgradesScreen();
}
function closeSubmenu() {
  if (returnStateAfterSubmenu === "playing" || returnStateAfterSubmenu === "paused") {
    gameState = "paused";
    showScreen("pause");
  } else {
    gameState = "menu";
    showScreen("menu");
  }
}
document.getElementById("btn-skins-back").addEventListener("click", closeSubmenu);
document.getElementById("btn-upgrades-back").addEventListener("click", closeSubmenu);

// --- Skins: gacha + inventory tabs ---
const tabGachaBtn = document.getElementById("tab-gacha-btn");
const tabInventoryBtn = document.getElementById("tab-inventory-btn");
const gachaPanel = document.getElementById("gacha-panel");
const inventoryPanel = document.getElementById("inventory-panel");
let skinsTab = "gacha";

function setSkinsTab(tab) {
  skinsTab = tab;
  tabGachaBtn.classList.toggle("tab-active", tab === "gacha");
  tabInventoryBtn.classList.toggle("tab-active", tab === "inventory");
  gachaPanel.classList.toggle("hidden", tab !== "gacha");
  inventoryPanel.classList.toggle("hidden", tab !== "inventory");
  if (tab === "inventory") renderInventory();
  else renderGacha();
}
tabGachaBtn.addEventListener("click", () => setSkinsTab("gacha"));
tabInventoryBtn.addEventListener("click", () => setSkinsTab("inventory"));

function renderGacha() {
  gachaPanel.innerHTML = `
    <p class="coin-label">🪙 ${save.coins}</p>
    <div class="skin-preview" id="gacha-reveal"></div>
    <button class="big-btn" id="spin-btn">Spin (500 🪙)</button>
    <p class="hint-text">Roll for a random cat skin!</p>
  `;
  document.getElementById("spin-btn").addEventListener("click", doSpin);
}

function doSpin() {
  if (save.coins < 500) {
    showToast("Not enough coins!");
    return;
  }
  save.coins -= 500;
  save.stats.gachaSpins++;
  const won = weightedRandomSkin();
  const isNew = !save.ownedSkins.includes(won.id);
  if (isNew) save.ownedSkins.push(won.id);
  else save.coins += 100; // duplicate consolation
  markDirty();
  const reveal = document.getElementById("gacha-reveal");
  reveal.innerHTML = `
    <div class="skin-card rarity-${won.rarity}">
      <div class="skin-swatch" style="background:${won.body}"></div>
      <div class="skin-name">${won.name}</div>
      <div class="skin-rarity">${won.rarity}${isNew ? "" : " (duplicate +100🪙)"}</div>
    </div>
  `;
  gachaPanel.querySelector(".coin-label").textContent = `🪙 ${save.coins}`;
}

function renderInventory() {
  inventoryPanel.innerHTML = "";
  const list = save.ownedSkins.includes(KNIGHT_SKIN.id) ? [...ALL_SKINS, KNIGHT_SKIN] : ALL_SKINS;
  for (const skin of list) {
    const owned = save.ownedSkins.includes(skin.id);
    const equipped = save.equippedSkin === skin.id;
    const card = document.createElement("div");
    card.className = `skin-card rarity-${skin.rarity} ${owned ? "" : "locked"} ${equipped ? "equipped" : ""}`;
    card.innerHTML = `
      <div class="skin-swatch" style="background:${owned ? skin.body : "#ccc"}"></div>
      <div class="skin-name">${owned ? skin.name : "???"}</div>
      <div class="skin-rarity">${skin.rarity}</div>
      ${owned ? `<button class="equip-btn" ${equipped ? "disabled" : ""}>${equipped ? "Equipped" : "Equip"}</button>` : ""}
    `;
    if (owned) {
      card.querySelector(".equip-btn").addEventListener("click", () => {
        save.equippedSkin = skin.id;
        markDirty();
        renderInventory();
      });
    }
    inventoryPanel.appendChild(card);
  }
}

// --- Upgrades screen ---
const upgradesList = document.getElementById("upgrades-list");
function renderUpgradesScreen() {
  upgradesList.innerHTML = "";
  const lockedOut = activeUpgrade && activeUpgrade.timeLeft > 0;
  for (const key of Object.keys(UPGRADES)) {
    const def = UPGRADES[key];
    const isActive = activeUpgrade?.type === key;
    const disableBtn = isActive || (lockedOut && !isActive);
    const card = document.createElement("div");
    card.className = `upgrade-card${lockedOut && !isActive ? " upgrade-locked" : ""}`;
    card.innerHTML = `
      <div class="upgrade-swatch" style="background:${def.color}"></div>
      <div class="upgrade-info">
        <div class="upgrade-name">${def.name}</div>
        <div class="upgrade-cost">🪙 ${def.cost} · ${def.duration}s</div>
        <div class="upgrade-desc">${def.desc}</div>
      </div>
      <button class="activate-btn" ${disableBtn ? "disabled" : ""}>${isActive ? Math.ceil(activeUpgrade.timeLeft) + "s" : "Activate"}</button>
    `;
    card.querySelector(".activate-btn").addEventListener("click", () => {
      activateUpgrade(key);
      renderUpgradesScreen();
    });
    upgradesList.appendChild(card);
  }
}

// --- Question modal ---
const questionText = document.getElementById("question-text");
const questionOptions = document.getElementById("question-options");

// --- Weapons screen ---
const weaponsList = document.getElementById("weapons-list");
function renderWeaponsScreen() {
  weaponsList.innerHTML = "";
  for (const key of Object.keys(WEAPONS)) {
    const def = WEAPONS[key];
    const owned = save.ownedWeapons.includes(key);
    const equipped = save.equippedWeapon === key;
    const card = document.createElement("div");
    card.className = "upgrade-card";
    card.innerHTML = `
      <div class="upgrade-swatch" style="background:${def.color}"></div>
      <div class="upgrade-info">
        <div class="upgrade-name">${def.name}</div>
        <div class="upgrade-cost">${owned ? "Owned" : "🪙 " + def.cost}</div>
      </div>
      <button class="activate-btn" ${equipped ? "disabled" : ""}>${equipped ? "Equipped" : owned ? "Equip" : "Buy"}</button>
    `;
    card.querySelector(".activate-btn").addEventListener("click", () => {
      if (!owned) {
        if (save.coins < def.cost) {
          showToast("Not enough coins!");
          return;
        }
        save.coins -= def.cost;
        save.ownedWeapons.push(key);
      }
      save.equippedWeapon = key;
      markDirty();
      renderWeaponsScreen();
    });
    weaponsList.appendChild(card);
  }
}

// --- Accessories screen ---
const accessoriesPanel = document.getElementById("accessories-panel");
function renderAccessories() {
  accessoriesPanel.innerHTML = "";
  for (const acc of ACCESSORIES) {
    const owned = save.ownedAccessories.includes(acc.id);
    const equipped = save.equippedAccessory === acc.id;
    const card = document.createElement("div");
    card.className = `skin-card ${equipped ? "equipped" : ""}`;
    card.innerHTML = `
      <div class="skin-swatch" style="background:${acc.color}"></div>
      <div class="skin-name">${acc.name}</div>
      <div class="skin-rarity">${owned ? "owned" : "🪙 " + acc.cost}</div>
      <button class="equip-btn" ${equipped ? "disabled" : ""}>${equipped ? "Equipped" : owned ? "Equip" : "Buy"}</button>
    `;
    card.querySelector(".equip-btn").addEventListener("click", () => {
      if (!owned) {
        if (save.coins < acc.cost) {
          showToast("Not enough coins!");
          return;
        }
        save.coins -= acc.cost;
        save.ownedAccessories.push(acc.id);
      }
      save.equippedAccessory = equipped ? null : acc.id;
      markDirty();
      renderAccessories();
    });
    accessoriesPanel.appendChild(card);
  }
}

// --- Achievements screen ---
const achievementsPanel = document.getElementById("achievements-panel");
function renderAchievements() {
  achievementsPanel.innerHTML = "";
  for (const ach of ACHIEVEMENTS) {
    const unlocked = ach.check(save);
    const card = document.createElement("div");
    card.className = `achievement-card ${unlocked ? "unlocked" : ""}`;
    card.innerHTML = `
      <div class="achievement-icon">${unlocked ? "★" : "☆"}</div>
      <div class="achievement-info">
        <div class="achievement-name">${ach.name}</div>
        <div class="achievement-desc">${ach.desc}</div>
      </div>
    `;
    achievementsPanel.appendChild(card);
  }
}

// --- Game Mode screen ---
const gamemodeList = document.getElementById("gamemode-list");
function renderGameModeScreen() {
  gamemodeList.innerHTML = "";
  for (const key of Object.keys(SQUID_MODES)) {
    const def = SQUID_MODES[key];
    const selected = squidMode === key;
    const card = document.createElement("div");
    card.className = "upgrade-card";
    card.innerHTML = `
      <div class="upgrade-info">
        <div class="upgrade-name">${def.name}</div>
        <div class="upgrade-cost">${def.desc}</div>
      </div>
      <button class="activate-btn" ${selected ? "disabled" : ""}>${selected ? "Selected" : "Pick"}</button>
    `;
    card.querySelector(".activate-btn").addEventListener("click", () => {
      squidMode = key;
      renderGameModeScreen();
    });
    gamemodeList.appendChild(card);
  }
}
function openGameMode(from) {
  returnStateAfterSubmenu = from;
  gameState = "submenu";
  showScreen("gamemode");
  renderGameModeScreen();
}
document.getElementById("btn-menu-gamemode").addEventListener("click", () => openGameMode("menu"));
document.getElementById("btn-gamemode-back").addEventListener("click", closeSubmenu);

function openWeapons(from) {
  returnStateAfterSubmenu = from;
  gameState = "submenu";
  showScreen("weapons");
  renderWeaponsScreen();
}
function openAccessories(from) {
  returnStateAfterSubmenu = from;
  gameState = "submenu";
  showScreen("accessories");
  renderAccessories();
}
function openAchievements(from) {
  returnStateAfterSubmenu = from;
  gameState = "submenu";
  showScreen("achievements");
  renderAchievements();
}
document.getElementById("btn-weapons-back").addEventListener("click", closeSubmenu);
document.getElementById("btn-accessories-back").addEventListener("click", closeSubmenu);
document.getElementById("btn-achievements-back").addEventListener("click", closeSubmenu);

document.getElementById("btn-menu-weapons").addEventListener("click", () => openWeapons("menu"));
document.getElementById("btn-menu-accessories").addEventListener("click", () => openAccessories("menu"));
document.getElementById("btn-menu-achievements").addEventListener("click", () => openAchievements("menu"));
document.getElementById("btn-pause-weapons").addEventListener("click", () => openWeapons("paused"));
document.getElementById("btn-pause-accessories").addEventListener("click", () => openAccessories("paused"));
document.getElementById("btn-pause-achievements").addEventListener("click", () => openAchievements("paused"));

// --- Boss attack button ---
const attackBtn = document.getElementById("attack-btn");
attackBtn.addEventListener("click", fireWeapon);

function renderQuestionScreen() {
  showScreen("question");
  questionText.textContent = currentQuestion.q;
  questionOptions.innerHTML = "";
  currentQuestion.a.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    btn.textContent = opt;
    btn.addEventListener("click", () => answerQuestion(idx));
    questionOptions.appendChild(btn);
  });
}

function answerQuestion(idx) {
  if (idx === currentQuestion.c) {
    pendingPortal.used = true;
    player.x = pendingPortal.x + pendingPortal.w + 5;
    save.stats.correctAnswers++;
    addRewards(15, 20);
    const choices = BIOMES.filter((b) => b !== effectiveBiome);
    effectiveBiome = choices[Math.floor(Math.random() * choices.length)];
    applyBiomeAmbience(effectiveBiome);
    showToast("Correct! +15 coins");
    gameState = "playing";
    hideAllScreens();
    refillQuestionQueue();
  } else {
    gameState = "playing";
    hideAllScreens();
    triggerGameOver();
  }
}

// --- Game over screen ---
const gameoverStats = document.getElementById("gameover-stats");
function renderGameOverScreen() {
  showScreen("gameover");
  gameoverStats.textContent = `Studs: ${studsFromX(player.x)}  ·  Coins: ${save.coins}  ·  Level: ${save.level}`;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
gameState = "menu";
showScreen("menu");
refillQuestionQueue();

function loop() {
  frameCount++;
  if (gameState === "playing") {
    updatePlayer();
  } else if (gameState === "boss") {
    updateBoss();
  }
  if (["playing", "boss", "paused", "question"].includes(gameState) && player) {
    render();
  }
  attackBtn.classList.toggle("hidden", gameState !== "boss");
  teleportBtn.classList.toggle("hidden", !save.cheatUnlocked);
  updateHUD();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
