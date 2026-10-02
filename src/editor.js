// Editor: importing photos, skins and fonts, the overlay over the page (hover, selection, grip,
// issue dots, the blank-page hint), hit-testing from the geometry record, block moves, undo,
// drag and drop with the ghost preview, span by drag, in-place text editing with its toolbar.
// docs/design-v2.md sections 8 to 12, docs/design-v3.md sections 7 to 9.
"use strict";

function nextImageId(issue) {
  let n = Object.keys(issue.images).length + 1;
  while (issue.images["img-" + n]) n++;
  return "img-" + n;
}

async function decodeFile(file) {
  const url = URL.createObjectURL(file);
  try {
    return await decodeImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// Downsize to at most 1200 px on the longer side and store as JPEG 0.85 (v1 section 12.1).
// A missing image of the same name is filled in instead of adding a new entry.
async function importPhoto(issue, file) {
  const img = await decodeFile(file);
  const w = img.naturalWidth;
  const hh = img.naturalHeight;
  const s = Math.min(1, 1200 / Math.max(w, hh));
  const tw = Math.max(1, Math.round(w * s));
  const th = Math.max(1, Math.round(hh * s));
  let src = img;
  let cw = w;
  let ch = hh;
  while (cw > tw * 2) {
    const c = newCanvas(Math.round(cw / 2), Math.round(ch / 2));
    const cctx = c.getContext("2d");
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = "high";
    cctx.drawImage(src, 0, 0, c.width, c.height);
    src = c;
    cw = c.width;
    ch = c.height;
  }
  const out = newCanvas(tw, th);
  const octx = out.getContext("2d");
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(src, 0, 0, tw, th);
  const data = out.toDataURL("image/jpeg", 0.85);
  let id = Object.keys(issue.images).find((k) => issue.images[k].name === file.name && !issue.images[k].data && issue.images[k].kind !== "skin");
  if (id) Object.assign(issue.images[id], { data, w: tw, h: th });
  else {
    id = nextImageId(issue);
    issue.images[id] = { name: file.name, kind: "photo", data, w: tw, h: th };
  }
  await decodeEntry(id, issue.images[id]);
  return id;
}

// Returns the new image id, or throws with a message for the user.
async function importSkin(issue, file) {
  const data = await readAsDataURL(file);
  let img;
  try {
    img = await decodeImage(data);
  } catch (e) {
    throw new Error("Could not read " + file.name + " as an image.");
  }
  if (img.naturalWidth !== 64 || img.naturalHeight !== 64 || !/^data:image\/png/.test(data)) {
    throw new Error("Needs a 64 by 64 skin PNG (the old 64 by 32 layout is not supported)");
  }
  const old = issue.paper.skin;
  let id = Object.keys(issue.images).find((k) => issue.images[k].kind === "skin" && issue.images[k].name === file.name && !issue.images[k].data);
  if (id) Object.assign(issue.images[id], { data, w: 64, h: 64 });
  else {
    id = nextImageId(issue);
    issue.images[id] = { name: file.name, kind: "skin", data, w: 64, h: 64 };
  }
  issue.paper.skin = id;
  if (old && old !== id && !imageUses(issue, old).length) delete issue.images[old];
  await decodeEntry(id, issue.images[id]);
  return id;
}

function imageUses(issue, id) {
  const uses = [];
  if (issue.paper.skin === id) uses.push("officer skin");
  issue.pages.forEach((p, pi) => {
    eachBlock(p, (b) => {
      if (b.type === "photo" && b.image === id) uses.push("page " + (pi + 1) + " " + b.id);
    });
  });
  return uses;
}

// Add an uploaded font file to the theme and load it (section 11.4). Returns the font id.
async function importFont(issue, file) {
  if (file.size > 4 * 1024 * 1024) throw new Error("Font file is over 4 MB");
  let data = await readAsDataURL(file);
  const ext = (/\.([a-z0-9]+)$/i.exec(file.name || "") || [, "ttf"])[1].toLowerCase();
  const mime = { ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2" }[ext] || "font/ttf";
  data = "data:" + mime + data.slice(data.indexOf(";"));
  const fonts = issue.theme.fonts;
  let n = Object.keys(fonts).length + 1;
  while (fonts["font-" + n]) n++;
  const id = "font-" + n;
  const entry = { name: file.name, data, bytes: file.size };
  const ok = await TX.loadFace(id, entry);
  if (!ok) {
    delete TX.FACES[id];
    throw new Error("Could not load " + file.name + " as a font");
  }
  fonts[id] = entry;
  return id;
}

// Replace a theme sprite with an uploaded PNG of at most 64 by 64 (section 13.3).
async function importSprite(theme, key, file) {
  const bad = "Needs a PNG up to 64 by 64";
  const data = await readAsDataURL(file);
  let img;
  try {
    img = await decodeImage(data);
  } catch (e) {
    throw new Error(bad);
  }
  if (!/^data:image\/png/.test(data) || img.naturalWidth > 64 || img.naturalHeight > 64) throw new Error(bad);
  theme.sprites[key] = { name: file.name, data, w: img.naturalWidth, h: img.naturalHeight };
  await decodeSprites(theme);
}

// Where an uploaded font is used: role names, and "<field>-override in <owner>" (section 13.4).
function fontUses(issue, id) {
  const uses = [];
  for (const role of TX.ROLES) if (issue.theme.styles[role] && issue.theme.styles[role].font === id) uses.push(role);
  const fromOverrides = (obj, where) => {
    for (const [name, st] of Object.entries((obj && obj.styles) || {})) if (st && st.font === id) uses.push(name + "-override in " + where);
  };
  fromOverrides(issue.paper, "masthead");
  issue.pages.forEach((p) => eachBlock(p, (b) => fromOverrides(b, b.id || b.type)));
  return uses;
}

// ------------------------------------------------------------ moving blocks (v3 sections 7, 8.4)
// The first of `list` that is still in `arr`, as an index; else the end of arr.
function firstStill(arr, list) {
  for (const x of list) {
    const i = arr.indexOf(x);
    if (i >= 0) return i;
  }
  return arr.length;
}

// Apply a drop to a page (the real one, or a clone for a preview). target: {kind: "col", band,
// col, idx} | {kind: "newcol", band, at} | {kind: "band", at} | {kind: "photo", band, col, idx}.
// payload: {kind: "new", type, issue} | {kind: "move", block} | {kind: "photos", images, issue}.
// The target names positions from the pre-drop geometry; a move removes the block and compacts
// first, so they are re-resolved through the objects that were there. Returns {block, blocks,
// reduced}: the first landed block, every landed block, and the span it lost (or 0).
function applyDrop(page, target, payload, geometry, yHint) {
  const bands = page.bands;
  let blocks;
  if (payload.kind === "move") blocks = [payload.block];
  else if (payload.kind === "new") blocks = [newBlock(payload.type, payload.issue, payload.extra)];
  else blocks = newBlocks(payload.issue, payload.images.map((id) => ["photo", { image: id }]));
  // remember the objects the target points at
  const bandList = target.kind === "band" ? bands.slice(target.at) : null;
  const bandObj = target.band !== undefined ? bands[target.band] : null;
  const colObj = bandObj && target.col !== undefined ? bandObj.columns[target.col] : null;
  const colList = bandObj && target.kind === "newcol" ? bandObj.columns.slice(target.at) : null;
  const entryList = colObj && target.kind === "col" ? colObj.slice(target.idx) : null;
  if (payload.kind === "move") {
    removeBlock(page, payload.block);
    compact(page);
  }
  let bi = bandObj ? bands.indexOf(bandObj) : -1;
  if (bandObj && bi < 0) bi = clamp(target.band, 0, bands.length - 1);
  let reduced = 0;
  const first = blocks[0];
  if (target.kind === "photo") {
    const host = colObj && colObj[target.idx];
    if (host && host.type === "photo" && blocks.length) {
      host.image = blocks.shift().image;
      const at = colObj.indexOf(host) + 1;
      colObj.splice(at, 0, ...blocks);
      compact(page);
      return { block: host, blocks: [host, ...blocks], reduced: 0 };
    }
  } else if (target.kind === "band") {
    insertBand(page, firstStill(bands, bandList), { columns: [blocks.slice()] });
    reduced = clampSpan(page, first);
  } else if (target.kind === "newcol") {
    const band = bands[bi];
    if (!isContentBand(band)) return { block: null, blocks: [], reduced: 0 };
    const at = colList ? firstStill(band.columns, colList) : band.columns.length;
    insertColumn(page, bi, clamp(at, 0, band.columns.length), blocks.slice(), yHint, geometry);
    reduced = clampSpan(page, first);
    placeRefs(page, first, yHint, geometry);
  } else if (target.kind === "col") {
    const band = bands[bi];
    let ci = colObj ? band.columns.indexOf(colObj) : -1;
    if (ci < 0) ci = clamp(target.col, 0, band.columns.length - 1);
    const col = band.columns[ci];
    const idx = col === colObj ? firstStill(col, entryList) : col.length;
    reduced = insertBlock(page, bi, ci, idx, first, yHint, geometry);
    col.splice(col.indexOf(first) + 1, 0, ...blocks.slice(1));
  }
  compact(page);
  return { block: first, blocks, reduced };
}

// Keyboard moves (v3 section 7): the block keeps its span (clamped) and its refs are placed
// again without a geometry hint. Returns the reduced span, or 0.
function moveBlockKey(page, block, dir) {
  const pos = blockPos(page, block);
  if (!pos || isBandBlock(block)) return 0;
  const band = page.bands[pos.band];
  const col = band.columns[pos.col];
  if (dir === "up" || dir === "down") {
    const j = dir === "up" ? pos.idx - 1 : pos.idx + 1;
    if (j < 0 || j >= col.length) return 0;
    dropRefs(band, block.id);
    [col[pos.idx], col[j]] = [col[j], col[pos.idx]];
    clampSpan(page, block);
    placeRefs(page, block, null, null);
    syncRefs(page);
    return 0;
  }
  const to = dir === "left" ? pos.col - 1 : pos.col + 1;
  if (to < 0 || to >= band.columns.length) return 0;
  const toCol = band.columns[to];
  removeBlock(page, block);
  compact(page);
  const bi = page.bands.indexOf(band);
  if (bi < 0 || band.columns.indexOf(toCol) < 0) return 0;
  const reduced = insertBlock(page, bi, band.columns.indexOf(toCol), toCol.length, block, null, null);
  compact(page);
  return reduced;
}

// ------------------------------------------------------------ undo and redo (section 8.5)
const HIST = { undo: [], redo: [], last: null, images: {}, fonts: {} };

function snapshotOf(issue) {
  for (const [id, e] of Object.entries(issue.images)) if (e.data) HIST.images[id] = e.data;
  for (const [id, f] of Object.entries(issue.theme.fonts || {})) if (f.data) HIST.fonts[id] = f.data;
  return serialize(issue, { stripImages: true, stripFonts: true });
}

function resetHistory() {
  HIST.undo = [];
  HIST.redo = [];
  HIST.last = snapshotOf(S.issue);
}

// Push the state before the change that just happened, if anything changed.
function commit() {
  if (!S.issue) return;
  const s = snapshotOf(S.issue);
  if (s === HIST.last) return;
  HIST.undo.push(HIST.last);
  if (HIST.undo.length > 100) HIST.undo.shift();
  HIST.redo = [];
  HIST.last = s;
}

async function restoreSnapshot(s) {
  HIST.last = s;
  const issue = JSON.parse(s);
  for (const [id, e] of Object.entries(issue.images)) e.data = HIST.images[id] || null;
  for (const [id, f] of Object.entries(issue.theme.fonts || {})) f.data = HIST.fonts[id] || null;
  const oldFonts = JSON.stringify(Object.keys(S.issue.theme.fonts || {}));
  const oldSprites = JSON.stringify(S.issue.theme.sprites);
  S.issue = issue;
  for (const [id, e] of Object.entries(issue.images)) if (!(id in IMG)) await decodeEntry(id, e);
  if (JSON.stringify(Object.keys(issue.theme.fonts || {})) !== oldFonts) await TX.loadFonts(issue.theme);
  if (JSON.stringify(issue.theme.sprites) !== oldSprites) await decodeSprites(issue.theme);
  S.page = clamp(S.page, 0, issue.pages.length - 1);
  if (!validSel(S.sel)) S.sel = null;
  afterStructure();
}

async function undo() {
  endSession();
  if (!HIST.undo.length) return;
  HIST.redo.push(HIST.last);
  await restoreSnapshot(HIST.undo.pop());
  setStatus("Undone");
}

async function redo() {
  endSession();
  if (!HIST.redo.length) return;
  HIST.undo.push(HIST.last);
  await restoreSnapshot(HIST.redo.pop());
  setStatus("Redone");
}

/// ------------------------------------------------------------ selection (v3 sections 5.2, 7)
// S.sel: null (the page) | {kind: "block", band, col, idx}. Everything selectable is a block.
function blockAt(sel) {
  const page = S.issue && S.issue.pages[S.page];
  if (!sel || !page) return null;
  const band = page.bands[sel.band];
  const col = band && band.columns[sel.col];
  const e = col && col[sel.idx];
  return e && !isRef(e) ? e : null;
}

function validSel(sel) {
  if (!sel || !S.issue || sel.kind !== "block") return null;
  return blockAt(sel) ? sel : null;
}

function selectedBlock() {
  return blockAt(validSel(S.sel));
}

function ownerToSel(owner) {
  if (!owner || owner.kind !== "block") return null;
  return { kind: "block", band: owner.band, col: owner.col, idx: owner.idx };
}

const posSel = (pos) => (pos ? { kind: "block", band: pos.band, col: pos.col, idx: pos.idx } : null);

// ------------------------------------------------------------ hit-testing (v2 section 9)
const inside = (r, p) => r && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

// Order: text field, photo rect, block rect, else the page.
function hitTest(p) {
  const G = S.geometry;
  if (!G) return null;
  // fields with text first, so an empty field never shadows the text it sits on
  for (const f of G.texts) if (f.h > 0 && inside(textHitRect(f), p)) return { kind: "text", field: f, sel: ownerToSel(f.owner) };
  for (const f of G.texts) {
    if (f.h > 0 || !clickableBlank(f)) continue;
    if (inside(textHitRect(f), p)) return { kind: "text", field: f, sel: ownerToSel(f.owner) };
  }
  for (const b of G.blocks) if (b.photo && inside(b.photo, p)) return { kind: "photo", block: b, sel: posSel(b) };
  for (const b of G.blocks) if (inside(b, p)) return { kind: "block", block: b, sel: posSel(b) };
  return null;
}

// An empty field can be clicked to type into it, except a photo's optional headline, which
// would sit over the top of the photo.
function clickableBlank(f) {
  if (f.name !== "headline") return true;
  return !(f.obj && f.obj.type === "photo");
}

const geoBlock = (sel) => (S.geometry && sel ? S.geometry.blocks.find((x) => x.band === sel.band && x.col === sel.col && x.idx === sel.idx) || null : null);

function selRect(sel) {
  const b = geoBlock(sel);
  return b ? { x: b.x, y: b.y, w: b.w, h: Math.max(b.h, 4) } : null;
}

const sameSel = (a, b) => !!a && !!b && a.kind === b.kind && a.band === b.band && a.col === b.col && a.idx === b.idx;

// ------------------------------------------------------------ the overlay (section 8.2)
const OV = { hover: null, built: false };

function artScale() {
  // CSS px per art px
  return (2 * $("#screen").clientWidth) / SW;
}

function artPoint(ev) {
  const r = $("#overlay").getBoundingClientRect();
  const k = r.width / W;
  // ev: a pointer or drag event, or a stored client point {x, y}
  const cx = ev.clientX !== undefined ? ev.clientX : ev.x;
  const cy = ev.clientY !== undefined ? ev.clientY : ev.y;
  return { x: (cx - r.left) / k, y: (cy - r.top) / k };
}

function place(el, r, pad = 0) {
  const k = artScale();
  el.style.left = Math.round((r.x - pad) * k) + "px";
  el.style.top = Math.round((r.y - pad) * k) + "px";
  el.style.width = Math.round((r.w + 2 * pad) * k) + "px";
  el.style.height = Math.round((r.h + 2 * pad) * k) + "px";
}

function buildOverlay() {
  const ov = $("#overlay");
  // The strip above a block is its move handle; it shows on the selected block and on the
  // hovered one (v3 section 8.2, Q2 answer B).
  const grip = h("div", { id: "ovGrip", class: "ov-grip", title: "Drag to move this block" });
  const hoverGrip = h("div", { id: "ovHoverGrip", class: "ov-grip", title: "Drag to move this block" });
  // The tab on a block's right edge sets its span by dragging sideways (Span columns by drag).
  const spanTip = "Drag sideways to run this block across more or fewer columns";
  const spanGrip = h("div", { id: "ovSpan", class: "ov-span", title: spanTip });
  const hoverSpan = h("div", { id: "ovHoverSpan", class: "ov-span", title: spanTip });
  const ta = h("textarea", {
    id: "editbox", tabindex: "-1", spellcheck: false, autocomplete: "off", autocapitalize: "off",
    "aria-label": "Text being edited on the page",
  });
  ov.replaceChildren(
    // the ghost: the page as it will be after the drop, drawn over the page (v3 section 9.1)
    h("canvas", { id: "ghost", width: SW, height: SH, hidden: true }),
    h("div", { id: "ovHover", class: "ov-hover", hidden: true }, hoverGrip, hoverSpan),
    h("div", { id: "ovSel", class: "ov-sel", hidden: true }, grip, spanGrip),
    h("div", { id: "ovDots" }),
    h("div", { id: "ovHint", class: "ov-hint", hidden: true }, "Drag a block from the toolbox onto the page, or click one to add it."),
    h("div", { id: "ovBars" }),
    h("div", { id: "ovAdd" }),
    h("div", { id: "ovHandle", class: "ov-handle", hidden: true, title: "Drag to set a fixed photo height" }),
    h("canvas", { id: "caret", width: SW, height: SH }),
    ta,
    h("div", { id: "textBar", class: "text-bar", hidden: true, role: "toolbar", "aria-label": "Text" }));

  ov.addEventListener("pointermove", (e) => {
    if (DRAG.active) return;
    if (PH.pan) {
      panMove(e);
      return;
    }
    if (PH.handle) {
      handleMove(e);
      return;
    }
    if (ED && ED.dragging) {
      const f = editField();
      if (f) setEditSel(ED.dragAnchor, indexAt(f, artPoint(e)));
      return;
    }
    if (e.target.closest(".ov-grip, .ov-span")) return; // on a handle: keep the hovered block
    const p = artPoint(e);
    const hit = hitTest(p);
    let next = hit ? hit.sel : null;
    // keep the hovered block while the pointer travels up to its handle
    const hr = OV.hover && !sameSel(next, OV.hover) ? selRect(OV.hover) : null;
    if (hr && p.x >= hr.x - 2 && p.x < hr.x + hr.w + 2 && p.y < hr.y && p.y >= hr.y - 2 - 20 / artScale()) next = OV.hover;
    OV.hover = next;
    let cursor = "default";
    if (hit && hit.kind === "text") cursor = "text";
    else if (hit && hit.kind === "photo" && sameSel(hit.sel, validSel(S.sel)) && photoReady(blockAt(hit.sel))) cursor = "grab";
    ov.style.cursor = cursor;
    drawOverlay();
  });
  ov.addEventListener("pointerleave", () => {
    if (DRAG.active) return;
    OV.hover = null;
    drawOverlay();
  });
  // Keep the hidden textarea focused: the page itself never takes focus (section 11.1).
  ov.addEventListener("mousedown", (e) => {
    if (e.target.closest("#textBar, .ov-grip, .ov-span, button, input, select")) return;
    e.preventDefault();
  });
  ov.addEventListener("pointerdown", onOverlayDown);
  ov.addEventListener("pointerup", (e) => {
    if (PH.pan || PH.handle) {
      endPhotoDrag(e);
      return;
    }
    if (!ED) return;
    ED.dragging = false;
    syncCaret(true);
  });
  ov.addEventListener("pointercancel", endPhotoDrag);
  ov.addEventListener("wheel", onPhotoWheel, { passive: false });
  $("#ovHandle").addEventListener("pointerdown", onHandleDown);
  ov.addEventListener("dblclick", (e) => {
    if (!ED || e.target.closest("#textBar")) return;
    const f = editField();
    const p = artPoint(e);
    if (!f || !inside(textHitRect(f), p)) return;
    const text = $("#editbox").value;
    const i = indexAt(f, p);
    const isW = (ch) => /[\p{L}\p{N}-]/u.test(ch || "");
    let a = i;
    let b = i;
    while (a > 0 && isW(text[a - 1])) a--;
    while (b < text.length && isW(text[b])) b++;
    if (b > a) setEditSel(a, b);
  });

  // block drags: pointer events on the handles (v3 section 8.1)
  for (const g of [grip, hoverGrip]) {
    g.addEventListener("pointerdown", (e) => {
      const sel = g === grip ? validSel(S.sel) : validSel(OV.hover);
      const b = blockAt(sel);
      if (!b) return;
      e.stopPropagation();
      beginBlockDrag(e, { kind: "move", from: { band: sel.band, col: sel.col, idx: sel.idx, block: b } }, g);
    });
  }
  for (const g of [spanGrip, hoverSpan]) {
    g.addEventListener("pointerdown", (e) => {
      const sel = g === spanGrip ? validSel(S.sel) : validSel(OV.hover);
      const b = blockAt(sel);
      if (!b || !spanAdjustable(sel)) return;
      e.stopPropagation();
      beginBlockDrag(e, { kind: "span", from: { band: sel.band, col: sel.col, idx: sel.idx, block: b } }, g);
    });
  }
  // file drags from the file explorer keep the HTML5 events (v3 section 8.6)
  ov.addEventListener("dragover", (e) => {
    if (!isFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    if (DRAG.kind !== "files") startFileDrag();
    // one placeholder photo per image file in the ghost, at least one (v3 section 8.6)
    const items = [...(e.dataTransfer.items || [])].filter((it) => it.kind === "file");
    DRAG.files = Math.max(1, items.filter((it) => /^image\//.test(it.type || "")).length);
    DRAG.last = { x: e.clientX, y: e.clientY };
    const t = updateTarget();
    e.dataTransfer.dropEffect = t && t.kind !== "none" && t.kind !== "self" ? "copy" : "none";
  });
  ov.addEventListener("dragleave", (e) => {
    if (DRAG.kind === "files" && (!e.relatedTarget || !ov.contains(e.relatedTarget))) endDrag();
  });
  ov.addEventListener("drop", onFileDrop);
  // A file dropped anywhere else must never make the tab open it (v2 section 10.5).
  const outside = (e) => !(e.target && e.target.closest && e.target.closest("#overlay"));
  window.addEventListener("dragover", (e) => {
    if (!outside(e) || !isFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "none";
    if (DRAG.kind === "files") endDrag();
  });
  window.addEventListener("drop", (e) => {
    if (!outside(e) || !isFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    if (DRAG.kind === "files") endDrag();
  });
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragUp);
  window.addEventListener("pointercancel", (e) => {
    if (DRAG.kind && DRAG.kind !== "files" && e.pointerId === DRAG.pointer) endDrag();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !DRAG.kind) return;
    e.preventDefault();
    e.stopPropagation();
    endDrag();
  }, true);

  // text editing (section 11)
  ta.addEventListener("input", onEditInput);
  ta.addEventListener("keyup", () => syncCaret());
  ta.addEventListener("keydown", (e) => {
    if (!ED || e.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (!$("#colourPop") || $("#colourPop").hidden) endSession();
      else closeColourPop();
      return;
    }
    if (e.key === "Enter" && ED.single) {
      e.preventDefault();
      endSession();
      return;
    }
    if (e.key === "Tab") endSession();
  });
  ta.addEventListener("blur", checkEditFocus);
  const bar = $("#textBar");
  bar.addEventListener("focusout", checkEditFocus);
  // toolbar buttons keep the textarea focused (section 11.1)
  bar.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) e.preventDefault();
  });
  bar.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    if (!$("#colourPop").hidden) closeColourPop();
    refocusEdit();
  });
  $("#fileFont").addEventListener("change", onFontFile);
  OV.built = true;
}

function drawOverlay() {
  if (!OV.built || !S.geometry) return;
  const G = S.geometry;
  const sel = validSel(S.sel);
  const hov = $("#ovHover");
  const hr = OV.hover && !sameSel(OV.hover, sel) ? selRect(OV.hover) : null;
  hov.hidden = !hr;
  if (hr) place(hov, hr, 2);
  const sb = $("#ovSel");
  const sr = selRect(sel);
  sb.hidden = !sr;
  if (sr) {
    place(sb, sr, 3);
    const grip = $("#ovGrip");
    const b = selectedBlock();
    grip.hidden = !b;
    if (b) grip.textContent = b.type + " · " + (b.id || "");
  }
  $("#ovSpan").hidden = !sr || !spanAdjustable(sel);
  const hb = hr ? blockAt(OV.hover) : null;
  const hg = $("#ovHoverGrip");
  hg.hidden = !hb;
  if (hb) hg.textContent = hb.type + " · " + (hb.id || "");
  $("#ovHoverSpan").hidden = !hb || !spanAdjustable(OV.hover);
  // issue dots on blocks of this page
  const dots = $("#ovDots");
  const k = artScale();
  const marks = new Map();
  for (const r of S.reports || []) {
    if (r.page !== S.page || !r.owner || r.owner.kind !== "block") continue;
    const key = r.owner.band + ":" + r.owner.col + ":" + r.owner.idx;
    if (marks.get(key) !== "issue") marks.set(key, r.level);
  }
  dots.replaceChildren(...[...marks.entries()].map(([key, level]) => {
    const [bi, c, i] = key.split(":").map(Number);
    const b = geoBlock({ band: bi, col: c, idx: i });
    if (!b) return null;
    const d = h("div", { class: "ov-dot " + level, title: level === "issue" ? "This block has an issue" : "This block has a warning" });
    d.style.left = Math.round((b.x + b.w) * k - 12) + "px";
    d.style.top = Math.round(b.y * k + 2) + "px";
    return d;
  }).filter(Boolean));
  // blank page hint
  const hint = $("#ovHint");
  const page = S.issue.pages[S.page];
  const blank = page && !page.bands.some((band) => isContentBand(band) && bandHasBlock(band));
  hint.hidden = !blank;
  if (blank) place(hint, { x: LEFT, y: G.body.y0, w: FULL_W, h: Math.max(20, G.body.y1 - G.body.y0) });
  drawPhotoControls(G, sel);
  drawEditing();
}

// ------------------------------------------------------------ photos in place (section 12)
// pan: {band, col, idx, x0, y0, f (the framing numbers at the start), moved}
// handle: {band, col, idx, y0, h0, moved}
const PH = { pan: null, handle: null, wheelTimer: 0, addKey: "" };

const photoReady = (b) => !!b && b.type === "photo" && !!b.image && !!IMG[b.image];

// The inspector's Zoom and Focus sliders follow the wheel and the drag (section 12).
function mirrorRange(key, v) {
  const span = document.querySelector('#inspector .range[data-key="' + key + '"]');
  if (!span) return;
  span.querySelector("input").value = v;
  span.querySelector("output").textContent = Number(v).toFixed(2);
}

// "Add photo" over every photo block without an image, and the height handle of the selected
// photo. The buttons are rebuilt only when the set changes, so a click survives hover redraws.
function drawPhotoControls(G, sel) {
  const k = artScale();
  const empties = G.blocks.filter((gb) => gb.type === "photo" && gb.photo && gb.photo.h > 0 && !photoReady(blockAt(gb)));
  const box = $("#ovAdd");
  const key = empties.map((gb) => gb.band + ":" + gb.col + ":" + gb.idx + ":" + (gb.photo.h >= 40 ? 1 : 0)).join("|");
  if (key !== PH.addKey) {
    PH.addKey = key;
    box.replaceChildren(...empties.map((gb) => {
      const at = posSel(gb);
      return h("div", { class: "ov-add", dataset: { band: gb.band, col: gb.col, idx: gb.idx } },
        h("button", {
          type: "button",
          onclick: () => {
            endSession();
            select(at);
            uploadPhotosInto(at);
          },
        }, "Add photo"),
        gb.photo.h >= 40 ? h("span", null, "or drop an image here") : null);
    }));
  }
  for (const el of box.children) {
    const gb = geoBlock({ band: Number(el.dataset.band), col: Number(el.dataset.col), idx: Number(el.dataset.idx) });
    if (!gb || !gb.photo) continue;
    place(el, gb.photo);
    // below the canvas's own "no photo" label, which stays visible, when there is room
    const tall = (gb.photo.h / 2 - 6) * k >= 48;
    el.style.justifyContent = tall ? "flex-start" : "center";
    el.style.paddingTop = tall ? Math.round((gb.photo.h / 2 + 6) * k) + "px" : "0";
  }
  const hd = $("#ovHandle");
  const gb = geoBlock(sel);
  const show = !!gb && gb.type === "photo" && !!gb.photo && !DRAG.active;
  hd.hidden = !show;
  if (show) {
    const r = gb.photo;
    hd.style.left = Math.round(r.x * k) + "px";
    hd.style.top = Math.round((r.y + r.h) * k) - 3 + "px";
    hd.style.width = Math.round(r.w * k) + "px";
  }
}

// Wheel over the selected photo: zoom by 0.05 per notch around the frame centre (section 12).
function onPhotoWheel(e) {
  const sel = validSel(S.sel);
  if (!sel || sel.kind !== "block") return;
  const b = blockAt(sel);
  if (!photoReady(b)) return;
  const gb = geoBlock(sel);
  if (!gb || !gb.photo || !inside(gb.photo, artPoint(e))) return;
  e.preventDefault();
  if (!e.deltaY) return;
  const z = clamp((Math.round((Number(b.zoom) || 1) * 100) + (e.deltaY < 0 ? 5 : -5)) / 100, 1, 3);
  if (z === b.zoom) return;
  b.zoom = z;
  mirrorRange("zoom", z);
  renderFast();
  clearTimeout(PH.wheelTimer);
  PH.wheelTimer = setTimeout(commit, 400);
}

function capture(el, e) {
  try {
    el.setPointerCapture(e.pointerId);
  } catch (err) {
    // synthetic pointers cannot be captured
  }
}

// Pan: the image follows the pointer one to one and stops at its edges.
function panMove(e) {
  const P = PH.pan;
  const dx = e.clientX - P.x0;
  const dy = e.clientY - P.y0;
  if (!P.moved && Math.hypot(dx, dy) < 3) return;
  P.moved = true;
  $("#overlay").style.cursor = "grabbing";
  const b = blockAt(P);
  if (!photoReady(b)) return;
  const k = SW / $("#screen").clientWidth; // screen px per CSS px
  const f = P.f;
  const round4 = (v) => Math.round(v * 10000) / 10000;
  if (f.rw > f.sw) b.focusX = round4((clamp(f.left - dx * k, 0, f.rw - f.sw) + f.sw / 2) / f.rw);
  if (f.rh > f.sh) b.focusY = round4((clamp(f.top - dy * k, 0, f.rh - f.sh) + f.sh / 2) / f.rh);
  mirrorRange("focusX", b.focusX);
  mirrorRange("focusY", b.focusY);
  renderFast();
}

// The height handle: dragging fixes the photo's height (section 12).
function onHandleDown(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const sel = validSel(S.sel);
  const gb = geoBlock(sel);
  if (!gb || !gb.photo) return;
  endSession();
  PH.handle = { band: sel.band, col: sel.col, idx: sel.idx, y0: e.clientY, h0: gb.photo.h, moved: false };
  capture($("#ovHandle"), e);
}

function handleMove(e) {
  const P = PH.handle;
  const dy = e.clientY - P.y0;
  if (!P.moved && Math.abs(dy) < 2) return;
  P.moved = true;
  const b = blockAt(P);
  if (!b) return;
  const hgt = clamp(Math.round(P.h0 + dy / artScale()), 16, 700);
  if (Number(b.minH) === hgt && Number(b.maxH) === hgt) return;
  b.minH = hgt;
  b.maxH = hgt;
  renderFast();
}

function endPhotoDrag() {
  const pan = PH.pan;
  const hd = PH.handle;
  PH.pan = null;
  PH.handle = null;
  $("#overlay").style.cursor = "default";
  if (pan && pan.moved) {
    commit();
    renderPreview();
  }
  if (hd && hd.moved) {
    const b = blockAt(hd);
    if (b) setStatus("Photo height fixed at " + b.minH + " art px");
    commit();
    afterStructure(); // the inspector switches to Fixed
  }
}

//// ------------------------------------------------------------ drag and drop (v3 sections 8 and 9.2)
// Block drags (a toolbox tile, a block's handle) use pointer events; file drags from the file
// explorer use the HTML5 events. Both go through dropTarget and applyDrop.
// kind: "new" | "move" | "files"; from: {band, col, idx, block} of a moved block; pointer: the
// pointer id; start, last: client points; active: past the 4 px threshold; target: the current
// drop target; src: the element holding the pointer capture.
// kind "span" is the tab on a block's right edge: it sets the block's span by dragging.
// files: how many placeholder photos a file drag's ghost shows.
const DRAG = { kind: null, type: null, from: null, pointer: null, start: null, last: null, active: false, target: null, src: null, raf: 0, dropped: null, files: 1 };

const isFileDrag = (dt) => !!dt && [...(dt.types || [])].includes("Files");

// A block's span can be dragged when it is a content block in a band of two or more columns.
function spanAdjustable(sel) {
  const b = blockAt(sel);
  const page = S.issue && S.issue.pages[S.page];
  if (!b || !page || isBandBlock(b)) return false;
  const band = page.bands[sel.band];
  return !!band && isContentBand(band) && band.columns.length >= 2;
}

// The span the tab is dragged to: the column under the pointer, counted from the block's own
// column (v3 section 14's "drag a block's right edge", brought in so a page can be built by
// dragging alone). Returns {kind: "span", span} or {kind: "self"}.
function spanTarget(p, drag) {
  const G = S.geometry;
  const f = drag.from;
  const gb = G && G.bands[f.band];
  if (!gb || !gb.columns.length) return { kind: "none" };
  const n = gb.columns.length;
  let c = gb.columns.findIndex((col) => p.x >= col.x - GUTTER / 2 && p.x < col.x + col.w + GUTTER / 2);
  if (c < 0) c = p.x < gb.columns[0].x ? 0 : n - 1;
  const s = clamp(c - f.col + 1, 1, n - f.col);
  return s === effSpan(f.block, f.col, n) ? { kind: "self" } : { kind: "span", span: s };
}

// A masthead or footer payload can only land as a band of its own.
const isBandPayload = (drag) => (drag.kind === "new" && BAND_TYPES.includes(drag.type)) || (drag.kind === "move" && !!drag.from && isBandBlock(drag.from.block));

// Pointerdown on a tile or a handle: the drag starts once the pointer has moved 4 CSS px.
function beginBlockDrag(e, spec, el) {
  if (e.button !== 0 || DRAG.kind) return;
  DRAG.dropped = null;
  e.preventDefault();
  Object.assign(DRAG, { kind: spec.kind, type: spec.type || null, from: spec.from || null, pointer: e.pointerId, start: { x: e.clientX, y: e.clientY }, last: { x: e.clientX, y: e.clientY }, active: false, target: null, src: el });
  capture(el, e);
}

function startFileDrag() {
  Object.assign(DRAG, { kind: "files", type: null, from: null, pointer: null, active: true, target: null, src: null });
}

function activateDrag() {
  DRAG.active = true;
  endSession();
  closeColourPop();
  const chip = h("div", { id: "dragChip", class: "drag-chip" }, dragChipText());
  document.body.append(chip);
  document.body.classList.add("dragging");
  DRAG.raf = requestAnimationFrame(autoScroll);
  drawOverlay();
}

function dragChipText() {
  const b = DRAG.from && DRAG.from.block;
  if (DRAG.kind === "move") return b.type + " · " + (b.id || "");
  if (DRAG.kind === "span") {
    const page = currentPage();
    const n = page.bands[DRAG.from.band] ? page.bands[DRAG.from.band].columns.length : 1;
    const s = DRAG.target && DRAG.target.kind === "span" ? DRAG.target.span : effSpan(b, DRAG.from.col, n);
    return (b.id || b.type) + " · " + s + (s === 1 ? " column" : " columns");
  }
  return DRAG.type;
}

function onDragMove(e) {
  if (!DRAG.kind || DRAG.kind === "files" || e.pointerId !== DRAG.pointer) return;
  DRAG.last = { x: e.clientX, y: e.clientY };
  if (!DRAG.active) {
    if (Math.hypot(e.clientX - DRAG.start.x, e.clientY - DRAG.start.y) <= 4) return;
    activateDrag();
  }
  const chip = $("#dragChip");
  if (chip) {
    chip.style.left = e.clientX + 12 + "px";
    chip.style.top = e.clientY - 28 + "px";
  }
  updateTarget();
}

function onDragUp(e) {
  if (!DRAG.kind || DRAG.kind === "files" || e.pointerId !== DRAG.pointer) return;
  if (!DRAG.active) {
    endDrag(); // a click: the tile's click handler adds the block
    return;
  }
  DRAG.last = { x: e.clientX, y: e.clientY };
  const t = updateTarget();
  const drag = { kind: DRAG.kind, type: DRAG.type, from: DRAG.from };
  const p = artPoint(DRAG.last);
  DRAG.dropped = DRAG.src; // the click that follows on a tile is not an add
  endDrag();
  if (!t || t.kind === "none" || t.kind === "self") return;
  if (drag.kind === "new") {
    commitDrop(t, { kind: "new", type: drag.type, issue: S.issue, extra: newExtra(drag.type) }, p.y);
  } else if (drag.kind === "move" && drag.from && blockPos(currentPage(), drag.from.block)) {
    commitDrop(t, { kind: "move", block: drag.from.block }, p.y);
  } else if (drag.kind === "span" && t.kind === "span") {
    const page = currentPage();
    const b = drag.from.block;
    const pos = blockPos(page, b);
    if (!pos) return;
    applySpan(page, b, t.span, S.geometry);
    S.sel = posSel(blockPos(page, b));
    S.pane = "inspector";
    structural();
    setStatus("Span on " + (b.id || b.type) + " set to " + effSpan(b, S.sel.col, page.bands[S.sel.band].columns.length));
  }
}

const newExtra = (type) => (type === "masthead" ? { variant: S.page === 0 ? "full" : "half" } : null);

// Span by drag goes through setSpan with the block's own top as the hint, as the inspector does.
function applySpan(page, block, s, geometry) {
  const gb = geometry && rectById(geometry, block.id);
  setSpan(page, block, s, gb ? gb.y : null, geometry);
}

function endDrag() {
  cancelAnimationFrame(DRAG.raf);
  if (DRAG.src && DRAG.pointer !== null) {
    try {
      DRAG.src.releasePointerCapture(DRAG.pointer);
    } catch (err) {
      // not captured
    }
  }
  Object.assign(DRAG, { kind: null, type: null, from: null, pointer: null, start: null, last: null, active: false, target: null, src: null, raf: 0, files: 1 });
  const chip = $("#dragChip");
  if (chip) chip.remove();
  document.body.classList.remove("dragging");
  hideDropPreview();
  drawOverlay();
}

// Within 24 CSS px of the stage's top or bottom edge the stage scrolls 8 px a frame.
function autoScroll() {
  if (!DRAG.active || !DRAG.last) return;
  const wrap = $("#canvasWrap");
  const y = DRAG.last.y;
  const scrollsItself = wrap.scrollHeight > wrap.clientHeight + 1 && getComputedStyle(wrap).overflowY !== "visible";
  const r = scrollsItself ? wrap.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const d = y < r.top + 24 ? -8 : y > r.bottom - 24 ? 8 : 0;
  if (d) {
    if (scrollsItself) wrap.scrollTop += d;
    else window.scrollBy(0, d);
    updateTarget();
  }
  DRAG.raf = requestAnimationFrame(autoScroll);
}

// The target under the pointer, and its preview. The pointer must be over the page.
function updateTarget() {
  if (!DRAG.kind || !DRAG.last) return null;
  const r = $("#overlay").getBoundingClientRect();
  const on = DRAG.last.x >= r.left && DRAG.last.x < r.right && DRAG.last.y >= r.top && DRAG.last.y < r.bottom;
  const p = artPoint(DRAG.last);
  const t = on ? (DRAG.kind === "span" ? spanTarget(p, DRAG) : dropTarget(p, DRAG)) : null;
  DRAG.target = t;
  if (DRAG.kind === "span") {
    const chip = $("#dragChip");
    if (chip) chip.textContent = dragChipText();
  }
  showDropPreview(t, DRAG, p);
  return t;
}

// The band under y: the one whose [y, y + h) holds it, the last content band reaching the
// target; between bands, the nearer one (v3 section 8.3).
function bandUnder(G, y) {
  let lastContent = -1;
  for (const b of G.bands) if (b.kind === "content") lastContent = b.index;
  let best = null;
  let bd = Infinity;
  for (const b of G.bands) {
    const y1 = b.index === lastContent ? Math.max(b.y + b.h, G.target) : b.y + b.h;
    if (y >= b.y && y < y1) return b;
    const d = y < b.y ? b.y - y : y - y1;
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

const BAR_HALF = 3; // band bars are 6 art px tall (v3 section 9.2)

// Classify a pointer position during a drag (v3 section 8.3). drag: {kind, type, from}.
// Returns {kind: "photo", band, col, idx, rect} | {kind: "band", at} | {kind: "newcol", band, at,
// zone, gutter} | {kind: "col", band, col, idx} | {kind: "self"} | {kind: "none"}.
function dropTarget(p, drag) {
  const G = S.geometry;
  const page = S.issue && S.issue.pages[S.page];
  if (!G || !page) return null;
  if (drag.kind === "files") {
    for (const b of G.blocks) {
      if (b.type === "photo" && b.photo && b.photo.h > 0 && inside(b.photo, p)) return { kind: "photo", band: b.band, col: b.col, idx: b.idx, rect: b.photo };
    }
  }
  const bnds = G.boundaries;
  if (isBandPayload(drag)) {
    // the nearest band boundary, not the ones just before and after a moved band
    let best = null;
    for (const b of bnds) {
      if (drag.kind === "move" && (b.at === drag.from.band || b.at === drag.from.band + 1)) continue;
      if (!best || Math.abs(p.y - b.y) < Math.abs(p.y - best.y)) best = b;
    }
    return best ? { kind: "band", at: best.at } : { kind: "none" };
  }
  for (const b of bnds) if (Math.abs(p.y - b.y) <= BAR_HALF) return selfCheck(page, { kind: "band", at: b.at }, drag);
  if (!bnds.length || p.y < bnds[0].y - BAR_HALF || p.y > bnds[bnds.length - 1].y + BAR_HALF) return { kind: "none" };
  const gb = bandUnder(G, p.y);
  if (!gb || gb.kind !== "content") return { kind: "none" };
  const band = page.bands[gb.index];
  const n = band.columns.length;
  let t = null;
  if (p.x < LEFT + 20) t = { kind: "newcol", band: gb.index, at: 0, zone: "left" };
  else if (p.x > RIGHT - 20) t = { kind: "newcol", band: gb.index, at: n, zone: "right" };
  else {
    for (const g of gb.gutters) {
      if (p.x >= g.x - 4 && p.x < g.x + g.w + 4 && !g.breaks.some(([a, b]) => p.y >= a && p.y < b)) {
        t = { kind: "newcol", band: gb.index, at: g.after + 1, zone: "gutter", gutter: g };
        break;
      }
    }
    if (!t) {
      let c = gb.columns.findIndex((col) => p.x >= col.x && p.x < col.x + col.w);
      if (c < 0) {
        let best = Infinity;
        gb.columns.forEach((col, i) => {
          const d = Math.min(Math.abs(p.x - col.x), Math.abs(p.x - (col.x + col.w)));
          if (d < best) {
            best = d;
            c = i;
          }
        });
      }
      let idx = band.columns[c].length;
      for (const e of gb.entries[c] || []) {
        if (e.block && e.y + e.h / 2 > p.y) {
          idx = e.idx;
          break;
        }
      }
      t = { kind: "col", band: gb.index, col: c, idx };
    }
  }
  return selfCheck(page, t, drag);
}

// A move onto its own place is "self": no preview, no drop (v3 section 8.3).
function selfCheck(page, t, drag) {
  const f = drag.kind === "move" ? drag.from : null;
  if (!f || !t) return t;
  const band = page.bands[f.band];
  if (!band) return t;
  const onlyInCol = blocksOf(band.columns[f.col] || []).length === 1;
  const onlyInBand = band.columns.reduce((s, col) => s + blocksOf(col).length, 0) === 1;
  if (t.kind === "col" && t.band === f.band && t.col === f.col && (t.idx === f.idx || t.idx === f.idx + 1)) return { kind: "self" };
  if (t.kind === "newcol" && t.band === f.band && onlyInCol && (t.at === f.col || t.at === f.col + 1)) return { kind: "self" };
  if (t.kind === "band" && onlyInBand && (t.at === f.band || t.at === f.band + 1)) return { kind: "self" };
  return t;
}

// How many columns a band has after a drop into a new column there: empty columns go (v3 8.4).
function newColumnCount(t, drag) {
  const band = currentPage().bands[t.band];
  const lens = band.columns.map((col) => blocksOf(col).length);
  if (drag.kind === "move" && drag.from && drag.from.band === t.band && lens[drag.from.col] !== undefined) lens[drag.from.col]--;
  return lens.filter((l) => l > 0).length + 1;
}

function clearBars() {
  const bars = $("#ovBars");
  if (bars) bars.replaceChildren();
}

function hideDropPreview() {
  clearBars();
  hideGhost();
}

// The "+" circle on the bar or strip the pointer is on, and the 3-column chip under it.
function plusAt(x, y, count) {
  const k = artScale();
  const wrap = h("div", { class: "ov-plus-at" }, h("div", { class: "ov-plus" }, "+"), count > 3 ? h("div", { class: "ov-plus-note" }, count + " columns; the format was designed for 3") : null);
  wrap.style.left = Math.round(x * k) + "px";
  wrap.style.top = Math.round(y * k) + "px";
  return wrap;
}

// Previews while a drag is active (v3 sections 9.1 and 9.2): a bar for every band boundary,
// strips at the margins and in the gutters of the content band under the pointer, the one the
// pointer is on at full strength with a "+", and the ghost of the page after the drop. A span
// drag shows only the ghost.
function showDropPreview(t, drag, p) {
  clearBars();
  const G = S.geometry;
  if (!G || !DRAG.kind) {
    hideGhost();
    return;
  }
  const live = t && t.kind !== "none" && t.kind !== "self";
  if (drag.kind !== "span") {
    const kids = [];
    const piece = (cls, r, on) => {
      const el = h("div", { class: "ov-bar " + cls + (on ? " on" : "") });
      place(el, r);
      return el;
    };
    for (const b of G.boundaries) {
      const on = live && t.kind === "band" && t.at === b.at;
      kids.push(piece("bar", { x: LEFT, y: b.y - BAR_HALF, w: FULL_W, h: 2 * BAR_HALF }, on));
      if (on) kids.push(plusAt(clamp(p.x, LEFT + 14, RIGHT - 14), b.y, 0));
    }
    if (!isBandPayload(drag) && p) {
      const gb = bandUnder(G, p.y);
      if (gb && gb.kind === "content" && gb.columns.length) {
        const bottom = gb.columns[0].bottom;
        const n = gb.columns.length;
        const count = live && t.kind === "newcol" ? newColumnCount(t, drag) : 0;
        const isOn = (at) => live && t.kind === "newcol" && t.band === gb.index && t.at === at;
        const strip = (x, y0, y1, at) => {
          if (y1 <= y0) return;
          kids.push(piece("strip", { x, y: y0, w: 6, h: y1 - y0 }, isOn(at)));
        };
        strip(LEFT - 10, gb.y, bottom, 0);
        strip(RIGHT + 4, gb.y, bottom, n);
        for (const g of gb.gutters) {
          let y = g.top;
          for (const [a, b] of g.breaks) {
            strip(g.x + GUTTER / 2 - 3, y, Math.min(a, g.bottom), g.after + 1);
            y = Math.max(y, b);
          }
          strip(g.x + GUTTER / 2 - 3, y, g.bottom, g.after + 1);
        }
        if (live && t.kind === "newcol" && t.band === gb.index) {
          const x = t.zone === "left" ? LEFT - 7 : t.zone === "right" ? RIGHT + 7 : t.gutter.x + GUTTER / 2;
          kids.push(plusAt(x, clamp(p.y, gb.y + 14, bottom - 14), count));
        }
      }
    }
    $("#ovBars").replaceChildren(...kids);
  }
  if (live) showGhost(t, drag, p);
  else hideGhost();
}

// ------------------------------------------------------------ the ghost (v3 section 9.1)
// The page as it will be after the drop, drawn on #ghost over the page canvas, with the landed
// block faded. key: the drop's result as text, so the ghost is drawn again only when the result
// changes; want: the result waiting for the next animation frame; raf: that frame; renders: how
// many ghosts have been drawn (at most one per frame).
const GHOST = { key: "", want: null, raf: 0, renders: 0 };

// Apply the drag to a copy of the shown page. Returns {issue, page, landed} or null.
function ghostResult(t, drag, p) {
  const page = JSON.parse(JSON.stringify(currentPage()));
  const issue = Object.assign({}, S.issue, { pages: S.issue.pages.map((x, i) => (i === S.page ? page : x)) });
  const f = drag.from;
  const fromBlock = () => {
    const col = f && page.bands[f.band] && page.bands[f.band].columns[f.col];
    const e = col && col[f.idx];
    return e && !isRef(e) ? e : null;
  };
  if (drag.kind === "span") {
    const b = fromBlock();
    if (!b) return null;
    applySpan(page, b, t.span, S.geometry);
    return { issue, page, landed: [b] };
  }
  let payload;
  if (drag.kind === "new") payload = { kind: "new", type: drag.type, issue, extra: newExtra(drag.type) };
  else if (drag.kind === "move") {
    const b = fromBlock();
    if (!b) return null;
    payload = { kind: "move", block: b };
  } else {
    // placeholder photos until the files are imported; a photo that gets a new image keeps
    // showing its current one
    const images = new Array(Math.max(1, drag.files || 1)).fill(null);
    if (t.kind === "photo") {
      const host = page.bands[t.band] && page.bands[t.band].columns[t.col] && page.bands[t.band].columns[t.col][t.idx];
      if (host && host.image) images[0] = host.image;
    }
    payload = { kind: "photos", images, issue };
  }
  const res = applyDrop(page, t, payload, S.geometry, p.y);
  if (!res.block) return null;
  return { issue, page, landed: res.blocks };
}

function showGhost(t, drag, p) {
  const g = ghostResult(t, drag, p);
  if (!g) {
    hideGhost();
    return;
  }
  const key = JSON.stringify(g.page) + "|" + g.landed.map((b) => JSON.stringify(blockPos(g.page, b))).join(",");
  if (key === GHOST.key) return;
  GHOST.key = key;
  GHOST.want = g;
  if (!GHOST.raf) GHOST.raf = requestAnimationFrame(drawGhost);
}

function drawGhost() {
  GHOST.raf = 0;
  const g = GHOST.want;
  GHOST.want = null;
  if (!g || !DRAG.kind) return;
  const cv = $("#ghost");
  // the fast path: no texture and no markers; the ghost's layout reports nothing (REP is null)
  const L = renderPage(g.issue, S.page, cv, { fast: true });
  GHOST.renders++;
  const ctx = cv.getContext("2d");
  const k = SW / Math.max(1, $("#screen").clientWidth); // canvas px per CSS px
  ctx.save();
  for (const b of g.landed) {
    const r = L.geometry.blocks.find((x) => x.obj === b);
    if (!r) continue;
    const x = 2 * r.x;
    const y = 2 * r.y;
    const w = 2 * r.w;
    const hh = 2 * Math.max(r.h, 4);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = g.issue.theme.colours.paper;
    ctx.fillRect(x, y, w, hh);
    // a light wash of the accent so the landed block stands out from the reflowed page
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = accentColour();
    ctx.fillRect(x, y, w, hh);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = accentColour();
    ctx.lineWidth = 2 * k;
    ctx.setLineDash([6 * k, 4 * k]);
    ctx.strokeRect(x + k, y + k, w - 2 * k, hh - 2 * k);
  }
  ctx.restore();
  cv.hidden = false;
  $("#overlay").classList.add("ghosting");
}

function hideGhost() {
  if (GHOST.raf) cancelAnimationFrame(GHOST.raf);
  GHOST.raf = 0;
  GHOST.want = null;
  GHOST.key = "";
  const cv = $("#ghost");
  if (cv) cv.hidden = true;
  const ov = $("#overlay");
  if (ov) ov.classList.remove("ghosting");
}

const accentColour = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2e8b86";

function selectDropped(page, b) {
  S.sel = posSel(blockPos(page, b));
  S.pane = "inspector";
  structural();
}

const isImageFile = (f) => /^image\//.test(f.type || "") || (!f.type && /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(f.name || ""));

// Import the image files of a drop; returns {ids, msgs}.
async function importDropped(files) {
  const msgs = [];
  const ids = [];
  for (const f of files) {
    if (!isImageFile(f)) {
      msgs.push("Skipped " + f.name + ": not an image");
      continue;
    }
    try {
      ids.push(await importPhoto(S.issue, f));
    } catch (e) {
      msgs.push("Skipped " + f.name + ": not an image");
    }
  }
  return { ids, msgs };
}

// Apply a drop to the shown page and select what landed (v3 section 8.4): one undo step.
function commitDrop(t, payload, yHint) {
  const page = currentPage();
  const res = applyDrop(page, t, payload, S.geometry, yHint);
  if (!res.block) return null;
  selectDropped(page, res.block);
  if (res.reduced) setStatus("Span on " + res.block.id + " reduced to " + res.reduced + " to fit the band");
  return res;
}

async function onFileDrop(e) {
  if (!isFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  DRAG.last = { x: e.clientX, y: e.clientY };
  if (DRAG.kind !== "files") startFileDrag();
  const t = updateTarget();
  const p = artPoint(DRAG.last);
  const files = [...(e.dataTransfer.files || [])];
  endDrag();
  if (!t || t.kind === "none" || t.kind === "self") return;
  endSession();
  const pi = S.page;
  const { ids, msgs } = await importDropped(files);
  if (!ids.length) {
    if (msgs.length) setStatus(msgs.join("; "));
    return;
  }
  S.page = pi;
  commitDrop(t, { kind: "photos", images: ids, issue: S.issue }, p.y);
  msgs.unshift("Imported " + ids.length + (ids.length === 1 ? " image" : " images"));
  setStatus(msgs.join("; "));
}

// ------------------------------------------------------------ in-place text editing (section 11)
// ED: null, or {obj (the block, or the paper for masthead texts), owner, name, role, single,
// dragging, dragAnchor, blinkOn, lastSel, selTimer, blink}
let ED = null;

function editField() {
  if (!ED || !S.geometry) return null;
  return S.geometry.texts.find((f) => f.name === ED.name && f.obj === ED.obj) || null;
}

function editStyle() {
  const obj = ED.obj;
  return TX.resolve(S.issue.theme, ED.role, obj && obj.styles && obj.styles[ED.name]);
}

// The clickable area of a text field: the ink of single-line fields, the wrapping width of
// paragraphs, and at least one em high so an empty field can be clicked.
function textHitRect(f) {
  const st = f.style;
  const em = TX.emH(st);
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const l of f.lines) {
    x0 = Math.min(x0, l.x);
    x1 = Math.max(x1, l.x + TX.inkWidth(l.text, st));
  }
  if (!f.single) {
    x0 = Math.min(x0, f.x);
    x1 = Math.max(x1, f.x + f.w);
  }
  if (!(x1 - x0 >= 12)) {
    const c = Number.isFinite(x0) ? (x0 + x1) / 2 : f.x;
    x0 = c - 6;
    x1 = c + 6;
  }
  const last = f.lines[f.lines.length - 1];
  const y1 = Math.max(f.y + f.h, last ? last.y + em : f.y + em);
  return { x: x0 - 1, y: f.y - 1, w: x1 - x0 + 2, h: y1 - f.y + 2 };
}

function lineAtY(f, y) {
  let ln = f.lines[0];
  for (const l of f.lines) if (l.y <= y) ln = l;
  return ln;
}

function lineAtIndex(f, index) {
  let ln = f.lines[0];
  for (const l of f.lines) if (l.start <= index) ln = l;
  return ln;
}

// Pointer to text index (section 11.2).
function indexAt(f, p) {
  const ln = lineAtY(f, p.y);
  if (!ln) return 0;
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i <= ln.text.length; i++) {
    const d = Math.abs(ln.x + TX.caretX(ln.text, i, f.style) - p.x);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return ln.start + best;
}

function caretPoint(f, index) {
  const ln = lineAtIndex(f, index);
  if (!ln) return { x: f.x, y: f.y, line: null };
  return { x: ln.x + TX.caretX(ln.text, clamp(index - ln.start, 0, ln.text.length), f.style), y: ln.y, line: ln };
}

function onOverlayDown(e) {
  if (e.button !== 0) return;
  if (e.target.closest("#textBar, .ov-grip, .ov-span, #ovHandle, button")) return;
  closeColourPop();
  const ov = $("#overlay");
  const p = artPoint(e);
  if (ED) {
    const f = editField();
    if (f && inside(textHitRect(f), p)) {
      e.preventDefault();
      const ta = $("#editbox");
      const idx = indexAt(f, p);
      let anchor = idx;
      if (e.shiftKey) anchor = ta.selectionDirection === "backward" ? ta.selectionEnd : ta.selectionStart;
      ta.focus({ preventScroll: true });
      setEditSel(anchor, idx);
      ED.dragAnchor = anchor;
      ED.dragging = true;
      try {
        ov.setPointerCapture(e.pointerId);
      } catch (err) {
        // synthetic pointers cannot be captured
      }
      return;
    }
    endSession();
  }
  const hit = hitTest(p);
  // A drag on a photo with an image pans it; a press without movement is a click (section 12).
  if (hit && hit.kind === "photo") {
    select(hit.sel);
    const r = hit.block.photo;
    if (photoReady(blockAt(hit.sel)) && r && r.rw) {
      e.preventDefault();
      PH.pan = { band: hit.sel.band, col: hit.sel.col, idx: hit.sel.idx, x0: e.clientX, y0: e.clientY, f: Object.assign({}, r), moved: false };
      capture(ov, e);
    }
    return;
  }
  select(hit ? hit.sel : null);
  if (hit && hit.kind === "text") {
    e.preventDefault();
    const idx = indexAt(hit.field, p);
    startSession(hit.field, idx);
    if (!ED) return;
    ED.dragAnchor = idx;
    ED.dragging = true;
    try {
      ov.setPointerCapture(e.pointerId);
    } catch (err) {
      // synthetic pointers cannot be captured
    }
  }
}

function startSession(f, idx) {
  endSession();
  const obj = f.obj;
  if (!obj) return;
  const ta = $("#editbox");
  ED = {
    obj, owner: Object.assign({}, f.owner), name: f.name, role: f.role, single: !!f.single,
    dragging: false, dragAnchor: idx, blinkOn: true, lastSel: "", selTimer: 0, blink: 0,
  };
  let text = getField(obj, f.name);
  if (ED.single) text = text.replace(/\n/g, " ");
  ta.value = text;
  ta.focus({ preventScroll: true });
  const i = clamp(idx, 0, text.length);
  ta.setSelectionRange(i, i);
  ED.selTimer = setInterval(() => syncCaret(), 60);
  restartBlink();
  buildTextBar();
  syncCaret(true);
}

function endSession() {
  if (!ED) return;
  const ed = ED;
  ED = null;
  clearInterval(ed.selTimer);
  clearInterval(ed.blink);
  const bar = $("#textBar");
  if (bar) bar.hidden = true;
  closeColourPop();
  const ta = $("#editbox");
  if (ta && document.activeElement === ta) ta.blur();
  if (S.textureTimer) renderPreview();
  else drawEditing();
  commit();
}

function checkEditFocus() {
  setTimeout(() => {
    if (!ED) return;
    const a = document.activeElement;
    if (a === $("#editbox") || (a && a.closest && a.closest("#textBar"))) return;
    if (!document.hasFocus()) return; // the window lost focus (another app, a file dialog)
    endSession();
  }, 0);
}

function refocusEdit() {
  if (!ED) return;
  const ta = $("#editbox");
  if (document.activeElement !== ta) ta.focus({ preventScroll: true });
  syncCaret(true);
}

function restartBlink() {
  if (!ED) return;
  clearInterval(ED.blink);
  ED.blinkOn = true;
  ED.blink = setInterval(() => {
    if (!ED) return;
    ED.blinkOn = !ED.blinkOn;
    drawEditing();
  }, 530);
}

function setEditSel(anchor, focus) {
  const ta = $("#editbox");
  ta.setSelectionRange(Math.min(anchor, focus), Math.max(anchor, focus), focus < anchor ? "backward" : "forward");
  syncCaret(true);
}

// Read the selection from the textarea and redraw when it moved (section 11.2).
function syncCaret(force) {
  if (!ED) return;
  const ta = $("#editbox");
  const key = ta.selectionStart + ":" + ta.selectionEnd;
  if (!force && key === ED.lastSel) return;
  ED.lastSel = key;
  restartBlink();
  drawEditing();
  refreshTextBar();
}

function onEditInput() {
  if (!ED) return;
  const ta = $("#editbox");
  const obj = ED.obj;
  if (!obj) {
    endSession();
    return;
  }
  let v = ta.value;
  if (ED.single && v.includes("\n")) {
    const a = ta.selectionStart;
    const b = ta.selectionEnd;
    v = v.replace(/\n/g, " ");
    ta.value = v;
    ta.setSelectionRange(a, b);
  }
  const old = getField(obj, ED.name);
  if (v === old) return;
  setField(obj, ED.name, v);
  mirrorInspector(ED.name, v);
  renderFast();
  syncCaret(true);
}

// In-place edits update the matching inspector input without rebuilding the pane (9.5).
function mirrorInspector(name, value) {
  if (S.pane !== "inspector" || !sameSel(validSel(S.sel), ownerToSel(ED.owner))) return;
  const el = [...document.querySelectorAll("#inspector [data-field]")].find((x) => x.dataset.field === name);
  if (el && el !== document.activeElement) el.value = value;
}

// Caret, selection, the textarea's position and the toolbar's (section 11.2, 11.3).
function drawEditing() {
  const cv = $("#caret");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, cv.width, cv.height);
  const bar = $("#textBar");
  const f = ED ? editField() : null;
  const ta = $("#editbox");
  if (!f) {
    if (bar) bar.hidden = true;
    // park the textarea so a position from another zoom never widens the stage
    ta.style.left = "0px";
    ta.style.top = "0px";
    return;
  }
  const a = ta.selectionStart;
  const b = ta.selectionEnd;
  const st = f.style;
  const em = TX.emH(st);
  if (a !== b) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2e8b86";
    for (const ln of f.lines) {
      const spanEnd = Math.max(ln.end, ln.start + 1);
      if (!(a < spanEnd && b > ln.start)) continue;
      const len = ln.text.length;
      const xa = TX.caretX(ln.text, clamp(a - ln.start, 0, len), st);
      let xb = TX.caretX(ln.text, clamp(b - ln.start, 0, len), st);
      if (b > ln.start + len && xb - xa < 1) xb = xa + 1;
      if (xb > xa) ctx.fillRect(Math.round(2 * (ln.x + xa)), 2 * ln.y, Math.round(2 * (xb - xa)), 2 * em);
    }
    ctx.restore();
  }
  const cp = caretPoint(f, b === a ? a : ta.selectionDirection === "backward" ? a : b);
  if (a === b && ED.blinkOn) {
    ctx.fillStyle = colour(st.colour) || "#000";
    ctx.fillRect(Math.round(2 * cp.x), 2 * cp.y, 2, 2 * em);
  }
  const k = artScale();
  ta.style.left = Math.round(cp.x * k) + "px";
  ta.style.top = Math.round(cp.y * k) + "px";
  // the toolbar: above the field, below it when there is no room above
  bar.hidden = false;
  const r = textHitRect(f);
  const ov = $("#overlay");
  bar.style.maxWidth = Math.max(200, ov.clientWidth) + "px";
  const bw = bar.offsetWidth;
  const bh = bar.offsetHeight;
  const left = clamp(Math.round(r.x * k), 0, Math.max(0, ov.clientWidth - bw));
  let top = Math.round(r.y * k) - bh - 8;
  const ovRect = ov.getBoundingClientRect();
  // stay clear of the block's grip, which is the handle for moving it
  const grip = $("#ovGrip");
  if (grip && !grip.hidden && !$("#ovSel").hidden) {
    const g = grip.getBoundingClientRect();
    const gl = g.left - ovRect.left;
    const gt = g.top - ovRect.top;
    if (left < gl + g.width && left + bw > gl && top < gt + g.height && top + bh > gt) top = Math.round(gt) - bh - 4;
  }
  const wrapTop = $("#canvasWrap").getBoundingClientRect().top;
  if (ovRect.top + top < wrapTop + 4) top = Math.round((r.y + r.h) * k) + 8;
  bar.style.left = left + "px";
  bar.style.top = top + "px";
}

function renderFast() {
  renderPreview({ fast: true });
  clearTimeout(S.textureTimer);
  S.textureTimer = setTimeout(() => {
    S.textureTimer = 0;
    renderPreview();
  }, 400);
  scheduleDraft();
}

// ------------------------------------------------------------ the text toolbar (section 11.3)
const SIZES_PIXEL = [11, 22, 33, 44];

function buildTextBar() {
  const bar = $("#textBar");
  if (!ED || !bar) return;
  const st = editStyle();
  const fonts = Object.entries(S.issue.theme.fonts || {});
  const fontSel = h("select", { id: "tbFont", title: "Font", "aria-label": "Font" },
    h("option", { value: TX.PIXEL }, "Salon Pixel"),
    fonts.map(([id, f]) => h("option", { value: id, disabled: !(TX.FACES[id] && TX.FACES[id].ok) }, f.name || id)),
    h("option", { value: "__upload" }, "Upload font..."));
  fontSel.value = st.font;
  fontSel.addEventListener("change", () => {
    if (fontSel.value === "__upload") {
      fontSel.value = editStyle().font;
      $("#fileFont").value = "";
      $("#fileFont").click();
      return;
    }
    setEditStyle("font", fontSel.value);
  });
  let size;
  if (TX.isVector(st)) {
    size = h("input", { type: "number", id: "tbSize", min: 6, max: 120, step: 1, title: "Size (art px)", "aria-label": "Size" });
    size.value = String(st.size);
    size.addEventListener("input", () => {
      const v = parseInt(size.value, 10);
      if (v >= 6 && v <= 120) setEditStyle("size", v, { keepFocus: true });
    });
    size.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        refocusEdit();
      }
    });
  } else {
    const opts = SIZES_PIXEL.includes(st.size) ? SIZES_PIXEL : SIZES_PIXEL.concat([st.size]).sort((p, q) => p - q);
    size = h("select", { id: "tbSize", title: "Size", "aria-label": "Size" }, opts.map((s) => h("option", { value: String(s) }, s + " (" + s / 11 + "x)")));
    size.value = String(st.size);
    size.addEventListener("change", () => setEditStyle("size", Number(size.value)));
  }
  const sw = h("button", { type: "button", id: "tbColour", class: "tb-swatch", title: "Colour", "aria-label": "Colour", "aria-haspopup": "dialog" }, h("span", { class: "sw" }));
  sw.addEventListener("click", toggleColourPop);
  bar.replaceChildren(fontSel, size, sw, h("span", { class: "tb-note" }, "applies to this text"), h("div", { id: "colourPop", class: "popover colour-pop", hidden: true }));
  refreshTextBar();
}

function refreshTextBar() {
  if (!ED) return;
  const st = editStyle();
  const sw = $("#tbColour .sw");
  if (sw) sw.style.background = colour(st.colour);
  const font = $("#tbFont");
  if (font && font.value !== st.font && document.activeElement !== font) font.value = st.font;
}

// Font, size and colour apply to the whole field, stored as its override (sections 5.1, 11.3).
function setEditStyle(key, value, opts = {}) {
  if (!ED) return;
  const obj = ED.obj;
  if (!obj) return;
  const theme = S.issue.theme;
  const cur = editStyle();
  const ov = Object.assign({}, (obj.styles && obj.styles[ED.name]) || {});
  ov[key] = value;
  if (key === "font") {
    ov.size = value === TX.PIXEL ? clamp(Math.round(cur.size / 11), 1, 4) * 11 : clamp(Math.round(cur.size), 6, 120);
  }
  const def = Object.assign({ font: TX.PIXEL, size: 11, colour: "ink", bold: false, tracking: 0 }, theme.styles[ED.role] || {});
  for (const k of Object.keys(ov)) {
    if (ov[k] === def[k] || (k === "colour" && String(ov[k]).toLowerCase() === String(def[k]).toLowerCase())) delete ov[k];
  }
  if (!obj.styles || typeof obj.styles !== "object") obj.styles = {};
  if (Object.keys(ov).length) obj.styles[ED.name] = ov;
  else delete obj.styles[ED.name];
  renderPreview();
  scheduleDraft();
  commit();
  if (key === "font") buildTextBar();
  else refreshTextBar();
  if (!opts.keepFocus) refocusEdit();
  else drawEditing();
}

async function onFontFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const target = S.fontTarget; // set by the theme pane's font selects (section 13.2)
  S.fontTarget = null;
  try {
    const id = await importFont(S.issue, file);
    setStatus("Added font " + file.name);
    if (target) target(id);
    else if (ED) setEditStyle("font", id);
    else {
      renderPreview();
      scheduleDraft();
      commit();
      if (S.pane === "theme") renderLeft(); // the Fonts list shows the new font
    }
  } catch (err) {
    alert(err.message);
    refocusEdit();
  }
}

// ------------------------------------------------------------ colours (section 11.3)
const HEX_RE = /^#?([0-9a-f]{6})$/i;

function closeColourPop() {
  const pop = $("#colourPop");
  if (pop) pop.hidden = true;
}

function toggleColourPop() {
  const pop = $("#colourPop");
  if (!pop) return;
  if (!pop.hidden) {
    closeColourPop();
    return;
  }
  buildColourPop();
  pop.hidden = false;
}

function buildColourPop() {
  fillColourPop($("#colourPop"), editStyle().colour, (v) => {
    closeColourPop();
    setEditStyle("colour", v);
  });
}

// The colour popover of section 11.3, shared by the text toolbar and the theme pane's text
// styles: theme tokens, saved colours (with a remove "x") and a hex input with "Save colour".
// pick gets a token name or "#RRGGBB".
function fillColourPop(pop, current, pick) {
  const theme = S.issue.theme;
  const cur = String(current).toLowerCase();
  const swatch = (value, label, css) => h("button", {
    type: "button", class: "swatch" + (String(value).toLowerCase() === cur ? " current" : ""),
    title: label, "aria-label": label, style: "background:" + css, onclick: () => pick(value),
  });
  const tokens = Object.keys(theme.colours).map((t) => h("span", { class: "sw-cell" }, swatch(t, t + " " + theme.colours[t], theme.colours[t]), h("small", null, t)));
  const saved = (theme.savedColours || []).map((hex) => h("span", { class: "saved" },
    swatch(hex, hex, hex),
    h("button", {
      type: "button", class: "sw-x", title: "Remove " + hex, "aria-label": "Remove " + hex,
      onclick: (e) => {
        e.stopPropagation();
        theme.savedColours = theme.savedColours.filter((c) => c.toLowerCase() !== hex.toLowerCase());
        scheduleDraft();
        commit();
        fillColourPop(pop, current, pick);
      },
    }, "x")));
  const hexIn = h("input", { type: "text", class: "hex-input", placeholder: "#7A1F1F", maxlength: 7, "aria-label": "Hex colour", spellcheck: false });
  const save = () => {
    const m = HEX_RE.exec(hexIn.value.trim());
    if (!m) {
      hexIn.setAttribute("aria-invalid", "true");
      setStatus("A colour is a hex code like #7A1F1F");
      return;
    }
    const hex = "#" + m[1].toUpperCase();
    const list = theme.savedColours || (theme.savedColours = []);
    if (!list.some((c) => c.toLowerCase() === hex.toLowerCase())) list.push(hex);
    while (list.length > 24) list.shift();
    pick(hex);
  };
  hexIn.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  });
  pop.replaceChildren(
    h("div", { class: "pop-label" }, "Theme colours"),
    h("div", { class: "sw-grid" }, tokens),
    h("div", { class: "pop-label" }, "Saved colours"),
    saved.length ? h("div", { class: "sw-row" }, saved) : h("p", { class: "muted pop-empty" }, "None yet"),
    h("div", { class: "hex-row" }, hexIn, h("button", { type: "button", onclick: save }, "Save colour")));
}
