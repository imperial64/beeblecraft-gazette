// Rendering: embedded sprites, decoded images, the skin figure, the art canvas, the 2x upscale
// with the paper texture, and the screen pass (photos, vector text). docs/design-v2.md section 7.2.
"use strict";

// ------------------------------------------------------------ sprites (v1 section 7, v2 section 13.3)
const ASSETS = {}; // built-in pieces: lantern, footerLantern, chain -> {img, bbox}
const SPRITES = {}; // theme sprites decoded: key -> {img, bbox, data}

function decodeImage(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Could not decode image"));
    im.src = url;
  });
}

function alphaBBox(img) {
  const c = newCanvas(img.naturalWidth, img.naturalHeight);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x + 1);
        y1 = Math.max(y1, y + 1);
      }
    }
  }
  if (x1 === 0) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { x0, y0, x1, y1 };
}

async function loadAssets() {
  const map = JSON.parse($("#gazette-assets").textContent);
  const names = {
    lantern: "oxidized_copper_lantern.png",
    footerLantern: "copper_lantern.png",
    chain: "oxidized_copper_chain.png",
  };
  for (const [key, file] of Object.entries(names)) {
    const img = await decodeImage(map[file]);
    ASSETS[key] = { img, bbox: alphaBBox(img) };
  }
}

async function decodeSprites(theme) {
  for (const k of Object.keys(SPRITES)) delete SPRITES[k];
  const sp = (theme && theme.sprites) || {};
  for (const key of Object.keys(ASSETS)) {
    const e = sp[key];
    if (!e || typeof e.data !== "string") continue;
    try {
      const img = await decodeImage(e.data);
      SPRITES[key] = { img, bbox: alphaBBox(img), data: e.data };
    } catch (err) {
      // a sprite that does not decode falls back to the built-in piece
    }
  }
}

function sprite(key) {
  const e = LTHEME && LTHEME.sprites && LTHEME.sprites[key];
  if (e && SPRITES[key] && SPRITES[key].data === e.data) return SPRITES[key];
  return ASSETS[key];
}

// ------------------------------------------------------------ images in memory
const IMG = {}; // id -> decoded HTMLImageElement, or null when missing
const HALVES = new Map(); // id -> [canvas at 1/2, 1/4, ...]
const SKINS = new Map(); // id|model -> figure

function resetImageCaches() {
  for (const k of Object.keys(IMG)) delete IMG[k];
  HALVES.clear();
  SKINS.clear();
}

async function decodeEntry(id, entry) {
  HALVES.delete(id);
  for (const k of [...SKINS.keys()]) if (k.startsWith(id + "|")) SKINS.delete(k);
  if (!entry || typeof entry.data !== "string" || !entry.data.startsWith("data:image/")) {
    IMG[id] = null;
    return;
  }
  try {
    IMG[id] = await decodeImage(entry.data);
  } catch (e) {
    IMG[id] = null;
  }
}

async function decodeAll(issue) {
  resetImageCaches();
  await Promise.all(Object.entries(issue.images).map(([id, e]) => decodeEntry(id, e)));
}

// ------------------------------------------------------------ skin front view (v1 section 13)
function skinIsSlim(img) {
  const c = newCanvas(64, 64);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, 64, 64).data;
  const alpha = (x, y) => d[(y * 64 + x) * 4 + 3];
  for (const x of [50, 51]) for (let y = 16; y < 20; y++) if (alpha(x, y)) return false;
  for (const x of [54, 55]) for (let y = 20; y < 32; y++) if (alpha(x, y)) return false;
  for (const x of [46, 47]) for (let y = 52; y < 64; y++) if (alpha(x, y)) return false;
  return true;
}

function skinFigure(issue) {
  const paper = issue.paper;
  const id = paper.skin;
  if (!id) return null;
  const img = IMG[id];
  if (!img) return null;
  if (img.naturalWidth !== 64 || img.naturalHeight !== 64) {
    report("issue", "Officer skin is not 64 by 64; no figure drawn");
    return null;
  }
  const model = paper.skinModel || "auto";
  const key = id + "|" + model;
  if (SKINS.has(key)) return SKINS.get(key);
  const slim = skinIsSlim(img);
  const a = model === "slim" ? 3 : model === "classic" ? 4 : slim ? 3 : 4;
  const front = newCanvas(2 * a + 8, 32);
  const fctx = front.getContext("2d");
  fctx.imageSmoothingEnabled = false;
  const parts = [
    [[8, 8, 8, 8], [40, 8], [a, 0]],
    [[20, 20, 8, 12], [20, 36], [a, 8]],
    [[44, 20, a, 12], [44, 36], [0, 8]],
    [[36, 52, a, 12], [52, 52], [a + 8, 8]],
    [[4, 20, 4, 12], [4, 36], [a, 20]],
    [[20, 52, 4, 12], [4, 52], [a + 4, 20]],
  ];
  for (const [[bx, by, pw, ph], [ox, oy], [dx, dy]] of parts) {
    fctx.drawImage(img, bx, by, pw, ph, dx, dy, pw, ph);
    fctx.drawImage(img, ox, oy, pw, ph, dx, dy, pw, ph);
  }
  const fig = { canvas: front, a, w: front.width * 2, h: 64, detected: slim ? "slim" : "classic" };
  SKINS.set(key, fig);
  return fig;
}

// ------------------------------------------------------------ photo framing (v1 section 12.2)
function frame(img, aw, ah, zoom, focusX, focusY) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const z = Math.max(1, Number(zoom) || 1);
  const fx = Number.isFinite(Number(focusX)) ? Number(focusX) : 0.5;
  const fy = Number.isFinite(Number(focusY)) ? Number(focusY) : 0.5;
  const sw = aw * 2;
  const sh = ah * 2;
  const s = Math.max(sw / iw, sh / ih) * z;
  const rw = Math.max(sw, Math.round(iw * s));
  const rh = Math.max(sh, Math.round(ih * s));
  const left = clamp(Math.round(fx * rw - sw / 2), 0, rw - sw);
  const top = clamp(Math.round(fy * rh - sh / 2), 0, rh - sh);
  return { sw, sh, rw, rh, left, top };
}

// ------------------------------------------------------------ paper texture (v1 section 14)
const TEXTURES = new Map();

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function textureLayer(pi) {
  if (TEXTURES.has(pi)) return TEXTURES.get(pi);
  const N = SW * SH;
  const rnd = mulberry32(1001 + pi);
  const byte = () => Math.floor(rnd() * 256);
  const uniform = (a, b) => a + (b - a) * rnd();

  const grain = new Int16Array(N);
  for (let i = 0; i < N; i++) grain[i] = 128 + Math.floor(((byte() - 128) * 3) / 128);

  const TW = 13;
  const TH = 17;
  const toneSmall = newCanvas(TW, TH);
  const tctx = toneSmall.getContext("2d");
  const tdata = tctx.createImageData(TW, TH);
  for (let i = 0; i < TW * TH; i++) {
    const v = 128 + Math.floor(((byte() - 128) * 4) / 128);
    tdata.data[i * 4] = tdata.data[i * 4 + 1] = tdata.data[i * 4 + 2] = v;
    tdata.data[i * 4 + 3] = 255;
  }
  tctx.putImageData(tdata, 0, 0);
  const toneBig = newCanvas(SW, SH);
  const tb = toneBig.getContext("2d", { willReadFrequently: true });
  tb.imageSmoothingEnabled = true;
  tb.imageSmoothingQuality = "high";
  tb.drawImage(toneSmall, 0, 0, SW, SH);
  const tone = tb.getImageData(0, 0, SW, SH).data;

  const fib = newCanvas(SW, SH);
  const fctx = fib.getContext("2d");
  fctx.fillStyle = "rgb(128,128,128)";
  fctx.fillRect(0, 0, SW, SH);
  fctx.lineWidth = 1;
  const levels = [-7, -6, -5, 4];
  for (let f = 0; f < 1100; f++) {
    let x = uniform(0, SW);
    let y = uniform(0, SH);
    let a = uniform(0, Math.PI);
    const seg = uniform(3, 8);
    const nseg = 2 + Math.floor(rnd() * 4);
    fctx.beginPath();
    fctx.moveTo(x, y);
    for (let k = 0; k < nseg; k++) {
      a += uniform(-0.5, 0.5);
      x += seg * Math.cos(a);
      y += seg * Math.sin(a);
      fctx.lineTo(x, y);
    }
    const l = 128 + levels[Math.floor(rnd() * levels.length)];
    fctx.strokeStyle = "rgb(" + l + "," + l + "," + l + ")";
    fctx.stroke();
  }
  const blurred = newCanvas(SW, SH);
  const bctx = blurred.getContext("2d", { willReadFrequently: true });
  bctx.fillStyle = "rgb(128,128,128)";
  bctx.fillRect(0, 0, SW, SH);
  if (typeof bctx.filter === "string") bctx.filter = "blur(0.5px)";
  bctx.drawImage(fib, 0, 0);
  if (typeof bctx.filter === "string") bctx.filter = "none";
  const fibres = bctx.getImageData(0, 0, SW, SH).data;

  const delta = new Int16Array(N);
  for (let i = 0; i < N; i++) {
    const v = grain[i] + (tone[i * 4] - 128) + (fibres[i * 4] - 128);
    delta[i] = clamp(v, 0, 255) - 128;
  }
  TEXTURES.set(pi, delta);
  return delta;
}

function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return [-1, -1, -1];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// ------------------------------------------------------------ photos on the screen canvas (v1 section 12.3)
function halvedSource(id, img, scale) {
  // scale: target px per source px. Pre-shrink by halving until within 2x.
  let src = img;
  let w = img.naturalWidth;
  let list = HALVES.get(id);
  if (!list) {
    list = [];
    HALVES.set(id, list);
  }
  let level = 0;
  while (scale * (img.naturalWidth / w) < 0.5 && w > 2) {
    if (!list[level]) {
      const c = newCanvas(Math.max(1, Math.round(src.width / 2)), Math.max(1, Math.round(src.height / 2)));
      const cctx = c.getContext("2d");
      cctx.imageSmoothingEnabled = true;
      cctx.imageSmoothingQuality = "high";
      cctx.drawImage(src, 0, 0, c.width, c.height);
      list[level] = c;
    }
    src = list[level];
    w = src.width;
    level++;
  }
  return src;
}

function drawPhoto(sctx, p) {
  const img = IMG[p.id];
  if (!img) return;
  const iw = img.naturalWidth;
  const f = frame(img, p.aw, p.ah, p.zoom, p.fx, p.fy);
  const src = halvedSource(p.id, img, f.rw / iw);
  const kx = (src.width || src.naturalWidth) / f.rw;
  const ky = (src.height || src.naturalHeight) / f.rh;
  sctx.save();
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(src, f.left * kx, f.top * ky, f.sw * kx, f.sh * ky, p.ax * 2, p.ay * 2, f.sw, f.sh);
  sctx.restore();
  const x0 = p.ax * 2;
  const y0 = p.ay * 2;
  const x1 = (p.ax + p.aw) * 2;
  const y1 = (p.ay + p.ah) * 2;
  border(sctx, x0, y0, x1, y1, "ink", 4);
  border(sctx, x0 + 4, y0 + 4, x1 - 4, y1 - 4, "paper_dark", 2);
}

function hatch(ctx, x0, y0, x1, y1, col, alpha) {
  if (y1 <= y0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const hh = y1 - y0;
  for (let k = -hh; k < x1 - x0; k += 12) {
    ctx.moveTo(x0 + k, y1);
    ctx.lineTo(x0 + k + hh, y0);
  }
  ctx.stroke();
  ctx.restore();
}

function drawMarkers(sctx, markers) {
  for (const m of markers) {
    const x0 = m.x * 2;
    const x1 = (m.x + m.w) * 2;
    if (m.kind === "overflow") {
      hatch(sctx, x0, m.target * 2, x1, Math.max(m.end, m.target + 4) * 2, MARK_RED, 0.35);
      sctx.fillStyle = MARK_RED;
      sctx.fillRect(x0, m.target * 2 - 2, x1 - x0, 4);
    } else {
      hatch(sctx, x0, m.y0 * 2, x1, m.y1 * 2, colour("ink_faint"), 0.6);
      sctx.save();
      sctx.strokeStyle = colour("paper_dark");
      sctx.lineWidth = 2;
      sctx.strokeRect(x0 + 1, m.y0 * 2 + 1, x1 - x0 - 2, (m.y1 - m.y0) * 2 - 2);
      sctx.restore();
    }
  }
}

// ------------------------------------------------------------ page render
let ART = null;

// opts: {preview, fast, log}. fast skips the texture (typing, panning). Returns the layout
// result, including the geometry record.
function renderPage(issue, pi, screen, opts = {}) {
  if (!ART) ART = newCanvas(W, H);
  const actx = ART.getContext("2d", { willReadFrequently: true });
  const L = layoutPage(issue, pi, actx, !!opts.log);
  LTHEME = issue.theme;
  const sctx = screen.getContext("2d");
  const src = actx.getImageData(0, 0, W, H).data;
  const out = sctx.createImageData(SW, SH);
  const d = out.data;
  const tex = issue.theme.texture && !opts.fast ? textureLayer(pi) : null;
  const P = hexRgb(issue.theme.colours.paper);
  const PS = hexRgb(issue.theme.colours.paper_shade);
  for (let ay = 0; ay < H; ay++) {
    for (let ax = 0; ax < W; ax++) {
      const si = (ay * W + ax) * 4;
      const r = src[si];
      const g = src[si + 1];
      const b = src[si + 2];
      const masked = tex && ((r === P[0] && g === P[1] && b === P[2]) || (r === PS[0] && g === PS[1] && b === PS[2]));
      for (let dy = 0; dy < 2; dy++) {
        let o = (ay * 2 + dy) * SW + ax * 2;
        for (let dx = 0; dx < 2; dx++, o++) {
          const di = o * 4;
          if (masked) {
            const v = tex[o];
            d[di] = r + v;
            d[di + 1] = g + v;
            d[di + 2] = b + v;
          } else {
            d[di] = r;
            d[di + 1] = g;
            d[di + 2] = b;
          }
          d[di + 3] = 255;
        }
      }
    }
  }
  sctx.putImageData(out, 0, 0);
  for (const p of L.photos) drawPhoto(sctx, p);
  for (const run of L.runs) TX.drawRun(sctx, run);
  if (opts.preview) drawMarkers(sctx, L.markers);
  return L;
}
