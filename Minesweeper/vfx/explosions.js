const TAU = Math.PI * 2;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function easeOutCubic(t) {
  const x = clamp01(t);
  return 1 - (1 - x) ** 3;
}

function rgba(hex, a) {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function makeEmojiBurst(explosion) {
  const count = 10 + Math.floor(Math.random() * 7);
  const emojis = explosion.emojiSet || ["💥", "🔥", "☠️"];
  const particles = [];

  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * TAU;
    const speed = 70 + Math.random() * 190;
    particles.push({
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 60,
      size: 18 + Math.random() * 12,
      spin: (Math.random() - 0.5) * 4,
      rot: Math.random() * TAU,
    });
  }

  return particles;
}

function makeSplatter(explosion) {
  const blobs = [];
  const blobCount = 8 + Math.floor(Math.random() * 5);
  const baseColor = (explosion.palette && explosion.palette[0]) || "#7dff74";

  for (let i = 0; i < blobCount; i += 1) {
    const angle = (i / blobCount) * TAU + (Math.random() - 0.5) * 0.32;
    const dist = 30 + Math.random() * 80;
    const radius = 10 + Math.random() * 16;
    blobs.push({ angle, dist, radius, color: baseColor });
  }

  return blobs;
}

function makeLavaEmbers(explosion) {
  const embers = [];
  const count = 14 + Math.floor(Math.random() * 8);
  const palette = explosion.palette || ["#ff7a18", "#ff3d00", "#ffd166"];

  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * TAU;
    const speed = 110 + Math.random() * 210;
    embers.push({
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (70 + Math.random() * 40),
      radius: 3 + Math.random() * 5,
      color: palette[Math.floor(Math.random() * palette.length)],
    });
  }

  return embers;
}

export class ExplosionManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true });
    this.active = [];
    this.queue = [];
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  buildExplosionInstance({ x, y, explosion }) {
    const instance = {
      x,
      y,
      type: explosion.type,
      duration: explosion.duration,
      scale: explosion.scale || 1,
      elapsed: 0,
      palette: explosion.palette || ["#ffd166", "#ff6b35", "#ff3f5e"],
      emojiSet: explosion.emojiSet,
      particles: [],
      blobs: [],
      embers: [],
    };

    if (instance.type === "emojiBurst") instance.particles = makeEmojiBurst(explosion);
    if (instance.type === "splatter") instance.blobs = makeSplatter(explosion);
    if (instance.type === "lavaBurst") instance.embers = makeLavaEmbers(explosion);
    return instance;
  }

  spawnExplosion({ x, y, explosion }) {
    this.active.push(this.buildExplosionInstance({ x, y, explosion }));
  }

  enqueueExplosion({ x, y, explosion, delay = 0 }) {
    this.queue.push({
      delayRemaining: Math.max(0, delay),
      payload: { x, y, explosion },
    });
  }

  updateExplosions(dt) {
    for (let i = this.queue.length - 1; i >= 0; i -= 1) {
      const queued = this.queue[i];
      queued.delayRemaining -= dt;
      if (queued.delayRemaining <= 0) {
        this.active.push(this.buildExplosionInstance(queued.payload));
        this.queue.splice(i, 1);
      }
    }

    for (const ex of this.active) {
      ex.elapsed += dt;
    }
    this.active = this.active.filter((ex) => ex.elapsed <= ex.duration);
  }

  drawExplosions() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const ex of this.active) {
      const t = clamp01(ex.elapsed / ex.duration);
      if (ex.type === "ringShockwave") this.drawRingShockwave(ctx, ex, t);
      if (ex.type === "emojiBurst") this.drawEmojiBurst(ctx, ex, t);
      if (ex.type === "mushroomCloud") this.drawMushroomCloud(ctx, ex, t);
      if (ex.type === "splatter") this.drawSplatter(ctx, ex, t);
      if (ex.type === "lavaBurst") this.drawLavaBurst(ctx, ex, t);
    }
  }

  drawRingShockwave(ctx, ex, t) {
    const e = easeOutCubic(t);
    const radius = (18 + e * 145) * ex.scale;
    const alpha = 1 - t;

    ctx.save();
    ctx.lineWidth = (8 - e * 4) * Math.max(0.75, ex.scale * 0.8);
    ctx.strokeStyle = rgba(ex.palette[0], alpha * 0.85);
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, radius, 0, TAU);
    ctx.stroke();

    ctx.lineWidth = 2.8;
    ctx.strokeStyle = rgba(ex.palette[1], alpha * 0.65);
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, radius * 0.78, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawEmojiBurst(ctx, ex, t) {
    const life = 1 - t;
    const gravity = 290;

    ctx.save();
    ctx.globalAlpha = life;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const p of ex.particles) {
      const x = ex.x + p.vx * t;
      const y = ex.y + p.vy * t + 0.5 * gravity * t * t;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rot + p.spin * t);
      ctx.font = `${Math.max(12, p.size * life)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      ctx.fillText(p.emoji, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  drawMushroomCloud(ctx, ex, t) {
    const e = easeOutCubic(t);
    const alpha = 1 - t;
    const stemH = 78 * e * ex.scale;

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = rgba(ex.palette[1], alpha * 0.9);
    ctx.fillRect(ex.x - 14 * ex.scale, ex.y - stemH + 16 * ex.scale, 28 * ex.scale, stemH);

    const capY = ex.y - stemH;
    const capR = (18 + e * 56) * ex.scale;
    ctx.fillStyle = rgba(ex.palette[0], alpha * 0.85);
    ctx.beginPath();
    ctx.arc(ex.x, capY, capR, 0, TAU);
    ctx.fill();

    ctx.fillStyle = rgba(ex.palette[2], alpha * 0.72);
    ctx.beginPath();
    ctx.arc(ex.x - capR * 0.45, capY + 7, capR * 0.56, 0, TAU);
    ctx.arc(ex.x + capR * 0.5, capY + 6, capR * 0.52, 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  drawSplatter(ctx, ex, t) {
    const e = easeOutCubic(t);
    const alpha = 1 - t;

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = rgba(ex.palette[0], alpha * 0.7);
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, (14 + e * 30) * ex.scale, 0, TAU);
    ctx.fill();

    for (const blob of ex.blobs) {
      const dist = blob.dist * e;
      const x = ex.x + Math.cos(blob.angle) * dist;
      const y = ex.y + Math.sin(blob.angle) * dist;
      ctx.fillStyle = rgba(blob.color, alpha * 0.82);
      ctx.beginPath();
      ctx.arc(x, y, blob.radius * (1 - t * 0.35), 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  drawLavaBurst(ctx, ex, t) {
    const e = easeOutCubic(t);
    const life = 1 - t;

    ctx.save();
    ctx.globalAlpha = life;

    const ringR = (16 + e * 120) * ex.scale;
    ctx.lineWidth = 6 * Math.max(0.75, ex.scale * 0.8);
    ctx.strokeStyle = rgba(ex.palette[0], 0.85 * life);
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ringR, 0, TAU);
    ctx.stroke();

    ctx.lineWidth = 3 * Math.max(0.75, ex.scale * 0.8);
    ctx.strokeStyle = rgba(ex.palette[2], 0.7 * life);
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ringR * 0.7, 0, TAU);
    ctx.stroke();

    for (const ember of ex.embers) {
      const x = ex.x + ember.vx * t;
      const y = ex.y + ember.vy * t + 0.5 * 340 * t * t;
      ctx.fillStyle = rgba(ember.color, 0.9 * life);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, ember.radius * (1 - t * 0.55)), 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }
}
