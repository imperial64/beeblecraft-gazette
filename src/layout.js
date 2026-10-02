// Page layout: bands stacked down the page, masthead and footer bands from text metrics, content
// bands with their columns and spanning blocks, balancing, the geometry record and the issue and
// warning reports. docs/design-v2.md sections 4 and 7, docs/design-v3.md section 6.
"use strict";

let LTHEME = null; // the theme of the issue being laid out
let REP = null; // Map of reports while collecting
// band: the content band's number on the page (null when the page has only one)
let RCTX = { page: null, band: null, column: null, block: null, owner: null };
let GEO = null; // geometry being recorded (draw pass of one page)
let CUR = null; // {fields, photo} of the block being drawn

function report(level, text) {
  if (!REP) return;
  const key = [level, RCTX.page, RCTX.band, RCTX.column, RCTX.block, text].join("|");
  if (!REP.has(key)) {
    REP.set(key, { level, text, page: RCTX.page, band: RCTX.band, column: RCTX.column, block: RCTX.block, owner: RCTX.owner });
  }
}

Font.hooks.missing = (ch) => {
  const code = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
  report("issue", "No glyph for '" + ch + "' (U+" + code + ")");
};
TX.onReport = report;

function reportText(r) {
  const where = [];
  if (r.page !== null && r.page !== undefined) where.push("Page " + (r.page + 1));
  if (r.band !== null && r.band !== undefined) where.push("band " + (r.band + 1));
  if (r.column !== null && r.column !== undefined) where.push("column " + (r.column + 1));
  if (r.block) where.push(r.block);
  return (where.length ? where.join(", ") + ": " : "") + r.text;
}

// ------------------------------------------------------------ drawing primitives
const colour = (token) => (LTHEME && LTHEME.colours[token]) || token;

function rect(ctx, x0, y0, x1, y1, token) {
  if (ctx && x1 > x0 && y1 > y0) {
    ctx.fillStyle = colour(token);
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
}

function border(ctx, x0, y0, x1, y1, token, t = 1) {
  rect(ctx, x0, y0, x1, y0 + t, token);
  rect(ctx, x0, y1 - t, x1, y1, token);
  rect(ctx, x0, y0, x0 + t, y1, token);
  rect(ctx, x1 - t, y0, x1, y1, token);
}

const styleOf = (obj, role, name) => TX.resolve(LTHEME, role, obj && obj.styles && obj.styles[name]);

// One text field. F: {obj, name, role, single, join, x, y, width (number, or function of the
// line's y), xAt (function of the line's y), align ("centre" | "right", within alignW), nowrap,
// paraGap, owner, style}. Returns {bottom, next, field}; bottom is y when the field is blank.
function drawField(ctx, F) {
  const st = F.style || styleOf(F.obj, F.role, F.name);
  let text = F.text !== undefined ? F.text : getField(F.obj, F.name);
  if (F.single || F.join) text = text.replace(/\n/g, " ");
  const em = TX.emH(st);
  const pt = TX.pitch(st);
  const paraGap = F.paraGap === undefined ? PARA_GAP : F.paraGap;
  const ink = colour(st.colour);
  const lines = [];
  let y = F.y;
  let bottom = F.y;
  if (!isBlank(text)) {
    const paras = F.single || F.join ? [text] : text.split("\n");
    let off = 0;
    paras.forEach((p, pi) => {
      if (pi) y += paraGap;
      const top = y;
      const wfn = typeof F.width === "function" ? (k) => F.width(top + k * pt) : F.width;
      const ls = F.nowrap ? [{ text: p, start: 0, end: p.length }] : TX.wrap(p, wfn, st);
      for (const ln of ls) {
        let lx = F.xAt ? F.xAt(y) : F.x;
        if (F.align === "centre") lx = F.x + Math.floor((F.alignW - TX.inkWidth(ln.text, st)) / 2);
        else if (F.align === "right") lx = F.x + F.alignW - TX.inkWidth(ln.text, st);
        TX.draw(ctx, lx, y, ln.text, st, ink);
        lines.push({ text: ln.text, start: off + ln.start, end: off + ln.end, x: lx, y });
        bottom = y + em;
        y += pt;
      }
      off += p.length + 1;
    });
  }
  let field = null;
  if (ctx && GEO) {
    const w = F.alignW || (typeof F.width === "function" ? F.width(F.y) : F.width) || 0;
    if (!lines.length) {
      const lx = F.align === "centre" ? F.x + Math.floor(F.alignW / 2) : F.align === "right" ? F.x + F.alignW : F.x;
      lines.push({ text: "", start: 0, end: text.length, x: lx, y: F.y });
    }
    field = {
      owner: F.owner || RCTX.owner, obj: F.obj, name: F.name, role: F.role, single: !!F.single, style: st,
      x: F.x, y: F.y, w, h: Math.max(bottom - F.y, 0), lines,
    };
    GEO.texts.push(field);
    if (CUR) CUR.fields[F.name] = field;
  }
  return { bottom, next: y, field };
}

// Headline with its teal rule (story, photo). Returns the body's top y (y itself when empty).
function headlineField(ctx, obj, name, x, y, w) {
  const r = drawField(ctx, { obj, name, role: "headline", single: true, x, y, width: w });
  if (r.bottom === y && isBlank(getField(obj, name))) return y;
  const ruleY = r.bottom + 3;
  rect(ctx, x, ruleY, x + w, ruleY + 1, "teal");
  return ruleY + 1 + 8;
}

// ------------------------------------------------------------ sprites
function chainTiles(ctx, x, y0, y1) {
  if (!ctx) return;
  const ch = sprite("chain");
  const th = ch.img.naturalHeight || 16;
  const tw = ch.img.naturalWidth || 16;
  for (let ty = y0; ty < y1; ty += th) {
    const hh = Math.min(th, y1 - ty);
    ctx.drawImage(ch.img, 0, 0, tw, hh, x, ty, tw, hh);
  }
}

// ------------------------------------------------------------ masthead (v2 section 4.4, v3 section 6.2)
// The masthead drawn from `top` (16 for a page's leading masthead). Returns {bottom, fields}:
// bottom is the top of whatever follows (94 for the default full masthead at 16).
function masthead(ctx, issue, variant, top, owner) {
  const paper = issue.paper;
  const orn = !!paper.ornaments;
  const full = variant !== "half";
  const P = (name, extra) => Object.assign({ obj: paper, name, single: true, nowrap: true, owner }, extra);
  const fields = {};
  const word = getField(paper, "wordmark").replace(/\n/g, " ");
  const wst0 = styleOf(paper, "wordmark", "wordmark");
  let wst = wst0;
  let clip = false;
  if (!isBlank(word)) {
    let sizes;
    if (!TX.isVector(wst0)) {
      sizes = [];
      for (let s = wst0.size; s >= Math.min(22, wst0.size); s -= 11) sizes.push(s);
    } else {
      sizes = [];
      const min = Math.ceil(wst0.size / 2);
      for (let s = wst0.size; s >= min; s = Math.round(s * 0.9)) {
        sizes.push(s);
        if (Math.round(s * 0.9) === s) break;
      }
      if (sizes[sizes.length - 1] !== min) sizes.push(min);
    }
    let found = -1;
    for (let i = 0; i < sizes.length; i++) {
      const st = Object.assign({}, wst0, { size: sizes[i] });
      if (TX.width(word, st) + 1 <= FULL_W) {
        found = i;
        break;
      }
    }
    if (found > 0) report("warning", "Wordmark drawn smaller than its size (" + wst0.size + ") to fit");
    if (found < 0) {
      found = sizes.length - 1;
      clip = true;
      report("issue", "Wordmark is wider than the page even at its smallest size");
    }
    wst = Object.assign({}, wst0, { size: sizes[found] });
  }
  rect(ctx, LEFT, top, RIGHT, top + 1, "ink");
  let ruleBottom;
  if (full) {
    const ky = top + 2;
    let kem = 0;
    for (const k of ["kickerLeft", "kickerCentre", "kickerRight"]) kem = Math.max(kem, TX.emH(styleOf(paper, "kicker", k)));
    fields.kickerLeft = drawField(ctx, P("kickerLeft", { role: "kicker", x: LEFT, y: ky, width: FULL_W })).field;
    fields.kickerCentre = drawField(ctx, P("kickerCentre", { role: "kicker", x: LEFT, y: ky, align: "centre", alignW: FULL_W })).field;
    fields.kickerRight = drawField(ctx, P("kickerRight", { role: "kicker", x: LEFT, y: ky, align: "right", alignW: FULL_W })).field;
    const r2 = ky + kem + 2;
    rect(ctx, LEFT, r2, RIGHT, r2 + 1, "ink");
    ruleBottom = r2 + 1;
  } else {
    ruleBottom = top + 1;
  }
  const wordCap = ruleBottom + 4;
  const wordTop = wordCap - TX.capOff(wst);
  const baseline = wordTop + TX.baseOff(wst);
  const ww = isBlank(word) ? 0 : TX.width(word, wst) + 1;
  const wx = LEFT + Math.floor((FULL_W - ww) / 2);
  if (ctx && clip) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(LEFT, 0, FULL_W, H);
    ctx.clip();
  }
  fields.wordmark = drawField(ctx, P("wordmark", { role: "wordmark", style: wst, x: clip ? LEFT : wx, y: wordTop, width: FULL_W, alignW: FULL_W })).field;
  if (fields.wordmark && !clip) {
    fields.wordmark.x = wx;
    fields.wordmark.w = ww;
  }
  if (ctx && clip) ctx.restore();
  const tealY = baseline + 4;
  if (orn) {
    const lan = sprite("lantern");
    const bb = lan.bbox;
    const ly = baseline - bb.y1;
    if (ctx) {
      // The built-in pair keeps v1's offset of 4; an uploaded lantern or chain hangs the chain's
      // ink centred over the lantern's ink.
      const ch = sprite("chain");
      const custom = lan !== ASSETS.lantern || ch !== ASSETS.chain;
      const cdx = custom ? bb.x0 + Math.floor((bb.x1 - bb.x0 - (ch.bbox.x1 - ch.bbox.x0)) / 2) - ch.bbox.x0 : 4;
      for (const lx of [LEFT - bb.x0, RIGHT - bb.x1]) {
        ctx.drawImage(lan.img, lx, ly);
        chainTiles(ctx, lx + cdx, ruleBottom, ly + 1);
      }
    }
    if (!isBlank(word) && !clip) {
      const gap = wx - (LEFT + (bb.x1 - bb.x0));
      if (gap < 10) report("warning", "Masthead lantern only " + gap + " art px from the wordmark");
    }
  }
  rect(ctx, LEFT, tealY, RIGHT, tealY + 2, "teal");
  let bottom;
  if (full) {
    const tst = styleOf(paper, "tagline", "tagline");
    const tTop = tealY + 2 + 3 - TX.capOff(tst);
    fields.tagline = drawField(ctx, P("tagline", { role: "tagline", x: LEFT, y: tTop, align: "centre", alignW: FULL_W })).field;
    const r1 = tTop + TX.emH(tst) + 3;
    rect(ctx, LEFT, r1, RIGHT, r1 + 2, "ink");
    rect(ctx, LEFT, r1 + 3, RIGHT, r1 + 4, "ink");
    bottom = r1 + 4 + 5;
  } else {
    bottom = tealY + 2 + 6;
  }
  return { bottom, fields };
}

// ------------------------------------------------------------ footer band (v2 section 4.5, v3 section 6.2)
// An empty footer is a band at its minimum height with no text, so it can be clicked and typed into.
function footerPlan(block, orn) {
  const text = getField(block, "text").replace(/\n/g, " ");
  const st = styleOf(block, "footer", "text");
  const width = orn ? FOOTER_TEXT_W : FOOTER_TEXT_W_PLAIN;
  if (isBlank(text)) return { n: 0, st, width, text, height: FOOTER_MIN_H };
  const n = TX.wrap(text, width, st).length;
  return { n, st, width, text, height: Math.max(12 + TX.emH(st) + (n - 1) * TX.pitch(st), FOOTER_MIN_H) };
}

function drawFooter(ctx, block, plan, orn, top, owner) {
  const y0 = top;
  const y1 = top + plan.height;
  const st = plan.st;
  const n = Math.max(1, plan.n);
  const em = TX.emH(st);
  const co = TX.capOff(st);
  const pt = TX.pitch(st);
  const innerTop = y0 + 3;
  const innerBottom = y1 - 1;
  const ink = (n - 1) * pt + (em - co);
  const cap = innerTop + Math.floor((innerBottom - innerTop - ink) / 2);
  if (ctx) {
    rect(ctx, LEFT, y0, RIGHT, y1, "paper_shade");
    border(ctx, LEFT, y0, RIGHT, y1, "ink");
    rect(ctx, LEFT + 1, y0 + 1, RIGHT - 1, y0 + 3, "teal");
    if (orn) {
      const warm = sprite("footerLantern");
      const bb = warm.bbox;
      const ly = n === 1
        ? innerTop + Math.floor((innerBottom - innerTop - (bb.y1 - bb.y0)) / 2) - bb.y0
        : cap - 1 - bb.y0;
      ctx.drawImage(warm.img, LEFT + 6, ly);
    }
  }
  const tx = orn ? LEFT + 28 : LEFT + 6;
  return drawField(ctx, { obj: block, name: "text", role: "footer", join: true, style: st, x: tx, y: cap - co, width: plan.width, owner }).field;
}

// ------------------------------------------------------------ photos
function photoRect(ctx, issue, ref, ax, ay, aw, ah, photos) {
  const id = ref.image;
  const entry = id ? issue.images[id] : null;
  if (!entry) report("issue", "no photo");
  else if (!IMG[id]) report("issue", "photo " + entry.name + " is missing: re-import it");
  const rec = { x: ax, y: ay, w: aw, h: ah };
  if (entry && IMG[id] && ah > 0) {
    const fr = frame(IMG[id], aw, ah, ref.zoom, ref.focusX, ref.focusY);
    Object.assign(rec, fr);
    if (fr.rw > IMG[id].naturalWidth) report("warning", "photo is upscaled; lower the zoom or use a larger image");
  }
  if (CUR) CUR.photo = rec;
  if (!ctx || ah <= 0) return;
  if (entry && IMG[id]) {
    photos.push({ id, ax, ay, aw, ah, zoom: ref.zoom, fx: ref.focusX, fy: ref.focusY });
    return;
  }
  rect(ctx, ax, ay, ax + aw, ay + ah, "paper_dark");
  border(ctx, ax, ay, ax + aw, ay + ah, "ink", 2);
  let label = entry ? entry.name || "missing photo" : "no photo";
  const saved = REP;
  REP = null; // the placeholder's own label never reports
  const st = { font: TX.PIXEL, size: 11, colour: "ink_soft", bold: false, tracking: 0 };
  while (label.length > 3 && TX.width(label, st) > aw - 8) label = label.slice(0, -2);
  const lw = TX.width(label, st);
  if (ah >= 12) TX.draw(ctx, ax + Math.floor((aw - lw) / 2), ay + Math.floor((ah - 7) / 2) - 2, label, st, colour("ink_soft"));
  REP = saved;
}

// ------------------------------------------------------------ blocks
function boxRun(ctx, x, y, w, b, bodyFn, orn) {
  const cx = x + 6;
  const cw = w - 12;
  const icon = sprite("lantern");
  const iw = orn ? icon.bbox.x1 - icon.bbox.x0 : 0;
  const tx = orn ? cx + iw + 4 : cx;
  const tw = orn ? cw - iw - 4 : cw;
  const tst = styleOf(b, "boxTitle", "title");
  const title = getField(b, "title").replace(/\n/g, " ");
  const n = Math.max(1, isBlank(title) ? 0 : TX.wrap(title, tw, tst).length);
  const ty = y + 6;
  const hairY = ty + (n - 1) * TX.pitch(tst) + TX.emH(tst) + 3;
  const bodyY = hairY + 1 + 6;
  const contentBottom = bodyFn(null, cx, bodyY, cw);
  const y1 = contentBottom + 6;
  if (ctx) {
    rect(ctx, x, y, x + w, y1, "paper_shade");
    border(ctx, x, y, x + w, y1, "ink");
    rect(ctx, x + 1, y + 1, x + w - 1, y + 3, "teal");
    if (orn) ctx.drawImage(icon.img, cx - icon.bbox.x0, ty + 3);
    drawField(ctx, { obj: b, name: "title", role: "boxTitle", single: true, style: tst, x: tx, y: ty, width: tw });
    rect(ctx, cx, hairY, cx + cw, hairY + 1, "ink_faint");
    bodyFn(ctx, cx, bodyY, cw);
  }
  return y1;
}

function paraBody(b) {
  return (ctx, cx, cy, cw) => drawField(ctx, { obj: b, name: "body", role: "body", x: cx, y: cy, width: cw }).bottom;
}

function deskBody(b, issue) {
  return (ctx, cx, cy, cw) => {
    const fig = skinFigure(issue);
    const figW = fig ? fig.w : 0;
    const figH = fig ? fig.h : 0;
    const narrowX = fig ? cx + figW + 6 : cx;
    const narrowW = fig ? cw - figW - 6 : cw;
    const besideUntil = fig ? cy + figH + 8 : cy;
    if (ctx && fig) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(fig.canvas, cx, cy, figW, figH);
    }
    const r = drawField(ctx, {
      obj: b, name: "body", role: "body", x: cx, y: cy,
      width: (ly) => (ly < besideUntil ? narrowW : cw),
      xAt: (ly) => (ly < besideUntil ? narrowX : cx),
    });
    let bottom = r.bottom;
    const sig = getField(b, "signature").replace(/\n/g, " ");
    if (!isBlank(sig)) {
      const y = r.next + PARA_GAP;
      const sst = styleOf(b, "signature", "signature");
      const sw = TX.inkWidth(sig, sst);
      const lim = y < besideUntil ? narrowW : cw;
      if (sw > lim) report("issue", "Signature wider than its line");
      bottom = drawField(ctx, { obj: b, name: "signature", role: "signature", single: true, nowrap: true, style: sst, x: cx, y, align: "right", alignW: cw }).bottom;
    } else if (ctx && GEO) {
      drawField(ctx, { obj: b, name: "signature", role: "signature", single: true, nowrap: true, x: cx, y: r.next + PARA_GAP, align: "right", alignW: cw });
    }
    return Math.max(bottom, cy + figH);
  };
}

function registerBody(b) {
  return (ctx, cx, cy, cw) => {
    const st = styleOf(b, "register", "lines");
    for (const line of getField(b, "lines").split("\n")) {
      if (TX.width(line, st) > cw) report("issue", "Register line does not fit: '" + line + "'");
    }
    return drawField(ctx, { obj: b, name: "lines", role: "register", style: st, nowrap: true, paraGap: 0, x: cx, y: cy, width: cw }).bottom;
  };
}

function mapSegments(len, dashed) {
  const out = [];
  if (len <= 0) return out;
  if (!dashed) return [[0, len]];
  for (let d = 0; d < len; d += 5) out.push([d, Math.min(len, d + 3)]);
  return out;
}

function mapRun(b, w) {
  const bpp = Number(b.blocksPerPx) > 0 ? Number(b.blocksPerPx) : 200;
  const lines = b.lines || {};
  const n = {};
  const lab = {};
  const dashed = {};
  for (const d of DIRS) {
    const ln = lines[d] || {};
    n[d] = Math.max(0, Math.round((Number(ln.blocks) || 0) / bpp));
    lab[d] = n[d] ? getField(b, "lines." + d + ".label").replace(/\n/g, " ") : "";
    dashed[d] = ln.style === "dashed";
  }
  return (ctx, x, y, bh) => {
    const bw = w;
    const cx = Math.floor(w / 2);
    const lst = (d) => styleOf(b, "mapLabel", "lines." + d + ".label");
    const lw = (d) => TX.width(lab[d], lst(d));
    if (n.east && cx + n.east + 4 + lw("east") > bw - 2) report("issue", "Map: east line or label runs past the box");
    if (n.west && cx - n.west < 4) report("issue", "Map: west line runs past the box");
    if (n.west && lab.west && cx - n.west + lw("west") >= cx - 2) report("issue", "Map: west label reaches the spawn square");
    for (const k of ["north", "south"]) {
      if (n[k] && lab[k] && cx + 5 + lw(k) > bw - 2) report("issue", "Map: " + k + " label runs past the box");
    }
    if (bh > 0) {
      const cy = Math.floor((bh + n.north - n.south) / 2);
      if (cy - n.north < 1 || cy + n.south > bh - 1) report("issue", "Map: a line is taller than the box");
      if (ctx) {
        rect(ctx, x, y, x + bw, y + bh, "paper");
        border(ctx, x, y, x + bw, y + bh, "ink");
        ctx.fillStyle = colour("paper_dark");
        for (let gx = ((cx % 10) + 10) % 10; gx < bw; gx += 10) {
          for (let gy = ((cy % 10) + 10) % 10; gy < bh; gy += 10) {
            if (gx >= 2 && gx < bw - 2 && gy >= 2 && gy < bh - 2) ctx.fillRect(x + gx, y + gy, 1, 1);
          }
        }
        const X = x + cx;
        const Y = y + cy;
        for (const [a, e] of mapSegments(n.east, dashed.east)) rect(ctx, X + a, Y - 1, X + e, Y + 1, "teal");
        for (const [a, e] of mapSegments(n.west, dashed.west)) rect(ctx, X - e, Y - 1, X - a, Y + 1, "teal");
        for (const [a, e] of mapSegments(n.north, dashed.north)) rect(ctx, X - 1, Y - e, X + 1, Y - a, "teal");
        for (const [a, e] of mapSegments(n.south, dashed.south)) rect(ctx, X - 1, Y + a, X + 1, Y + e, "teal");
        rect(ctx, X - 2, Y - 2, X + 2, Y + 2, "teal_dark");
        const nst = styleOf(null, "mapLabel", "");
        TX.draw(ctx, x + 4, y + 4 - TX.capOff(nst), "N", nst, colour(nst.colour));
        const label = (d, lx, capY) => {
          if (!lab[d]) return;
          drawField(ctx, { obj: b, name: "lines." + d + ".label", role: "mapLabel", single: true, nowrap: true, x: lx, y: capY - TX.capOff(lst(d)), width: bw });
        };
        label("east", X + n.east + 4, y + cy - 4);
        label("west", X - n.west, y + cy - 13);
        label("north", X + 5, y + cy - n.north);
        label("south", X + 5, y + cy + n.south - 7);
      }
    }
    if (isBlank(b.caption)) return y + bh;
    return drawField(ctx, { obj: b, name: "caption", role: "caption", x, y: y + bh + CAPTION_GAP, width: w }).bottom;
  };
}


// Column items: run(ctx, x, y, h) returns the ink bottom. Flexible items get h from balance.
// fixed: a block across several columns with something below it keeps its minimum height.
function makeItem(b, issue, photos, w, fixed) {
  const orn = !!issue.paper.ornaments;
  const id = b.id || b.type;
  const base = { id, b, w, flex: false, h: 0 };
  switch (b.type) {
    case "story":
      return Object.assign(base, {
        run(ctx, x, y) {
          const by = headlineField(ctx, b, "headline", x, y, w);
          if (isBlank(b.body)) {
            if (ctx && GEO) drawField(ctx, { obj: b, name: "body", role: "body", x, y: by, width: w });
            return by === y ? y : by - 8;
          }
          return drawField(ctx, { obj: b, name: "body", role: "body", x, y: by, width: w }).bottom;
        },
      });
    case "photo": {
      const lo = Math.max(0, Math.round(Number(b.minH)) || 0);
      const hi = fixed ? lo : Math.max(lo, Math.round(Number(b.maxH)) || 0);
      return Object.assign(base, {
        flex: !fixed, lo, hi, h: lo,
        run(ctx, x, y, hgt) {
          const py = headlineField(ctx, b, "headline", x, y, w);
          photoRect(ctx, issue, b, x, py, w, hgt, photos);
          if (isBlank(b.caption)) {
            if (ctx && GEO) drawField(ctx, { obj: b, name: "caption", role: "caption", x, y: py + hgt + CAPTION_GAP, width: w });
            return py + hgt;
          }
          return drawField(ctx, { obj: b, name: "caption", role: "caption", x, y: py + hgt + CAPTION_GAP, width: w }).bottom;
        },
      });
    }
    case "map":
      return Object.assign(base, { flex: !fixed, lo: MAP_MIN, hi: fixed ? MAP_MIN : MAP_MAX, h: MAP_MIN, run: mapRun(b, w) });
    case "box":
      return Object.assign(base, { run: (ctx, x, y) => boxRun(ctx, x, y, w, b, paraBody(b), orn) });
    case "desk":
      return Object.assign(base, { run: (ctx, x, y) => boxRun(ctx, x, y, w, b, deskBody(b, issue), orn) });
    case "register":
      return Object.assign(base, { run: (ctx, x, y) => boxRun(ctx, x, y, w, b, registerBody(b), orn) });
    default:
      return Object.assign(base, {
        run(ctx, x, y) {
          report("issue", "Unknown block type '" + b.type + "'; kept but not drawn");
          return y;
        },
      });
  }
}

// Run one item at (x, y); records its geometry block when drawing.
function runItem(ctx, it, x, y) {
  const saved = [RCTX.column, RCTX.block, RCTX.owner];
  RCTX.column = it.pos.col;
  RCTX.block = it.id;
  RCTX.owner = it.owner;
  const rec = ctx && GEO ? { fields: {}, photo: null } : null;
  CUR = rec;
  const bottom = it.run(ctx, x, y, it.h);
  CUR = null;
  if (rec) {
    const g = {
      band: it.pos.band, col: it.pos.col, idx: it.pos.idx, type: it.b.type, id: it.id, span: it.span || 1, members: it.members,
      x, y, w: it.w, h: Math.max(0, bottom - y), fields: rec.fields, photo: rec.photo, flexible: it.flex, obj: it.b,
    };
    GEO.blocks.push(g);
    it.geo = g;
  }
  [RCTX.column, RCTX.block, RCTX.owner] = saved;
  return bottom;
}

function runColumn(ctx, x, y, items) {
  let bottom = y;
  items.forEach((it, i) => {
    if (i) y = bottom + STORY_GAP;
    bottom = runItem(ctx, it, x, y);
  });
  return bottom;
}

// Flexible items share what the text leaves, within their limits (v1 section 11).
function balanceColumn(x, y, items, target) {
  const flex = items.filter((it) => it.flex);
  let status = null;
  if (!flex.length) {
    const end = runColumn(null, x, y, items);
    if (items.length && end > target) status = { kind: "overflow", amount: end - target };
    else if (items.length && end < target) status = { kind: "gap", amount: target - end };
  } else {
    for (const it of flex) it.h = 0;
    const spare = target - runColumn(null, x, y, items);
    for (const it of flex) it.h = it.lo;
    let extra = spare - flex.reduce((s, it) => s + it.lo, 0);
    const open = flex.slice();
    while (extra > 0 && open.length) {
      const share = Math.floor(extra / open.length);
      const rest = extra % open.length;
      open.slice().forEach((it, i) => {
        const add = Math.min(share + (i < rest ? 1 : 0), it.hi - it.h);
        it.h += add;
        extra -= add;
        if (it.h === it.hi) open.splice(open.indexOf(it), 1);
      });
      if (share === 0 && rest === 0) break;
    }
    if (extra < 0) {
      for (const it of flex) it.h = Math.max(0, Math.floor(spare / flex.length));
      status = { kind: "overflow", amount: -extra };
    } else if (extra > 0) {
      status = { kind: "gap", amount: extra };
    }
  }
  const end = runColumn(null, x, y, items);
  return { end, status, flex };
}

// The end of a run of items at their minimum heights.
function naturalEnd(x, y, items) {
  for (const it of items) if (it.flex) it.h = it.lo;
  return runColumn(null, x, y, items);
}

// ------------------------------------------------------------ content bands (v3 section 6.3)
// Lay out one content band from y0. Without H it measures: returns {hMin, hMax}. With H it
// balances every column to y0 + H, reports, draws when ctx is given, and returns the band's
// geometry {columns, gutters, entries}. B: {issue, page, bi, photos, markers, log, anyBlock,
// label (the band's number for the balance log), ord (its number among content bands), orn}.
function solveBand(ctx, B, y0, H) {
  const { issue, page, bi, photos } = B;
  const band = page.bands[bi];
  const cols = band.columns;
  const n = Math.max(1, cols.length);
  const cg = columnGeometry(n);
  const final = H !== null && H !== undefined;
  const spanW = (c, s) => {
    let w = 0;
    for (let k = c; k < c + s; k++) w += cg.ws[k];
    return w + GUTTER * (s - 1);
  };
  const so = spanOrder(band);
  const own = (c, i) => ({ kind: "block", band: bi, col: c, idx: i });
  if (final) {
    if (cols.length > 3) {
      RCTX.column = null;
      RCTX.block = null;
      RCTX.owner = null;
      report("warning", "Band " + (B.ord + 1) + " has " + cols.length + " columns; the format was designed for 3");
    }
    for (const D of so.demoted) {
      RCTX.column = D.c;
      RCTX.block = D.b.id;
      RCTX.owner = own(D.c, D.idx);
      report("issue", D.b.id + ": span could not be laid out; drawn in one column");
    }
    RCTX.block = null;
    RCTX.owner = null;
    cols.forEach((col, c) => {
      RCTX.column = c;
      if (B.anyBlock && !blocksOf(col).length) report("warning", "Column " + (c + 1) + " is empty");
    });
    RCTX.column = null;
  }
  const spanners = new Map(so.order.map((P) => [P.b, P]));
  const refOf = new Map();
  for (const P of so.order) for (const m of P.members) if (m !== P.c) refOf.set(cols[m][P.at[m]], P);
  // each column's entries: an item, or the sync point of a spanner (its own entry or a ref)
  const ents = cols.map((col, c) => {
    const out = [];
    col.forEach((e, i) => {
      if (isRef(e)) {
        const P = refOf.get(e);
        if (P) out.push({ sync: P, idx: i });
        return;
      }
      const P = spanners.get(e);
      if (P) {
        out.push({ sync: P, idx: i });
        return;
      }
      const it = makeItem(e, issue, photos, cg.ws[c], false);
      it.pos = { band: bi, col: c, idx: i };
      it.owner = own(c, i);
      it.members = [c];
      out.push({ item: it, idx: i });
    });
    return out;
  });
  for (const P of so.order) {
    // the last entry of every member column: it stretches with the columns (tail-flexible)
    P.tailFlex = P.members.every((m) => ents[m].length && ents[m][ents[m].length - 1].sync === P);
    const it = makeItem(P.b, issue, photos, spanW(P.c, P.s), !P.tailFlex);
    it.span = P.s;
    it.pos = { band: bi, col: P.c, idx: P.idx };
    it.owner = own(P.c, P.idx);
    it.members = P.members.slice();
    P.item = it;
  }
  // segments between sync points: [seg0, P, seg1, P', seg2, ...]
  const segs = ents.map((l) => {
    const out = [[]];
    for (const e of l) {
      if (e.sync) out.push(e.sync, []);
      else out[out.length - 1].push(e.item);
    }
    return out;
  });
  const ptr = cols.map(() => 0);
  const cursor = cols.map(() => y0);
  const runs = [];
  const tailFlexOf = cols.map(() => null);
  // Phase A: sync placement, top to bottom
  for (const P of so.order) {
    let syncY = y0;
    for (const m of P.members) {
      const seg = segs[m][ptr[m]];
      RCTX.column = m;
      const minEnd = seg.length ? naturalEnd(cg.xs[m], cursor[m], seg) + STORY_GAP : cursor[m];
      syncY = Math.max(syncY, minEnd);
    }
    for (const m of P.members) {
      const seg = segs[m][ptr[m]];
      ptr[m] += 2;
      if (!seg.length) {
        // nothing above the spanner in this column: the space down to it is a gap
        if (final && syncY > cursor[m]) {
          RCTX.column = m;
          RCTX.block = null;
          RCTX.owner = null;
          report("warning", "Column " + (m + 1) + " has a gap of " + (syncY - cursor[m]) + " art px above " + P.b.id);
          B.markers.push({ kind: "gap", x: cg.xs[m], w: cg.ws[m], y0: cursor[m], y1: syncY - 2 });
        }
        continue;
      }
      RCTX.column = m;
      const res = balanceColumn(cg.xs[m], cursor[m], seg, syncY - STORY_GAP);
      runs.push({ c: m, x: cg.xs[m], y: cursor[m], items: seg });
      if (final && res.status && res.status.kind === "gap") {
        RCTX.block = null;
        RCTX.owner = null;
        report("warning", "Column " + (m + 1) + " has a gap of " + res.status.amount + " art px above " + P.b.id);
        B.markers.push({ kind: "gap", x: cg.xs[m], w: cg.ws[m], y0: res.end, y1: syncY - STORY_GAP });
      }
    }
    P.y = syncY;
    if (P.tailFlex) {
      for (const m of P.members) {
        cursor[m] = syncY;
        tailFlexOf[m] = P;
      }
      continue;
    }
    RCTX.column = P.c;
    P.bottom = runItem(null, P.item, cg.xs[P.c], syncY);
    for (const m of P.members) cursor[m] = P.bottom + STORY_GAP;
  }
  RCTX.column = null;
  if (!final) {
    let hMin = 0;
    let hMax = Infinity;
    cols.forEach((col, c) => {
      const tail = segs[c][ptr[c]];
      const tf = tailFlexOf[c];
      let end;
      let cap = 0;
      RCTX.column = c;
      if (tf) {
        end = naturalEnd(cg.xs[tf.c], tf.y, [tf.item]);
        if (tf.item.flex) cap = tf.item.hi - tf.item.lo;
      } else if (tail.length) {
        end = naturalEnd(cg.xs[c], cursor[c], tail);
        for (const it of tail) if (it.flex) cap += it.hi - it.lo;
      } else end = cursor[c];
      hMin = Math.max(hMin, end - y0);
      hMax = Math.min(hMax, end - y0 + cap);
    });
    RCTX.column = null;
    return { hMin, hMax: Math.max(hMin, hMax) };
  }
  // Phase B: every tail balanced to the band bottom
  const bottomY = y0 + H;
  const tfDone = new Map();
  cols.forEach((col, c) => {
    const x = cg.xs[c];
    const w = cg.ws[c];
    const tf = tailFlexOf[c];
    let res;
    let items;
    let y;
    RCTX.column = c;
    if (tf) {
      if (!tfDone.has(tf)) {
        RCTX.column = tf.c;
        const r = balanceColumn(cg.xs[tf.c], tf.y, [tf.item], bottomY);
        tf.bottom = r.end;
        runs.push({ c: tf.c, x: cg.xs[tf.c], y: tf.y, items: [tf.item] });
        tfDone.set(tf, r);
        RCTX.column = c;
      }
      res = tfDone.get(tf);
      items = [tf.item];
      y = tf.y;
    } else {
      items = segs[c][ptr[c]];
      y = cursor[c];
      res = balanceColumn(x, y, items, bottomY);
      if (items.length) runs.push({ c, x, y, items });
    }
    RCTX.block = null;
    RCTX.owner = null;
    if (res.status && res.status.kind === "overflow") {
      report("issue", "Column " + (c + 1) + " overflows by " + res.status.amount + " art px: cut copy or remove a block");
      B.markers.push({ kind: "overflow", x, w, target: bottomY, end: res.end });
    } else if (res.status && res.status.kind === "gap") {
      report("warning", "Column " + (c + 1) + " has a gap of " + res.status.amount + " art px: add copy or a photo");
      const gy = items.length ? res.end + STORY_GAP : y;
      B.markers.push({ kind: "gap", x, w, y0: gy < bottomY ? gy : res.end, y1: bottomY });
    }
  });
  RCTX.column = null;
  if (B.log) {
    cols.forEach((col, c) => {
      const flex = [];
      for (const r of runs) if (r.c === c) for (const it of r.items) if (it.flex) flex.push(it);
      if (flex.length) console.log("page " + (B.pi + 1) + (B.label !== null ? " band " + (B.label + 1) : "") + " col " + (c + 1) + ": " + flex.map((it) => it.id + " " + it.h).join(", "));
    });
  }
  if (ctx) {
    for (const r of runs) {
      RCTX.column = r.c;
      runColumn(ctx, r.x, r.y, r.items);
    }
    for (const P of so.order) {
      if (P.tailFlex) continue;
      RCTX.column = P.c;
      runItem(ctx, P.item, cg.xs[P.c], P.y);
    }
    RCTX.column = null;
  }
  // gutters, with breaks where a spanner crosses them (v3 section 6.4)
  const gutters = [];
  for (let g = 0; g + 1 < n; g++) {
    const breaks = [];
    for (const P of so.order) {
      if (P.c <= g && P.c + P.s - 1 >= g + 1) breaks.push([Math.max(y0, P.y - STORY_GAP / 2), P.bottom + STORY_GAP]);
    }
    breaks.sort((a, b) => a[0] - b[0]);
    gutters.push({ after: g, x: cg.xs[g] + cg.ws[g], w: GUTTER, top: y0, bottom: bottomY, breaks });
  }
  if (B.orn && ctx) {
    const ch = sprite("chain");
    const cb = ch.bbox;
    for (const gt of gutters) {
      const cx = gt.x + Math.floor((GUTTER - (cb.x1 - cb.x0)) / 2) - cb.x0;
      let y = gt.top;
      for (const [a, b] of gt.breaks) {
        if (a > y) chainTiles(ctx, cx, y, Math.min(a, bottomY));
        y = Math.max(y, b);
      }
      if (y < bottomY) chainTiles(ctx, cx, y, bottomY);
    }
  }
  const columns = [];
  for (let c = 0; c < n; c++) columns.push({ index: c, x: cg.xs[c], w: cg.ws[c], top: y0, bottom: bottomY });
  // per column, refs included; a ref's rect is its spanner's
  const entries = ents.map((l, c) => l.map((e) => {
    const g = (e.item || e.sync.item).geo || null;
    return { idx: e.idx, ref: isRef(cols[c][e.idx]), block: g, y: g ? g.y : 0, h: g ? g.h : 0 };
  }));
  return { columns, gutters, entries };
}

// ------------------------------------------------------------ the page (v3 section 6.1)
// Lay out one page; draw it on the art canvas when ctx is given. Returns the photo rects and
// vector runs for the screen pass, the preview markers and (when drawing) the geometry record.
function layoutPage(issue, pi, ctx, log) {
  const page = issue.pages[pi];
  const orn = !!issue.paper.ornaments;
  LTHEME = issue.theme;
  const photos = [];
  const markers = [];
  const runs = [];
  const prevSink = TX.sink;
  TX.sink = ctx ? runs : null;
  GEO = ctx ? { top: TOP, target: 0, body: null, bands: [], boundaries: [], blocks: [], texts: [] } : null;
  RCTX = { page: pi, band: null, column: null, block: null, owner: null };
  try {
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      rect(ctx, 0, 0, W, H, "paper");
    }
    const bands = page.bands;
    const kinds = bands.map(bandKind);
    const content = [];
    kinds.forEach((k, bi) => {
      if (k === "content") content.push(bi);
    });
    const anyBlock = content.some((bi) => bandHasBlock(bands[bi]));
    const label = (bi) => (content.length > 1 ? content.indexOf(bi) : null);
    const ownerOf = (bi) => ({ kind: "block", band: bi, col: 0, idx: 0 });
    const ctxOf = (bi) => {
      const b = kinds[bi] === "content" ? null : bands[bi].columns[0][0];
      RCTX = { page: pi, band: kinds[bi] === "content" ? label(bi) : null, column: null, block: b ? b.id : null, owner: b ? ownerOf(bi) : null };
      return b;
    };
    const B = (bi) => ({ issue, page, bi, pi, photos, markers, log, anyBlock, label: label(bi), ord: content.indexOf(bi), orn });
    // measure every band
    const meas = bands.map((band, bi) => {
      const b = ctxOf(bi);
      if (kinds[bi] === "masthead") return { h: masthead(null, issue, b.variant, 0, ownerOf(bi)).bottom };
      if (kinds[bi] === "footer") {
        const plan = footerPlan(b, orn);
        return { h: plan.height, plan };
      }
      const m = solveBand(null, Object.assign(B(bi), { photos: [] }), 0, null);
      return { h: m.hMin, hMin: m.hMin, hMax: m.hMax };
    });
    // stack them: a trailing footer is pinned to the page bottom; spare height goes to the
    // content bands from the last upward (v3 section 6.1)
    const last = bands.length - 1;
    const trailing = last >= 0 && kinds[last] === "footer";
    const target = trailing ? PAGE_BOTTOM - meas[last].h - FOOT_GAP : PAGE_BOTTOM;
    const stack = trailing ? last : bands.length;
    const gapOf = (a, b) => (kinds[a] === "masthead" ? 0 : kinds[b] === "footer" ? FOOT_GAP : STORY_GAP);
    const hs = meas.map((m) => m.h);
    let used = TOP;
    for (let i = 0; i < stack; i++) used += hs[i] + (i ? gapOf(i - 1, i) : 0);
    const stacked = content.filter((bi) => bi < stack);
    if (stacked.length) {
      let spare = target - used;
      const lastC = stacked[stacked.length - 1];
      if (spare >= 0) {
        for (let k = stacked.length - 1; k >= 0; k--) {
          const bi = stacked[k];
          const take = Math.min(spare, meas[bi].hMax - meas[bi].hMin);
          hs[bi] += take;
          spare -= take;
        }
      }
      hs[lastC] += spare;
    }
    const tops = [];
    let y = TOP;
    for (let i = 0; i < stack; i++) {
      tops[i] = y;
      y += hs[i] + (i + 1 < stack ? gapOf(i, i + 1) : 0);
    }
    if (trailing) tops[last] = PAGE_BOTTOM - hs[last];
    // lay out and draw
    bands.forEach((band, bi) => {
      const top = tops[bi];
      const b = ctxOf(bi);
      let geoBand = { index: bi, kind: kinds[bi], y: top, h: hs[bi], columns: [], gutters: [], entries: [] };
      if (kinds[bi] === "masthead") {
        const mh = masthead(ctx, issue, b.variant, top, ownerOf(bi));
        if (GEO) {
          GEO.blocks.push({
            band: bi, col: 0, idx: 0, type: b.type, id: b.id, span: 1, members: [0],
            x: LEFT, y: top - 4, w: FULL_W, h: mh.bottom - top - 1, fields: mh.fields, photo: null, flexible: false, obj: b,
          });
        }
      } else if (kinds[bi] === "footer") {
        const field = drawFooter(ctx, b, meas[bi].plan, orn, top, ownerOf(bi));
        if (GEO) {
          GEO.blocks.push({
            band: bi, col: 0, idx: 0, type: b.type, id: b.id, span: 1, members: [0],
            x: LEFT, y: top, w: FULL_W, h: hs[bi], fields: { text: field }, photo: null, flexible: false, obj: b,
          });
        }
      } else {
        const res = solveBand(ctx, B(bi), top, hs[bi]);
        Object.assign(geoBand, res);
      }
      if (GEO) GEO.bands.push(geoBand);
    });
    RCTX = { page: pi, band: null, column: null, block: null, owner: null };

    let geometry = null;
    if (GEO) {
      GEO.target = target;
      const bnd = [];
      if (!bands.length) bnd.push({ at: 0, y: TOP - 7 });
      else {
        bnd.push({ at: 0, y: tops[0] - 7 });
        for (let i = 1; i < bands.length; i++) {
          const prevBottom = tops[i - 1] + hs[i - 1];
          bnd.push({ at: i, y: tops[i] - prevBottom <= 0 ? tops[i] - 3 : Math.floor((prevBottom + tops[i]) / 2) });
        }
        bnd.push({ at: bands.length, y: tops[last] + hs[last] + 5 });
      }
      GEO.boundaries = bnd;
      // the body area for the blank-page hint: below a leading masthead, above the target
      const lead = kinds[0] === "masthead" ? tops[0] + hs[0] : TOP;
      GEO.body = { y0: lead, y1: target };
      geometry = GEO;
    }
    return { photos, markers, runs, geometry };
  } finally {
    GEO = null;
    CUR = null;
    TX.sink = prevSink;
  }
}

function issueReports(issue) {
  RCTX = { page: null, band: null, column: null, block: null, owner: null };
  const sp = issue.theme.sprites || {};
  const builtIn = !sp.lantern || !sp.footerLantern || !sp.chain;
  const blocks = allBlocks(issue);
  if (issue.paper.ornaments && builtIn && blocks.some((b) => !isBandBlock(b))) {
    const credited = blocks.some((b) => {
      if (b.type !== "footer") return false;
      const f = String(b.text || "");
      return f.includes("Modern Mizunos") && f.includes("CC BY-NC-SA");
    });
    if (!credited) report("warning", "Ornaments are on but no footer credits Modern Mizunos (CC BY-NC-SA 4.0)");
  }
  for (const [id, f] of Object.entries(issue.theme.fonts || {})) {
    if (!(TX.FACES[id] && TX.FACES[id].ok)) report("issue", "Font " + (f.name || id) + " could not be loaded; Salon Pixel used instead");
  }
}

// Every report of the issue: [{level, text, page, band, column, block, owner}].
function collectReports(issue) {
  REP = new Map();
  try {
    issue.pages.forEach((_, pi) => layoutPage(issue, pi, null, false));
    issueReports(issue);
    return [...REP.values()];
  } finally {
    REP = null;
  }
}
