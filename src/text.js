// Text engine: styles, the Salon Pixel bitmap engine and the vector engine for uploaded fonts,
// measuring, wrapping with indices, and drawing. docs/design-v2.md section 5.
"use strict";

const TX = (() => {
  const PIXEL = "salon-pixel";
  const ROLES = ["body", "headline", "caption", "boxTitle", "register", "signature", "footer", "kicker", "tagline", "wordmark", "mapLabel"];

  // Uploaded fonts that have been loaded through the FontFace API: id -> {family, ok, name}.
  const FACES = {};
  // Vector runs recorded during an art pass, drawn later on the screen canvas (section 5.3).
  let sink = null;
  // Called with (level, text) for reports the engine finds (a unit wider than its line).
  let onReport = null;

  const mcanvas = document.createElement("canvas");
  const mctx = mcanvas.getContext("2d");
  const metricsCache = new Map();

  function snap11(size) {
    const n = Math.round((Number(size) || 11) / 11);
    return Math.max(1, n) * 11;
  }

  // Effective style: the theme's style for the role with the field's override merged on top.
  // A vector font that is not loaded falls back to Salon Pixel at the nearest multiple of 11.
  function resolve(theme, role, override) {
    const base = (theme && theme.styles && theme.styles[role]) || {};
    const st = Object.assign({ font: PIXEL, size: 11, colour: "ink", bold: false, tracking: 0 }, base, override || {});
    st.bold = !!st.bold;
    st.tracking = Number(st.tracking) || 0;
    if (st.font !== PIXEL && !(FACES[st.font] && FACES[st.font].ok)) st.font = PIXEL;
    if (st.font === PIXEL) st.size = snap11(st.size);
    else st.size = Math.min(120, Math.max(6, Math.round(Number(st.size) || 11)));
    return st;
  }

  const isVector = (st) => st.font !== PIXEL;

  // ------------------------------------------------------------ bitmap engine
  const bm = {
    scale: (st) => st.size / 11,
    emH: (st) => 11 * bm.scale(st),
    capOff: (st) => 2 * bm.scale(st),
    baseOff: (st) => 9 * bm.scale(st),
    pitch: (st) => 12 * bm.scale(st),
    width: (text, st) => Font.width(text, bm.scale(st), st.tracking),
    adv(ch, st) {
      if (ch === " ") return Font.SPACE_ADV + st.tracking;
      const g = Font.GLYPHS[ch];
      return (g ? g.w : Font.MISSING_W) + Font.TRACK + st.tracking;
    },
    // Start x of every index 0..len (full advances, tracking included), in art px.
    offsets(text, st) {
      const s = bm.scale(st);
      const out = [0];
      let x = 0;
      for (const ch of text) {
        x += bm.adv(ch, st) * s;
        for (let k = 0; k < ch.length; k++) out.push(x);
      }
      return out;
    },
  };

  // ------------------------------------------------------------ vector engine
  function fontString(st) {
    const face = FACES[st.font];
    return (st.bold ? "bold " : "") + 2 * st.size + 'px "' + (face ? face.family : "sans-serif") + '"';
  }

  function vmetrics(st) {
    const key = st.font + "|" + st.size + "|" + st.bold;
    if (metricsCache.has(key)) return metricsCache.get(key);
    mctx.font = fontString(st);
    const m = mctx.measureText("H");
    let asc;
    let desc;
    let cap;
    if (typeof m.fontBoundingBoxAscent === "number" && typeof m.actualBoundingBoxAscent === "number") {
      asc = m.fontBoundingBoxAscent / 2;
      desc = m.fontBoundingBoxDescent / 2;
      cap = (m.fontBoundingBoxAscent - m.actualBoundingBoxAscent) / 2;
    } else {
      asc = 0.8 * st.size;
      desc = 0.2 * st.size;
      cap = 0.1 * st.size;
    }
    const emH = Math.max(1, Math.round(asc + desc));
    const out = { emH, capOff: Math.round(cap), baseOff: Math.round(asc), pitch: emH + Math.max(1, Math.round(emH / 11)) };
    metricsCache.set(key, out);
    return out;
  }

  const vec = {
    emH: (st) => vmetrics(st).emH,
    capOff: (st) => vmetrics(st).capOff,
    baseOff: (st) => vmetrics(st).baseOff,
    pitch: (st) => vmetrics(st).pitch,
    width(text, st) {
      if (!text) return 0;
      mctx.font = fontString(st);
      return mctx.measureText(text).width / 2;
    },
    offsets(text, st) {
      const out = [0];
      for (let i = 1; i <= text.length; i++) out.push(vec.width(text.slice(0, i), st));
      return out;
    },
  };

  const eng = (st) => (isVector(st) ? vec : bm);
  const emH = (st) => eng(st).emH(st);
  const capOff = (st) => eng(st).capOff(st);
  const baseOff = (st) => eng(st).baseOff(st);
  const pitch = (st) => eng(st).pitch(st);
  const width = (text, st) => eng(st).width(text || "", st);
  // Ink width: a bold bitmap glyph is dilated 1 px right.
  const inkWidth = (text, st) => width(text, st) + (!isVector(st) && st.bold && text ? 1 : 0);
  const caretX = (lineText, index, st) => width(lineText.slice(0, index), st);

  // Draw with the em top at (x, y); colour is a resolved CSS colour.
  function draw(ctx, x, y, text, st, colour) {
    if (!ctx || !text) return;
    if (isVector(st)) {
      if (sink) sink.push({ x, y, text, style: st, colour });
      return;
    }
    Font.drawText(ctx, x, y, text, bm.scale(st), colour, st.tracking, st.bold);
  }

  // Draw a recorded vector run on the screen canvas (2x), after the texture.
  function drawRun(sctx, run) {
    const st = run.style;
    sctx.save();
    sctx.font = fontString(st);
    sctx.textBaseline = "alphabetic";
    sctx.fillStyle = run.colour;
    sctx.fillText(run.text, 2 * run.x, 2 * (run.y + baseOff(st)));
    sctx.restore();
  }

  // ------------------------------------------------------------ wrapping (section 5.4)
  // Units with their [s, e) positions in the paragraph: split on single spaces, then glue a
  // coordinate, a day and its month, "CC BY" and "BY-x.y" (v1 section 5).
  function units(p) {
    const toks = [];
    let pos = 0;
    for (const t of p.split(" ")) {
      if (t) toks.push({ t, s: pos, e: pos + t.length });
      pos += t.length + 1;
    }
    const out = [];
    let prev = null;
    for (const tk of toks) {
      if (prev !== null && out.length && Font.glued(prev, tk.t)) out[out.length - 1].e = tk.e;
      else out.push({ s: tk.s, e: tk.e });
      prev = tk.t;
    }
    return out;
  }

  // One paragraph (no newlines) to [{text, start, end}]; the ranges tile the paragraph.
  function wrap(p, widthFn, st) {
    const wfn = typeof widthFn === "function" ? widthFn : () => widthFn;
    const segs = [];
    let cur = null; // {s, e}
    for (const u of units(p)) {
      const limit = wfn(segs.length);
      if (width(p.slice(u.s, u.e), st) > limit) {
        if (onReport) onReport("issue", "'" + p.slice(u.s, u.e) + "' is wider than its line");
        if (cur) segs.push(cur);
        segs.push({ s: u.s, e: u.e });
        cur = null;
        continue;
      }
      if (!cur) {
        cur = { s: u.s, e: u.e };
        continue;
      }
      const from = segs.length === 0 ? 0 : cur.s;
      if (width(p.slice(from, u.e), st) <= limit) cur.e = u.e;
      else {
        segs.push(cur);
        cur = { s: u.s, e: u.e };
      }
    }
    if (cur) segs.push(cur);
    if (!segs.length) return [{ text: "", start: 0, end: p.length }];
    return segs.map((sg, i) => {
      const start = i === 0 ? 0 : sg.s;
      const end = i + 1 < segs.length ? segs[i + 1].s : p.length;
      return { text: p.slice(start, sg.e), start, end };
    });
  }

  // ------------------------------------------------------------ uploaded fonts (section 5.3)
  function dataUrlBuffer(url) {
    const comma = url.indexOf(",");
    const bin = atob(url.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  async function loadFace(id, entry) {
    const family = "gz-" + id;
    metricsCache.clear();
    try {
      const face = new FontFace(family, dataUrlBuffer(entry.data));
      await face.load();
      document.fonts.add(face);
      FACES[id] = { family, ok: true, name: entry.name, face };
    } catch (e) {
      FACES[id] = { family, ok: false, name: entry.name };
    }
    return FACES[id].ok;
  }

  async function loadFonts(theme) {
    for (const k of Object.keys(FACES)) {
      if (FACES[k].face) {
        try {
          document.fonts.delete(FACES[k].face);
        } catch (e) {
          // already gone
        }
      }
      delete FACES[k];
    }
    metricsCache.clear();
    const fonts = (theme && theme.fonts) || {};
    await Promise.all(Object.entries(fonts).map(([id, entry]) => loadFace(id, entry)));
  }

  return {
    PIXEL, ROLES, FACES, resolve, isVector, emH, capOff, baseOff, pitch, width, inkWidth, caretX,
    offsets: (text, st) => eng(st).offsets(text, st),
    draw, drawRun, wrap, units, loadFace, loadFonts,
    get sink() { return sink; },
    set sink(v) { sink = v; },
    set onReport(fn) { onReport = fn; },
  };
})();
