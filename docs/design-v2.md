# Gazette builder v2: design spec

Written 2026-10-02 from the user's feedback on v1, the v1 spec (docs/design.md), and the v1 code (src/app.js, src/font.js, src/index.html, build.py). v2 turns the form-plus-preview editor into a page editor you work on directly: three panes (inspector, page, toolbox), blocks dragged onto the page, text typed on the page, photos dropped onto it, an editable theme, uploaded fonts, redactions, and an issues indicator.

Everything in docs/design.md that this file does not change still holds; where the two disagree, this file wins. Section references of the form "v1 section N" point into docs/design.md.

Authority labels:

- **feedback**: the user's v2 feedback, quoted from the orchestration file. Each point is quoted once where it is settled.
- **answer**: a decision the user made for v1 (brief, questionnaire 1) that still applies: GitHub Pages hosting, all saving client-side, MIT code licence, issue JSON as the source of copy, issue 1 as the embedded sample, portrait 1200 by 1600, no mention of any AI vendor anywhere in the tool repository.
- **ported**: taken from v1 unchanged (code and numbers).
- **proposal**: my design decision, made so the implementer has none to make. Change at a visual gate, not during the build.
- **later**: out of scope for v2, listed in section 19.
- **TBD**: waits on gazette/tool-questionnaire-2.md (in the planning repository). Each TBD names its default; the build proceeds against the default. Section 20.

No audit and no review pass (user instruction). Each chunk in section 18 ends with the implementer's own checks.

## 1. What v2 changes, point by point

| Feedback (quoted) | Where it is settled |
|---|---|
| "elements drag and droppable", "drag out of a vertical toolbox on the right to the page in the middle" | Sections 8, 10 |
| "writeable directly on the page itself" | Section 11 |
| "photos draggable from file explorer or uploaded directly to image box containers" | Sections 10.5, 12 |
| "left side coloumn should be reserved for detailed editing ... only show editable fields of that block" | Section 9 |
| "allow uploading font files to use any font, by default it should already use the font we have here" | Sections 5, 11.4, 13 |
| "theme should be editable, the sprites ... or literally anything we use. colors adjustable as hex codes" | Section 13 |
| "i thought export copy was json?" | Section 15 |
| "export all should be export all pages" | Section 15 |
| "a 'new' page ... should give an empty page with the header elements" | Sections 8.3, 9.1 |
| "coloumn making should be natural ... + sign ... not limit the amount of coloumns but tell the user ... 3 coloumns" | Section 10.3 |
| "red '!' inside a triangle ... yellow ... tooltip '3 warnings, 1 issue' ... expand into a box" | Section 7.4 |
| "images ... zoomable and pannable" | Section 12 |
| "word style text field area ... font, upload their own, ... premade colors or ... custom hex code that gets saved, and font size" | Section 11.3 |
| "a big block of black like the redactions in government documents, without actually exposing the text redacted underneath" | Section 14 |

## 2. Architecture: the canvas stays the renderer, the DOM is the hands

### 2.1 Decision (proposal)

The page is drawn on a canvas exactly as in v1: an offscreen 600 by 800 art canvas, 2x nearest-neighbour upscale to 1200 by 1600, texture, photos. That canvas is both the preview and the export, so what the user sees is the PNG they get. Everything the user does to the page happens through a transparent interaction layer over the canvas: selection frames, drag previews, drop targets, the text caret and selection, photo controls, hint text. None of that layer is ever drawn into the export.

In-place text editing uses a hidden textarea for input and the layout engine for display: the textarea (invisible, focused) receives keystrokes, IME composition, clipboard and native undo; on every change its value is written into the document and the page re-renders; the caret and selection are drawn on an overlay canvas at positions computed from the same line layout that drew the text. This is the technique code editors used before contenteditable matured. It needs no second text renderer, so Salon Pixel stays pixel-exact while being edited.

Uploaded fonts are drawn with `fillText` through the FontFace API, on the screen canvas at 2x like photos (section 5.3). The default theme uses only Salon Pixel, so the default look stays pixel-art; a page set in an uploaded font is anti-aliased, which is what an uploaded vector font is.

### 2.2 Why not a DOM page rendered to PNG

Considered and rejected: a DOM page (divs, CSS, contenteditable) exported through an SVG `foreignObject` snapshot. It would make text editing trivial, but: Salon Pixel exists only as a glyph table (no TrueType file anywhere; generating one and getting browsers to rasterise it without anti-aliasing at every zoom is unreliable), so the default look would stop being pixel-exact; `foreignObject` snapshots are unreliable in Safari and taint-prone; and the v1 texture mask, balancing and sprite placement would all have to be rebuilt in CSS. The canvas renderer is the proven part of v1; v2 keeps it and builds the editor around it.

### 2.3 Kept from v1 (ported)

Art grid and constants (v1 section 4), Salon Pixel glyph table and parser (v1 section 6), embedded assets (v1 section 7), block drawing (v1 section 10), balancing (v1 section 11), photo import, framing and drawing (v1 section 12), skin renderer (v1 section 13), paper texture (v1 section 14), the three saving layers (v1 section 16), export and download path (v1 section 17), publishing (v1 section 18), build.py's job (v1 section 2.1), runtime rules (v1 section 3). Where a v1 function takes a Salon Pixel scale, v2 passes a text style (section 5) and the function reads its metrics from the text engine; the numbers for the default theme are the v1 numbers.

## 3. Repository and build

Same repository, same single-file deliverable (index.html), same build (`python build.py`). Changes:

```
src/
  index.html      markup and CSS for the three-pane shell (section 8)
  font.js         Salon Pixel data and parser (ported, renamed exports only if needed)
  text.js         text engine: styles, bitmap and vector fonts, measuring, wrapping, drawing (section 5)
  model.js        document model, defaults, migration, serialisation, theme defaults (section 6)
  layout.js       page layout, balancing, geometry record, issues and warnings (sections 4, 7)
  render.js       art canvas, texture, screen pass (photos, vector text, redactions), export rendering
  editor.js       selection, overlay, drag and drop, in-place text editing, photo controls (sections 9 to 12)
  ui.js           shell, top bar, inspector, toolbox, theme pane, issues popover, saving wiring (sections 8, 9, 13, 15)
docs/
  design.md       v1 spec, kept
  design-v2.md    this file
```

build.py inlines the scripts in that order into one `<script>` each (proposal: splitting the 2200-line app.js is for the implementer's sanity; the output is still one file). Everything else in build.py is unchanged, including the 8 MB limit and the no-outside-reference check. sample/issue-001.json is rewritten in the version 2 form (section 6.6).

The header comment, README and Help text are updated in chunk 6 (section 16). No mention of any AI tool or vendor anywhere in the repository, in commits, or in this file (answer).

## 4. Page geometry, generalised

All numbers are art px. The v1 constants hold: W 600, H 800, LEFT 17, RIGHT 583, FULL_W 566, GUTTER 16, PAGE_BOTTOM 784, FOOT_GAP 8, STORY_GAP 14, PARA_GAP 6, CAPTION_GAP 7, PHOTO_MIN 64, PHOTO_MAX 168, MAP_MIN 112, MAP_MAX 118, MAP_CX 89, FOOTER_TEXT_W 532 (554 without ornaments).

### 4.1 Columns (proposal, generalising v1)

A page has `n >= 1` columns of equal width: `colW = floor((FULL_W - GUTTER * (n - 1)) / n)`, remainder `r = FULL_W - n * colW - GUTTER * (n - 1)` given one px each to the first `r` columns. Column `c` starts at `x = LEFT + sum of widths of columns before c + GUTTER * c`. For n = 3 this is exactly v1: widths 178, x 17, 211, 405. For n = 1: 566. For n = 2: 275. For n = 4: 129, 129, 128, 128 with x 17, 162, 307, 451. No upper limit on n (feedback); section 7.3 says how the user is told about 3.

A column exists only while it holds a block, except that a page always has at least one column (so a blank page has one empty column). Columns are created by dropping a block at an edge or in a gutter (section 10.3) and removed automatically when their last block leaves (section 10.4).

### 4.2 Spanning blocks (proposal, replacing v1's page-level lead)

Any block that is the first in its column may have `span` 2 or more: it then covers columns `c .. c + span - 1` (clamped to the columns that exist), its width is the sum of those widths plus the gutters between, and each covered column's stack starts at the spanning block's bottom plus STORY_GAP. Only the first block of a column can span; moving a spanning block to any other position sets its span to 1. A covered column's own first block cannot span (it starts below). A spanning photo keeps a fixed height (minH is used; maxH is ignored for it), because a flexible height balanced across several columns has no single answer.

v1's lead photo becomes a photo block with `span: 2` as the first block of column 1, `minH = maxH = 195`, no headline, the lead caption as its caption (migration, section 6.5). For the sample this reproduces v1's lead rect exactly (x 17, y 94, w 372, h 195). One difference: v1 resumed columns 1 and 2 at caption bottom + CAPTION_GAP (7); v2 uses STORY_GAP (14) like every other block, so the sample's columns 1 and 2 start 7 art px lower than the Python pages and the two flexible photos in those columns are 7 px shorter. This is accepted here as a proposal: one rule for every block beats a special case for one, and the shift is invisible to a reader. If the user wants the Python pages reproduced to the pixel, the rule becomes "after a spanning block with a caption, use CAPTION_GAP", a one-line change.

### 4.3 Gutters and chains (ported, generalised)

Between every pair of adjacent columns there is a gutter of GUTTER px. With ornaments on, a chain is tiled in each gutter from its top to the page target (section 7.1), x centred on the chain sprite's ink width as in v1. A gutter's top is `bodyTop`, or the resume y of a spanning block that covers that gutter. For the sample: gutter 1|2 is covered by the lead, so it starts at the lead's resume y; gutter 2|3 starts at bodyTop; exactly v1.

### 4.4 Masthead, flowed from text metrics (ported numbers, generalised)

The masthead is drawn from the text styles' metrics (section 5.2: `emH`, `capOff`, `baseOff`) so that a different font or size still lays out, and so that the default theme gives the v1 numbers. Full masthead:

| Element | Rule |
|---|---|
| rule 1 | 1 px ink at y 16 |
| kickers | em top at 18; left at LEFT, centre centred on FULL_W, right ending at RIGHT; empty ones skipped |
| rule 2 | 1 px ink at `18 + emH(kicker) + 2` (31 for the default) |
| wordmark | cap line at `rule2 bottom + 4`, so em top = `cap - capOff(wordmark)` (36 and 28); centred; shrink rule below |
| teal rule | 2 px teal at `wordmark baseline + 4` where baseline = `em top + baseOff(wordmark)` (64 + 4 = 68) |
| tagline | cap line at `teal bottom + 3` (73); centred |
| rules | 2 px ink at `tagline em bottom + 3` (85), 1 px ink at `+3` (88) |
| body top | `last rule bottom + 5` (94) |

Half masthead: rule 1 at 16; wordmark cap line at `17 + 4` (21); teal rule at baseline + 4 (53); body top at `teal bottom + 6` (61). Kickers and tagline are not drawn on a half masthead.

Wordmark shrink (ported, generalised): if `width(wordmark) + 1 > FULL_W` at the style's size, step the size down (bitmap: 44, 33, 22; vector: 10 percent steps down to half the size) until it fits; warn "Wordmark drawn smaller than its size (N) to fit" (warning). If it still does not fit at the smallest step, draw clipped to the content edges and report "Wordmark is wider than the page even at its smallest size" (issue).

Lanterns (ported): `base` = wordmark baseline; `ly = base - lanternBbox.y1`; left lantern image x = `LEFT - bbox.x0`, right = `RIGHT - bbox.x1`; chains from rule bottom (32 full, 17 half) to `ly + 1`, tiled with the chain sprite's own height. Lantern-to-wordmark gap under 10 px: warning as in v1.

### 4.5 Footer band (ported, generalised)

Lines = wrap(footer, FOOTER_TEXT_W or 554, footer style). With `emH`, `pitch` from the footer style: `footerHeight = max(12 + emH + (n - 1) * pitch, 27)`; `ink = (n - 1) * pitch + (emH - capOff)`; `cap = innerTop + floor((innerBottom - innerTop - ink) / 2)`; line i em top at `cap - capOff + i * pitch`. For the default (emH 11, capOff 2, pitch 12) these are v1's 23, 27, 9 and `cap - 2`. Lantern placement as v1. Empty footer: no band.

### 4.6 Headline and box title rules (ported, generalised)

`ruleY = y + (n - 1) * pitch(style) + emH(style) + 3`; body top = `ruleY + 1 + 8`. Box: `hairY = ty + (n - 1) * pitch + emH + 3`, `bodyY = hairY + 7`. With the default headline style (emH 22, pitch 24) these are v1's formulas.

Map labels: v1 places label cap lines with `capTop(y, 1)`; v2 uses `y - capOff(mapLabel style)`. Everything else in the map, box, desk and register is ported as is, with the text calls taking styles.

## 5. Text engine (src/text.js)

### 5.1 Styles

A text style is `{font, size, colour, bold, tracking}`:

- `font`: a font id. `"salon-pixel"` is built in; others are ids in `issue.theme.fonts` (section 6.3).
- `size`: em height in art px. For Salon Pixel the size must be a multiple of 11 (11, 22, 33, 44, 55, ... ; the UI offers 11 to 44); `scale = size / 11`. For vector fonts any integer 6 to 120.
- `colour`: a theme colour token name (`"ink"`, `"ink_soft"`, ...) or a hex string `#rrggbb`. Resolved through `theme.colours` at draw time.
- `bold`: boolean. Bitmap: the 1 px dilation of v1 (wordmark). Vector: `bold` in the canvas font string.
- `tracking`: extra px between glyphs, bitmap only (kickers use 1). Default 0.

The theme carries a default style per role (section 6.3): `body`, `headline`, `caption`, `boxTitle`, `register`, `signature`, `footer`, `kicker`, `tagline`, `wordmark`, `mapLabel`. A text field's effective style is its role's theme style with the field's own override object (if any) merged on top. The text toolbar (section 11.3) edits the override for the whole field (TBD Q2, default: whole field).

### 5.2 Engine interface

One object per font kind with the same methods. `style` is an effective style.

| Method | Meaning |
|---|---|
| `emH(style)` | em height in art px. Bitmap: `11 * scale`. Vector: `round(fontBoundingBoxAscent + fontBoundingBoxDescent)` measured at the draw size and divided by 2 (section 5.3). |
| `capOff(style)` | em top to cap line. Bitmap: `2 * scale`. Vector: `round(fontBoundingBoxAscent - actualBoundingBoxAscent of "H")`, same units. |
| `baseOff(style)` | em top to baseline. Bitmap: `9 * scale`. Vector: `round(fontBoundingBoxAscent)`. |
| `pitch(style)` | line pitch: `emH + max(1, round(emH / 11))`. Bitmap: `12 * scale` (v1's BODY_PITCH and HEAD_PITCH). |
| `width(text, style)` | advance width in art px (v1 rules for bitmap: advances with TRACK and tracking, the last glyph's tracking dropped unless the text ends in a space; vector: `measureText` at the draw size divided by 2). |
| `wrap(text, widthFn, style)` | lines for one paragraph (section 5.4). |
| `draw(ctx, x, y, text, style, skipRanges)` | draw with em top at (x, y), skipping character ranges that are redacted (section 14). Bitmap draws on the art canvas; vector records a draw call for the screen pass. |
| `caretX(lineText, index, style)` | `width(lineText.slice(0, index), style)`; used for the caret, selection and hit-testing. |

If `measureText` lacks `fontBoundingBoxAscent` (older Safari), the vector engine uses ascent `0.8 * size`, descent `0.2 * size`, capOff `0.1 * size`.

### 5.3 Vector fonts on the screen canvas (proposal)

A vector font is loaded once per issue: base64 of its data URL decoded to an ArrayBuffer (no fetch), `new FontFace("gz-" + id, buffer)`, `await face.load()`, `document.fonts.add(face)`. Failure gives the issue "Font <name> could not be loaded; Salon Pixel used instead" and the style falls back to Salon Pixel at the nearest multiple of 11.

Vector text is measured and drawn at the screen scale: canvas font `"<bold >" + (2 * size) + "px gz-<id>"`, `textBaseline = "alphabetic"`, drawn at `(2x, 2 * (y + baseOff))` on the screen canvas after the texture pass (the same pass that draws photos), so the texture never touches it. The layout records every vector text run (position, text, style, skip ranges) during the art pass and the screen pass draws them. Nearest-neighbour upscaling never applies to vector text, so it is as crisp as the browser draws it.

### 5.4 Wrapping with indices

`wrap(text, widthFn, style)` takes one paragraph (no newlines) and returns `[{text, start, end}]` where `start` and `end` are indices into the paragraph: `text` is the drawn text (no trailing spaces), `end` includes any trailing spaces, so the ranges tile the paragraph without gaps and the caret has one line for every index. `widthFn` is a number or a function of the line index (the desk column uses the function form). Units are v1's `units()`: split on single spaces, then glue coordinates, day-month pairs, "CC BY" and "BY-x.y" (v1 section 5). A unit wider than the limit sits on its own line and overruns; the layout reports "'<unit>' is wider than its line" (issue). Empty paragraph: one empty line.

Multi-paragraph fields (section 6.4) split on "\n", wrap each paragraph, and lay the lines out with PARA_GAP between paragraphs (none for `register.lines`); the field's line records carry absolute indices into the whole field string (paragraph offset added) so one index space covers the field.

### 5.5 Missing glyphs (ported)

A character with no glyph in Salon Pixel draws the hollow box and reports "No glyph for 'ç' (U+00E7)" (issue). Vector fonts draw whatever the font gives; no check.

## 6. Document model: issue JSON version 2

### 6.1 Shape

```json
{
  "format": "gazette-builder-issue",
  "version": 2,
  "title": "The Beeblecraft Gazette, No. 1",
  "paper": {
    "wordmark": "THE BEEBLECRAFT GAZETTE",
    "tagline": "Inspections, cases and notices from the Beeblecraft Inspection Office",
    "kickerLeft": "NO. 1",
    "kickerCentre": "BEEBLECRAFT INSPECTION OFFICE",
    "kickerRight": "OCTOBER 2026",
    "ornaments": true,
    "skin": "img-skin",
    "skinModel": "auto",
    "styles": {},
    "redactions": {}
  },
  "theme": { "...": "section 6.3" },
  "pages": [
    {
      "masthead": "full",
      "columns": [
        [
          { "type": "photo", "id": "lead", "span": 2, "image": "img-lead", "zoom": 1, "focusX": 0.5, "focusY": 0.5,
            "headline": "", "caption": "The south line near the cherry trees: ...", "minH": 195, "maxH": 195 },
          { "type": "story", "id": "intro", "headline": "The office starts work", "body": "First paragraph.\nSecond paragraph." },
          { "type": "photo", "id": "south-water", "image": "img-3", "zoom": 1, "focusX": 0.5, "focusY": 0.5,
            "headline": "", "caption": "Heading back toward spawn ...", "minH": 64, "maxH": 168 }
        ],
        [ "..." ],
        [ "..." ]
      ],
      "footer": "Continued on page 2: ...",
      "styles": {},
      "redactions": {}
    }
  ],
  "images": { "img-skin": { "name": "character-skin.png", "kind": "skin", "data": "data:image/png;base64,...", "w": 64, "h": 64 } }
}
```

Field rules, where they differ from v1 section 8.1:

- `version` is 2. A version 1 file is migrated on load (section 6.5). A version above 2 is refused.
- `pages[].columns` is an array of 1 or more arrays. `pages[].lead` no longer exists.
- Every block may carry `span` (integer, default 1; honoured only on the first block of a column), `styles` (object: field name to style override, section 5.1) and `redactions` (object: field name to array of `[start, end)` index pairs, section 14). Both objects are omitted when empty.
- `paper.styles` and `paper.redactions` do the same for the five masthead texts; `pages[].styles` and `pages[].redactions` for `footer`.
- New block type `redaction` (section 14.1): `{type, id, lines}`.
- `images` as v1. `fonts` live in the theme (section 6.3), because they are part of the look.
- Unknown fields are kept and written back (ported rule).

### 6.2 Text fields and paragraphs (proposal, changes v1)

In v2 a newline in a multi-paragraph field is a paragraph break: `body` and `caption` are "one paragraph per line"; `register.lines` is one entry per line; `footer` is paragraphs too (drawn as wrapped lines without PARA_GAP, as v1 joins it into one text; keep v1: the footer is joined into one paragraph before wrapping). Single-line fields (`headline`, `title`, `signature`, the five masthead texts, map labels) have their newlines replaced by spaces on load. v1's "blank line between paragraphs" rule goes; the migration converts (section 6.5). The Markdown export still writes a blank line between paragraphs (J-### format).

### 6.3 Theme

```json
"theme": {
  "colours": {
    "paper": "#EFE6D0", "paper_shade": "#E3D8BD", "paper_dark": "#CDBF9E",
    "ink": "#1F1B17", "ink_soft": "#5A5048", "ink_faint": "#9C907E",
    "teal": "#2E8B86", "teal_dark": "#1F5F5C", "teal_light": "#7FC4BF", "copper": "#B8683A",
    "redaction": "#000000"
  },
  "savedColours": ["#7A1F1F"],
  "styles": {
    "body":      { "font": "salon-pixel", "size": 11, "colour": "ink" },
    "headline":  { "font": "salon-pixel", "size": 22, "colour": "ink" },
    "caption":   { "font": "salon-pixel", "size": 11, "colour": "ink_soft" },
    "boxTitle":  { "font": "salon-pixel", "size": 22, "colour": "ink" },
    "register":  { "font": "salon-pixel", "size": 11, "colour": "ink_soft" },
    "signature": { "font": "salon-pixel", "size": 11, "colour": "ink" },
    "footer":    { "font": "salon-pixel", "size": 11, "colour": "ink_soft" },
    "kicker":    { "font": "salon-pixel", "size": 11, "colour": "ink_soft", "tracking": 1 },
    "tagline":   { "font": "salon-pixel", "size": 11, "colour": "ink_soft" },
    "wordmark":  { "font": "salon-pixel", "size": 44, "colour": "ink", "bold": true },
    "mapLabel":  { "font": "salon-pixel", "size": 11, "colour": "ink_soft" }
  },
  "sprites": { "lantern": null, "footerLantern": null, "chain": null },
  "fonts": {
    "font-1": { "name": "Minecraftia.ttf", "data": "data:font/ttf;base64,...", "bytes": 61234 }
  },
  "texture": true
}
```

- `colours`: every token the renderer uses, as hex. The defaults are v1's palette plus `redaction`. The texture mask compares against the current `paper` and `paper_shade` values (section 7.2). `teal_light` and `copper` are kept for themes and later blocks; v2 draws nothing with them, same as v1.
- `savedColours`: the user's custom hex colours (section 11.3), saved with the issue so they travel with it.
- `styles`: one per role (section 5.1). `tracking` and `bold` default to 0 and false when absent.
- `sprites`: `null` means the built-in Modern Mizunos piece; otherwise `{name, data, w, h}` with a PNG data URL, at most 64 by 64 (section 13.3). `lantern` is the masthead flanker and the box icon; `footerLantern` the warm footer lantern; `chain` the gutter and masthead chain tile.
- `fonts`: uploaded font files as data URLs (`font/ttf`, `font/otf`, `font/woff`, `font/woff2`), at most 4 MB each. A font that no style and no field override uses can be removed in the theme pane.
- `texture`: paper texture on or off, for preview and export alike (v1's preview-only checkbox goes; typing uses the fast path of section 11.1 instead).

The theme is written in full on every save, defaults included, so a file describes itself. "Export theme" and "Import theme" (section 13.5) use `{format: "gazette-builder-theme", version: 1, theme: {...}}`.

### 6.4 Fields per block type

| Type | Text fields (role) | Other fields |
|---|---|---|
| story | headline (headline, single line), body (body) | |
| photo | headline (headline, single, optional), caption (caption) | image, zoom 1 to 3, focusX, focusY, minH, maxH |
| map | caption (caption); the four labels (mapLabel, single) | blocksPerPx, lines east/north/south/west {blocks, label, style} |
| box | title (boxTitle, single), body (body) | |
| desk | title (boxTitle, single), body (body), signature (signature, single) | the skin is issue-level (`paper.skin`, `paper.skinModel`), edited from this block's inspector |
| register | title (boxTitle, single), lines (register, one entry per line) | |
| redaction | none | lines (integer >= 1, default 3) |

Masthead: wordmark (wordmark), tagline (tagline), kickerLeft, kickerCentre, kickerRight (kicker), all single line. Page: footer (footer).

Block defaults when added from the toolbox (proposal, placeholder text short and obviously placeholder as in v1): story {headline "Headline", body "Body text."}; photo {image null, zoom 1, focus 0.5/0.5, headline "", caption "Caption.", minH 64, maxH 168}; map as v1; box {title "Box title", body "Body text."}; desk {title "Box title", body "Body text.", signature "Signature"}; register {title "Box title", lines "C-000 Case"}; redaction {lines 3}. Ids `<type>-<n>` as v1.

### 6.5 Migration from version 1 (proposal)

On loading a version 1 file or draft:

1. `theme` = the default theme (6.3). `paper.styles`, `paper.redactions` = `{}`.
2. For each page: if `lead` is an object, insert `{type: "photo", id: lead.id || "lead", span: 2, image, zoom, focusX, focusY, headline: "", caption, minH: 195, maxH: 195}` at index 0 of column 1 (create the column if the page has none); delete `lead`. Columns: drop trailing empty columns (v1 always had three) but keep at least one; a v1 page whose columns 2 and 3 are empty becomes a one-column page. `styles`, `redactions` = `{}`.
3. Text fields: multi-paragraph fields (`body`, `caption`, `footer`) are converted from v1's convention: split on blank lines, join single newlines inside a paragraph with a space, join the paragraphs with "\n". `register.lines` is unchanged. Single-line fields: newlines to spaces.
4. `version` = 2. The status line says "Opened <name> (converted from version 1)".

The draft key becomes `gazette-builder.draft.v2`; on start, if there is no v2 draft but a v1 draft exists under `gazette-builder.draft.v1`, it is migrated and the old key removed.

### 6.6 The sample

sample/issue-001.json is rewritten in version 2 form by the implementer (chunk 1): the two leads become span-2 photo blocks at the top of column 1 of each page; paragraph breaks become single newlines; `version: 2`; a full default `theme`. Copy is otherwise untouched. The sample must still load and export to pages that match beeblecraft-mc/gazette/issues/001/page.png and page-2.png apart from the 7 px shift of section 4.2 and the differences v1 allowed (texture pattern, photo resampling).

"New issue" (section 8.3) no longer loads a preset page; "Load sample" is the way to see issue 1.

## 7. Layout, geometry record, issues and warnings (src/layout.js)

### 7.1 Layout pass (ported, generalised)

Per page: `bodyTop` from the masthead (4.4); footer lines and `target = PAGE_BOTTOM - footerHeight - FOOT_GAP`; column geometry (4.1); spanning blocks measured first (fixed heights) to get each column's start y and each gutter's top (4.2, 4.3); then every column is balanced exactly as v1 section 11 from its start y to `target`, flexible blocks sharing the spare height; then drawn.

Balancing rules carried over, with the classification of 7.4: overflow is an issue, gap is a warning. An empty column gets no gap warning when the whole page is blank (no block on any column); on a page with blocks, an empty column cannot exist (4.1), so the empty-column case only arises on the blank page and is silent.

### 7.2 Render passes (ported, extended)

1. Art canvas: paper fill, masthead, blocks (bitmap text, boxes, map, figure, placeholders, redaction rects for bitmap text and redaction blocks), chains, footer.
2. 2x upscale with the texture mask (v1 section 14), mask colours = `theme.colours.paper` and `paper_shade`; skipped when `theme.texture` is false or when the fast path is active (11.1).
3. Screen pass: photos with frames (v1 section 12.3), vector text runs (5.3), redaction rects for vector text.
4. Preview only: overflow and gap markers (v1 section 11), drawn on the screen canvas as before. Everything else that is editor chrome lives in the overlay (section 8.2), not on the canvas.

### 7.3 Geometry record (proposal)

The layout returns, besides the draw lists, a `geometry` object for the current page that the editor uses for hit-testing and overlays. Art px throughout.

```
geometry = {
  bodyTop, target,
  columns: [{index, x, w, top, bottom}],          // bottom = target
  gutters: [{after, x, w, top, bottom}],          // gutter after column `after`
  masthead: {y0: 16, y1: bodyTop, fields: {wordmark, tagline, kickerLeft, kickerCentre, kickerRight}},
  blocks: [{col, idx, type, id, span, x, y, w, h, fields: {name: textField}, photo: photoRect | null, flexible}],
  footer: {x, y, w, h, field: textField} | null,
  texts: [textField, ...]                         // every text field on the page, for hit-testing
}
textField = {owner, name, role, single, style, x, y, w, h, lines: [{text, start, end, x, y}]}
photoRect = {x, y, w, h, rw, rh, sw, sh, left, top}   // the framing numbers of v1 section 12.2, for pan maths
owner = {kind: "paper"} | {kind: "block", col, idx} | {kind: "footer"}
```

A block's rect spans from its top to its ink bottom (box blocks: the box; photos: headline top to caption bottom). The record is rebuilt on every render; the editor never caches it across renders.

### 7.4 Issues and warnings (feedback)

Every report is `{level, text, page, column, block, owner}` with `level` "issue" or "warning". Issues mean the export will be wrong; warnings are advice.

Issues:

- "Column N overflows by M art px: cut copy or remove a block"
- "<block>: no photo" (the placeholder would export)
- "<block>: photo <name> is missing: re-import it"
- "No glyph for 'ç' (U+00E7)"
- "'<unit>' is wider than its line"
- "Register line does not fit: '...'"
- "Signature wider than its line"
- "Map: ..." (the v1 map fit checks)
- "Officer skin is not 64 by 64; no figure drawn"
- "Font <name> could not be loaded; Salon Pixel used instead"
- "Wordmark is wider than the page even at its smallest size"
- "Unknown block type '<type>'; kept but not drawn"

Warnings:

- "Column N has a gap of M art px: add copy or a photo"
- "Wordmark drawn smaller than its size (N) to fit"
- "Masthead lantern only N art px from the wordmark"
- "Page has N columns; the format was designed for 3" (when N > 3)
- "<block>: photo is upscaled; lower the zoom or use a larger image" (when the framed source is drawn larger than its pixels: `rw > iw` in v1 section 12.2 terms)
- "Ornaments are on but no footer credits Modern Mizunos (CC BY-NC-SA 4.0)": only while at least one of the three sprites is the built-in piece (a theme with three uploaded sprites owes no credit) and only when the issue has at least one block.

The indicator (section 8.1) shows the counts for the whole issue, not just the current page; the list names the page.

## 8. Editor shell (src/index.html, src/ui.js)

### 8.1 Layout (feedback: three panes)

CSS grid, full viewport height: top bar across; below it, left pane 320 px (inspector or theme pane, scrolls), centre stage (flexible, scrolls), right pane 168 px (toolbox). Below 1000 px wide the panes stack: top bar, toolbox as a horizontal strip, stage, inspector; no horizontal page scroll; 16 px gutters. System font 14 px, native controls, editor colours as `:root` tokens with a dark set (v1 section 3); the page canvas is never themed by dark mode.

Top bar, left to right (labels exact, section 15 for the reasoning):

`[Issue title]` `New` `Open .json` `Save .json` `Save as` | `Export page PNG` `Export all pages PNG` `Export text .md` | `Theme` `Help` ... status text at the right.

Tooltips: Save .json: "Save the whole issue (layout, text, photos, theme) as a .json file you can reopen. Ctrl+S". Export text .md: "Write only the words, block by block, as a Markdown file for the journal. This does not save the issue." Export page PNG: "Save this page as a 1200 by 1600 PNG". Export all pages PNG: "Save every page as a PNG".

Stage bar, above the page: page tabs `1` `2` ... and a `+` tab (8.3); zoom buttons `Fit` `50%` `100%` `200%`; at the right the issues indicator:

- a triangle (inline SVG, 20 px) with a "!" inside: red (`--bad`) when there is at least one issue, yellow (#D9A400 light, #E6B422 dark) when there are warnings only, and when there is nothing a small grey "No issues" text instead of the triangle.
- `title` tooltip and `aria-label`: "<w> warning(s), <i> issue(s)" with correct plurals, warnings first, zero parts dropped: "3 warnings, 1 issue", "1 warning", "2 issues".
- Click toggles a popover anchored under it (max height 50 vh, scrolls): a heading "Issues" with one line per issue, then "Warnings". Each line is "Page 2, column 3, west-maze: no photo" and is a button: clicking selects that page and block (or the masthead or footer) and closes the popover. Escape or clicking outside closes it.

The stage: the page canvas (1200 by 1600, CSS-scaled; `image-rendering: auto`) centred on the grey stage with 24 px padding, the overlay layer exactly over it (8.2). Fit is the default zoom; the Fit scale is recomputed on resize.

### 8.2 Overlay layer

`<div id="overlay">` absolutely positioned over the canvas, same CSS size, `pointer-events: auto`; it is the only thing that receives pointer events on the page. Art px to CSS: `css = art * 2 * (canvas.clientWidth / 1200)`. It contains, as needed: hover outline, selection frame with grip (9.0), drop indicators (10.3), the caret and selection canvas (11.2), the text toolbar (11.3), photo controls (12), per-block issue dots (a 10 px red or yellow dot at a block's top right when it has reports), and the blank-page hint. Nothing in it is ever drawn to the export.

The hover outline: 1 px dashed `--accent` around the block under the pointer (not the selected one). Cursor: `text` over text fields, `move` over the grip, `grab` over a photo with an image when its block is selected, `default` elsewhere.

### 8.3 Pages and the blank page (feedback)

`+` opens a small menu: "Blank page" first, then "From preset: Front page, Inside page, Back page, Issue 1 page 1, Issue 1 page 2" (the v1 presets, ported, with the lead as a span-2 block). A blank page has masthead `full` when it is page 1, `half` otherwise, one empty column, empty footer. The masthead texts are the issue's `paper` values, so a blank page shows the wordmark, tagline and the three kickers and nothing else (TBD Q4, default: shared across pages).

"New" creates an issue with the Beeblecraft paper defaults (answer), the default theme, one blank page, no images. It has no issues and no warnings. The blank page shows, in the overlay, centred in the body area: "Drag a block from the toolbox onto the page, or click one to add it." in the editor's muted colour.

Page tabs: click to show; the Page inspector (9.1) has Duplicate, Delete (confirm), Move left, Move right.

### 8.4 Keyboard

Ctrl+S save, Ctrl+Shift+S save as (ported). Ctrl+Z undo, Ctrl+Shift+Z or Ctrl+Y redo (8.5) when no text field is being edited; while editing, the textarea's native undo applies. Delete or Backspace with a block selected and no text being edited deletes the block (no confirm; undo covers it). Escape: end text editing, else clear the selection, else close a popover. Arrow keys while a block is selected and nothing is being edited: Alt+Up/Down move the block within its column, Alt+Left/Right move it to the end of the previous or next column (proposal; a keyboard path for what drag does).

### 8.5 Undo and redo (proposal)

A stack of document snapshots: the serialised issue without image and font data (ids only), pushed on every structural change (add, move, delete, column change, span, page operations, theme change, photo zoom or pan at pointer release) and at the end of each text editing session (11.1), capped at 100. Undo replaces the document (images and fonts are kept by id; an image removed and then undone comes back because removal is only allowed for unused images and the entry's data is kept in a side map for the session). Selection after undo: the same owner if it still exists, else the page.

## 9. Selection and the inspector (feedback: "left side ... only show editable fields of that block")

Selection is one of: nothing (the page), the masthead, a block, the footer. Clicking on the overlay hit-tests the geometry record in this order: text field, photo rect, block rect, masthead area, footer band, else page. A click on a text field selects its owner and starts editing (11.1). A click on a block outside its text selects the block only. The selected block gets a 2 px `--accent` frame and a grip: a 16 px strip above the frame, filled `--accent`, showing "<type> · <id>" in white 12 px and the `move` cursor; the grip is the drag handle (10.2). Masthead and footer selections get the frame without the grip.

The inspector shows only the selected thing:

### 9.1 Page (nothing selected)

Heading "Page N of M". Fields: Masthead `full | half`; "Columns: N" with the note "The page and the format were designed for 3 columns." (always shown, muted); Footer textarea (3 rows; also editable in place); buttons Duplicate page, Delete page, Move left, Move right; "Add page" with the preset select of 8.3. Under a rule: Ornaments checkbox "Lanterns and chains (Modern Mizunos, CC BY-NC-SA 4.0; credit them in a footer)" (issue-level, as v1) and a link-button "Edit theme" that switches the left pane to the theme pane (13).

### 9.2 Masthead

Heading "Masthead". Wordmark, Tagline, Kicker left, Kicker centre, Kicker right (text inputs, bound live to the same fields the in-place editor edits); Masthead `full | half` for this page; the Ornaments checkbox; "Edit theme".

### 9.3 Block

Heading "<type>", then Id (text; shown in reports), then the type's fields of 6.4 as v1 did (text inputs and textareas bound live; selects; number inputs), then:

- photo: Photo: thumbnail (or "no photo"), buttons "Choose from this issue" (opens a list of the issue's photos with thumbnails and names, pick one), "Upload photo" (file input, `image/*`, multiple; the first goes here, the rest become new photo blocks after this one), "Remove photo"; Zoom and Focus X/Y range inputs (also driven by wheel and drag, 12); Height: radio "Flexible" (min/max number inputs) or "Fixed" (one number); when `span > 1` the Height control shows only the fixed height with the note "A photo across several columns keeps a fixed height".
- desk: after the text fields, "Officer skin": Choose/Replace (PNG 64 by 64), Remove, model `auto | classic | slim`, 4x preview (v1 section 13 controls moved here).
- redaction: "Lines" (integer) with the note "Drawn as a solid block in the theme's redaction colour. It holds no text."
- Every block: "Span columns" select from 1 to the columns to its right plus one, shown only when the block is first in its column; "Duplicate block", "Delete block".

Text styles are not shown in the inspector; the toolbar edits them (11.3). Redactions are not listed in the inspector either; they are visible on the page.

### 9.4 Footer

Heading "Footer". The footer textarea; the note "An empty footer removes the band and lets the columns run to the bottom."

### 9.5 Live binding

Inspector inputs write to the document and call `changed()` (debounced render 60 ms, draft 1 s). In-place edits update the matching inspector input's value without rebuilding the pane. The pane is rebuilt only when the selection or the structure changes, so focus is never stolen from an input while typing.

## 10. Toolbox and drag and drop (src/editor.js)

### 10.1 Toolbox (feedback)

The right pane lists the block types as tiles, in this order: Story, Photo, Box, Desk, Register, Map, Redaction. A tile is 56 px tall: the name in 14 px and a one-line muted description ("Headline and paragraphs", "A framed screenshot with caption", "Shaded box with a title", "The officer's box with the skin figure", "Case list, one line per entry", "Line map from spawn", "A solid black block"). Tiles are `draggable` (HTML5 drag and drop, data type `application/x-gazette-block` carrying the type). Clicking a tile adds the block at the end of the selected block's column, or of column 1 when nothing is selected, and selects it (this is the touch and keyboard path).

### 10.2 Moving a block

The grip (9.0) is `draggable` with data type `application/x-gazette-move` carrying `{col, idx}`. Pointer-based dragging of blocks without the grip is not offered: a drag that starts on text selects text (11.2), and a drag on a photo pans it (12).

### 10.3 Drop targets and previews (feedback: "+" previews, unlimited columns, told about 3)

On every `dragover` over the overlay the pointer position is converted to art px and classified, in this order:

1. **New column at the left edge**: `x < LEFT + 20`. **New column at the right edge**: `x > RIGHT - 20`.
2. **New column in a gutter**: x within a gutter's range widened by 4 px each side.
3. **Into a column**: the column whose x range contains x (or the nearest column when x is in the margins but not in an edge zone). Insertion index from y: the block whose vertical centre is below y gives the index of insertion before it; below the last block means the end; y above `bodyTop` means index 0.
4. Over the masthead or footer band and not in an edge zone: no target (`dropEffect = "none"`, cursor not-allowed).

Previews in the overlay:

- Into a column: a 2 px `--accent` line across the column width at the insertion y (between blocks: midway in the STORY_GAP; at the end: STORY_GAP below the last block; empty column: at the column's top). While dragging a move, the moved block's own position is skipped (dropping on itself does nothing).
- New column: a translucent rectangle where the new column would be, from `bodyTop` to `target`, width `colW(n + 1)`, dashed 1 px ink outline, fill `ink_faint` at 30 percent; at the left edge it sits at x = LEFT, at the right edge at x = RIGHT - colW(n + 1), in a gutter centred on the gutter. In its middle a 28 px circle in `--accent` with a white "+" (text, not an icon font). Under the circle a label in 12 px: "New column" and, when `n + 1 > 3`, a second line "4 columns; the format was designed for 3" (the number filled in).

Drop: insert the block (a new one from the toolbox, or the moved one) at the target; for a new column, splice a new column array into `page.columns` at the right index first, then insert the block as its only member. After a drop the block is selected, the page re-renders, a snapshot is pushed (8.5).

Column widths change on every column count change; blocks reflow; flexible photos rebalance. The warning of 7.4 reminds about 3 while the page has more.

### 10.4 Column removal

After a move, a delete or a file drop, any column left without blocks is removed, except that a page keeps at least one column. When a move empties its source column and the target was to the right of it, the target index shifts left by one; implement the move as remove, then compact, then insert at the adjusted index. The selection follows the moved block.

### 10.5 Files from the file explorer (feedback)

A drag whose `dataTransfer.types` includes `Files` is classified like a block drag, with one extra target first: over the photo rect of a photo block (with or without an image), the photo frame highlights (2 px `--accent` inside the frame) and the drop assigns the first image file to that block, replacing its image; further files become new photo blocks after it. Elsewhere the same targets as 10.3 apply and each image file becomes a new photo block (caption "Caption.", flexible height) in drop order. Files that are not images are ignored with the status "Skipped <name>: not an image". Import is v1's (downsize to 1200 px, JPEG 0.85). `dragover` must `preventDefault` on the whole stage so the browser never navigates to the dropped file.

## 11. In-place text editing (feedback: "writeable directly on the page itself")

### 11.1 The editing session

Clicking a text field (9.0) starts a session on that field:

- The field's text goes into the hidden textarea `#editbox` (`position: absolute; opacity: 0; width: 1px; height: 1px; white-space: pre; font-size: 16px` so iOS does not zoom; moved to the caret's CSS position on every caret change so IME candidate windows appear near the text). It is focused; `selectionStart = selectionEnd =` the index under the click (11.2).
- `input` events: the new value is written to the field, redaction ranges adjusted (14.3), the page re-renders on the fast path (no texture; texture is re-applied 400 ms after the last change), the caret overlay redraws, the inspector's matching input updates (9.5).
- Selection is read from the textarea after `input`, `keyup`, `pointerup` and on a 60 ms timer while the session lasts, and drawn (11.2).
- Enter: in a single-line field, ends the session. In a multi-paragraph field, inserts "\n" (a new paragraph; a new entry in `register.lines`). Shift+Enter is the same as Enter. Tab: ends the session (focus moves on normally).
- Escape ends the session. Clicking anywhere outside the field ends it (and the click is then handled normally: it may start a session on another field). Blur of the textarea ends it unless focus went to the toolbar (toolbar controls `preventDefault` on `pointerdown` so the textarea keeps focus).
- Ending a session pushes one undo snapshot if the text changed, and if a single-line field is now empty where the role needs text (headline is fine empty; wordmark empty is fine too), nothing special happens: empty is allowed everywhere.

While a session is active the block stays selected and the toolbar (11.3) is shown above the field.

### 11.2 Caret, selection, hit-testing

A `<canvas id="caret">` the size of the page canvas sits in the overlay, `pointer-events: none`. From the field's `lines` (7.3) and the textarea's selection:

- Caret: the line with `start <= index < end`, or the last line when `index == text.length`; x = `line.x + caretX(line.text, min(index - line.start, line.text.length))` (an index inside trailing spaces sits at the drawn end of the line); drawn as a 1 art px (2 screen px) bar from the line's em top to em bottom in the field's colour, blinking 530 ms on, 530 ms off; blinking resets on every change.
- Selection: for each line intersecting `[a, b)`, a rect from caretX(a') to caretX(b') (clamped to the line's drawn text; a selection crossing a line end extends to the line's drawn end) over the em height, filled `--accent` at 35 percent.
- Pointer to index: the line whose y range contains the pointer y (above the first: first line; below the last: last line), then the index whose caret x is nearest the pointer x within the line's text, offset by `line.start`.
- Pointer down on the field being edited sets the caret; pointer drag extends the selection (the anchor is the down index; `setSelectionRange(min, max, direction)`); double-click selects the word around the index (letters, digits and `-`); Shift+click extends.
- Keyboard navigation, word jumps, select-all, copy, cut, paste and undo inside the field are the textarea's own; every change arrives as `input`.

### 11.3 The text toolbar (feedback: "word style")

Shown while a session is active, in the overlay above the field (below it when the field is within 40 px of the stage top), horizontal, editor-styled:

`[Font select] [Size] [Colour swatch] [Redact] · "applies to this text"`

- Font select: "Salon Pixel" first, then every uploaded font by name, then "Upload font..." (opens a file input accepting .ttf .otf .woff .woff2; on success the font is added to the theme (6.3) and selected).
- Size: for Salon Pixel a select of 11, 22, 33, 44 labelled "11 (1x)" ... "44 (4x)"; for a vector font a number input 6 to 120 with a step of 1. Switching fonts snaps the size to the nearest allowed value.
- Colour swatch: shows the effective colour; click opens a popover with three rows: the theme's colour tokens as named swatches (paper, paper_shade, ..., redaction), the saved custom colours as swatches, and a hex input with "Save colour" (adds to `theme.savedColours`, deduplicated, at most 24; a saved swatch has a small "x" to remove it on hover). Picking sets the field's colour (token name when a token swatch was picked, hex otherwise).
- Redact: toggles redaction on the current selection (14.2); disabled when the selection is empty.

Font, size and colour apply to the whole field (TBD Q2, default) and are stored as the field's style override (5.1): `{font, size, colour}` merged over the role default; an override equal to the role default is deleted. The text "applies to this text" (muted, 12 px) states the scope so no one expects a word-level change.

Every toolbar change re-renders immediately and pushes an undo snapshot.

### 11.4 Fonts

Uploading reads the file (4 MB limit, else "Font file is over 4 MB"), stores it as a data URL in `theme.fonts` under a new id `font-<n>` with its file name, loads it (5.3; a load failure removes the entry and shows "Could not load <name> as a font"). Fonts are listed in the theme pane (13.4) with where they are used; an unused font can be removed. Salon Pixel is always present and is the default for every role (feedback: "by default it should already use the font we have here").

## 12. Photos in place (feedback: "zoomable and pannable", "uploaded directly to image box containers")

With a photo block selected and an image assigned:

- Wheel over the photo rect: zoom by 0.05 per notch (sign of `deltaY`; up zooms in), clamped 1 to 3, `preventDefault` so the stage does not scroll. The zoom is around the frame centre, which keeps focus unchanged; the inspector's Zoom range updates.
- Pointer drag inside the photo rect (threshold 3 CSS px, else it is a click): pan. With the framing numbers from the geometry (`rw, rh, sw, sh`), `focusX -= dxScreen / (rw - sw)` when `rw > sw` (else unchanged), likewise Y; clamped 0 to 1; `dxScreen` is the pointer delta in screen px (CSS delta divided by the CSS scale). Render on every move (fast path), snapshot on release.
- A photo block without an image shows, in the overlay centred in the photo rect, a button "Add photo" (opens the file input of 9.3) and the text "or drop an image here" when the rect is at least 40 art px tall. The canvas still draws v1's "no photo" placeholder, which is what would export, and the block has the issue "no photo".
- Height handle: a 6 px tall grab strip at the bottom edge of the photo rect, `ns-resize` cursor; dragging sets the block to Fixed height = the new height in art px (minimum 16); the inspector switches to Fixed. The flexible or fixed choice is TBD Q3 (default: new photos are flexible as in v1).

Span is set in the inspector (9.3); it is not dragged (later).

## 13. Theme pane (feedback: "theme should be editable ... colors adjustable as hex codes")

The `Theme` button (top bar) and "Edit theme" (inspector) switch the left pane to the theme pane; "Back to inspector" at its top returns. Sections, each `<details open>`:

### 13.1 Colours

One row per token: name, a native `<input type="color">` swatch and a hex text input (`#rrggbb`, validated on blur; invalid text is reverted), and "Reset" to the default. Changing `paper` or `paper_shade` changes the texture mask colours (7.2). The redaction colour is a token like the others.

### 13.2 Text styles

One row per role (6.3): font select (as 11.3), size, colour (the popover of 11.3), bold checkbox, tracking number (0 to 4; bitmap only, disabled for vector fonts), "Reset". These are the role defaults; field overrides from the toolbar sit on top.

### 13.3 Sprites

Three rows: Lantern (masthead flankers and box icon), Footer lantern, Chain. Each shows the current image at 4x (`image-rendering: pixelated`), "Replace (PNG)" (file input; must decode as PNG, at most 64 by 64, else "Needs a PNG up to 64 by 64"), "Reset to default". Replacing a sprite stores `{name, data, w, h}` in `theme.sprites`; the renderer recomputes the alpha bounding box (v1 section 7) and uses the sprite's own height as the chain tile height. A note under the rows: "The default pieces are from Modern Mizunos (CC BY-NC-SA 4.0). Pages exported with any of them on need the credit in a footer. Your own sprites carry your own terms." The credit warning (7.4) applies only while a default piece is in use.

### 13.4 Fonts

The uploaded fonts: name, size in KB, "used by: body, headline-override in intro" or "unused"; "Remove" enabled only when unused; "Upload font" below.

### 13.5 Texture, export and import

"Paper texture" checkbox (`theme.texture`). "Export theme" writes `<slug>-theme.json` (6.3, including sprites and fonts) through the saveFile path of v1 section 17.3. "Import theme" opens a `.json`, validates `format`, replaces the theme (confirm when the current theme is not the default), reloads fonts and sprites, re-renders. "Reset theme" restores the default theme (confirm).

Every theme change renders immediately and pushes an undo snapshot.

## 14. Redaction (feedback)

### 14.1 Redaction block

Block type `redaction` with `lines` (default 3): a filled rectangle in `theme.colours.redaction` over the block's full width, height `lines * pitch(body style)`, no border, no text. Its ink bottom is the rectangle bottom. It holds nothing, so there is nothing to leak. In the Markdown export it is skipped.

### 14.2 Redaction marks in text

Any text field can carry redaction ranges: `owner.redactions[field] = [[start, end), ...]`, sorted, non-overlapping, merged when adjacent. Rendering: for every line, the parts of the line inside a range are not drawn as glyphs; instead a rectangle in the redaction colour covers them from the start x of the first redacted character to the end x of the last (its advance including tracking) over the em height. Bitmap: on the art canvas; vector: on the screen canvas in the screen pass. The glyphs under a mark are never drawn anywhere, in preview or export, so nothing can be recovered from the PNG.

The Redact toolbar button: if the current selection `[a, b)` is wholly inside existing ranges, remove `[a, b)` from them (unredact); otherwise add `[a, b)` and merge. The caret and the selection overlay work the same over redacted text (the user can still edit under a mark; the characters are simply not drawn).

### 14.3 Keeping ranges correct while typing

On each `input`, compare the old and new field text: common prefix length `p`, common suffix length `s` (with `p + s <= min(oldLen, newLen)`), removed range `[p, oldLen - s)`, inserted length `k = newLen - p - s`, `delta = k - (oldLen - s - p)`. For each range `[a, b)`: if `b <= p`, unchanged; if `a >= oldLen - s`, shift both by `delta`; if the range contains the whole removed region (`a <= p` and `b >= oldLen - s`), set `b += delta` (typing inside a mark extends it); otherwise clip: the part before `p` stays, the part after `oldLen - s` shifts by `delta`, the middle is dropped; empty ranges are removed.

### 14.4 Redacted text in the saved file (TBD Q1)

Default (build against): the `.json` keeps the real text and the ranges; the author can unredact later. The questionnaire asks whether that is wanted or whether Save should replace redacted characters with U+2588 (full block) so the file never holds them. The Markdown export always writes U+2588 for each redacted character (proposal: the journal file is for posting; nothing redacted on the page should be readable in its copy).

## 15. Saving and exporting: names (feedback: "i thought export copy was json?")

Nothing changes in what the actions do (v1 section 16 and 17, ported); the names and the explanations do:

| Button | Does | File |
|---|---|---|
| Save .json | the whole issue: layout, text, photos, fonts, theme | `<slug>.json` (Ctrl+S overwrites the opened file in Chrome and Edge) |
| Save as | the same, to a new file | |
| Open .json | opens an issue file (v1 or v2) | |
| Export page PNG | this page as an image | `<slug>-page-<n>.png` |
| Export all pages PNG | every page, in order (feedback) | one file per page |
| Export text .md | only the words, block by block, journal format (v1 section 20, built in v1) | `<slug>.md` |

Status messages name the thing: "Saved issue to gazette-no-1.json 18:33", "Exported 2 pages 18:34", "Exported text to gazette-no-1.md". The Help panel has a section "Save versus export" in three sentences: Save writes the issue file you reopen and share with a co-editor; Export PNG writes the pictures you post; Export text writes the words only. The export confirm dialog (v1 section 17.2) lists issues first, then warnings, then the reminder text.

Draft autosave (v1 section 16.2) is unchanged apart from the v2 key (6.5).

## 16. Help, README, header comment (chunk 6)

Help panel sections: Making an issue (toolbox, drag, click to type, photos by drop); Columns ("start with one; drop a block at an edge for another; three is the format"); Text (click to type, the toolbar, fonts, colours, Redact); Photos (drop, wheel to zoom, drag to pan); Theme; Issues and warnings (what the triangle colours mean, click for the list); Save versus export (15); Before posting (v1's reminder text); The font (Salon Pixel character list, generated); Licences (as v1). No emojis; no vendor names (answer).

README: rewrite "Making an issue" for the direct editor; keep the Pages link, offline use, saving, the issue file (point to this file's section 6), building, licences, Support link.

Header comment in index.html: unchanged notices; add that uploaded fonts and sprites stay in the user's files and are never part of the site.

## 17. Runtime rules carried over

All of v1 section 3: plain ES2020, no framework, no bundler, no external resource, no network (FontFace is fed from decoded bytes, not a URL), works from `file://` and from Pages, storage access in try/catch, phone width works (stacked panes; drag and drop needs a mouse, the toolbox click path works everywhere), no emojis.

Rendering performance: the fast path (no texture) during typing, panning and zooming; the full render 400 ms after the last change and on every structural change. The texture layer cache per page index is ported.

## 18. Build chunks

Each chunk leaves a working tool: `python build.py` succeeds, index.html opens from disk with no console errors, the sample loads and exports. Chunks are built in order; a chunk's checks are the implementer's own (no audit, user instruction).

### Chunk 1: model v2, text engine, generalised layout

Scope: sections 4, 5, 6, 7.1 to 7.4. Split app.js into the files of section 3. Text engine with styles, bitmap and vector implementations, wrapping with indices, redaction skip ranges. Columns formula, spans, gutters, masthead and footer by metrics. Theme in the document with defaults; migration from version 1; sample rewritten as version 2; geometry record and the issue/warning classification. The v1 panel UI is kept running on top with the minimum needed: the Lead section removed, a "Span" number on first blocks, "Add column" and "Remove empty column" buttons in the Columns section, the renamed top-bar buttons of section 15, the warnings list showing level. Vector text drawn in the screen pass; a console hook `GazetteBuilder.loadFont(file)` to test it before the UI exists.

Checks: the sample exports two pages matching the Python pages except the 7 px shift of 4.2 (balance log, printed per column as in v1: columns not under the lead are unchanged, page 1 map 118 and south-bridge 82, page 2 west-maze 103; a column under the lead has 7 art px less flexible height in total, so page 1 south-water 87 and south-snow 75, page 2 west-tunnel 58, and page 2 column 2 shares the 7 between west-bridge and west-temple as 4 and 3, giving 81 and 81; the implementer confirms the log against the render); a v1 file opens, is converted, re-saves as version 2 and reopens identical; a page with 1, 2, 4 and 5 columns lays out with the widths of 4.1; a span-2 story wraps to 372 px; a redaction block draws black; a redaction range over "Beeblecraft" in the intro draws a black box and the exported PNG has no glyphs there (zoom in); loading a .ttf through the hook and setting the body style to it draws anti-aliased text on the screen canvas with no texture over it; the metrics make the default masthead land on y 16, 31, 36, 68, 73, 85, 88, 94.

### Chunk 2: shell, selection, inspector, pages, indicator, undo

Scope: sections 8, 9, 7.4's indicator, 8.5. The three panes; the overlay with hover and selection frames and grips; hit-testing from the geometry; the inspector per selection with live binding; toolbox tiles with click-to-add; page tabs with the `+` menu and blank pages; New gives a blank issue with no reports; the issues triangle, tooltip and popover with click-to-select; undo and redo; keyboard of 8.4. The v1 panel is removed.

Checks: New shows a blank page with the five masthead texts and the hint and "No issues"; clicking a toolbox tile adds a block to column 1 and selects it; clicking a block shows only its fields; clicking the wordmark shows the masthead inspector; the triangle turns red when a photo block has no image and yellow when only a gap remains; the tooltip reads "1 warning, 1 issue"; clicking a popover line selects that block; Ctrl+Z undoes an add; at 400 px wide the panes stack and nothing scrolls sideways.

### Chunk 3: drag and drop, columns, file drops

Scope: section 10. Toolbox drags, grip moves, edge and gutter "+" previews, column creation and automatic removal, the 3-column warning and labels, image files dropped onto photo blocks and onto the page.

Checks: on a blank page, dropping a story at the right edge makes 2 columns with the story in column 2; dropping at the left edge makes 3 with widths 178; a fourth shows the "4 columns; the format was designed for 3" label and the warning afterwards; dragging the last block out of a column removes the column; dropping a PNG from the file explorer onto a photo block replaces its image; dropping three images onto an empty area makes three photo blocks; the drop never navigates the tab.

### Chunk 4: in-place text, toolbar, fonts, colours, redaction marks

Scope: sections 11, 14.2, 14.3, 14.4 default. Hidden textarea sessions, caret and selection canvas, pointer selection, Enter rules, toolbar with font, size, colour popover and saved colours, font upload, Redact toggle.

Checks: clicking in the intro body places the caret at the clicked character; typing appears on the canvas within a frame and the texture returns after a pause; Enter in a body makes a new paragraph, Enter in a headline ends editing; the caret in Salon Pixel sits exactly on the glyph boundary at 100 percent and 200 percent zoom; select a word, Redact: black box, no glyphs in the export; type inside the mark: the mark grows; undo inside a session is the textarea's, Ctrl+Z after Escape reverts the whole session; uploading a .ttf and picking it for a headline draws it and the .json reopens with it; a saved custom colour appears in the popover after reopening the file; the inspector field mirrors the typed text live.

### Chunk 5: photos in place

Scope: section 12. Wheel zoom, drag pan, "Add photo" overlay button, height handle and fixed/flexible, span control behaviour for photos, upscale warning.

Checks: wheel over the lead zooms in steps of 0.05 and the inspector slider follows; dragging pans and stops at the edges; the handle fixes a height and the column rebalances around it; a span-2 photo shows only the fixed height control.

### Chunk 6: theme pane, docs, final pass

Scope: sections 13, 16. Colours, text styles, sprites, fonts list, texture toggle, export and import theme, reset; credit warning tied to default sprites; Help, README, header comment; the v1 acceptance list (v1 section 19) re-run where it still applies (saving layers, File System Access, skin, Pages URL, phone width, no emojis, no vendor names).

Checks: changing `paper` to a blue hex re-textures the page in blue; replacing the chain with a 16 by 24 PNG tiles at 24 rows; replacing all three sprites silences the credit warning; a changed body style re-wraps every story; Export theme then Reset then Import brings the theme back; `grep -ri` for emojis and vendor names over the repository finds nothing; build size under 8 MB.

## 19. Later (not in v2)

- Word-level styles inside a paragraph (mixed fonts or colours in one field): TBD Q2 option B; needs a run model and is a spec revision.
- Dragging the span handle of a block; blocks spanning from a column other than where they sit.
- Touch drag and drop; pinch zoom on photos.
- Editable layout constants (margins, gutter, story gap) in the theme.
- A pixel-font rendering mode for uploaded bitmap-style TTFs (snap to the art grid).
- ZIP export; phone preview; shared online saving; 64 by 32 skins; contain fit and rotation; auto-flow of stories across columns (all from v1 section 20).

## 20. Open questions

gazette/tool-questionnaire-2.md in the planning repository holds the user decisions: Q1 redacted text in the saved file (14.4), Q2 scope of the text toolbar (11.3), Q3 photo heights by default (12), Q4 masthead shared across pages or per page (8.3). Each has a default stated in its section, and the build proceeds on the defaults until answered; Q2 option B and Q4 option B need a revision of this spec before the affected chunk (4 and 1 respectively).

Answered 2026-10-02: all four answers are the defaults (A), so the spec builds as written.

## Build log

### Chunk 1 (2026-10-02)

- app.js is split into src/text.js, model.js, layout.js, render.js, editor.js and ui.js. build.py inlines font.js then those six, one `<script>` each, in the order of section 3. The files are plain top-level scripts sharing one global scope: constants and helpers live in model.js, the text engine is the `TX` object, Salon Pixel stays `Font` (it now also exports `glued` and `MISSING_W`).
- Text engine, theme, migration, spans, gutters, masthead and footer from metrics, the geometry record and the issue/warning reports are built as specified. Vector text runs are recorded during the art pass and drawn after the texture. Redaction ranges in any field draw as boxes with no glyphs underneath (bitmap and vector), and the Markdown export writes U+2588 for them.
- Checked: the sample's masthead and column 3 are pixel-identical to the Python pages, columns under the lead are identical after the 7 px shift, and the rest differs only by photo resampling. A v1 file opens, says "converted from version 1", saves as version 2, and reopens and re-saves byte-identical. The 1, 2, 4 and 5 column pages lay out by the 4.1 formula. A span-2 block takes the width of two columns and moves the gutter chain down. The redaction block and the "Beeblecraft" redaction draw black with no glyphs in the export. Georgia loaded through `GazetteBuilder.loadFont` draws anti-aliased with no texture over it. Masthead rows: 16, 31, 36 (em top 28), 68, 73 (em top 71), 85, 88, body top 94.
- Deviation, column widths: section 4.1's n = 4 example (129, 129, 128, 128) contradicts its own formula and does not fill FULL_W. The formula is implemented: 130, 130, 129, 129 at x 17, 163, 309, 454 (n = 5: 101, 101, 100, 100, 100).
- Deviation, balance log: the numbers in chunk 1's checks came from older copy. Today's Python run (render_issue.py with the current J-001 copy) gives page 1 south-water 88 and south-snow 70, so v2 gives 81 and 63. Page 1 column 3 (map 118, south-bridge 82) and page 2 (west-tunnel 58, west-bridge 81, west-temple 81, west-maze 103) match the spec.
- Deviation, sample: with STORY_GAP below the lead, south-snow (63) and west-tunnel (58) fall under v1's 64 minimum and would report overflows of 1 and 6 px. The rewritten sample sets their minH to 56. The heights and pixels are unchanged and the sample loads with no reports. A version 1 file of issue 1 still converts with those two overflow issues.

### Chunk 2 (2026-10-02)

- The three-pane shell replaces the v1 panel: top bar, inspector (page, masthead, block, footer), stage bar (page tabs, + menu, zoom Fit, 50%, 100%, 200%, issues indicator and popover), the overlay (hover outline, selection frame and grip, per-block issue dots, blank-page hint), the toolbox with click-to-add, undo and redo (snapshots without image and font data, data kept in a side map), and the keyboard of 8.4.
- Checked: New shows a blank page with the five masthead texts, the hint and "No issues". A toolbox tile adds to column 1 and selects the block. Clicking a block shows only its fields, and clicking the wordmark shows the masthead. The indicator is red with "1 warning, 1 issue" for an imageless photo, and yellow with "1 warning" once only a gap is left. A popover line selects its block. Ctrl+Z undoes an add and Ctrl+Y redoes it. Alt+Up reorders. The + menu adds blank and preset pages. At 400 px the panes stack with no sideways scroll. The sample loads with no reports and exports the same as in chunk 1 (one pixel differs by one level in a photo), and the selection never reaches the export. Save, reopen and save again is byte-identical. The page opens from file:// with no console errors and no requests. A grep finds no vendor names and no emojis.
- Deviations and notes for the next chunks:
  - "Load sample" sits in the top bar after Help, because section 8.1's bar has no place for it.
  - Escape closes an open popover first, then leaves an inspector field, then clears the selection.
  - The blank-page hint uses the fixed light-mode muted grey (#6b6760), because it sits on paper in both themes.
  - The theme pane only has "Back to inspector" and the Paper texture checkbox until chunk 6.
  - Deleting a block already removes the column it empties (10.4), using `compactColumns`.
  - The Help text got a short interim update for the new editor; chunk 6 rewrites it.
  - v1's Images list is gone. "Remove photo" unassigns the image but keeps it in the issue, so it can be chosen again. Nothing prunes unused images yet.
- For chunk 3: the grip (`#ovGrip`) is not draggable yet and the tiles are not `draggable`. `moveBlockTo(page, fromCol, fromIdx, toCol, toIdx)` already does remove, compact, adjust and insert (10.4), and `fixSpans` drops spans from blocks that are not first. `hitTest`, `artPoint` and `place` in editor.js convert between the pointer and art px. Call `structural()` after a change (inspector rebuild, render, draft, undo snapshot); `changed()` is the debounced live path. The geometry of the shown page is `S.geometry`, and reports are `S.reports`.
- For chunk 4: clicking a text field selects its owner but does not start a session. `hitTest` returns `{kind: "text", field}` with the field's line records (absolute indices, x, y) ready for the caret. `renderPage(..., {fast: true})` already skips the texture.

### Chunk 3 (2026-10-02)

- Toolbox tiles drag onto the page (`application/x-gazette-block`), the grip drags a block (`application/x-gazette-move`), and image files drop from the file explorer. The overlay classifies every `dragover` as section 10.3 and 10.5 say and shows the insertion line, the new-column rectangle with the "+" and its labels, or the photo-frame highlight. Drops outside the page are swallowed on the whole window, so a file never opens in the tab.
- Checked: on a blank page a story dropped at the right edge gives 2 columns (275 each) with the story in column 2; one dropped at the left edge gives 3 columns of 178. A fourth column's preview reads "New column" and "4 columns; the format was designed for 3", and after the drop the warning is listed. Dragging a column's last block into another column removes its column (undo and redo restore and repeat it). A PNG dropped on a photo block assigns it, and another replaces it. Three images and a .txt dropped on empty paper make three photo blocks with "Imported 3 images; Skipped notes.txt: not an image". A real file drop (playwright-cli `drop`) into a gutter makes a new middle column with the photo. Drops on the stage, the inspector and the toolbox are prevented and the URL never changes. The sample exports unchanged.
- Deviations and decisions:
  - Toolbox drops keep empty columns, because 10.4 lists only moves, deletes and file drops, and the check "a story at the right edge makes 2 columns with the story in column 2" needs the blank page's empty column to stay. So a page can hold an empty column next to blocks until the next move or delete; it gets no gap warning. Section 7.1's "an empty column cannot exist" does not hold after such a drop.
  - Moves and file drops remove every empty column, not only the source one (10.4 literally).
  - Masthead versus "y above bodyTop means index 0": y above `bodyTop - 5` (the masthead's last rule) is no target; the 5 px band below it inserts at index 0.
  - A gutter is a new-column target only below its own top. Above that, where a spanning block covers it, the pointer falls through to the nearest column.
  - Dropping a block on itself does nothing, and so does dragging a column's only block into a new column right beside its own.
  - Moving a block anywhere clears its span (4.2: "moving a spanning block to any other position").
  - The new-column preview's count, width and label use the column count after the drop, so a move or file drop counts the columns left after compaction.
  - Tiles are `div role="button"` with tabindex, not `<button>`, because some browsers never start a drag on a button. Click, Enter and Space still add the block.

### Chunk 4 (2026-10-02)

- In-place editing as section 11: the hidden `#editbox` textarea, the caret and selection canvas `#caret`, pointer, drag, Shift+click and double-click selection, the Enter, Tab and Escape rules, the fast render with the texture back 400 ms later, the inspector mirrored live, one undo snapshot per session. The text toolbar has the font select (Salon Pixel, uploaded fonts, "Upload font..."), the size (11 to 44 select for Salon Pixel, 6 to 120 number for a vector font), the colour popover (theme tokens, saved colours with a remove "x", hex input with "Save colour") and Redact. Redaction ranges are kept through edits as 14.3, the .json keeps the text (14.4 default) and the Markdown writes U+2588.
- Checked: a click on the "B" of "Beeblecraft" in the intro puts the caret at index 4. Typed text is in the canvas and the inspector on the same event, the paper is flat right after and textured again after 700 ms. Enter in the body adds a paragraph and keeps editing; Enter in a headline ends it. Inside a session Ctrl+Z is the textarea's (Chrome undoes each test keystroke separately); after Escape one Ctrl+Z reverts the whole session. At 100 and 200 percent the caret is at screen x 78 = 2 x its art x, on the empty tracking column after a glyph whose last column has ink, and the caret canvas sits exactly on the page canvas. Double-click selects "Beeblecraft", Redact marks [4, 15), typing inside grows it to [4, 17) and typing before shifts it. In the exported PNG all 3124 pixels of the mark are #000000; the unredacted export has 612 ink pixels in the same rectangle. A footer range can be redacted and unredacted from a drag selection. Georgia uploaded for the "South line" headline draws with the vector engine, a size of 26 and the saved colour #7A1F1F apply, and after Save, New and Open the file is identical, the font loads and the saved swatch is in the popover. The caret in the Georgia headline sits at the measured advance. Wordmark typing mirrors into the masthead inspector. At 400 px the toolbar wraps and nothing scrolls sideways. Chunk 2's checks still pass from file:// with no console errors and no requests. Sample, New, export all, save and reopen work end to end; the vendor and emoji grep finds nothing.
- Deviations and decisions:
  - Selection now happens on `pointerdown`, not `click`. The overlay cancels `mousedown` (except on its buttons, inputs, the toolbar and the grip) so the textarea keeps focus.
  - Hit areas: a single-line field is hit on its ink, a paragraph field on its wrapping width, an empty field one em high. Fields with text win over empty ones, and a photo's empty optional headline is not clickable (it would cover the top of the photo).
  - The toolbar moves above the grip when it would cover it, and below the field when there is no room above the stage top.
  - "Save colour" saves and applies the colour; hex is stored as "#RRGGBB" in capitals; past 24 the oldest saved colour goes.
  - A session ends when focus goes anywhere but the textarea or the toolbar while the window has focus, so a file dialog or another app does not end it.
  - Inspector text inputs adjust redaction ranges the same way (14.3), so a mark stays on its words whichever side the text is typed in.
  - Redact shows `aria-pressed` when the selection is inside a mark (it will unredact). Uploaded fonts that failed to load are disabled in the select.
  - Testing note: choosing "Upload font..." opens the file chooser only with user activation (a real selection gives it). playwright-cli holds that chooser as a modal, so tests put the file straight into `#fileFont` with `setInputFiles`.
- For chunk 5: `onOverlayDown` in editor.js handles a pointerdown in this order: toolbar and grip ignored, an active session's own field, then `hitTest` and `select`. Photo panning goes in there before `select` for `hit.kind === "photo"`. `renderFast()` renders without texture, re-renders in full 400 ms later and schedules the draft; call `commit()` on pointer release. `drawOverlay()` ends with `drawEditing()`; photo controls ("Add photo", the height handle) can be drawn in `drawOverlay`, and buttons inside the overlay already keep their default mousedown. The file-drop path onto photo rects is done (`dropTarget` kind "photo"). `#overlay [hidden]` is `display: none`.

### Chunk 5 (2026-10-02)

- Photos in place as section 12: the wheel over the selected photo zooms by 0.05 per notch (1 to 3, the stage does not scroll, the Zoom slider follows, one undo snapshot 400 ms after the last notch); a drag on a photo with an image pans it on the fast path, the Focus sliders follow, and the release pushes one snapshot; "Add photo" with "or drop an image here" sits over every photo block without a usable image and opens the photo picker for that block (the first image goes in, the rest become photo blocks after it, as the inspector's Upload photo, which now shares `uploadPhotosInto`); the selected photo has a 6 px `ns-resize` strip on its bottom edge that sets a fixed height (16 to 700 art px) and switches the inspector to Fixed on release.
- Fix from chunk 3: a column with no blocks on a page that has blocks elsewhere now reports the warning "Column N is empty" (yellow triangle and the list). A blank page's single empty column stays silent (7.1). The toolbox drop flow still keeps the empty column.
- Checked: wheel over the unselected lead does nothing; selected, three notches give 1.15 with the slider at 1.15, one notch out 1.10, clamped at 3 and 1; at zoom 3 the lead reports "photo is upscaled" and at 1 it does not. Dragging the lead at zoom 1.5 by 50 by 20 CSS px at 100 percent moves the crop 100 by 40 screen px, a long drag stops at left 0 and top 0, and 20 CSS px back moves it 20 screen px at once (no dead zone). A press without movement keeps the focus; Ctrl+Z undoes a pan in one step. The span-2 lead shows only the fixed height with its note. Dragging south-bridge's handle up 20 art px gives minH = maxH = 62, Fixed checked, and a 20 px gap warning; dragging far up stops at 16; Flexible restores 64 and 168 and the column rebalances to 82. Fixing the lead at 180 gives the 15 px to south-water (81 to 96). Add photo with two images fills the block and adds a second photo block. A story dropped at the right edge of a blank page reports "Column 1 is empty"; New reports nothing. From file:// the sample loads with no reports, exports two pages, saves, reopens after New and re-saves byte-identical, with no console errors and no requests.
- Deviations and decisions:
  - Pan is one to one: the new crop left is the start left minus the pointer delta in screen px, clamped to the image, and focus is stored as `(left + sw / 2) / rw` (4 decimals). Section 12's `focusX -= dx / (rw - sw)` moves the image faster than the pointer by `rw / (rw - sw)` (121 times for the lead at zoom 1) and leaves dead zones near the ends, because focus beyond the crop's reach still changes.
  - A drag on a photo pans it even when its block was not selected yet (the pointerdown selects it first). The wheel needs the block selected, so scrolling the stage over photos still scrolls.
  - "Add photo" also shows on a photo whose image is missing (not decoded). It sits below the canvas's own "no photo" label when the rect is tall enough, so the placeholder that would export stays visible.
  - The height handle shows only on the selected photo block.

### Chunk 6 (2026-10-02)

- The theme pane (section 13): Colours, one row per token with a colour picker, a hex input validated on blur or Enter (invalid text reverts) and Reset; Text styles, one card per role with font select (Salon Pixel, uploaded fonts, "Upload font..."), size (11 to 44 select for Salon Pixel, 6 to 120 number for a vector font), colour swatch opening the toolbar's colour popover (now shared as `fillColourPop`), Bold, Tracking (0 to 4, disabled for vector fonts) and Reset; Sprites, three rows with a 4x preview, "Replace (PNG)" ("Needs a PNG up to 64 by 64" otherwise), "Reset to default" and the credit note; Fonts, name, size in KB, "used by: headline, caption-override in intro" or "unused", Remove only when unused, "Upload font"; Paper texture, Export theme (`<slug>-theme.json`), Import theme (format and version checked, confirm unless the current theme is the default) and Reset theme (confirm). Every change renders at once and pushes one undo snapshot (a colour picker renders live and commits on change).
- Help panel rewritten with the sections of 16, README rewritten for the direct editor (Pages link, offline use, saving, the issue file pointing to section 6 here, building, licences, Support link), and the header comment says uploaded fonts and sprites stay in the user's files.
- Checked: `paper` set to #3060C0 re-textures the page in blue in the preview and the exported PNG (paper pixels vary 47 to 53 red around 48); the texture checkbox off gives flat #EFE6D0. A 16 by 24 chain tiles every 24 art rows down the gutter (marker rows 94, 118, 142 ...). The 65 by 65 PNG and a JPEG are refused with the message. With page 2's footer cleared the credit warning fires; it still fires with only the chain replaced, goes once all three are replaced, and comes back when the lantern is reset. Body size 22 re-wraps every story (18, 16, 19 lines to 38, 32, 37) and Reset brings it back. A headline colour picked from the popover sets the token "teal". Georgia and Consolas upload from the Fonts section and from a role's "Upload font..."; the list shows where each is used and Remove is enabled only when unused. Export theme, Reset theme (default after), Import theme gives the identical theme JSON with both fonts loaded; an issue file is refused as a theme. Undo steps back through colour changes with the theme pane kept. A reload restores the draft with the theme colour, the chain sprite and the uploaded headline font. The sample's skin is still detected slim (28 px figure). At 400 px the theme pane stacks with no sideways scroll; dark mode leaves the page canvas untouched. The default-theme sample exports differ from chunk 5's in 2 and 4 photo pixels by one level (resampling), so the masthead and chain placement are unchanged. End to end from file:// as in chunk 5, with no console errors and no requests. The vendor-name grep finds nothing (case-insensitive over the repository) and no emojis. index.html is 1.63 MB.
- Deviations and decisions:
  - With an uploaded lantern or chain, the masthead chain is centred on the lantern's ink. The built-in pair keeps v1's offset of 4 px (centring would move it by one pixel).
  - Reset theme returns the theme to the default exactly, uploaded fonts and saved colours included, as section 13.5 says; field overrides that pointed at a removed font fall back to Salon Pixel.
  - A sprite reset or replace rebuilds the theme pane; colour and number edits do not, so focus stays in the field being edited.
- Not verified here: writing back to an opened file with the File System Access picker (headless runs use the download path), Firefox and Safari, and the live Pages URL (nothing is published yet).
