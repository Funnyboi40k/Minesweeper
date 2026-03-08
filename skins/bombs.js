export const BOMB_SKINS = {
  bomb: {
    id: "bomb",
    name: "Bomb",
    icon: "💣",
    tile: "💣",
    explosion: "ringShockwave",
    explosionDuration: 0.62,
    soundEffectId: "classicBlast",
    palette: ["#ffd166", "#ff6b35", "#ff3f5e"],
  },
  skull: {
    id: "skull",
    name: "Skull Bomb",
    icon: "💀",
    tile: "💀",
    tileImage: "./assets/skins/skull_bomb.png",
    explosion: "emojiBurst",
    explosionDuration: 0.88,
    soundEffectId: "skullBurst",
    emojiSet: ["💥", "🔥", "☠️"],
    palette: ["#ff7b7b", "#ffb347", "#f8f9fa"],
  },
  nuke: {
    id: "nuke",
    name: "Nuke",
    icon: "☢️",
    tile: "☢️",
    explosion: "mushroomCloud",
    explosionDuration: 1.25,
    explosionScale: 1.25,
    soundEffectId: "nukeBlast",
    palette: ["#ffe066", "#ff922b", "#f03e3e"],
  },
  slime: {
    id: "slime",
    name: "Slime Bomb",
    icon: "🧪",
    tile: { type: "image", src: "./assets/skins/slime_bomb.png" },
    tileImage: "./assets/skins/slime_bomb.png",
    chromaKey: { color: [232, 232, 232], tolerance: 72, neutralTolerance: 20, neutralMin: 160 },
    explosion: "splatter",
    explosionDuration: 0.8,
    soundEffectId: "slimePop",
    palette: ["#7dff74", "#40d954", "#8dffbe"],
  },
  lava: {
    id: "lava",
    name: "Lava Bomb",
    icon: "🌋",
    unlockType: "playedGames",
    unlockValue: 10,
    tile: { type: "image", src: "./assets/skins/lava_bomb.png?v=20260308a" },
    tileImage: "./assets/skins/lava_bomb.png?v=20260308a",
    tileScale: 0.82,
    tilePaddingFactor: 0.06,
    chromaKey: { color: [232, 232, 232], tolerance: 78, neutralTolerance: 22, neutralMin: 170 },
    tileFallback: "🌋",
    explosion: "lavaBurst",
    explosionDuration: 0.95,
    soundEffectId: "lavaPop",
    palette: ["#ff7a18", "#ff3d00", "#ffd166"],
  },
};

export const BOMB_ORDER = ["bomb", "skull", "nuke", "slime", "lava"];

export const LEGACY_BOMB_ID_MAP = {
  classic: "bomb",
  bomb: "bomb",
  dynamite: "nuke",
  skull: "skull",
  nuke: "nuke",
  slime: "slime",
  spark: "slime",
  lava: "lava",
};

export function normalizeBombSkinId(rawId) {
  if (BOMB_SKINS[rawId]) return rawId;
  if (LEGACY_BOMB_ID_MAP[rawId]) return LEGACY_BOMB_ID_MAP[rawId];
  return "bomb";
}

export function bombEntriesForSelect() {
  return Object.fromEntries(
    BOMB_ORDER.map((id) => {
      const skin = BOMB_SKINS[id];
      const icon = skin.icon || (typeof skin.tile === "string" ? skin.tile : "🧨");
      return [id, { name: `${icon} ${skin.name}` }];
    })
  );
}
