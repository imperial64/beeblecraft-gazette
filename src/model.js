// Document model: constants, defaults, the theme, the page structure of bands, columns and
// spans with its helpers, migration from versions 1 and 2, serialisation and the Markdown copy.
// docs/design-v2.md section 6 and docs/design-v3.md sections 3 to 5.
"use strict";

// ------------------------------------------------------------ grid, art px (v2 section 4)
const W = 600;
const H = 800;
const SW = 1200;
const SH = 1600;
const LEFT = 17;
const RIGHT = 583;
const FULL_W = RIGHT - LEFT;
const GUTTER = 16;
const TOP = 16;
const PAGE_BOTTOM = 784;
const FOOT_GAP = 8;
const STORY_GAP = 14;
const PARA_GAP = 6;
const CAPTION_GAP = 7;
const PHOTO_MIN = 64;
const PHOTO_MAX = 168;
const MAP_MIN = 112;
const MAP_MAX = 118;
const FOOTER_TEXT_W = 532;
const FOOTER_TEXT_W_PLAIN = 554;
const FOOTER_MIN_H = 27;
const MARK_RED = "#C8321E";

const FORMAT = "gazette-builder-issue";
const THEME_FORMAT = "gazette-builder-theme";
const VERSION = 3;
const DRAFT_KEY = "gazette-builder.draft.v3";
const DRAFT_KEY_V2 = "gazette-builder.draft.v2";
const DRAFT_KEY_V1 = "gazette-builder.draft.v1";
const IDB_NAME = "gazette-builder";
const IDB_STORE = "drafts";
const BLOCK_TYPES = ["masthead", "story", "photo", "box", "desk", "register", "map", "footer"];
const BAND_TYPES = ["masthead", "footer"];
const DIRS = ["east", "north", "south", "west"];
const REMINDER =
  "Before posting: no player names or coordinates of anyone's build without that player's " +
  "permission (the office's consent rules). Credit the texture pack and shader in the " +
  "screenshots. With the Modern Mizunos pieces on, the issue must carry their credit and the " +
  "CC BY-NC-SA 4.0 line.";
const CREDITS_TEMPLATE =
  "Out of character. Names appear in the paper only with the player's permission. Screenshots " +
  "taken with [texture pack] and [shader]. Lantern and chain pieces from Modern Mizunos v0.5.2 " +
  "by Kchem and Garden Gals, CC BY-NC-SA 4.0 (modrinth.com/organization/garden-gals). This " +
  "page: CC BY-NC-SA 4.0, [your name].";

// ------------------------------------------------------------ small helpers
const $ = (sel) => document.querySelector(sel);
const clone = (o) => JSON.parse(JSON.stringify(o));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "style" && typeof v === "string") el.setAttribute("style", v);
      else if (k in el) el[k] = v;
      else el.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

function hhmm() {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function slug(title) {
  const s = String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "gazette";
}

function newCanvas(w, hh) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = hh;
  return c;
}

const isBlank = (t) => String(t === null || t === undefined ? "" : t).trim() === "";

// ------------------------------------------------------------ columns (v2 section 4.1)
function columnGeometry(n) {
  n = Math.max(1, n | 0);
  const colW = Math.floor((FULL_W - GUTTER * (n - 1)) / n);
  const r = FULL_W - n * colW - GUTTER * (n - 1);
  const ws = [];
  const xs = [];
  let x = LEFT;
  for (let c = 0; c < n; c++) {
    const w = colW + (c < r ? 1 : 0);
    xs.push(x);
    ws.push(w);
    x += w + GUTTER;
  }
  return { n, xs, ws };
}

// ------------------------------------------------------------ text fields per owner (v2 section 6.4)
const BLOCK_FIELDS = {
  masthead: [],
  story: [["headline", "headline", true], ["body", "body", false]],
  photo: [["headline", "headline", true], ["caption", "caption", false]],
  map: [["caption", "caption", false]].concat(DIRS.map((d) => ["lines." + d + ".label", "mapLabel", true])),
  box: [["title", "boxTitle", true], ["body", "body", false]],
  desk: [["title", "boxTitle", true], ["body", "body", false], ["signature", "signature", true]],
  register: [["title", "boxTitle", true], ["lines", "register", false]],
  footer: [["text", "footer", false]],
};
// The masthead block's texts live on the paper and are shared by every page (v3 section 5.1).
const PAPER_FIELDS = [["wordmark", "wordmark", true], ["tagline", "tagline", true], ["kickerLeft", "kicker", true], ["kickerCentre", "kicker", true], ["kickerRight", "kicker", true]];

function getField(obj, name) {
  let o = obj;
  for (const k of name.split(".")) {
    if (o === null || o === undefined) return "";
    o = o[k];
  }
  return o === null || o === undefined ? "" : String(o);
}

function setField(obj, name, value) {
  const ks = name.split(".");
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    if (!o[ks[i]] || typeof o[ks[i]] !== "object") o[ks[i]] = {};
    o = o[ks[i]];
  }
  o[ks[ks.length - 1]] = value;
}

// ------------------------------------------------------------ defaults
function defaultTheme() {
  return {
    colours: {
      paper: "#EFE6D0", paper_shade: "#E3D8BD", paper_dark: "#CDBF9E",
      ink: "#1F1B17", ink_soft: "#5A5048", ink_faint: "#9C907E",
      teal: "#2E8B86", teal_dark: "#1F5F5C", teal_light: "#7FC4BF", copper: "#B8683A",
    },
    savedColours: [],
    styles: {
      body: { font: "salon-pixel", size: 11, colour: "ink" },
      headline: { font: "salon-pixel", size: 22, colour: "ink" },
      caption: { font: "salon-pixel", size: 11, colour: "ink_soft" },
      boxTitle: { font: "salon-pixel", size: 22, colour: "ink" },
      register: { font: "salon-pixel", size: 11, colour: "ink_soft" },
      signature: { font: "salon-pixel", size: 11, colour: "ink" },
      footer: { font: "salon-pixel", size: 11, colour: "ink_soft" },
      kicker: { font: "salon-pixel", size: 11, colour: "ink_soft", tracking: 1 },
      tagline: { font: "salon-pixel", size: 11, colour: "ink_soft" },
      wordmark: { font: "salon-pixel", size: 44, colour: "ink", bold: true },
      mapLabel: { font: "salon-pixel", size: 11, colour: "ink_soft" },
    },
    sprites: { lantern: null, footerLantern: null, chain: null },
    fonts: {},
    texture: true,
  };
}

function defaultPaper() {
  return {
    wordmark: "THE BEEBLECRAFT GAZETTE",
    tagline: "Inspections, cases and notices from the Beeblecraft Inspection Office",
    kickerLeft: "NO. 1",
    kickerCentre: "BEEBLECRAFT INSPECTION OFFICE",
    kickerRight: "OCTOBER 2026",
    ornaments: true,
    skin: null,
    skinModel: "auto",
    styles: {},
  };
}

function blockDefaults(type) {
  switch (type) {
    case "masthead":
      return { variant: "full" };
    case "story":
      return { headline: "Headline", body: "Body text." };
    case "photo":
      return { image: null, zoom: 1, focusX: 0.5, focusY: 0.5, headline: "", caption: "Caption.", minH: PHOTO_MIN, maxH: PHOTO_MAX };
    case "map": {
      const lines = {};
      for (const d of DIRS) lines[d] = { blocks: 0, label: "", style: "solid" };
      return { blocksPerPx: 200, lines, caption: "Caption." };
    }
    case "box":
      return { title: "Box title", body: "Body text." };
    case "desk":
      return { title: "Box title", body: "Body text.", signature: "Signature" };
    case "register":
      return { title: "Box title", lines: "C-000 Case" };
    case "footer":
      return { text: "Footer text." };
    default:
      return {};
  }
}

// ------------------------------------------------------------ page structure (v3 section 4)
// A page is {bands: [{columns: [[entry, ...], ...]}, ...]}; an entry is a block or a ref
// {ref: "<block id>"} marking where a spanning block from a column to the left crosses.
const isRef = (e) => !!e && typeof e === "object" && !Array.isArray(e) && typeof e.ref === "string" && !("type" in e);
const isBlockEntry = (e) => !!e && typeof e === "object" && !Array.isArray(e) && typeof e.type === "string";
const isBandBlock = (b) => !!b && (b.type === "masthead" || b.type === "footer");
const blocksOf = (col) => col.filter((e) => !isRef(e));

// "masthead" or "footer" for a band holding just that block, else "content".
function bandKind(band) {
  const cols = band && band.columns;
  if (cols && cols.length === 1 && cols[0].length === 1 && isBandBlock(cols[0][0])) return cols[0][0].type;
  return "content";
}
const isContentBand = (band) => bandKind(band) === "content";
const bandHasBlock = (band) => band.columns.some((col) => blocksOf(col).length > 0);

// The span a block at column c of an n-column band actually covers (v3 section 4.2).
function effSpan(b, c, n) {
  if (isBandBlock(b)) return 1;
  const s = Math.max(1, Math.round(Number(b.span)) || 1);
  return Math.max(1, Math.min(s, n - c));
}

function eachBlock(page, fn) {
  page.bands.forEach((band, bi) => band.columns.forEach((col, ci) => col.forEach((e, ei) => {
    if (!isRef(e)) fn(e, bi, ci, ei);
  })));
}

function pageBlocks(page) {
  const out = [];
  eachBlock(page, (block, band, col, idx) => out.push({ band, col, idx, block }));
  return out;
}

function findBlock(page, id) {
  return pageBlocks(page).find((x) => x.block.id === id) || null;
}

// Position of a block by object identity: {band, col, idx} or null.
function blockPos(page, block) {
  for (let bi = 0; bi < page.bands.length; bi++) {
    const cols = page.bands[bi].columns;
    for (let c = 0; c < cols.length; c++) {
      const i = cols[c].indexOf(block);
      if (i >= 0) return { band: bi, col: c, idx: i };
    }
  }
  return null;
}

function allBlocks(issue) {
  const out = [];
  for (const p of issue.pages) eachBlock(p, (b) => out.push(b));
  return out;
}

// Remove every ref to id in a band.
function dropRefs(band, id) {
  for (const col of band.columns) {
    for (let i = col.length - 1; i >= 0; i--) if (isRef(col[i]) && col[i].ref === id) col.splice(i, 1);
  }
}

// The rect of a block (or of the spanner a ref points to) in a geometry record, by id.
function rectById(geometry, id) {
  if (!geometry || !geometry.blocks) return null;
  return geometry.blocks.find((b) => b.id === id) || null;
}
const entryRect = (geometry, e) => rectById(geometry, isRef(e) ? e.ref : e.id);

// Splice the block and every ref to it out of the page; returns its old position.
function removeBlock(page, block) {
  const pos = blockPos(page, block);
  if (!pos) return null;
  const band = page.bands[pos.band];
  band.columns[pos.col].splice(pos.idx, 1);
  dropRefs(band, block.id);
  return pos;
}

// Clamp a block's stored span to its band; returns the new span when it was reduced, else 0.
function clampSpan(page, block) {
  if (isBandBlock(block)) {
    delete block.span;
    return 0;
  }
  const pos = blockPos(page, block);
  if (!pos) return 0;
  const n = page.bands[pos.band].columns.length;
  const s = Math.max(1, Math.round(Number(block.span)) || 1);
  const max = Math.max(1, n - pos.col);
  const ns = Math.min(s, max);
  if (ns >= 2) block.span = ns;
  else delete block.span;
  return s > max ? ns : 0;
}

// Put one ref to a spanner in each column it covers: before the first entry whose rect has its
// vertical centre below yHint, else at the end; without a geometry, index 0 when the block is
// first in its own column, else the end (v3 section 4.3).
function placeRefs(page, block, yHint, geometry) {
  const pos = blockPos(page, block);
  if (!pos) return;
  const band = page.bands[pos.band];
  const s = effSpan(block, pos.col, band.columns.length);
  const hinted = !!geometry && yHint !== null && yHint !== undefined;
  for (let d = pos.col + 1; d < pos.col + s; d++) {
    const col = band.columns[d];
    let k = pos.idx === 0 ? 0 : col.length;
    if (hinted) {
      k = col.length;
      for (let i = 0; i < col.length; i++) {
        const r = entryRect(geometry, col[i]);
        if (r && r.y + r.h / 2 > yHint) {
          k = i;
          break;
        }
      }
    }
    col.splice(k, 0, { ref: block.id });
  }
}

// Insert a block at (band, col, idx); returns the reduced span when it had to shrink, else 0.
function insertBlock(page, bandIdx, colIdx, idx, block, yHint, geometry) {
  const col = page.bands[bandIdx].columns[colIdx];
  col.splice(clamp(idx, 0, col.length), 0, block);
  const reduced = clampSpan(page, block);
  placeRefs(page, block, yHint, geometry);
  return reduced;
}

function setSpan(page, block, s, yHint, geometry) {
  const pos = blockPos(page, block);
  if (!pos) return;
  dropRefs(page.bands[pos.band], block.id);
  if (s >= 2) block.span = s;
  else delete block.span;
  clampSpan(page, block);
  placeRefs(page, block, yHint, geometry);
}

// Index of a spanner's own entry or its ref in a column, for ordering.
function orderIn(col, block) {
  const i = col.findIndex((e) => e === block || (isRef(e) && e.ref === block.id));
  return i < 0 ? col.length : i;
}

// Spanners at a column left of `at` whose span reaches `at` (before an insert or a removal).
function spannersAcross(band, at) {
  const n = band.columns.length;
  const out = [];
  band.columns.forEach((col, c) => {
    if (c >= at) return;
    for (const e of col) {
      if (isRef(e) || isBandBlock(e)) continue;
      const s = effSpan(e, c, n);
      if (s >= 2 && c + s - 1 >= at) out.push({ b: e, s });
    }
  });
  return out;
}

// Splice a new column in; spanners that reached across it grow by one and get a ref in it, above
// its own blocks when yHint is below the spanner's rect, else after them.
function insertColumn(page, bandIdx, at, column, yHint, geometry) {
  const band = page.bands[bandIdx];
  const cover = spannersAcross(band, at);
  band.columns.splice(at, 0, column);
  if (!cover.length) return;
  const prev = band.columns[at - 1];
  cover.sort((a, b) => orderIn(prev, a.b) - orderIn(prev, b.b));
  const above = [];
  const below = [];
  for (const P of cover) {
    P.b.span = P.s + 1;
    const r = rectById(geometry, P.b.id);
    if (yHint === null || yHint === undefined || !r || yHint >= r.y + r.h) above.push({ ref: P.b.id });
    else below.push({ ref: P.b.id });
  }
  column.unshift(...above);
  column.push(...below);
}

function removeColumn(page, bandIdx, at) {
  const band = page.bands[bandIdx];
  for (const P of spannersAcross(band, at)) {
    if (P.s - 1 >= 2) P.b.span = P.s - 1;
    else delete P.b.span;
  }
  const [removed] = band.columns.splice(at, 1);
  for (const b of blocksOf(removed || [])) dropRefs(band, b.id);
}

function insertBand(page, at, band) {
  page.bands.splice(clamp(at, 0, page.bands.length), 0, band);
}

function removeBand(page, at) {
  page.bands.splice(at, 1);
}

// Where a new content band goes when a page has none: after the leading masthead band and
// before a trailing footer band.
function contentBandSlot(page) {
  return page.bands.length && bandKind(page.bands[0]) === "masthead" ? 1 : 0;
}

// Remove columns and content bands without blocks; keep one content band (v3 section 4.3).
// A page whose content bands are all empty keeps its first one where it is.
function compact(page) {
  const keep = page.bands.some((b) => isContentBand(b) && bandHasBlock(b)) ? null : page.bands.find(isContentBand);
  for (let bi = page.bands.length - 1; bi >= 0; bi--) {
    const band = page.bands[bi];
    if (!isContentBand(band)) continue;
    for (let c = band.columns.length - 1; c >= 0 && band.columns.length > 1; c--) {
      if (!blocksOf(band.columns[c]).length) removeColumn(page, bi, c);
    }
    if (!bandHasBlock(band) && band !== keep) page.bands.splice(bi, 1);
  }
  if (!page.bands.some(isContentBand)) page.bands.splice(contentBandSlot(page), 0, { columns: [[]] });
  syncRefs(page);
}

// Restore the ref invariant of v3 section 4.2: clamp spans, drop refs that point nowhere, to a
// block that does not cover them or twice, and add missing refs.
function syncRefs(page) {
  for (const band of page.bands) {
    const cols = band.columns;
    const n = cols.length;
    const spanners = [];
    cols.forEach((col, c) => col.forEach((e, i) => {
      if (isRef(e)) return;
      if (isBandBlock(e)) {
        delete e.span;
        return;
      }
      if (e.span === undefined) return;
      const s = effSpan(e, c, n);
      if (s >= 2) {
        e.span = s;
        spanners.push({ b: e, c, i, s });
      } else delete e.span;
    }));
    const want = cols.map(() => new Set());
    for (const P of spanners) for (let d = P.c + 1; d < P.c + P.s; d++) want[d].add(P.b.id);
    // filtered in place: callers hold on to column arrays across a compact
    const seen = cols.map(() => new Set());
    cols.forEach((col, d) => {
      const keep = col.map((e) => {
        if (!isRef(e)) return true;
        if (!want[d].has(e.ref) || seen[d].has(e.ref)) return false;
        seen[d].add(e.ref);
        return true;
      });
      for (let i = col.length - 1; i >= 0; i--) if (!keep[i]) col.splice(i, 1);
    });
    const front = cols.map(() => 0);
    for (const P of spanners) {
      for (let d = P.c + 1; d < P.c + P.s; d++) {
        if (seen[d].has(P.b.id)) continue;
        seen[d].add(P.b.id);
        if (P.i === 0) band.columns[d].splice(front[d]++, 0, { ref: P.b.id });
        else band.columns[d].push({ ref: P.b.id });
      }
    }
  }
}

function renameBlock(page, block, id) {
  const pos = blockPos(page, block);
  if (pos) {
    for (const col of page.bands[pos.band].columns) for (const e of col) if (isRef(e) && e.ref === block.id) e.ref = id;
  }
  block.id = id;
}

// Make block ids unique within a page; refs are resolved to their blocks first (v3 section 4.4).
function uniqueIds(page) {
  const links = [];
  for (const band of page.bands) {
    const n = band.columns.length;
    band.columns.forEach((col, d) => {
      for (const e of col) {
        if (!isRef(e)) continue;
        let hit = null;
        for (let c = 0; c < d && !hit; c++) {
          for (const b of band.columns[c]) {
            if (!isRef(b) && b.id === e.ref && c + effSpan(b, c, n) - 1 >= d) {
              hit = b;
              break;
            }
          }
        }
        if (hit) links.push([e, hit]);
      }
    });
  }
  const seen = new Set();
  eachBlock(page, (b) => {
    let id = isBlank(b.id) ? b.type : String(b.id);
    if (seen.has(id)) {
      let k = 2;
      while (seen.has(id + "-" + k)) k++;
      id = id + "-" + k;
    }
    b.id = id;
    seen.add(id);
  });
  for (const [r, b] of links) r.ref = b.id;
}

// The order in which a band's spanners are laid out (v3 section 6.3). A spanner is ready when,
// in every member column, it is the next sync point; among ready ones the lowest own column goes
// first. When none is ready (or a ref is missing) a spanner is demoted to one column.
// Returns {order: [P], demoted: [P]} with P = {b, c, idx, s, members, at: {column: index}}.
function spanOrder(band) {
  const cols = band.columns;
  const n = cols.length;
  const all = [];
  cols.forEach((col, c) => col.forEach((e, i) => {
    if (isRef(e) || isBandBlock(e)) return;
    const s = effSpan(e, c, n);
    if (s < 2) return;
    const members = [];
    for (let m = c; m < c + s; m++) members.push(m);
    all.push({ b: e, c, idx: i, s, members, at: { [c]: i } });
  }));
  const valid = [];
  const demoted = [];
  const used = new Set();
  for (const P of all) {
    let ok = true;
    for (let d = P.c + 1; d < P.c + P.s; d++) {
      const k = cols[d].findIndex((e) => isRef(e) && e.ref === P.b.id && !used.has(e));
      if (k < 0) {
        ok = false;
        break;
      }
      P.at[d] = k;
    }
    if (!ok) {
      demoted.push(P);
      continue;
    }
    for (let d = P.c + 1; d < P.c + P.s; d++) used.add(cols[d][P.at[d]]);
    valid.push(P);
  }
  const lists = cols.map(() => []);
  for (const P of valid) for (const m of P.members) lists[m].push({ P, k: P.at[m] });
  for (const l of lists) l.sort((a, b) => a.k - b.k);
  const ptr = cols.map(() => 0);
  const remaining = new Set(valid);
  const order = [];
  while (remaining.size) {
    let pick = null;
    for (const P of remaining) {
      const ready = P.members.every((m) => lists[m][ptr[m]] && lists[m][ptr[m]].P === P);
      if (ready && (!pick || P.c < pick.c)) pick = P;
    }
    if (!pick) {
      const D = [...remaining].sort((a, b) => a.c - b.c || a.idx - b.idx)[0];
      remaining.delete(D);
      demoted.push(D);
      for (const m of D.members) lists[m] = lists[m].filter((x) => x.P !== D);
      continue;
    }
    order.push(pick);
    remaining.delete(pick);
    for (const m of pick.members) ptr[m]++;
  }
  return { order, demoted };
}

// One line describing a page's bands for the Page inspector (v3 section 5.2).
function layoutLine(page) {
  return page.bands.map((band) => {
    const k = bandKind(band);
    if (k !== "content") return k;
    const n = band.columns.length;
    return n + (n === 1 ? " column" : " columns");
  }).join(" · ");
}

// ------------------------------------------------------------ new blocks and pages
// Ids: <type>-<n>; the first masthead and footer are just "masthead" and "footer".
function newBlock(type, issue, extra) {
  const blocks = allBlocks(issue);
  const ids = new Set(blocks.map((b) => b.id));
  let n = blocks.filter((b) => b.type === type).length + 1;
  const name = (k) => (BAND_TYPES.includes(type) && k === 1 ? type : type + "-" + k);
  while (ids.has(name(n))) n++;
  return Object.assign({ type, id: name(n) }, blockDefaults(type), extra || {});
}

// Several new blocks at once, each id counted against the ones made before it.
function newBlocks(issue, specs) {
  const pending = [];
  const view = { pages: issue.pages.concat([{ bands: [{ columns: [pending] }] }]) };
  for (const [type, extra] of specs) pending.push(newBlock(type, view, extra));
  return pending;
}

const mastheadBand = (variant) => ({ columns: [[{ type: "masthead", id: "masthead", variant }]] });

function blankBands(index) {
  return [mastheadBand(index === 0 ? "full" : "half"), { columns: [[]] }];
}

function blankPage(index) {
  return { bands: blankBands(index) };
}

const LEAD_EXTRA = { span: 2, headline: "", minH: 195, maxH: 195 };

function presetPage(name, issue) {
  // newBlock numbers against the issue; blocks made here are not in it yet, so count them too.
  const pending = [];
  const issueView = { pages: issue.pages.concat([{ bands: [{ columns: [pending] }] }]) };
  const mk = (type, extra) => {
    const blk = newBlock(type, issueView, extra);
    pending.push(blk);
    return blk;
  };
  const page = (variant, columns, footer) => {
    const bands = [mastheadBand(variant), { columns }];
    if (footer !== null) bands.push({ columns: [[mk("footer", { text: footer })]] });
    return { bands };
  };
  switch (name) {
    case "front": {
      const lead = mk("photo", LEAD_EXTRA);
      return page("full", [[lead, mk("story"), mk("photo")], [{ ref: lead.id }, mk("story"), mk("photo")], [mk("desk"), mk("map"), mk("photo")]], "Continued on page 2.");
    }
    case "inside":
      return page("half", [[mk("story"), mk("photo")], [mk("story"), mk("photo")], [mk("story"), mk("photo")]], null);
    case "back": {
      const lead = mk("photo", LEAD_EXTRA);
      return page("half", [
        [lead, mk("story"), mk("photo")],
        [{ ref: lead.id }, mk("photo", { headline: "Gallery" }), mk("photo"), mk("box")],
        [mk("story"), mk("story"), mk("photo"), mk("register")],
      ], CREDITS_TEMPLATE);
    }
    default:
      return null;
  }
}

function newIssue() {
  return {
    format: FORMAT,
    version: VERSION,
    title: "The Beeblecraft Gazette",
    paper: defaultPaper(),
    theme: defaultTheme(),
    pages: [blankPage(0)],
    images: {},
  };
}

function sampleIssue() {
  return JSON.parse($("#gazette-sample").textContent);
}

// ------------------------------------------------------------ normalising (version 3)
const nl1 = (t) => String(t === null || t === undefined ? "" : t).replace(/\r\n?/g, "\n");
const toSingle = (t) => nl1(t).replace(/\n/g, " ");

function fillDefaults(target, defaults) {
  for (const k of Object.keys(defaults)) {
    if (!(k in target) || target[k] === undefined) target[k] = clone(defaults[k]);
  }
}

// An imported theme or an opened issue may still carry the old redaction colour; it goes.
function normalizeTheme(theme) {
  const d = defaultTheme();
  if (!theme || typeof theme !== "object") return d;
  if (!theme.colours || typeof theme.colours !== "object") theme.colours = {};
  delete theme.colours.redaction;
  fillDefaults(theme.colours, d.colours);
  if (!Array.isArray(theme.savedColours)) theme.savedColours = [];
  if (!theme.styles || typeof theme.styles !== "object") theme.styles = {};
  for (const role of Object.keys(d.styles)) {
    if (!theme.styles[role] || typeof theme.styles[role] !== "object") theme.styles[role] = clone(d.styles[role]);
    else fillDefaults(theme.styles[role], { font: d.styles[role].font, size: d.styles[role].size, colour: d.styles[role].colour });
  }
  if (!theme.sprites || typeof theme.sprites !== "object") theme.sprites = {};
  for (const k of Object.keys(d.sprites)) if (!(k in theme.sprites)) theme.sprites[k] = null;
  if (!theme.fonts || typeof theme.fonts !== "object") theme.fonts = {};
  if (typeof theme.texture !== "boolean") theme.texture = true;
  return theme;
}

const objOr = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const hasMarks = (r) => !!r && typeof r === "object" && Object.values(r).some((v) => Array.isArray(v) && v.length > 0);

function normalizeBlock(b) {
  const def = blockDefaults(b.type);
  for (const k of Object.keys(def)) if (!(k in b)) b[k] = typeof def[k] === "string" && b.type !== "footer" && b.type !== "masthead" ? "" : clone(def[k]);
  if (b.type === "map") {
    if (!b.lines || typeof b.lines !== "object") b.lines = {};
    for (const d of DIRS) if (!b.lines[d]) b.lines[d] = { blocks: 0, label: "", style: "solid" };
  }
  if (b.type === "masthead" && b.variant !== "full" && b.variant !== "half") b.variant = "full";
  for (const [name, , single] of BLOCK_FIELDS[b.type] || []) {
    const v = getField(b, name);
    setField(b, name, single ? toSingle(v) : nl1(v));
  }
  if (b.span !== undefined) {
    const s = Math.max(1, Math.round(Number(b.span)) || 1);
    if (s === 1 || isBandBlock(b)) delete b.span;
    else b.span = s;
  }
}

// counts: {marks, blocks} of redaction leftovers found; notes: strings for the status line.
function normalizePage(p, pi, counts, notes) {
  if (!Array.isArray(p.bands)) p.bands = [];
  const bands = [];
  for (const band of p.bands) {
    if (!band || typeof band !== "object" || Array.isArray(band)) continue;
    if (!Array.isArray(band.columns)) band.columns = [];
    band.columns = band.columns.map((col) => (Array.isArray(col) ? col : []).filter((e) => {
      if (isRef(e)) return true;
      if (!isBlockEntry(e)) return false;
      if (e.type === "redaction") {
        counts.blocks++;
        return false;
      }
      if ("redactions" in e) {
        if (hasMarks(e.redactions)) counts.marks = true;
        delete e.redactions;
      }
      return true;
    }));
    if (!band.columns.length) band.columns.push([]);
    if (bandKind(band) !== "content") {
      bands.push(band);
      continue;
    }
    // masthead and footer blocks live alone in a one-column band (v3 section 4.4)
    const heads = [];
    const feet = [];
    band.columns = band.columns.map((col) => col.filter((e) => {
      if (!isBandBlock(e)) return true;
      (e.type === "masthead" ? heads : feet).push(e);
      return false;
    }));
    const pulled = heads.length + feet.length > 0;
    for (const m of heads) bands.push({ columns: [[m]] });
    if (pulled) band.columns = band.columns.filter((col) => col.length);
    if (band.columns.length) bands.push(band);
    for (const f of feet) bands.push({ columns: [[f]] });
  }
  p.bands = bands;
  eachBlock(p, (b) => normalizeBlock(b));
  uniqueIds(p);
  syncRefs(p);
  for (const band of p.bands) {
    for (const D of spanOrder(band).demoted) {
      delete D.b.span;
      dropRefs(band, D.b.id);
      notes.push("a span on " + D.b.id + " could not be laid out and was reset");
    }
  }
  if (!p.bands.length) p.bands = blankBands(pi);
}

function normalize(issue, notes = [], counts = { marks: false, blocks: 0 }) {
  if (typeof issue.title !== "string") issue.title = "";
  issue.format = FORMAT;
  issue.version = VERSION;
  if (!issue.paper || typeof issue.paper !== "object") issue.paper = {};
  const paper = issue.paper;
  if (hasMarks(paper.redactions)) counts.marks = true;
  delete paper.redactions;
  fillDefaults(paper, defaultPaper());
  paper.styles = objOr(paper.styles);
  for (const [name] of PAPER_FIELDS) paper[name] = toSingle(paper[name]);
  issue.theme = normalizeTheme(issue.theme);
  if (!Array.isArray(issue.pages)) issue.pages = [];
  issue.pages = issue.pages.filter((p) => p && typeof p === "object" && !Array.isArray(p));
  if (!issue.images || typeof issue.images !== "object") issue.images = {};
  const spanNotes = [];
  issue.pages.forEach((p, pi) => normalizePage(p, pi, counts, spanNotes));
  if (!issue.pages.length) issue.pages.push(blankPage(0));
  if (counts.marks) notes.push("redaction marks dropped");
  if (counts.blocks) notes.push(counts.blocks + (counts.blocks === 1 ? " redaction block removed" : " redaction blocks removed"));
  notes.push(...spanNotes);
  // images are written last
  const imgs = issue.images;
  delete issue.images;
  issue.images = imgs;
  return issue;
}

// ------------------------------------------------------------ migration from version 1 (v2 section 6.5)
function v1paras(t) {
  return nl1(t)
    .split(/\n[ \t]*\n/)
    .map((p) => p.split("\n").map((l) => l.trim()).filter(Boolean).join(" "))
    .filter(Boolean);
}
const v1oneLine = (t) => v1paras(t).join(" ");

function migrateV1(issue) {
  issue.theme = defaultTheme();
  if (!issue.paper || typeof issue.paper !== "object") issue.paper = {};
  issue.paper.styles = {};
  for (const [name] of PAPER_FIELDS) if (name in issue.paper) issue.paper[name] = v1oneLine(issue.paper[name]);
  for (const p of issue.pages || []) {
    if (!Array.isArray(p.columns)) p.columns = [];
    p.columns = p.columns.map((col) => (Array.isArray(col) ? col : []));
    if (p.lead && typeof p.lead === "object") {
      const L = p.lead;
      const photo = {
        type: "photo", id: L.id || "lead", span: 2, image: L.image || null,
        zoom: L.zoom === undefined ? 1 : L.zoom, focusX: L.focusX === undefined ? 0.5 : L.focusX, focusY: L.focusY === undefined ? 0.5 : L.focusY,
        headline: "", caption: L.caption || "", minH: 195, maxH: 195,
      };
      if (!p.columns.length) p.columns.push([]);
      p.columns[0].unshift(photo);
    }
    delete p.lead;
    while (p.columns.length > 1 && !p.columns[p.columns.length - 1].length) p.columns.pop();
    if (!p.columns.length) p.columns.push([]);
    p.styles = {};
    if ("footer" in p) p.footer = v1paras(p.footer).join("\n");
    for (const col of p.columns) {
      for (const b of col) {
        for (const [name, , single] of BLOCK_FIELDS[b.type] || []) {
          if (name === "lines") continue; // register lines are one entry per line already
          const v = getField(b, name);
          if (single) setField(b, name, v1oneLine(v));
          else setField(b, name, v1paras(v).join("\n"));
        }
      }
    }
  }
  issue.version = 2;
  return issue;
}

// ------------------------------------------------------------ migration from version 2 (v3 section 4.7)
function migrateV2(issue, counts) {
  if (!Array.isArray(issue.pages)) issue.pages = [];
  issue.pages.forEach((p, pi) => {
    if (!p || typeof p !== "object") return;
    const bands = [mastheadBand(p.masthead === "half" ? "half" : "full")];
    const cols = (Array.isArray(p.columns) ? p.columns : []).map((col) => (Array.isArray(col) ? col : []).filter((b) => {
      if (b && b.type === "redaction") {
        counts.blocks++;
        return false;
      }
      return true;
    }));
    if (!cols.length) cols.push([]);
    const n = cols.length;
    const adds = cols.map(() => ({ front: [], back: [] }));
    cols.forEach((col, c) => col.forEach((b, i) => {
      if (!b || typeof b !== "object") return;
      const s = Math.min(Math.max(1, Math.round(Number(b.span)) || 1), n - c);
      for (let d = c + 1; d < c + s; d++) (i === 0 ? adds[d].front : adds[d].back).push({ ref: String(b.id || b.type) });
    }));
    cols.forEach((col, d) => {
      col.unshift(...adds[d].front);
      col.push(...adds[d].back);
    });
    bands.push({ columns: cols });
    const styles = objOr(p.styles);
    if (!isBlank(p.footer)) {
      const fb = { type: "footer", id: p.footerId || "page" + (pi + 1) + "-footer", text: nl1(p.footer) };
      if (styles.footer) fb.styles = { text: styles.footer };
      bands.push({ columns: [[fb]] });
    }
    if (hasMarks(p.redactions)) counts.marks = true;
    for (const k of ["masthead", "columns", "footer", "styles", "redactions", "footerId"]) delete p[k];
    p.bands = bands;
  });
  if (issue.theme && issue.theme.colours) delete issue.theme.colours.redaction;
  issue.version = 3;
  return issue;
}

// Returns {issue, converted (the version it was converted from, else 0), notes}.
function parseIssue(textStr) {
  let issue;
  try {
    issue = JSON.parse(textStr);
  } catch (e) {
    throw new Error("This file is not valid JSON.");
  }
  if (!issue || typeof issue !== "object" || issue.format !== FORMAT) {
    throw new Error("This file is not a Gazette Builder issue.");
  }
  const v = issue.version === undefined ? 1 : Number(issue.version);
  if (!(v <= VERSION)) {
    throw new Error("This issue was saved by a newer version of the Gazette Builder (version " + issue.version + ").");
  }
  const counts = { marks: false, blocks: 0 };
  let converted = 0;
  if (v < 2) migrateV1(issue);
  if (v < 3) {
    migrateV2(issue, counts);
    converted = v < 2 ? 1 : 2;
  }
  const notes = [];
  normalize(issue, notes, counts);
  return { issue, converted, notes };
}

// "Opened <name> (converted from version 2): redaction marks dropped; ..." (v3 sections 3, 4.7).
function openedMessage(prefix, parsed) {
  let m = prefix + (parsed.converted ? " (converted from version " + parsed.converted + ")" : "");
  if (parsed.notes.length) m += ": " + parsed.notes.join("; ");
  return m;
}

// ------------------------------------------------------------ serialising
function stripEmpty(b) {
  const out = {};
  for (const [k, v] of Object.entries(b)) {
    if (k === "styles" && v && typeof v === "object" && !Object.keys(v).length) continue;
    out[k] = v;
  }
  return out;
}

// opts: {stripImages, stripFonts}. Images are written last; empty block styles are left out.
function serialize(issue, opts = {}) {
  const out = {};
  for (const k of Object.keys(issue)) {
    if (k === "images") continue;
    if (k === "pages") {
      out.pages = issue.pages.map((p) => Object.assign({}, p, {
        bands: p.bands.map((band) => Object.assign({}, band, { columns: band.columns.map((col) => col.map((e) => (isRef(e) ? e : stripEmpty(e)))) })),
      }));
    } else if (k === "theme" && opts.stripFonts) {
      const fonts = {};
      for (const [id, f] of Object.entries(issue.theme.fonts || {})) fonts[id] = Object.assign({}, f, { data: null });
      out.theme = Object.assign({}, issue.theme, { fonts });
    } else out[k] = issue[k];
  }
  const imgs = {};
  for (const [id, e] of Object.entries(issue.images || {})) imgs[id] = opts.stripImages ? Object.assign({}, e, { data: null }) : e;
  out.images = imgs;
  return JSON.stringify(out, null, 2);
}

function hasContent(issue) {
  if (!issue) return false;
  if (Object.keys(issue.images).length) return true;
  const fresh = newIssue();
  const a = JSON.parse(serialize(fresh));
  const b = JSON.parse(serialize(issue));
  delete a.title;
  delete b.title;
  return JSON.stringify(a) !== JSON.stringify(b);
}

// ------------------------------------------------------------ Markdown copy (J-### block format)
function issueMarkdown(issue) {
  const out = ["# " + (issue.title || "Gazette issue"), ""];
  const add = (id, body) => {
    out.push("## `" + id + "`", "");
    if (body) out.push(body, "");
  };
  const ptext = (obj, name) => getField(obj, name).split("\n").map((l) => l.trim()).filter(Boolean).join("\n\n");
  const p = issue.paper;
  add("kicker-left", ptext(p, "kickerLeft"));
  add("kicker-centre", ptext(p, "kickerCentre"));
  add("kicker-right", ptext(p, "kickerRight"));
  add("wordmark", ptext(p, "wordmark"));
  add("tagline", ptext(p, "tagline"));
  for (const page of issue.pages) {
    eachBlock(page, (b) => {
      const id = b.id || b.type;
      if (b.type === "story") {
        add(id + "-headline", ptext(b, "headline"));
        add(id, ptext(b, "body"));
      } else if (b.type === "photo") {
        if (!isBlank(b.headline)) add(id + "-headline", ptext(b, "headline"));
        add(id + "-caption", ptext(b, "caption"));
      } else if (b.type === "map") {
        add(id + "-caption", ptext(b, "caption"));
      } else if (b.type === "box") {
        add(id + "-title", ptext(b, "title"));
        add(id, ptext(b, "body"));
      } else if (b.type === "desk") {
        add(id + "-title", ptext(b, "title"));
        add(id, ptext(b, "body"));
        add(id + "-signature", ptext(b, "signature"));
      } else if (b.type === "register") {
        add(id + "-title", ptext(b, "title"));
        add(id, getField(b, "lines").split("\n").map((l) => l.trim()).filter(Boolean).join("\n"));
      } else if (b.type === "footer") {
        add(id, ptext(b, "text"));
      }
    });
  }
  return out.join("\n");
}
