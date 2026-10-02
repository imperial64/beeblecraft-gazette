// Shell: top bar, inspector, toolbox, page tabs, the issues indicator, saving and export wiring.
// docs/design-v2.md sections 8, 9 and 15.
"use strict";

const KIND = {
  json: { description: "Gazette issue", accept: { "application/json": [".json"] } },
  png: { description: "PNG image", accept: { "image/png": [".png"] } },
  md: { description: "Markdown", accept: { "text/markdown": [".md"] } },
};

const TOOLS = [
  ["masthead", "Masthead", "Wordmark, kickers and tagline"],
  ["story", "Story", "Headline and paragraphs"],
  ["photo", "Photo", "A framed screenshot with caption"],
  ["box", "Box", "Shaded box with a title"],
  ["desk", "Desk", "The officer's box with the skin figure"],
  ["register", "Register", "Case list, one line per entry"],
  ["map", "Map", "Line map from spawn"],
  ["footer", "Footer", "Credits strip in a shaded band"],
];

const PRESETS = [
  ["front", "Front page"],
  ["inside", "Inside page"],
  ["back", "Back page"],
  ["sample-0", "Issue 1 page 1"],
  ["sample-1", "Issue 1 page 2"],
];

// ------------------------------------------------------------ storage: IndexedDB helpers
function idbOpen() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no IndexedDB"));
    let req;
    try {
      req = indexedDB.open(IDB_NAME, 1);
    } catch (e) {
      return reject(e);
    }
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
}

async function idbDo(mode, fn) {
  const db = await idbOpen();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, mode);
      const req = fn(tx.objectStore(IDB_STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("IndexedDB aborted"));
    });
  } finally {
    db.close();
  }
}

const idbGet = (key) => idbDo("readonly", (st) => st.get(key));
const idbPut = (key, value) => idbDo("readwrite", (st) => st.put(value, key));
const idbDelete = (key) => idbDo("readwrite", (st) => st.delete(key));

// ------------------------------------------------------------ editor state
const S = {
  issue: null,
  page: 0,
  sel: null, // see validSel() in editor.js
  pane: "inspector", // or "theme"
  handle: null, // FileSystemFileHandle of the opened or saved file
  zoom: "fit",
  renderTimer: 0,
  textureTimer: 0, // the full render after fast renders (section 11.1)
  draftTimer: 0,
  afterImport: null,
  geometry: null,
  reports: [],
  photoList: false,
  fontTarget: null, // a theme pane font select waiting for an uploaded font (section 13.2)
  spriteTarget: null, // the sprite key a "Replace (PNG)" is for (section 13.3)
};

function setStatus(msg) {
  $("#status").textContent = msg;
}

// A field changed: render soon, save the draft later (section 9.5).
function changed() {
  clearTimeout(S.renderTimer);
  S.renderTimer = setTimeout(renderPreview, 60);
  scheduleDraft();
}

// The structure or the selection changed: rebuild the inspector and render now.
function afterStructure() {
  renderLeft();
  renderPreview();
  scheduleDraft();
}

function structural() {
  afterStructure();
  commit();
}

function currentPage() {
  return S.issue.pages[S.page];
}

function select(sel) {
  S.sel = validSel(sel);
  S.photoList = false;
  if (S.pane !== "inspector") S.pane = "inspector";
  renderLeft();
  drawOverlay();
}

async function setIssue(issue, statusMsg) {
  endSession();
  S.issue = issue;
  S.page = 0;
  S.sel = null;
  S.pane = "inspector";
  TEXTURES.clear();
  await decodeAll(issue);
  await TX.loadFonts(issue.theme);
  await decodeSprites(issue.theme);
  resetHistory();
  renderLeft();
  renderPreview();
  if (statusMsg) setStatus(statusMsg);
}

// ------------------------------------------------------------ draft autosave (v1 section 16.2)
function scheduleDraft() {
  clearTimeout(S.draftTimer);
  S.draftTimer = setTimeout(saveDraft, 1000);
}

async function saveDraft() {
  clearTimeout(S.draftTimer);
  S.draftTimer = 0;
  if (!S.issue) return;
  const json = serialize(S.issue);
  try {
    localStorage.setItem(DRAFT_KEY, json);
    try {
      await idbDelete("draft");
    } catch (e) {
      // nothing to clean up
    }
    setStatus("Draft saved " + hhmm());
    return;
  } catch (e) {
    // too large for localStorage, or no localStorage
  }
  try {
    await idbPut("draft", json);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (e) {
      // nothing to clean up
    }
    setStatus("Draft saved " + hhmm());
    return;
  } catch (e) {
    // no IndexedDB either
  }
  try {
    localStorage.setItem(DRAFT_KEY, serialize(S.issue, { stripImages: true, stripFonts: true }));
    setStatus("Draft saved without images (too large): save the issue file");
  } catch (e) {
    setStatus("Draft storage unavailable: save the issue file");
  }
}

// The v3 draft; else a v2 draft, else a v1 draft, migrated and its key removed (v3 section 4.7).
async function restoreDraft() {
  let textStr = null;
  let oldKey = null;
  try {
    textStr = localStorage.getItem(DRAFT_KEY);
  } catch (e) {
    textStr = null;
  }
  if (!textStr) {
    try {
      textStr = await idbGet("draft");
    } catch (e) {
      textStr = null;
    }
  }
  for (const key of [DRAFT_KEY_V2, DRAFT_KEY_V1]) {
    if (textStr) break;
    try {
      textStr = localStorage.getItem(key);
      if (textStr) oldKey = key;
    } catch (e) {
      textStr = null;
    }
  }
  if (!textStr) return false;
  let parsed;
  try {
    parsed = parseIssue(textStr);
  } catch (e) {
    return false;
  }
  await setIssue(parsed.issue, openedMessage("Draft restored", parsed));
  if (oldKey) {
    try {
      localStorage.removeItem(oldKey);
    } catch (e) {
      // ignore
    }
    scheduleDraft();
  }
  try {
    const hnd = await idbGet("handle");
    if (hnd) S.handle = hnd;
  } catch (e) {
    // no stored file handle
  }
  return true;
}

async function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (e) {
    // ignore
  }
  try {
    await idbDelete("draft");
  } catch (e) {
    // ignore
  }
}

async function setHandle(hnd) {
  S.handle = hnd;
  try {
    if (hnd) await idbPut("handle", hnd);
    else await idbDelete("handle");
  } catch (e) {
    // handles are a convenience; nothing breaks without them
  }
}

// ------------------------------------------------------------ files (v1 sections 16 and 17)
const hasFSA = () => typeof window.showSaveFilePicker === "function";

function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function writeHandle(hnd, data) {
  const w = await hnd.createWritable();
  await w.write(data);
  await w.close();
}

// Returns {result: "saved" | "cancel", name}.
async function saveFile(name, blob, kind) {
  if (hasFSA()) {
    try {
      const hnd = await window.showSaveFilePicker({ suggestedName: name, types: [kind] });
      await writeHandle(hnd, blob);
      return { result: "saved", name: hnd.name };
    } catch (e) {
      if (e && e.name === "AbortError") return { result: "cancel", name };
      if (!(e && e.name === "SecurityError")) setStatus("Could not write " + name + "; saving a copy instead");
    }
  }
  downloadBlob(name, blob);
  return { result: "saved", name };
}

async function saveIssue() {
  if (S.handle && hasFSA()) {
    const hnd = S.handle;
    try {
      let perm = "granted";
      if (hnd.queryPermission) perm = await hnd.queryPermission({ mode: "readwrite" });
      if (perm !== "granted" && hnd.requestPermission) perm = await hnd.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") return saveIssueAs();
      await writeHandle(hnd, serialize(S.issue));
      setStatus("Saved issue to " + hnd.name + " " + hhmm());
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
      setStatus("Could not write " + hnd.name + "; saving a copy instead");
      const name = slug(S.issue.title) + ".json";
      downloadBlob(name, new Blob([serialize(S.issue)], { type: "application/json" }));
      return;
    }
  }
  return saveIssueAs();
}

async function saveIssueAs() {
  const json = serialize(S.issue);
  const name = slug(S.issue.title) + ".json";
  if (hasFSA()) {
    try {
      const hnd = await window.showSaveFilePicker({ suggestedName: name, types: [KIND.json] });
      await writeHandle(hnd, json);
      await setHandle(hnd);
      setStatus("Saved issue to " + hnd.name + " " + hhmm());
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
      setStatus("Could not write " + name + "; saving a copy instead");
    }
  }
  downloadBlob(name, new Blob([json], { type: "application/json" }));
  setStatus("Saved issue to " + name + " " + hhmm());
}

async function loadIssueText(textStr, hnd, name) {
  let parsed;
  try {
    parsed = parseIssue(textStr);
  } catch (e) {
    alert((name ? name + ": " : "") + e.message);
    return;
  }
  if (hasContent(S.issue) && !confirm("Replace the current issue with " + (name || "this file") + "?")) return;
  await setIssue(parsed.issue, openedMessage("Opened " + (name || "issue"), parsed));
  await setHandle(hnd || null);
  scheduleDraft();
}

async function openIssue() {
  if (typeof window.showOpenFilePicker === "function") {
    try {
      const [hnd] = await window.showOpenFilePicker({ types: [KIND.json] });
      const file = await hnd.getFile();
      await loadIssueText(await file.text(), hnd, file.name);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      alert("Could not open the file: " + (e && e.message ? e.message : e));
    }
    return;
  }
  $("#fileJson").value = "";
  $("#fileJson").click();
}

function toBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

const issuesFirst = (reps) => reps.filter((r) => r.level === "issue").concat(reps.filter((r) => r.level !== "issue"));

function exportConfirmText(reps) {
  const sorted = issuesFirst(reps);
  if (!sorted.length) return REMINDER + "\n\nExport?";
  const lines = sorted.slice(0, 12).map((r) => (r.level === "issue" ? "Issue: " : "Warning: ") + reportText(r));
  if (sorted.length > 12) lines.push("and " + (sorted.length - 12) + " more");
  return "The issue has issues or warnings:\n\n" + lines.join("\n") + "\n\n" + REMINDER + "\n\nExport anyway?";
}

async function exportPages(indices) {
  if (!confirm(exportConfirmText(collectReports(S.issue)))) return;
  const name = slug(S.issue.title);
  for (const pi of indices) {
    const c = newCanvas(SW, SH);
    renderPage(S.issue, pi, c, { preview: false });
    const blob = await toBlob(c);
    const res = await saveFile(name + "-page-" + (pi + 1) + ".png", blob, KIND.png);
    if (res.result === "cancel") return;
  }
  setStatus("Exported " + indices.length + (indices.length === 1 ? " page " : " pages ") + hhmm());
}

async function exportMarkdown() {
  const md = issueMarkdown(S.issue);
  const res = await saveFile(slug(S.issue.title) + ".md", new Blob([md], { type: "text/markdown" }), KIND.md);
  if (res.result === "saved") setStatus("Exported text to " + res.name);
}

function pickImages(after) {
  S.afterImport = after || null;
  const input = $("#fileImages");
  input.value = "";
  input.click();
}

// The first picked image goes into the photo block at sel, the rest become new photo blocks
// after it (section 9.3).
function uploadPhotosInto(sel) {
  const pi = S.page;
  pickImages(async (ids) => {
    if (!ids.length) return;
    const page = S.issue.pages[pi];
    const band = page && page.bands[sel.band];
    const col = band && band.columns[sel.col];
    const b = col && col[sel.idx];
    if (!b || isRef(b) || b.type !== "photo") return;
    b.image = ids[0];
    ids.slice(1).forEach((id, k) => col.splice(sel.idx + 1 + k, 0, newBlock("photo", S.issue, { image: id })));
  });
}

// ------------------------------------------------------------ inspector controls (section 9)
function field(label, control, note) {
  return h("label", { class: "field" }, h("span", null, label), control, note ? h("small", { class: "muted note" }, note) : null);
}

// Text inputs write live; the change event (blur or Enter) ends the edit for undo.
function textInput(obj, key, opts = {}) {
  const el = opts.rows ? h("textarea", { rows: opts.rows }) : h("input", { type: "text" });
  el.dataset.field = key;
  el.value = getField(obj, key);
  el.addEventListener("input", () => {
    const v = opts.rows ? el.value : el.value.replace(/\n/g, " ");
    if (opts.set) opts.set(v);
    else setField(obj, key, v);
    if (opts.onInput) opts.onInput(el.value);
    changed();
  });
  el.addEventListener("change", commit);
  return el;
}

function numInput(obj, key, opts = {}) {
  const el = h("input", { type: "number", min: opts.min, max: opts.max, step: opts.step || 1 });
  el.value = obj[key] === undefined ? (opts.def === undefined ? "" : opts.def) : obj[key];
  el.addEventListener("input", () => {
    const v = parseInt(el.value, 10);
    if (Number.isFinite(v)) {
      obj[key] = v;
      if (opts.onSet) opts.onSet(v);
      changed();
    }
  });
  el.addEventListener("change", commit);
  return el;
}

function rangeInput(obj, key, min, max, step) {
  const fmt = (v) => Number(v).toFixed(2);
  const out = h("output", null, fmt(obj[key]));
  const el = h("input", { type: "range", min, max, step });
  el.value = obj[key];
  el.addEventListener("input", () => {
    obj[key] = parseFloat(el.value);
    out.textContent = fmt(el.value);
    changed();
  });
  el.addEventListener("change", commit);
  return h("span", { class: "range", dataset: { key } }, el, out);
}

function selectInput(obj, key, options, onChange) {
  const el = h("select", null, options.map(([v, label]) => h("option", { value: v }, label)));
  el.value = obj[key] === null || obj[key] === undefined ? "" : obj[key];
  el.addEventListener("change", () => {
    obj[key] = el.value;
    if (onChange) onChange(el.value);
    else {
      changed();
      commit();
    }
  });
  return el;
}

function checkInput(obj, key, label, onChange) {
  const el = h("input", { type: "checkbox", checked: !!obj[key] });
  el.addEventListener("change", () => {
    obj[key] = el.checked;
    if (onChange) onChange(el.checked);
    else structural();
  });
  return h("label", { class: "check" }, el, h("span", null, label));
}

function btn(label, onClick, opts = {}) {
  return h("button", { type: "button", disabled: !!opts.disabled, title: opts.title, class: opts.class, onclick: onClick }, label);
}

function ornamentsAndTheme() {
  return [
    h("hr"),
    checkInput(S.issue.paper, "ornaments", "Lanterns and chains (Modern Mizunos, CC BY-NC-SA 4.0; credit them in a footer)"),
    btn("Edit theme", () => showPane("theme"), { class: "link" }),
  ];
}

// ------------------------------------------------------------ inspector: page (v2 9.1, v3 5.2)
function inspectPage() {
  const pages = S.issue.pages;
  const p = currentPage();
  const i = S.page;
  const presetSel = h("select", null, h("option", { value: "blank" }, "Blank page"), PRESETS.map(([v, l]) => h("option", { value: v }, l)));
  return [
    h("h2", null, "Page " + (i + 1) + " of " + pages.length),
    h("p", null, "Layout: " + layoutLine(p), h("br"), h("small", { class: "muted" }, "The page and the format were designed for 3 columns.")),
    h("div", { class: "row" },
      btn("Duplicate page", () => {
        pages.splice(i + 1, 0, clone(p));
        S.page = i + 1;
        S.sel = null;
        structural();
      }),
      btn("Delete page", () => {
        if (!confirm("Delete page " + (i + 1) + "?")) return;
        pages.splice(i, 1);
        S.page = Math.min(i, pages.length - 1);
        S.sel = null;
        structural();
      }, { disabled: pages.length <= 1 }),
      btn("Move left", () => movePage(i, -1), { disabled: i === 0 }),
      btn("Move right", () => movePage(i, 1), { disabled: i === pages.length - 1 })),
    h("div", { class: "row" }, presetSel, btn("Add page", () => addPage(presetSel.value))),
    ornamentsAndTheme(),
  ];
}

function movePage(i, d) {
  const pages = S.issue.pages;
  const j = i + d;
  if (j < 0 || j >= pages.length) return;
  [pages[i], pages[j]] = [pages[j], pages[i]];
  S.page = j;
  S.sel = null;
  structural();
}

// ------------------------------------------------------------ inspector: masthead and footer blocks (v3 5.2)
function idField(b) {
  return field("Id (shown in reports)", textInput(b, "id", { onInput: refreshGrip, set: (v) => renameBlock(currentPage(), b, v) }));
}

function blockButtons(b) {
  return h("div", { class: "row" }, btn("Duplicate block", () => duplicateBlock(b)), btn("Delete block", () => deleteSelected()));
}

function inspectMasthead(b) {
  const paper = S.issue.paper;
  return [
    h("h2", null, "Masthead"),
    field("Wordmark", textInput(paper, "wordmark")),
    field("Tagline", textInput(paper, "tagline")),
    field("Kicker left", textInput(paper, "kickerLeft")),
    field("Kicker centre", textInput(paper, "kickerCentre")),
    field("Kicker right", textInput(paper, "kickerRight")),
    h("small", { class: "muted" }, "The masthead texts are shared by every masthead of the issue."),
    field("Variant", selectInput(b, "variant", [["full", "full"], ["half", "half"]], () => structural())),
    ornamentsAndTheme(),
    idField(b),
    blockButtons(b),
  ];
}

function inspectFooter(b) {
  return [
    h("h2", null, "Footer"),
    field("Text", textInput(b, "text", { rows: 4 })),
    h("small", { class: "muted" }, "Delete the footer block to let the columns run to the bottom of the page."),
    idField(b),
    blockButtons(b),
  ];
}

// ------------------------------------------------------------ inspector: block (9.3)
function photoControls(b, sel, spanning) {
  const entry = b.image ? S.issue.images[b.image] : null;
  const thumb = entry && entry.data
    ? h("img", { class: "thumb", src: entry.data, alt: "" })
    : h("div", { class: "thumb none" }, entry ? "missing: re-import " + entry.name : "no photo");
  const photos = Object.entries(S.issue.images).filter(([, e]) => e.kind !== "skin");
  const list = S.photoList
    ? h("div", { class: "photo-list" }, photos.length
      ? photos.map(([id, e]) => h("button", {
        type: "button", class: "photo-pick" + (id === b.image ? " current" : ""),
        onclick: () => {
          b.image = id;
          S.photoList = false;
          structural();
        },
      }, e.data ? h("img", { src: e.data, alt: "" }) : null, h("span", null, e.name || id)))
      : h("p", { class: "muted" }, "This issue has no photos yet."))
    : null;
  const fixed = Number(b.minH) === Number(b.maxH);
  const height = [];
  {
    const mode = h("div", { class: "row radios" },
      h("label", null, h("input", { type: "radio", name: "hmode", checked: !fixed, onchange: () => {
        b.minH = PHOTO_MIN;
        b.maxH = Math.max(PHOTO_MAX, PHOTO_MIN);
        structural();
      } }), " Flexible"),
      h("label", null, h("input", { type: "radio", name: "hmode", checked: fixed, onchange: () => {
        b.maxH = b.minH = Math.max(16, Math.round((Number(b.minH) + Number(b.maxH)) / 2) || PHOTO_MIN);
        structural();
      } }), " Fixed"));
    height.push(h("div", { class: "field" }, h("span", null, "Height"), mode));
    if (fixed) height.push(field("Fixed height (art px)", numInput(b, "minH", { min: 16, max: 700, onSet: (v) => { b.maxH = v; } })));
    else height.push(h("div", { class: "grid2" }, field("Min (art px)", numInput(b, "minH", { min: 0, max: 700 })), field("Max (art px)", numInput(b, "maxH", { min: 0, max: 700 }))));
    if (spanning) height.push(h("small", { class: "muted note" }, "A photo across several columns stretches only when nothing follows it in any of its columns."));
  }
  return [
    h("div", { class: "field" }, h("span", null, "Photo"), thumb),
    h("div", { class: "row" },
      btn(S.photoList ? "Close list" : "Choose from this issue", () => {
        S.photoList = !S.photoList;
        renderLeft();
      }),
      btn("Upload photo", () => uploadPhotosInto(sel)),
      btn("Remove photo", () => {
        b.image = null;
        structural();
      }, { disabled: !b.image })),
    list,
    field("Zoom", rangeInput(b, "zoom", 1, 3, 0.05)),
    field("Focus X", rangeInput(b, "focusX", 0, 1, 0.01)),
    field("Focus Y", rangeInput(b, "focusY", 0, 1, 0.01)),
    height,
  ];
}

function skinControls() {
  const p = S.issue.paper;
  const fig = skinFigure(S.issue);
  const skinEntry = p.skin ? S.issue.images[p.skin] : null;
  let preview = null;
  if (fig) {
    const c = newCanvas(fig.canvas.width * 4, fig.canvas.height * 4);
    const cctx = c.getContext("2d");
    cctx.imageSmoothingEnabled = false;
    cctx.drawImage(fig.canvas, 0, 0, c.width, c.height);
    c.className = "skin-preview";
    preview = c;
  }
  return h("div", { class: "field" },
    h("span", null, "Officer skin (64 by 64 PNG, drawn in the desk box; one per issue)"),
    h("div", { class: "row" },
      btn(skinEntry ? "Replace" : "Choose", () => {
        $("#fileSkin").value = "";
        $("#fileSkin").click();
      }),
      skinEntry ? btn("Remove", () => {
        const old = p.skin;
        p.skin = null;
        if (old && !imageUses(S.issue, old).length) delete S.issue.images[old];
        structural();
      }) : null),
    skinEntry ? h("small", { class: "muted" }, skinEntry.name + (skinEntry.data ? "" : " (missing: re-import it)") + (fig ? ", detected " + fig.detected + ", drawn " + (fig.a === 3 ? "slim" : "classic") : "")) : null,
    field("Model", selectInput(p, "skinModel", [["auto", "auto"], ["classic", "classic"], ["slim", "slim"]], () => structural())),
    preview);
}

function refreshGrip() {
  drawOverlay();
}

function inspectBlock(sel) {
  const page = currentPage();
  const b = blockAt(sel);
  if (b.type === "masthead") return inspectMasthead(b);
  if (b.type === "footer") return inspectFooter(b);
  const n = page.bands[sel.band].columns.length;
  const spanning = effSpan(b, sel.col, n) > 1;
  const kids = [h("h2", null, b.type), idField(b)];
  switch (b.type) {
    case "story":
      kids.push(field("Headline", textInput(b, "headline")), field("Body", textInput(b, "body", { rows: 10 }), "One paragraph per line."));
      break;
    case "photo":
      kids.push(field("Headline (optional)", textInput(b, "headline")), field("Caption", textInput(b, "caption", { rows: 5 })), photoControls(b, sel, spanning));
      break;
    case "map":
      kids.push(field("Blocks per art px", numInput(b, "blocksPerPx", { min: 1 })));
      for (const d of DIRS) {
        const ln = b.lines[d];
        kids.push(h("h3", null, d[0].toUpperCase() + d.slice(1) + " line"),
          h("div", { class: "grid2" },
            field("Blocks (0 = none)", numInput(ln, "blocks", { min: 0 })),
            field("Style", selectInput(ln, "style", [["solid", "solid"], ["dashed", "dashed"]]))),
          field("Label", textInput(b, "lines." + d + ".label")));
      }
      kids.push(field("Caption", textInput(b, "caption", { rows: 5 })));
      break;
    case "box":
      kids.push(field("Title", textInput(b, "title")), field("Body", textInput(b, "body", { rows: 10 })));
      break;
    case "desk":
      kids.push(field("Title", textInput(b, "title")), field("Body", textInput(b, "body", { rows: 10 }), "Runs beside the officer's figure."), field("Signature", textInput(b, "signature")), skinControls());
      break;
    case "register":
      kids.push(field("Title", textInput(b, "title")), field("Lines", textInput(b, "lines", { rows: 10 }), "One entry per line."));
      break;
    default:
      kids.push(h("p", { class: "muted" }, "Unknown block type '" + b.type + "'; it is kept but not drawn."));
  }
  // Span columns on every block but the masthead and footer, through setSpan (v3 section 7)
  const max = n - sel.col;
  const opts = [];
  for (let s = 1; s <= max; s++) opts.push(h("option", { value: String(s) }, String(s)));
  const spanSel = h("select", { disabled: max < 2 }, opts);
  spanSel.value = String(effSpan(b, sel.col, n));
  spanSel.addEventListener("change", () => {
    const gb = geoBlock(sel);
    setSpan(page, b, Number(spanSel.value), gb ? gb.y : null, S.geometry);
    S.sel = posSel(blockPos(page, b));
    structural();
  });
  kids.push(field("Span columns", spanSel), blockButtons(b));
  return kids;
}

// The copy goes right after the original and keeps its span, its refs right after the
// original's; a masthead or footer copy gets a band of its own below (v3 section 7).
function duplicateBlock(b) {
  const page = currentPage();
  const pos = blockPos(page, b);
  if (!pos) return;
  const copy = clone(b);
  copy.id = newBlock(b.type, S.issue).id;
  if (isBandBlock(b)) insertBand(page, pos.band + 1, { columns: [[copy]] });
  else {
    const band = page.bands[pos.band];
    band.columns[pos.col].splice(pos.idx + 1, 0, copy);
    for (const col of band.columns) {
      const i = col.findIndex((e) => isRef(e) && e.ref === b.id);
      if (i >= 0) col.splice(i + 1, 0, { ref: copy.id });
    }
    syncRefs(page);
  }
  S.sel = posSel(blockPos(page, copy));
  structural();
}

function deleteSelected() {
  const b = selectedBlock();
  if (!b) return;
  const page = currentPage();
  removeBlock(page, b);
  compact(page);
  S.sel = null;
  structural();
}

// ------------------------------------------------------------ the theme pane (section 13)
const ROLE_LABELS = {
  body: "Body", headline: "Headline", caption: "Caption", boxTitle: "Box title", register: "Register",
  signature: "Signature", footer: "Footer", kicker: "Kickers", tagline: "Tagline", wordmark: "Wordmark", mapLabel: "Map labels",
};
const SPRITE_ROWS = [
  ["lantern", "Lantern", "Masthead flankers and box icon"],
  ["footerLantern", "Footer lantern", "The warm lantern in the footer band"],
  ["chain", "Chain", "Gutters and masthead, tiled at its own height"],
];

// Every theme change renders at once and pushes an undo snapshot; live is for a control still
// being dragged (a colour picker), which commits on its change event (section 13).
function themeChanged(live) {
  if (live) {
    renderFast();
    return;
  }
  renderPreview();
  scheduleDraft();
  commit();
}

function themeSection(title, kids) {
  return h("details", { class: "theme-sec", open: true }, h("summary", null, title), kids);
}

function themeColours() {
  const theme = S.issue.theme;
  const defs = defaultTheme().colours;
  return Object.keys(theme.colours).map((tok) => {
    const pick = h("input", { type: "color", "aria-label": tok + " colour" });
    const hex = h("input", { type: "text", class: "hex", maxlength: 7, spellcheck: false, "aria-label": tok + " hex code" });
    const sync = () => {
      const v = theme.colours[tok];
      const m = HEX_RE.exec(String(v));
      hex.value = v;
      pick.value = m ? "#" + m[1].toLowerCase() : "#000000";
    };
    sync();
    const set = (v, live) => {
      theme.colours[tok] = v;
      sync();
      themeChanged(live);
    };
    pick.addEventListener("input", () => set(pick.value.toUpperCase(), true));
    pick.addEventListener("change", () => set(pick.value.toUpperCase(), false));
    // validated on blur; anything that is not #rrggbb is reverted (section 13.1)
    hex.addEventListener("blur", () => {
      const m = HEX_RE.exec(hex.value.trim());
      if (!m) {
        sync();
        return;
      }
      const v = "#" + m[1].toUpperCase();
      if (v !== theme.colours[tok]) set(v, false);
      else sync();
    });
    hex.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        hex.blur();
      }
    });
    const reset = btn("Reset", () => set(defs[tok], false), { disabled: !(tok in defs), title: "Back to " + (defs[tok] || "the default") });
    return h("div", { class: "theme-row", dataset: { token: tok } }, h("span", { class: "tr-name" }, tok), pick, hex, reset);
  });
}

function openThemePop(anchor, current, pick) {
  let pop = $("#themePop");
  const open = pop && !pop.hidden && pop.parentElement === anchor;
  closePopovers();
  if (open) return;
  if (!pop) pop = h("div", { id: "themePop", class: "popover colour-pop" });
  anchor.append(pop);
  fillColourPop(pop, current, (v) => {
    closePopovers();
    pick(v);
  });
  pop.hidden = false;
}

function themeStyles() {
  const theme = S.issue.theme;
  const defs = defaultTheme().styles;
  return TX.ROLES.map((role) => {
    if (!theme.styles[role]) theme.styles[role] = clone(defs[role]);
    const st = theme.styles[role];
    const eff = TX.resolve(theme, role, null);
    const vector = TX.isVector(eff);
    const card = h("div", { class: "style-card", dataset: { role } });
    const setFont = (id) => {
      st.font = id;
      st.size = id === TX.PIXEL ? clamp(Math.round(eff.size / 11), 1, 4) * 11 : clamp(Math.round(eff.size), 6, 120);
      themeChanged(false);
      renderLeft();
    };
    const fonts = Object.entries(theme.fonts || {});
    const fontSel = h("select", { "aria-label": ROLE_LABELS[role] + " font" },
      h("option", { value: TX.PIXEL }, "Salon Pixel"),
      fonts.map(([id, f]) => h("option", { value: id, disabled: !(TX.FACES[id] && TX.FACES[id].ok) }, f.name || id)),
      h("option", { value: "__upload" }, "Upload font..."));
    fontSel.value = eff.font;
    fontSel.addEventListener("change", () => {
      if (fontSel.value === "__upload") {
        fontSel.value = eff.font;
        S.fontTarget = setFont;
        $("#fileFont").value = "";
        $("#fileFont").click();
        return;
      }
      setFont(fontSel.value);
    });
    let size;
    if (vector) {
      size = h("input", { type: "number", min: 6, max: 120, step: 1, "aria-label": ROLE_LABELS[role] + " size" });
      size.value = String(eff.size);
      size.addEventListener("input", () => {
        const v = parseInt(size.value, 10);
        if (v >= 6 && v <= 120) {
          st.size = v;
          themeChanged(true);
        }
      });
      size.addEventListener("change", () => themeChanged(false));
    } else {
      const opts = SIZES_PIXEL.includes(eff.size) ? SIZES_PIXEL : SIZES_PIXEL.concat([eff.size]).sort((p, q) => p - q);
      size = h("select", { "aria-label": ROLE_LABELS[role] + " size" }, opts.map((s) => h("option", { value: String(s) }, s + " (" + s / 11 + "x)")));
      size.value = String(eff.size);
      size.addEventListener("change", () => {
        st.size = Number(size.value);
        themeChanged(false);
      });
    }
    const sw = h("button", { type: "button", class: "tb-swatch ts-swatch", title: "Colour: " + st.colour, "aria-label": ROLE_LABELS[role] + " colour" }, h("span", { class: "sw", style: "background:" + colourOf(theme, st.colour) }));
    sw.addEventListener("click", () => openThemePop(card, st.colour, (v) => {
      st.colour = v;
      themeChanged(false);
      renderLeft();
    }));
    const bold = h("input", { type: "checkbox", checked: !!st.bold });
    bold.addEventListener("change", () => {
      if (bold.checked) st.bold = true;
      else delete st.bold;
      themeChanged(false);
    });
    const track = h("input", { type: "number", min: 0, max: 4, step: 1, disabled: vector, title: vector ? "Tracking applies to Salon Pixel only" : "Extra art px between letters", "aria-label": ROLE_LABELS[role] + " tracking" });
    track.value = String(Number(st.tracking) || 0);
    track.addEventListener("input", () => {
      const v = parseInt(track.value, 10);
      if (!(v >= 0 && v <= 4)) return;
      if (v) st.tracking = v;
      else delete st.tracking;
      themeChanged(true);
    });
    track.addEventListener("change", () => themeChanged(false));
    const reset = btn("Reset", () => {
      theme.styles[role] = clone(defs[role]);
      themeChanged(false);
      renderLeft();
    });
    card.append(
      h("div", { class: "style-head" }, h("strong", null, ROLE_LABELS[role]), reset),
      h("div", { class: "style-controls" }, fontSel, size, sw,
        h("label", { class: "inline" }, bold, " Bold"),
        h("label", { class: "inline" }, "Tracking ", track)));
    return card;
  });
}

const colourOf = (theme, c) => (theme.colours[c] !== undefined ? theme.colours[c] : c);

function themeSprites() {
  const theme = S.issue.theme;
  const rows = SPRITE_ROWS.map(([key, label, note]) => {
    const e = theme.sprites[key];
    const own = !!(e && e.data && SPRITES[key]);
    const img = own ? SPRITES[key].img : ASSETS[key].img;
    const w = img.naturalWidth;
    const hh = img.naturalHeight;
    const pv = h("img", { class: "sprite-preview", src: img.src, alt: label, width: w * 4, height: hh * 4 });
    return h("div", { class: "sprite-row", dataset: { sprite: key } },
      pv,
      h("div", { class: "sprite-text" },
        h("strong", null, label),
        h("small", { class: "muted" }, note),
        h("small", null, own ? e.name + ", " + w + " by " + hh : "Built in (Modern Mizunos), " + w + " by " + hh),
        h("div", { class: "row" },
          btn("Replace (PNG)", () => {
            S.spriteTarget = key;
            $("#fileSprite").value = "";
            $("#fileSprite").click();
          }),
          btn("Reset to default", () => {
            theme.sprites[key] = null;
            decodeSprites(theme).then(() => structural());
          }, { disabled: !e }))));
  });
  return [rows, h("p", { class: "muted note" }, "The default pieces are from Modern Mizunos (CC BY-NC-SA 4.0). Pages exported with any of them on need the credit in a footer. Your own sprites carry your own terms.")];
}

function themeFonts() {
  const theme = S.issue.theme;
  const rows = Object.entries(theme.fonts || {}).map(([id, f]) => {
    const uses = fontUses(S.issue, id);
    const ok = TX.FACES[id] && TX.FACES[id].ok;
    const bytes = f.bytes || Math.round(((f.data || "").length - (f.data || "").indexOf(",") - 1) * 0.75);
    return h("div", { class: "font-row", dataset: { font: id } },
      h("div", null, h("strong", null, f.name || id), " ", h("small", { class: "muted" }, Math.max(1, Math.round(bytes / 1024)) + " KB" + (ok ? "" : ", could not be loaded"))),
      h("small", null, uses.length ? "used by: " + uses.join(", ") : "unused"),
      btn("Remove", () => removeFont(id), { disabled: uses.length > 0, title: uses.length ? "Used; set those styles to another font first" : "Remove this font from the issue" }));
  });
  return [
    rows.length ? rows : h("p", { class: "muted" }, "No uploaded fonts. Salon Pixel is built in and is the default for every text."),
    btn("Upload font", () => {
      S.fontTarget = null;
      $("#fileFont").value = "";
      $("#fileFont").click();
    }),
  ];
}

function removeFont(id) {
  const theme = S.issue.theme;
  if (fontUses(S.issue, id).length) return;
  const face = TX.FACES[id];
  if (face && face.face) {
    try {
      document.fonts.delete(face.face);
    } catch (e) {
      // already gone
    }
  }
  delete TX.FACES[id];
  const name = theme.fonts[id] && theme.fonts[id].name;
  delete theme.fonts[id];
  structural();
  setStatus("Removed font " + (name || id));
}

// Compare themes with sorted keys and hex colours in one case.
function canonTheme(t) {
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o = {};
      for (const k of Object.keys(v).sort()) o[k] = walk(v[k]);
      return o;
    }
    return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : v;
  };
  return JSON.stringify(walk(normalizeTheme(clone(t))));
}

const themeIsDefault = (t) => canonTheme(t) === canonTheme(defaultTheme());

async function applyTheme(theme, msg) {
  endSession();
  S.issue.theme = theme;
  await TX.loadFonts(theme);
  await decodeSprites(theme);
  structural();
  setStatus(msg);
}

async function exportTheme() {
  const json = JSON.stringify({ format: THEME_FORMAT, version: 1, theme: S.issue.theme }, null, 2);
  const res = await saveFile(slug(S.issue.title) + "-theme.json", new Blob([json], { type: "application/json" }), KIND.json);
  if (res.result === "saved") setStatus("Exported theme to " + res.name);
}

async function importThemeText(textStr, name) {
  let obj;
  try {
    obj = JSON.parse(textStr);
  } catch (e) {
    alert(name + ": This file is not valid JSON.");
    return;
  }
  if (!obj || typeof obj !== "object" || obj.format !== THEME_FORMAT || !obj.theme || typeof obj.theme !== "object") {
    alert(name + ": This file is not a Gazette Builder theme.");
    return;
  }
  if (Number(obj.version) > 1) {
    alert(name + ": This theme was saved by a newer version of the Gazette Builder.");
    return;
  }
  if (!themeIsDefault(S.issue.theme) && !confirm("Replace the current theme with " + name + "?")) return;
  await applyTheme(normalizeTheme(obj.theme), "Imported theme " + name);
}

async function resetTheme() {
  if (!confirm("Reset the theme to the default? Colours, text styles, sprites and uploaded fonts go back to the start.")) return;
  await applyTheme(defaultTheme(), "Theme reset");
}

function themePane() {
  const theme = S.issue.theme;
  return [
    btn("Back to inspector", () => showPane("inspector"), { class: "link" }),
    h("h2", null, "Theme"),
    h("p", { class: "muted note" }, "The theme is the look of the whole issue. It is saved in the issue file."),
    themeSection("Colours", themeColours()),
    themeSection("Text styles", [h("p", { class: "muted note" }, "The default for each kind of text. The bar above a text on the page overrides these for that one text."), themeStyles()]),
    themeSection("Sprites", themeSprites()),
    themeSection("Fonts", themeFonts()),
    themeSection("Texture, export and import", [
      checkInput(theme, "texture", "Paper texture"),
      h("div", { class: "row" },
        btn("Export theme", exportTheme, { title: "Save the colours, text styles, sprites and fonts as a .json file" }),
        btn("Import theme", () => {
          $("#fileTheme").value = "";
          $("#fileTheme").click();
        }),
        btn("Reset theme", resetTheme)),
    ]),
  ];
}

function showPane(which) {
  S.pane = which;
  renderLeft();
}

function renderLeft() {
  const pane = $("#inspector");
  const top = pane.scrollTop;
  let kids;
  if (S.pane === "theme") kids = themePane();
  else {
    const sel = validSel(S.sel);
    S.sel = sel;
    kids = sel ? inspectBlock(sel) : inspectPage();
  }
  pane.replaceChildren(...[kids].flat(Infinity).filter(Boolean));
  pane.scrollTop = top;
  $("#title").value = S.issue.title || "";
}

// ------------------------------------------------------------ toolbox (section 10.1)
// Click to add (v3 sections 5.1, 7): a masthead goes to the top of the page (below a top
// masthead), a footer to the end; anything else to the end of the selected block's column, else
// of the first column of the last content band.
function addBlock(type) {
  const page = currentPage();
  endSession();
  let b;
  if (type === "masthead") {
    b = newBlock(type, S.issue, { variant: S.page === 0 ? "full" : "half" });
    insertBand(page, page.bands.length && bandKind(page.bands[0]) === "masthead" ? 1 : 0, { columns: [[b]] });
  } else if (type === "footer") {
    b = newBlock(type, S.issue);
    insertBand(page, page.bands.length, { columns: [[b]] });
  } else {
    b = newBlock(type, S.issue);
    const sel = validSel(S.sel);
    const cur = selectedBlock();
    if (sel && cur && !isBandBlock(cur)) page.bands[sel.band].columns[sel.col].push(b);
    else {
      if (!page.bands.some(isContentBand)) page.bands.splice(contentBandSlot(page), 0, { columns: [[]] });
      let bi = page.bands.length - 1;
      while (!isContentBand(page.bands[bi])) bi--;
      page.bands[bi].columns[0].push(b);
    }
  }
  compact(page);
  S.sel = posSel(blockPos(page, b));
  S.pane = "inspector";
  structural();
}

// Tiles drag onto the page with pointer events (v3 section 8.1); a click or Enter adds the block
// instead. A click right after a drag is the end of that drag, not an add.
function buildToolbox() {
  $("#toolbox").replaceChildren(h("h2", { class: "tools-head" }, "Blocks"), ...TOOLS.map(([type, name, desc]) =>
    h("div", {
      class: "tile", role: "button", tabindex: "0", dataset: { type },
      title: "Drag onto the page, or click to add a " + name.toLowerCase() + " block",
      onpointerdown: (e) => beginBlockDrag(e, { kind: "new", type }, e.currentTarget),
      onclick: (e) => {
        if (DRAG.dropped === e.currentTarget) {
          DRAG.dropped = null;
          return;
        }
        addBlock(type);
      },
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          addBlock(type);
        }
      },
    }, h("span", { class: "tile-name" }, name), h("span", { class: "tile-desc" }, desc))));
}

// ------------------------------------------------------------ pages (section 8.3)
async function makePresetPage(preset) {
  const issue = S.issue;
  if (preset === "blank") return blankPage(issue.pages.length);
  if (!preset.startsWith("sample-")) return presetPage(preset, issue);
  const sample = normalize(sampleIssue());
  const page = clone(sample.pages[Number(preset.slice(7))]);
  const remap = {};
  for (const b of pageBlocks(page).map((x) => x.block)) {
    if (b.type !== "photo") continue;
    const sid = b.image;
    if (!sid || !sample.images[sid]) continue;
    if (!(sid in remap)) {
      const se = sample.images[sid];
      let id = sid;
      if (issue.images[id] && issue.images[id].data !== se.data) id = nextImageId(issue);
      if (!issue.images[id]) {
        issue.images[id] = clone(se);
        await decodeEntry(id, issue.images[id]);
      }
      remap[sid] = id;
    }
    b.image = remap[sid];
  }
  if (!issue.paper.skin && preset === "sample-0" && sample.paper.skin) {
    const se = sample.images[sample.paper.skin];
    const id = issue.images[sample.paper.skin] ? nextImageId(issue) : sample.paper.skin;
    issue.images[id] = clone(se);
    await decodeEntry(id, issue.images[id]);
    issue.paper.skin = id;
  }
  return page;
}

async function addPage(preset) {
  const page = await makePresetPage(preset);
  S.issue.pages.push(page);
  S.page = S.issue.pages.length - 1;
  S.sel = null;
  closePopovers();
  structural();
}

function selectPage(i) {
  endSession();
  S.page = i;
  S.sel = null;
  renderLeft();
  renderPreview();
}

function renderTabs() {
  $("#tabs").replaceChildren(...S.issue.pages.map((_, i) =>
    h("button", { type: "button", class: "tab" + (i === S.page ? " active" : ""), "aria-pressed": String(i === S.page), onclick: () => selectPage(i) }, String(i + 1))));
}

function buildAddMenu() {
  $("#addMenu").replaceChildren(
    h("button", { type: "button", onclick: () => addPage("blank") }, "Blank page"),
    h("div", { class: "menu-label" }, "From preset:"),
    ...PRESETS.map(([v, label]) => h("button", { type: "button", onclick: () => addPage(v) }, label)));
}

// ------------------------------------------------------------ the issues indicator (section 8.1)
function plural(n, word) {
  return n + " " + word + (n === 1 ? "" : "s");
}

function renderIndicator() {
  const reps = S.reports;
  const ni = reps.filter((r) => r.level === "issue").length;
  const nw = reps.length - ni;
  const ind = $("#indicator");
  const label = [nw ? plural(nw, "warning") : null, ni ? plural(ni, "issue") : null].filter(Boolean).join(", ");
  if (!reps.length) {
    ind.className = "indicator none";
    ind.replaceChildren("No issues");
    ind.title = "No issues";
    ind.setAttribute("aria-label", "No issues");
  } else {
    ind.className = "indicator " + (ni ? "bad" : "warn");
    ind.title = label;
    ind.setAttribute("aria-label", label);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = '<path d="M10 1.5 L19 18 L1 18 Z" fill="currentColor"/><rect x="9" y="7" width="2" height="6" fill="#fff"/><rect x="9" y="14.5" width="2" height="2" fill="#fff"/>';
    ind.replaceChildren(svg);
  }
  if (!$("#issuesPop").hidden) renderIssuesPop();
}

function renderIssuesPop() {
  const pop = $("#issuesPop");
  const line = (r) => h("button", { type: "button", class: "rep " + r.level, onclick: () => goToReport(r) }, reportText(r));
  const issues = S.reports.filter((r) => r.level === "issue");
  const warns = S.reports.filter((r) => r.level !== "issue");
  const kids = [];
  if (issues.length) kids.push(h("h3", null, "Issues"), ...issues.map(line));
  if (warns.length) kids.push(h("h3", null, "Warnings"), ...warns.map(line));
  if (!kids.length) kids.push(h("p", { class: "muted" }, "No issues"));
  pop.replaceChildren(...kids);
}

function goToReport(r) {
  closePopovers();
  if (r.page !== null && r.page !== undefined) S.page = r.page;
  S.sel = ownerToSel(r.owner);
  S.pane = "inspector";
  renderPreview();
  renderLeft();
  drawOverlay();
}

function closePopovers() {
  $("#issuesPop").hidden = true;
  $("#addMenu").hidden = true;
  if ($("#themePop")) $("#themePop").hidden = true;
  $("#indicator").setAttribute("aria-expanded", "false");
  $("#btnAddPage").setAttribute("aria-expanded", "false");
}

function popoverOpen() {
  return !$("#issuesPop").hidden || !$("#addMenu").hidden || !!($("#themePop") && !$("#themePop").hidden);
}

// ------------------------------------------------------------ the stage
function applyZoom() {
  const c = $("#screen");
  const wrap = $("#canvasWrap");
  let width;
  if (S.zoom === "fit") {
    const availW = Math.max(100, wrap.clientWidth - 48);
    let scale = availW / SW;
    if (window.innerWidth >= 1000) {
      const availH = Math.max(200, wrap.clientHeight - 48);
      scale = Math.min(scale, availH / SH);
    }
    width = Math.floor(SW * Math.min(scale, 1));
  } else {
    width = SW * Number(S.zoom);
  }
  c.style.width = width + "px";
  for (const b of document.querySelectorAll("[data-zoom]")) b.classList.toggle("active", b.dataset.zoom === String(S.zoom));
  drawOverlay();
}

// opts.fast: skip the paper texture (typing, panning); a full render follows (section 11.1).
function renderPreview(opts = {}) {
  clearTimeout(S.renderTimer);
  if (!opts.fast) {
    clearTimeout(S.textureTimer);
    S.textureTimer = 0;
  }
  if (!S.issue) return;
  S.page = clamp(S.page, 0, S.issue.pages.length - 1);
  renderTabs();
  S.reports = collectReports(S.issue);
  renderIndicator();
  const L = renderPage(S.issue, S.page, $("#screen"), { preview: true, log: !opts.fast, fast: !!opts.fast });
  S.geometry = L.geometry;
  applyZoom();
}

// ------------------------------------------------------------ wiring
function confirmReplace(what) {
  return !hasContent(S.issue) || confirm("Replace the current issue with " + what + "? Save it first if you want to keep it.");
}

async function loadSample() {
  if (!confirmReplace("the sample issue")) return;
  await setIssue(parseIssue(JSON.stringify(sampleIssue())).issue, "Sample loaded");
  await setHandle(null);
  scheduleDraft();
}

const isTyping = (el) => !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

function onKey(e) {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && !e.altKey && key === "s") {
    e.preventDefault();
    if (e.shiftKey) saveIssueAs();
    else saveIssue();
    return;
  }
  const typing = isTyping(document.activeElement);
  if (mod && !e.altKey && !typing && (key === "z" || key === "y")) {
    e.preventDefault();
    if (key === "y" || e.shiftKey) redo();
    else undo();
    return;
  }
  if (e.key === "Escape") {
    if (popoverOpen()) closePopovers();
    else if (typing) document.activeElement.blur();
    else if (S.sel) select(null);
    return;
  }
  if (typing) return;
  const sel = validSel(S.sel);
  if (!sel || sel.kind !== "block") return;
  if ((e.key === "Delete" || e.key === "Backspace") && !mod) {
    e.preventDefault();
    deleteSelected();
    return;
  }
  if (e.altKey && !mod && e.key.startsWith("Arrow")) {
    e.preventDefault();
    const page = currentPage();
    const b = selectedBlock();
    const before = JSON.stringify(page.bands);
    const reduced = moveBlockKey(page, b, e.key.slice(5).toLowerCase());
    if (JSON.stringify(page.bands) === before) return;
    S.sel = posSel(blockPos(page, b));
    structural();
    if (reduced) setStatus("Span on " + b.id + " reduced to " + reduced + " to fit the band");
  }
}

function wire() {
  $("#title").addEventListener("input", (e) => {
    S.issue.title = e.target.value;
    scheduleDraft();
  });
  $("#title").addEventListener("change", commit);
  $("#btnNew").addEventListener("click", async () => {
    if (!confirmReplace("a new issue")) return;
    await setIssue(newIssue(), "New issue");
    await setHandle(null);
    scheduleDraft();
  });
  $("#btnOpen").addEventListener("click", openIssue);
  $("#btnSave").addEventListener("click", saveIssue);
  $("#btnSaveAs").addEventListener("click", saveIssueAs);
  $("#btnExportPage").addEventListener("click", () => exportPages([S.page]));
  $("#btnExportAll").addEventListener("click", () => exportPages(S.issue.pages.map((_, i) => i)));
  $("#btnExportMd").addEventListener("click", exportMarkdown);
  $("#btnTheme").addEventListener("click", () => showPane(S.pane === "theme" ? "inspector" : "theme"));
  $("#btnSample").addEventListener("click", loadSample);
  $("#btnHelp").addEventListener("click", () => {
    const help = $("#help");
    help.hidden = !help.hidden;
    $("#btnHelp").setAttribute("aria-expanded", String(!help.hidden));
    applyZoom();
  });
  $("#btnDiscard").addEventListener("click", async () => {
    if (!confirm("Discard the browser's draft and start a new issue?")) return;
    clearTimeout(S.draftTimer);
    await clearDraft();
    await setHandle(null);
    await setIssue(newIssue(), "Draft discarded");
  });
  $("#fileJson").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    await loadIssueText(await file.text(), null, file.name);
  });
  $("#fileImages").addEventListener("change", async (e) => {
    const files = [...(e.target.files || [])];
    const ids = [];
    for (const f of files) {
      if (!/^image\//.test(f.type || "image/")) {
        setStatus("Skipped " + f.name + ": not an image");
        continue;
      }
      try {
        ids.push(await importPhoto(S.issue, f));
      } catch (err) {
        alert("Could not read " + f.name + " as an image.");
      }
    }
    const after = S.afterImport;
    S.afterImport = null;
    if (after) await after(ids);
    if (ids.length) setStatus("Imported " + ids.length + (ids.length === 1 ? " image" : " images"));
    structural();
  });
  $("#fileSkin").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      await importSkin(S.issue, file);
      structural();
    } catch (err) {
      alert(err.message);
    }
  });
  $("#fileSprite").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    const key = S.spriteTarget;
    S.spriteTarget = null;
    if (!file || !key) return;
    try {
      await importSprite(S.issue.theme, key, file);
      structural();
      setStatus("Sprite replaced with " + file.name);
    } catch (err) {
      alert(err.message);
    }
  });
  $("#fileTheme").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    await importThemeText(await file.text(), file.name);
  });
  for (const b of document.querySelectorAll("[data-zoom]")) {
    b.addEventListener("click", () => {
      S.zoom = b.dataset.zoom;
      applyZoom();
    });
  }
  $("#btnAddPage").addEventListener("click", () => {
    const menu = $("#addMenu");
    const open = menu.hidden;
    closePopovers();
    menu.hidden = !open;
    $("#btnAddPage").setAttribute("aria-expanded", String(open));
  });
  $("#indicator").addEventListener("click", () => {
    const pop = $("#issuesPop");
    const open = pop.hidden;
    closePopovers();
    if (open) {
      renderIssuesPop();
      pop.hidden = false;
      $("#indicator").setAttribute("aria-expanded", "true");
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (!popoverOpen()) return;
    if (e.target.closest("#issuesPop, #indicator, #addMenu, #btnAddPage, #themePop, .ts-swatch")) return;
    closePopovers();
  });
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", applyZoom);
  // flush a pending draft when the tab goes away
  window.addEventListener("pagehide", () => {
    if (!S.draftTimer || !S.issue) return;
    try {
      localStorage.setItem(DRAFT_KEY, serialize(S.issue));
    } catch (e) {
      // the debounced save would have hit the same limit
    }
  });
  $("#reminderText").textContent = REMINDER;
  $("#glyphs").textContent = Font.characters();
  buildToolbox();
  buildAddMenu();
  buildOverlay();
}

async function start() {
  wire();
  await loadAssets();
  const restored = await restoreDraft();
  if (!restored) await setIssue(newIssue(), "New issue");
}

// Hooks for checking the tool from the browser console.
window.GazetteBuilder = {
  get issue() { return S.issue; },
  get geometry() { return S.geometry; },
  get selection() { return S.sel; },
  get editing() { return ED ? { owner: ED.owner, name: ED.name, single: ED.single } : null; },
  reports: () => collectReports(S.issue).map((r) => r.level + ": " + reportText(r)),
  serialize: () => serialize(S.issue),
  markdown: () => issueMarkdown(S.issue),
  render: () => renderPreview(),
  async loadFont(file) {
    const id = await importFont(S.issue, file);
    renderPreview();
    scheduleDraft();
    return id;
  },
};

start().catch((e) => {
  setStatus("Could not start: " + (e && e.message ? e.message : e));
});
