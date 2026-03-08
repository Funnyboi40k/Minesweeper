import { BOMB_SKINS, bombEntriesForSelect, normalizeBombSkinId } from "./skins/bombs.js?v=20260308b";
import { ExplosionManager } from "./vfx/explosions.js?v=20260308b";

const SETTINGS = {
  beginner: { cols: 9, rows: 9, mines: 10 },
  intermediate: { cols: 16, rows: 16, mines: 40 },
  expert: { cols: 30, rows: 16, mines: 99 },
};

const boardEl = document.getElementById("board");
const boardWrapEl = document.querySelector(".boardWrap");
const explosionCanvasEl = document.getElementById("explosionCanvas");
const difficultyEl = document.getElementById("difficulty");
const themeEl = document.getElementById("theme");
const bombSkinEl = document.getElementById("bombSkin");
const resetEl = document.getElementById("reset");
const statsBtnEl = document.getElementById("statsBtn");
const hintBtnEl = document.getElementById("hintBtn");
const minesLeftEl = document.getElementById("minesLeft");
const hintsLeftEl = document.getElementById("hintsLeft");
const timeEl = document.getElementById("time");
const statusEl = document.getElementById("status");
const confettiEl = document.getElementById("confetti");
const gachaModalEl = document.getElementById("gachaModal");
const gachaSpinnerEl = document.getElementById("gachaSpinner");
const gachaResultEl = document.getElementById("gachaResult");
const gachaClaimBtn = document.getElementById("gachaClaim");
const statsModalEl = document.getElementById("statsModal");
const statsCloseEl = document.getElementById("statsClose");
const statsResetEl = document.getElementById("statsReset");
const statsPlayedEl = document.getElementById("statsPlayed");
const statsWinsEl = document.getElementById("statsWins");
const statsLossesEl = document.getElementById("statsLosses");
const statsWinRateEl = document.getElementById("statsWinRate");

const THEME_KEY = "ms_theme";
const BOMB_KEY = "ms_bombSkin";
const UNLOCK_KEY = "ms_unlocks_v1";
const STATS_KEY = "ms_stats_v1";
const GACHA_DUPLICATE_KEY = "ms_gacha_duplicates";
const LAVA_UNLOCK_KEY = "ms_unlock_lava_bomb";
const LAVA_UNLOCK_COMPLETED_GAMES = 10;
const HINTS_PER_GAME = 5;
const BOMB_DRAW_SCALE = 0.85;
const sessionStore = new Map();

const CATALOG = {
  themes: {
    neo: { name: "Neo", lockedByDefault: false },
    classic: { name: "Classic", lockedByDefault: true },
    pastel: { name: "Pastel", lockedByDefault: true },
    amoled: { name: "AMOLED", lockedByDefault: true },
  },
  bombs: Object.fromEntries(
    Object.entries(bombEntriesForSelect()).map(([id, meta], index) => [
      id,
      { name: meta.name, lockedByDefault: index !== 0 },
    ])
  ),
};

const RARITY_WEIGHTS = [
  { rarity: "Common", weight: 52 },
  { rarity: "Rare", weight: 24 },
  { rarity: "Epic", weight: 12 },
  { rarity: "Legendary", weight: 12 },
];

const GACHA_POOL = [
  { type: "theme", id: "classic", name: "Classic Theme", rarity: "Common", icon: "🟦" },
  { type: "theme", id: "pastel", name: "Pastel Theme", rarity: "Rare", icon: "🟪" },
  { type: "theme", id: "amoled", name: "AMOLED Theme", rarity: "Epic", icon: "⬛" },
  { type: "bomb", id: "skull", name: "Skull Bomb", rarity: "Common", icon: "💀" },
  { type: "bomb", id: "slime", name: "Slime Bomb", rarity: "Rare", icon: "🧪" },
  { type: "bomb", id: "nuke", name: "Nuke", rarity: "Legendary", icon: "☢️" },
];

let state = null;
let timerId = null;
let focused = { r: 0, c: 0 };
let pendingReward = null;
let gachaTimerId = null;
let stats = loadStats();

const bombImageCache = new Map();
const explosionManager = new ExplosionManager(explosionCanvasEl);
let lastFrameTs = performance.now();

class SoundBoard {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  tone({ freq = 400, type = "sine", start = 0, dur = 0.08, gain = 0.18, slideTo = null }) {
    this.ensure();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(35, slideTo), now + start + dur);

    amp.gain.setValueAtTime(0.0001, now + start);
    amp.gain.exponentialRampToValueAtTime(gain, now + start + Math.min(0.02, dur * 0.35));
    amp.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

    osc.connect(amp);
    amp.connect(this.master);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.03);
  }

  click() {
    this.tone({ freq: 520, type: "square", dur: 0.045, gain: 0.12, slideTo: 460 });
  }

  flag(on) {
    this.tone({ freq: on ? 840 : 560, type: "triangle", dur: 0.09, gain: 0.15, slideTo: on ? 960 : 430 });
  }

  cascade() {
    [0, 0.04, 0.08, 0.12].forEach((t, i) => {
      this.tone({ freq: 340 + i * 135, type: "sine", start: t, dur: 0.06, gain: 0.11, slideTo: 430 + i * 110 });
    });
  }

  explodeSkin(soundEffectId) {
    if (soundEffectId === "nukeBlast") {
      this.tone({ freq: 130, type: "sawtooth", dur: 0.62, gain: 0.23, slideTo: 42 });
      this.tone({ freq: 72, type: "square", start: 0.02, dur: 0.54, gain: 0.18, slideTo: 36 });
      this.tone({ freq: 520, type: "triangle", start: 0.22, dur: 0.18, gain: 0.1, slideTo: 210 });
      return;
    }
    if (soundEffectId === "slimePop") {
      this.tone({ freq: 260, type: "triangle", dur: 0.22, gain: 0.17, slideTo: 100 });
      this.tone({ freq: 420, type: "sine", start: 0.04, dur: 0.11, gain: 0.1, slideTo: 180 });
      return;
    }
    if (soundEffectId === "lavaPop") {
      this.tone({ freq: 180, type: "sawtooth", dur: 0.44, gain: 0.2, slideTo: 70 });
      this.tone({ freq: 360, type: "triangle", start: 0.06, dur: 0.18, gain: 0.11, slideTo: 160 });
      return;
    }
    if (soundEffectId === "skullBurst") {
      this.tone({ freq: 210, type: "square", dur: 0.34, gain: 0.2, slideTo: 64 });
      this.tone({ freq: 930, type: "triangle", start: 0.06, dur: 0.14, gain: 0.12, slideTo: 710 });
      return;
    }

    this.tone({ freq: 150, type: "sawtooth", dur: 0.42, gain: 0.22, slideTo: 54 });
    this.tone({ freq: 84, type: "square", start: 0.02, dur: 0.27, gain: 0.18, slideTo: 45 });
  }

  win() {
    [660, 830, 990, 1320].forEach((f, i) => {
      this.tone({ freq: f, type: "triangle", start: i * 0.07, dur: 0.15, gain: 0.13, slideTo: f * 1.08 });
    });
  }
}

const sfx = new SoundBoard();

function storageGet(key) {
  if (sessionStore.has(key)) return sessionStore.get(key);
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  const normalized = String(value);
  sessionStore.set(key, normalized);
  try {
    window.localStorage.setItem(key, normalized);
  } catch {
    // Ignore storage failures (private mode / blocked file storage).
  }
}

function frame(ts) {
  const dt = Math.min(0.05, (ts - lastFrameTs) / 1000);
  lastFrameTs = ts;
  explosionManager.updateExplosions(dt);
  explosionManager.drawExplosions();
  window.requestAnimationFrame(frame);
}

function defaultStats() {
  return { played: 0, wins: 0, losses: 0 };
}

function loadStats() {
  const fallback = defaultStats();
  try {
    const raw = JSON.parse(storageGet(STATS_KEY));
    if (!raw || typeof raw !== "object") return fallback;
    return {
      played: Number.isFinite(raw.played) ? Math.max(0, Math.floor(raw.played)) : 0,
      wins: Number.isFinite(raw.wins) ? Math.max(0, Math.floor(raw.wins)) : 0,
      losses: Number.isFinite(raw.losses) ? Math.max(0, Math.floor(raw.losses)) : 0,
    };
  } catch {
    return fallback;
  }
}

function saveStats(nextStats) {
  storageSet(STATS_KEY, JSON.stringify(nextStats));
}

function incStat(field) {
  if (!stats || !Object.prototype.hasOwnProperty.call(stats, field)) return;
  stats[field] += 1;
  saveStats(stats);
  if (statsModalEl.classList.contains("show")) renderStatsModal();
}

function resetStats() {
  stats = defaultStats();
  saveStats(stats);
  renderStatsModal();
}

function isLavaBombUnlocked() {
  if (storageGet(LAVA_UNLOCK_KEY) === "1") return true;
  try {
    const unlocks = loadUnlocks();
    return !!unlocks?.bombs?.lava;
  } catch {
    return false;
  }
}

function ensureLavaBombUnlockByCompletedGames() {
  if (!stats) return false;
  if (storageGet(LAVA_UNLOCK_KEY) === "1") return true;
  if (stats.played < LAVA_UNLOCK_COMPLETED_GAMES) return false;
  storageSet(LAVA_UNLOCK_KEY, "1");
  return true;
}

function renderStatsModal() {
  const played = stats.played;
  const wins = stats.wins;
  const losses = stats.losses;
  const winRate = played > 0 ? (wins / played) * 100 : 0;
  statsPlayedEl.textContent = String(played);
  statsWinsEl.textContent = String(wins);
  statsLossesEl.textContent = String(losses);
  statsWinRateEl.textContent = `${winRate.toFixed(1)}%`;
}

function openStatsModal() {
  renderStatsModal();
  statsModalEl.classList.add("show");
  statsModalEl.setAttribute("aria-hidden", "false");
}

function closeStatsModal() {
  statsModalEl.classList.remove("show");
  statsModalEl.setAttribute("aria-hidden", "true");
}

function getBombSkin(id = "bomb") {
  return BOMB_SKINS[normalizeBombSkinId(id)] || BOMB_SKINS.bomb;
}

function visibleBombCatalog() {
  return Object.fromEntries(
    Object.entries(CATALOG.bombs).filter(([id]) => {
      if (id === "lava" && !isLavaBombUnlocked()) return false;
      return true;
    })
  );
}

function preloadBombSkinImages() {
  for (const skin of Object.values(BOMB_SKINS)) {
    const tileImage = typeof skin.tile === "object" && skin.tile?.type === "image" ? skin.tile.src : skin.tileImage;
    if (!tileImage || bombImageCache.has(skin.id)) continue;
    const img = new Image();
    img.src = tileImage;
    img.decoding = "async";
    img.onload = () => {
      if (!state || state.bombSkinId !== skin.id) return;
      refreshRevealedMines();
    };
    bombImageCache.set(skin.id, img);
  }
}

function applyChromaKey(ctx, size, chromaKey) {
  if (!chromaKey || !Array.isArray(chromaKey.color)) return;
  const [kr, kg, kb] = chromaKey.color;
  const tolerance = Number.isFinite(chromaKey.tolerance) ? chromaKey.tolerance : 24;
  const neutralTolerance = Number.isFinite(chromaKey.neutralTolerance) ? chromaKey.neutralTolerance : 20;
  const neutralMin = Number.isFinite(chromaKey.neutralMin) ? chromaKey.neutralMin : 176;
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  const tolSq = tolerance * tolerance;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    const dr = data[i] - kr;
    const dg = data[i + 1] - kg;
    const db = data[i + 2] - kb;
    const distSq = dr * dr + dg * dg + db * db;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const isLightNeutral = maxC - minC <= neutralTolerance && (r + g + b) / 3 >= neutralMin;
    if (distSq <= tolSq || isLightNeutral) data[i + 3] = 0;
  }

  ctx.putImageData(imageData, 0, 0);
}

function drawBombSkinTile(ctx, img, size, skin) {
  const tileScale = Number.isFinite(skin?.tileScale) ? Math.max(0.35, Math.min(1, skin.tileScale)) : BOMB_DRAW_SCALE;
  const maxSize = size * tileScale;
  const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight);
  const baseW = img.naturalWidth * scale;
  const baseH = img.naturalHeight * scale;
  const paddingFactor = Number.isFinite(skin?.tilePaddingFactor)
    ? Math.max(0, Math.min(0.22, skin.tilePaddingFactor))
    : 0.05;
  const padding = size * paddingFactor;
  const maxInnerW = Math.max(1, size - padding * 2);
  const maxInnerH = Math.max(1, size - padding * 2);
  const fit = Math.min(maxInnerW / baseW, maxInnerH / baseH, 1);
  const drawW = baseW * fit;
  const drawH = baseH * fit;
  const dx = (size - drawW) / 2;
  const dy = (size - drawH) / 2;

  ctx.globalCompositeOperation = "source-over";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, dx, dy, drawW, drawH);
  if (skin?.chromaKey) applyChromaKey(ctx, size, skin.chromaKey);
}

function makeCell(r, c) {
  return { r, c, mine: false, revealed: false, flagged: false, adjacent: 0 };
}

function neighbors(r, c, rows, cols) {
  const result = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) result.push([nr, nc]);
    }
  }
  return result;
}

function defaultUnlocks() {
  return {
    themes: Object.fromEntries(Object.entries(CATALOG.themes).map(([k, v]) => [k, !v.lockedByDefault])),
    bombs: Object.fromEntries(Object.entries(CATALOG.bombs).map(([k, v]) => [k, !v.lockedByDefault])),
  };
}

function loadUnlocks() {
  const fallback = defaultUnlocks();
  try {
    const raw = JSON.parse(storageGet(UNLOCK_KEY));
    if (!raw || typeof raw !== "object") return fallback;
    const merged = {
      themes: { ...fallback.themes, ...(raw.themes || {}) },
      bombs: { ...fallback.bombs, ...(raw.bombs || {}) },
    };

    if (merged.bombs.classic) merged.bombs.bomb = true;
    if (merged.bombs.dynamite) merged.bombs.nuke = true;
    if (merged.bombs.spark) merged.bombs.slime = true;
    delete merged.bombs.classic;
    delete merged.bombs.dynamite;
    delete merged.bombs.spark;
    return merged;
  } catch {
    return fallback;
  }
}

function saveUnlocks(unlocks) {
  storageSet(UNLOCK_KEY, JSON.stringify(unlocks));
}

function firstUnlocked(map) {
  for (const [k, v] of Object.entries(map)) if (v) return k;
  return null;
}

function renderSelectOptions(selectEl, items, unlockedMap) {
  selectEl.innerHTML = "";
  for (const [key, meta] of Object.entries(items)) {
    const opt = document.createElement("option");
    const unlocked = !!unlockedMap[key];
    opt.value = key;
    opt.textContent = unlocked ? meta.name : `${meta.name} (Locked)`;
    opt.disabled = !unlocked;
    selectEl.appendChild(opt);
  }
}

function refreshCosmeticSelects() {
  const currentTheme = themeEl.value;
  const currentBomb = bombSkinEl.value;
  const bombItems = visibleBombCatalog();
  renderSelectOptions(themeEl, CATALOG.themes, state.unlocks.themes);
  renderSelectOptions(bombSkinEl, bombItems, state.unlocks.bombs);
  themeEl.value = state.unlocks.themes[currentTheme] ? currentTheme : firstUnlocked(state.unlocks.themes) || "neo";
  const bombCandidates = Object.fromEntries(
    Object.keys(bombItems).map((id) => [id, state.unlocks.bombs[id]])
  );
  bombSkinEl.value = state.unlocks.bombs[currentBomb] && bombItems[currentBomb]
    ? currentBomb
    : firstUnlocked(bombCandidates) || "bomb";
}

function applyTheme(theme) {
  const validTheme = Object.prototype.hasOwnProperty.call(CATALOG.themes, theme) ? theme : "neo";
  if (state?.unlocks?.themes && !state.unlocks.themes[validTheme]) return;
  document.body.dataset.theme = validTheme;
  storageSet(THEME_KEY, validTheme);
}

function applyBombSkin(skinId) {
  if (!state) return;
  const validSkinId = normalizeBombSkinId(skinId);
  if (state.unlocks?.bombs && !state.unlocks.bombs[validSkinId]) return;
  state.bombSkinId = validSkinId;
  storageSet(BOMB_KEY, validSkinId);
  refreshRevealedMines();
}

function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function isOwned(reward) {
  if (!state?.unlocks) return false;
  if (reward.type === "theme") return !!state.unlocks.themes[reward.id];
  if (reward.type === "bomb") return !!state.unlocks.bombs[reward.id];
  return false;
}

function grantReward(reward) {
  if (!state?.unlocks) return;
  if (reward.type === "theme") state.unlocks.themes[reward.id] = true;
  if (reward.type === "bomb") state.unlocks.bombs[reward.id] = true;
  saveUnlocks(state.unlocks);
  refreshCosmeticSelects();
}

function addDuplicateCredit() {
  const current = Number(storageGet(GACHA_DUPLICATE_KEY) || "0");
  storageSet(GACHA_DUPLICATE_KEY, String(current + 1));
}

function playRarityCue(rarity) {
  if (rarity === "Legendary") {
    sfx.win();
    return;
  }
  if (rarity === "Epic") {
    sfx.cascade();
    return;
  }
  if (rarity === "Rare") {
    sfx.flag(true);
    return;
  }
  sfx.click();
}

function closeGacha() {
  if (gachaTimerId) {
    clearTimeout(gachaTimerId);
    gachaTimerId = null;
  }
  gachaModalEl.classList.remove("show");
  gachaModalEl.setAttribute("aria-hidden", "true");
  pendingReward = null;
}

function pickRewardByRarity(rarity) {
  const candidates = GACHA_POOL.filter((item) => item.rarity === rarity);
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function openGacha() {
  gachaModalEl.classList.add("show");
  gachaModalEl.setAttribute("aria-hidden", "false");
  gachaClaimBtn.disabled = true;
  gachaResultEl.textContent = "";
  pendingReward = null;

  gachaSpinnerEl.textContent = "🎁";
  gachaSpinnerEl.classList.remove("rolling");
  void gachaSpinnerEl.offsetWidth;
  gachaSpinnerEl.classList.add("rolling");

  gachaTimerId = setTimeout(() => {
    const pickedRarity = weightedPick(RARITY_WEIGHTS).rarity;
    const reward =
      pickRewardByRarity(pickedRarity) || GACHA_POOL[Math.floor(Math.random() * GACHA_POOL.length)];
    pendingReward = reward;
    gachaSpinnerEl.textContent = reward.icon;

    const owned = isOwned(reward);
    gachaResultEl.innerHTML = owned
      ? `Duplicate: ${reward.name} <span class="gachaBadge rarity-${reward.rarity.toLowerCase()}">${reward.rarity}</span> (coins placeholder)`
      : `You got: ${reward.name} <span class="gachaBadge rarity-${reward.rarity.toLowerCase()}">${reward.rarity}</span>`;

    playRarityCue(reward.rarity);
    gachaClaimBtn.disabled = false;
    gachaTimerId = null;
  }, 1200);
}

function initGame(level = difficultyEl.value) {
  const cfg = SETTINGS[level];
  if (!cfg) return;
  if (gachaModalEl.classList.contains("show")) closeGacha();

  const unlocks = loadUnlocks();
  if (isLavaBombUnlocked()) unlocks.bombs.lava = true;
  const rawTheme = storageGet(THEME_KEY) || "neo";
  const rawBomb = normalizeBombSkinId(storageGet(BOMB_KEY) || "bomb");
  const fallbackTheme = firstUnlocked(unlocks.themes) || "neo";
  const fallbackBomb = firstUnlocked(unlocks.bombs) || "bomb";
  const savedTheme = unlocks.themes[rawTheme] ? rawTheme : fallbackTheme;
  const savedBomb = unlocks.bombs[rawBomb] ? rawBomb : fallbackBomb;
  const bombItems = visibleBombCatalog();

  renderSelectOptions(themeEl, CATALOG.themes, unlocks.themes);
  renderSelectOptions(bombSkinEl, bombItems, unlocks.bombs);
  themeEl.value = savedTheme;
  bombSkinEl.value = unlocks.bombs[savedBomb] && bombItems[savedBomb] ? savedBomb : firstUnlocked(
    Object.fromEntries(Object.keys(bombItems).map((id) => [id, unlocks.bombs[id]]))
  ) || "bomb";

  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }

  state = {
    level,
    cfgKey: level,
    rows: cfg.rows,
    cols: cfg.cols,
    mineCount: cfg.mines,
    cells: Array.from({ length: cfg.rows }, (_, r) => Array.from({ length: cfg.cols }, (_, c) => makeCell(r, c))),
    started: false,
    firstClick: true,
    minesPlaced: false,
    ended: false,
    resultRecorded: false,
    flags: 0,
    hintsRemaining: HINTS_PER_GAME,
    revealedCount: 0,
    seconds: 0,
    bombSkinId: savedBomb,
    unlocks,
  };

  applyTheme(savedTheme);
  applyBombSkin(bombSkinEl.value);
  focused = { r: 0, c: 0 };
  renderBoard();
  updateStats();
  setStatus("Ready");
}

function markGameCompleted() {
  if (state.resultRecorded) return false;
  incStat("played");
  const newlyUnlocked = !isLavaBombUnlocked() && ensureLavaBombUnlockByCompletedGames();
  if (newlyUnlocked) {
    state.unlocks.bombs.lava = true;
    saveUnlocks(state.unlocks);
    refreshCosmeticSelects();
  }
  return newlyUnlocked;
}

function renderBoard() {
  const { rows, cols } = state;
  boardWrapEl.classList.remove("shake");
  boardEl.innerHTML = "";
  boardEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;

  const frag = document.createDocumentFragment();
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cell";
      btn.setAttribute("role", "gridcell");
      btn.setAttribute("aria-label", `Cell ${r + 1}-${c + 1}`);
      btn.tabIndex = r === 0 && c === 0 ? 0 : -1;
      btn.dataset.r = String(r);
      btn.dataset.c = String(c);
      frag.appendChild(btn);
    }
  }
  boardEl.appendChild(frag);
}

function placeMinesAvoiding(safeR, safeC) {
  const safeSet = new Set();
  safeSet.add(`${safeR},${safeC}`);
  neighbors(safeR, safeC, state.rows, state.cols).forEach(([r, c]) => safeSet.add(`${r},${c}`));

  const available = [];
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      const key = `${r},${c}`;
      if (!safeSet.has(key)) available.push([r, c]);
    }
  }

  for (let i = available.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }

  for (let i = 0; i < state.mineCount; i += 1) {
    const [r, c] = available[i];
    state.cells[r][c].mine = true;
  }

  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      if (state.cells[r][c].mine) continue;
      const count = neighbors(r, c, state.rows, state.cols).reduce((acc, [nr, nc]) => {
        return acc + (state.cells[nr][nc].mine ? 1 : 0);
      }, 0);
      state.cells[r][c].adjacent = count;
    }
  }

  state.minesPlaced = true;
}

function startTimerIfNeeded() {
  if (state.started || state.ended) return;
  state.started = true;
  timerId = setInterval(() => {
    state.seconds += 1;
    timeEl.textContent = String(state.seconds);
  }, 1000);
}

function updateStats() {
  minesLeftEl.textContent = String(Math.max(0, state.mineCount - state.flags));
  hintsLeftEl.textContent = String(Math.max(0, state.hintsRemaining));
  timeEl.textContent = String(state.seconds);
  updateHintAvailability();
}

function updateHintAvailability() {
  if (!state) return;
  const hasHints = state.hintsRemaining > 0;
  hintBtnEl.disabled = !hasHints || state.ended;
  hintBtnEl.setAttribute("title", hasHints ? `Hint (H) • ${state.hintsRemaining} left` : "No hints left");
}

function setStatus(text, cls = "") {
  statusEl.textContent = text;
  statusEl.classList.remove("win", "lose");
  if (cls) statusEl.classList.add(cls);
}

function cellButton(r, c) {
  return boardEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
}

function renderMineTile(btn, skin) {
  const tileImage = typeof skin.tile === "object" && skin.tile?.type === "image" ? skin.tile.src : skin.tileImage;
  if (tileImage) {
    const img = bombImageCache.get(skin.id);
    if (img && img.complete && img.naturalWidth > 0) {
      const canvas = document.createElement("canvas");
      canvas.className = "bombSpriteCanvas";
      const size = 64;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      drawBombSkinTile(ctx, img, size, skin);
      btn.appendChild(canvas);
      return;
    }
  }

  if (typeof skin.tile === "string") {
    btn.textContent = skin.tile;
    return;
  }
  btn.textContent = skin.tileFallback || "💣";
}

function applyCellUI(r, c) {
  const cell = state.cells[r][c];
  const btn = cellButton(r, c);
  if (!btn) return;

  btn.classList.remove("revealed", "flagged", "mine");
  btn.textContent = "";
  btn.removeAttribute("data-n");
  btn.innerHTML = "";

  if (cell.revealed) {
    btn.classList.add("revealed");
    btn.disabled = true;
    if (cell.mine) {
      btn.classList.add("mine");
      renderMineTile(btn, getBombSkin(state.bombSkinId));
    } else if (cell.adjacent > 0) {
      btn.textContent = String(cell.adjacent);
      btn.setAttribute("data-n", String(cell.adjacent));
    }
    return;
  }

  btn.disabled = false;
  if (cell.flagged) {
    btn.classList.add("flagged");
    btn.textContent = "F";
  }
}

function refreshRevealedMines() {
  if (!state) return;
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      if (state.cells[r][c].revealed && state.cells[r][c].mine) applyCellUI(r, c);
    }
  }
}

function revealAllMines(triggerR, triggerC) {
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      const cell = state.cells[r][c];
      if (cell.mine || (r === triggerR && c === triggerC)) cell.revealed = true;
      applyCellUI(r, c);
    }
  }
}

function revealCell(r, c) {
  if (state.ended) return;
  const cell = state.cells[r][c];
  if (cell.revealed || cell.flagged) return;

  startTimerIfNeeded();

  if (state.firstClick) {
    placeMinesAvoiding(r, c);
    state.firstClick = false;
  }

  sfx.click();

  if (cell.mine) {
    cell.revealed = true;
    applyCellUI(r, c);
    lose(r, c);
    return;
  }

  const queue = [[r, c]];
  let cascadeCount = 0;

  while (queue.length) {
    const [cr, cc] = queue.shift();
    const current = state.cells[cr][cc];

    if (current.revealed || current.flagged) continue;
    current.revealed = true;
    state.revealedCount += 1;
    cascadeCount += 1;
    applyCellUI(cr, cc);

    if (current.adjacent === 0) {
      neighbors(cr, cc, state.rows, state.cols).forEach(([nr, nc]) => {
        const nCell = state.cells[nr][nc];
        if (!nCell.revealed && !nCell.flagged && !nCell.mine) queue.push([nr, nc]);
      });
    }
  }

  if (cascadeCount > 2) sfx.cascade();
  checkWin();
}

function toggleFlag(r, c) {
  if (state.ended) return;
  const cell = state.cells[r][c];
  if (cell.revealed) return;

  startTimerIfNeeded();
  cell.flagged = !cell.flagged;
  state.flags += cell.flagged ? 1 : -1;
  applyCellUI(r, c);
  updateStats();
  sfx.flag(cell.flagged);
}

function explosionPayloadForSkin(skin) {
  return {
    type: skin.explosion,
    duration: skin.explosionDuration,
    scale: skin.explosionScale || 1,
    palette: skin.palette,
    emojiSet: skin.emojiSet,
  };
}

function explosionAtCell(r, c) {
  if (!state) return;
  const skin = getBombSkin(state.bombSkinId);
  const center = cellCenterFromGrid(r, c);
  if (!center) return;
  const { x, y } = center;

  explosionManager.spawnExplosion({
    x,
    y,
    explosion: explosionPayloadForSkin(skin),
  });
}

function gridPixelMetrics() {
  if (!state) return null;
  const firstCell = cellButton(0, 0);
  if (!firstCell) return null;
  const firstRect = firstCell.getBoundingClientRect();
  const rightCell = state.cols > 1 ? cellButton(0, 1) : null;
  const downCell = state.rows > 1 ? cellButton(1, 0) : null;
  const gapX = Number.parseFloat(window.getComputedStyle(boardEl).columnGap) || 0;
  const gapY = Number.parseFloat(window.getComputedStyle(boardEl).rowGap) || 0;
  const pitchX = rightCell
    ? rightCell.getBoundingClientRect().left - firstRect.left
    : firstRect.width + gapX;
  const pitchY = downCell
    ? downCell.getBoundingClientRect().top - firstRect.top
    : firstRect.height + gapY;

  return {
    originX: firstRect.left,
    originY: firstRect.top,
    cellWidth: firstRect.width,
    cellHeight: firstRect.height,
    pitchX,
    pitchY,
  };
}

function cellCenterFromGrid(row, col) {
  const metrics = gridPixelMetrics();
  if (!metrics) return null;
  const x = metrics.originX + col * metrics.pitchX + metrics.cellWidth / 2;
  const y = metrics.originY + row * metrics.pitchY + metrics.cellHeight / 2;
  return { x, y };
}

function explodeAllBombs({ clickedRow, clickedCol }) {
  if (!state) return;
  const skin = getBombSkin(state.bombSkinId);
  const mineCells = [];

  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.cols; col += 1) {
      if (state.cells[row][col].mine) mineCells.push({ row, col });
    }
  }

  mineCells.sort((a, b) => {
    const da = Math.hypot(a.row - clickedRow, a.col - clickedCol);
    const db = Math.hypot(b.row - clickedRow, b.col - clickedCol);
    return da - db;
  });

  const stepSec = 0.03;
  for (let i = 0; i < mineCells.length; i += 1) {
    const mine = mineCells[i];
    const center = cellCenterFromGrid(mine.row, mine.col);
    if (!center) continue;
    explosionManager.enqueueExplosion({
      x: center.x,
      y: center.y,
      delay: i * stepSec,
      explosion: explosionPayloadForSkin(skin),
    });
  }
}

function explodeAllBombsOnLoss({ clickedRow, clickedCol }) {
  explodeAllBombs({ clickedRow, clickedCol });
}

function lose(r, c) {
  revealAllMines(r, c);
  explodeAllBombsOnLoss({ clickedRow: r, clickedCol: c });
  sfx.explodeSkin(getBombSkin(state.bombSkinId).soundEffectId);
  boardWrapEl.classList.add("shake");
  setTimeout(() => boardWrapEl.classList.remove("shake"), 380);
  setStatus("Boom! Game Over", "lose");

  state.ended = true;
  if (!state.resultRecorded) {
    const unlockedLava = markGameCompleted();
    incStat("losses");
    state.resultRecorded = true;
    if (unlockedLava) setStatus("You unlocked Lava Bomb!", "win");
  }
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function checkWin() {
  const target = state.rows * state.cols - state.mineCount;
  if (state.revealedCount !== target || state.ended) return;

  state.ended = true;
  let unlockedLava = false;
  if (!state.resultRecorded) {
    unlockedLava = markGameCompleted();
    incStat("wins");
    state.resultRecorded = true;
  }
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }

  let unlockedNukeOnExpert = false;
  if (state.level === "expert" && !state.unlocks.bombs.nuke) {
    state.unlocks.bombs.nuke = true;
    saveUnlocks(state.unlocks);
    refreshCosmeticSelects();
    bombSkinEl.value = "nuke";
    applyBombSkin("nuke");
    unlockedNukeOnExpert = true;
  }

  if (unlockedLava) setStatus("You unlocked Lava Bomb!", "win");
  else setStatus(unlockedNukeOnExpert ? "You Win! Nuke unlocked." : "You Win!", "win");
  sfx.win();
  confettiBurst();
  openGacha();
}

function setFocus(r, c) {
  const nr = Math.max(0, Math.min(state.rows - 1, r));
  const nc = Math.max(0, Math.min(state.cols - 1, c));
  focused = { r: nr, c: nc };

  boardEl.querySelectorAll(".cell[tabindex='0']").forEach((el) => (el.tabIndex = -1));
  const btn = cellButton(nr, nc);
  if (btn) {
    btn.tabIndex = 0;
    btn.focus();
  }
}

function isSafeHintCell(r, c) {
  const cell = state.cells[r][c];
  if (cell.revealed || cell.flagged) return false;
  if (!state.minesPlaced) return true;
  return !cell.mine;
}

function hasRevealedNumberNeighbor(r, c) {
  return neighbors(r, c, state.rows, state.cols).some(([nr, nc]) => {
    const n = state.cells[nr][nc];
    return n.revealed && n.adjacent > 0;
  });
}

function selectHintTarget() {
  const priority = [];
  const fallback = [];

  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      if (!isSafeHintCell(r, c)) continue;
      if (hasRevealedNumberNeighbor(r, c)) priority.push([r, c]);
      else fallback.push([r, c]);
    }
  }

  const pool = priority.length ? priority : fallback;
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function hint() {
  if (state.ended) return;
  if (state.hintsRemaining <= 0) {
    state.hintsRemaining = 0;
    updateStats();
    setStatus("No hints left.");
    return;
  }
  const target = selectHintTarget();
  if (!target) {
    setStatus("No safe hint available.");
    return;
  }

  const [r, c] = target;
  setFocus(r, c);
  revealCell(r, c);
  state.hintsRemaining = Math.max(0, state.hintsRemaining - 1);
  updateStats();
}

function confettiBurst() {
  confettiEl.innerHTML = "";
  const colors = ["#ffca3a", "#8ac926", "#1982c4", "#ff595e", "#ff924c", "#6a4c93"];
  const pieces = 90;

  for (let i = 0; i < pieces; i += 1) {
    const p = document.createElement("div");
    p.className = "confetti-piece";
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDuration = `${1.3 + Math.random() * 1.5}s`;
    p.style.animationDelay = `${Math.random() * 0.35}s`;
    p.style.transform = `translateY(0) rotate(${Math.random() * 220}deg)`;
    confettiEl.appendChild(p);
  }

  setTimeout(() => {
    confettiEl.innerHTML = "";
  }, 3200);
}

boardEl.addEventListener("mousedown", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell) return;
  cell.classList.add("press");
});

window.addEventListener("mouseup", () => {
  boardEl.querySelectorAll(".cell.press").forEach((el) => el.classList.remove("press"));
});

boardEl.addEventListener("click", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell) return;
  const r = Number(cell.dataset.r);
  const c = Number(cell.dataset.c);
  setFocus(r, c);
  revealCell(r, c);
  updateStats();
});

boardEl.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const cell = e.target.closest(".cell");
  if (!cell) return;
  const r = Number(cell.dataset.r);
  const c = Number(cell.dataset.c);
  setFocus(r, c);
  toggleFlag(r, c);
});

boardEl.addEventListener("focusin", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell) return;
  focused = { r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && statsModalEl.classList.contains("show")) {
    closeStatsModal();
    return;
  }
  if (statsModalEl.classList.contains("show")) return;
  if (gachaModalEl.classList.contains("show")) return;

  if (!state) return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
    if (e.key.toLowerCase() === "h") {
      e.preventDefault();
      hint();
    }
    return;
  }

  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Enter", "f", "F", "h", "H"].includes(e.key)) {
    e.preventDefault();
  }

  if (e.key === "ArrowUp") setFocus(focused.r - 1, focused.c);
  if (e.key === "ArrowDown") setFocus(focused.r + 1, focused.c);
  if (e.key === "ArrowLeft") setFocus(focused.r, focused.c - 1);
  if (e.key === "ArrowRight") setFocus(focused.r, focused.c + 1);

  if (e.key === " " || e.key === "Enter") {
    revealCell(focused.r, focused.c);
    updateStats();
  }

  if (e.key.toLowerCase() === "f") toggleFlag(focused.r, focused.c);
  if (e.key.toLowerCase() === "h") hint();
});

window.addEventListener("resize", () => explosionManager.resize());

statsBtnEl.addEventListener("click", openStatsModal);
statsCloseEl.addEventListener("click", closeStatsModal);
statsResetEl.addEventListener("click", resetStats);
statsModalEl.addEventListener("click", (e) => {
  if (e.target === statsModalEl) closeStatsModal();
});

resetEl.addEventListener("click", () => initGame(difficultyEl.value));
difficultyEl.addEventListener("change", () => initGame(difficultyEl.value));
hintBtnEl.addEventListener("click", hint);
themeEl.addEventListener("change", () => applyTheme(themeEl.value));
bombSkinEl.addEventListener("change", () => applyBombSkin(bombSkinEl.value));
gachaClaimBtn.addEventListener("click", () => {
  if (!pendingReward) return;
  const owned = isOwned(pendingReward);
  if (!owned) {
    grantReward(pendingReward);
    setStatus(`Unlocked: ${pendingReward.name}`, "win");
  } else {
    addDuplicateCredit();
    setStatus("Duplicate reward received.", "win");
  }
  closeGacha();
});

preloadBombSkinImages();
window.requestAnimationFrame(frame);
initGame("beginner");
