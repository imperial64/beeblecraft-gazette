# Gazette builder: design spec

Written 2026-10-02 from gazette/tool-brief.md (the user's request and scoping answers), gazette/render_issue.py, gazette/art/ (palette.py, salon_pixel.py, sprites.py), gazette/design.md, journal/J-001.md, records/consent.md, and the two rendered pages gazette/issues/001/page.png and page-2.png. Revised the same day for four user decisions: the tool is hosted on GitHub Pages with no outside service dependency; it lives in its own public repository, not in beeblecraft-mc ("this is my personal repo"); saving has three client-side layers (browser draft, .json file, File System Access overwrite in Chrome and Edge); the page format is portrait 1200 by 1600 and every preset is portrait (a 1920 by 1080 landscape try was rejected: "lets stick with the portrait, dont change anything").

The Python renderer is the look; this document says how to port it into one HTML file that the user and other players can use to lay out issues from presets. Paths below are relative to the new repository unless they start with `beeblecraft-mc/`. This file is copied into that repository as docs/design.md.

Decisions since this spec was written (2026-10-02): the tool's code is under the MIT licence (Q1); the issue JSON is the source of an issue's copy, and "Export copy (Markdown)" is in v1 (Q2, so the Markdown export of section 20 is built); issue 1 ships as the embedded sample with its screenshots and skin (Q3). Where this file says "TBD" for the licence, read MIT.

Authority labels used below:

- **answer**: the user's verbatim choice in tool-brief.md or an earlier answers file.
- **ported**: taken from render_issue.py, design.md or the art modules. Where this spec and the Python disagree on a number, the Python wins; it produced the pages the user accepted.
- **proposal**: my design decision, made so the implementer has none to make. Change at the visual gate, not during the build.
- **later**: out of scope for v1, listed in section 20.
- **TBD**: waits on gazette/tool-questionnaire.md. None of the three questions blocks the build; each has a default to build against.

No audit and no review pass (user instruction). The implementer does the checks in section 19 and the parent shows the user the result.

## 1. What is being built

One self-contained file, `index.html`, that opens in a browser with no server and no network and lets someone:

1. pick page presets, then add, reorder and edit blocks (story, photo, map, box, the officer's desk column, case register) in a side panel (answer: "Presets + block list");
2. see each page drawn on a canvas in the gazette's look, with warnings when a column overflows or leaves a gap;
3. edit the masthead, tagline, issue line and footer credits, so another player can run their own paper (answer: "Editable masthead", Beeblecraft Gazette as the default);
4. save and reload an issue as a JSON file, keep a draft in the browser, overwrite the same file with Ctrl+S where the browser allows it, and export every page as a 1200 by 1600 portrait PNG.

It is published two ways (answer: "Both"): as a GitHub Pages site, https://imperial64.github.io/beeblecraft-gazette/, and as the same index.html downloadable from the repository for offline use. Section 18. Nothing in the tool talks to any server: no analytics, no fonts, no API.

The default sample is issue 1: both pages, all copy from beeblecraft-mc/journal/J-001.md, the ten photos, the user's skin. Loading it and exporting must give pages that match beeblecraft-mc/gazette/issues/001/page.png and page-2.png element for element (section 19). The Python renderer stays in beeblecraft-mc untouched; it is the reference, not a dependency.

Working together: the JSON format (section 8) is the hand-off between people and scripts. Anyone can write or edit the copy in the JSON with a text editor (no images needed for that), then open it in the tool, add or re-frame photos, read the warnings, export. The JSON is therefore kept readable: 2-space indent, copy first, image data last.

Page format (answer): portrait, 1200 by 1600 screen px from a 600 by 800 art grid. There is no landscape mode, no page size setting, and every preset is portrait.

## 2. Repository and build

A new standalone repository, working name `beeblecraft-gazette`: local F:\Projects\beeblecraft-gazette, GitHub `imperial64/beeblecraft-gazette`, public (GitHub Pages on a free account needs a public repository), Pages serving the repository root from the default branch. Nothing in it reads a path in F:\Projects\beeblecraft-mc at build time or run time: everything it needs is copied in once.

```
beeblecraft-gazette/
  index.html                    the deliverable: built, committed, served by Pages at the site root,
                                and the same file to download for offline use
  README.md                     section 2.2
  LICENSE                       tool licence (TBD, questionnaire Q1): the file is created with the
                                single line "Licence: TBD" until answered
  .gitignore                    .playwright-cli/, __pycache__/, *.pyc
  build.py                      assembles src + assets + sample into index.html
  src/
    index.html                  markup and CSS, with {{...}} slots the build fills
    app.js                      editor, document model, layout, rendering, saving, export
    font.js                     Salon Pixel glyph table and text functions (section 6)
  assets/
    salon-pixel/
      LICENSE-OFL.txt           SIL OFL 1.1 text with the copyright line "Copyright 2026 imperial64"
    modern-mizunos/
      oxidized_copper_lantern.png, copper_lantern.png, oxidized_copper_chain.png
                                copied unchanged from beeblecraft-mc/gazette/art/third_party/modern-mizunos/
      CREDIT.md                 copied from the same place; its last sentence changed to say "Pages
                                exported with these pieces are shared under the same licence"
  sample/
    issue-001.json              the sample issue, images given as paths under sample/ (section 8.4)
    character-skin.png          copied from beeblecraft-mc/gazette/refs/
    photos/                     the ten issue-1 screenshots, already downsized to 1200 px wide JPEG
                                quality 85 by build.py's --import-photos step (section 8.4), so the
                                repository never holds the 3 to 4 MB originals
  docs/
    design.md                   this file, copied in
```

### 2.1 build.py

Python 3.13 + Pillow, nothing else. `python build.py` does:

1. Reads src/index.html and inlines src/font.js and src/app.js into `<script>` tags (no `src=` or `href=` to anything outside the file anywhere in the output).
2. Encodes the three Modern Mizunos PNGs from assets/modern-mizunos/ as PNG data URLs.
3. Reads sample/issue-001.json; for every image given as `"file"`, loads it from sample/, encodes it as a data URL (JPEG as-is for photos; PNG for the skin, never resized, never JPEG) and replaces `"file"` with `"data"` plus `"w"` and `"h"`.
4. Writes index.html with the asset map and the sample as JSON inside `<script type="application/json" id="...">` tags that app.js reads with `JSON.parse(document.getElementById(...).textContent)`.
5. Prints the output size. The build fails over 8 MB (proposal: keeps the Pages download and the first load quick; today's content is about 2.5 MB).

`python build.py --import-photos <dir>` is the one-time helper that copies screenshots into sample/photos/: for each file named on the command line it resizes so the longer side is at most 1200 px (LANCZOS) and saves JPEG quality 85 under the same base name with a .jpg extension. The implementer runs it once against beeblecraft-mc/screenshots/INS-003 and INS-004 for the ten photos of section 8.4; after that the new repository is self-contained.

The HTML file carries a header comment with: the tool name, the repository URL, the Salon Pixel copyright and SIL OFL 1.1 notice, the Modern Mizunos credit (authors, version, source URL, CC BY-NC-SA 4.0), and the tool licence line (the same TBD as LICENSE).

### 2.2 README.md

Plain, short, in this order: what the tool is (one paragraph); the link https://imperial64.github.io/beeblecraft-gazette/; offline use (download index.html, open it, nothing else needed); how an issue is made (presets, blocks, photos, warnings, export) in ten lines or fewer; saving (section 16 in two sentences: browser draft, .json file, Ctrl+S overwrite in Chrome and Edge); the JSON format in one paragraph with a pointer to docs/design.md section 8; building (`python build.py`, needs Python 3 and Pillow); licences (tool: TBD; Salon Pixel: SIL OFL 1.1, copyright 2026 imperial64; Modern Mizunos pieces: CC BY-NC-SA 4.0 by Kchem and Garden Gals, so pages exported with the ornaments on carry that licence and credit); a "Support" section with https://buymeacoffee.com/imperial64 (the user's standing preference for public projects). No badges, no screenshots required (one exported sample page as a PNG in docs/ is fine but optional).

## 3. Runtime rules

- Plain HTML, CSS and JavaScript (ES2020). No framework, no bundler, no external script or stylesheet, no web font. Everything the page needs is in the file.
- Works opened from disk (`file://`) and served by GitHub Pages (`https://`). Tested in current Chrome and Edge; Firefox should work; Safari is best effort (section 14 notes the one feature that may be missing there). Features that only some browsers have (File System Access, section 16.4; canvas `filter`) are detected at use and fall back; nothing breaks without them.
- `<title>Gazette Builder</title>`. Editor chrome colours are tokens on `:root`, with a dark set under `@media (prefers-color-scheme: dark)`; `body` has an explicit background; the layout works at phone width with a 16 px side gutter and no horizontal page scroll (the panels stack; the preview scales to the width). The page canvas is not themed: paper is paper in dark mode too.
- No network access of any kind: no fetch, no XHR, no external resource, no service worker, no analytics. The file works with the network cable out, and the Pages site is static hosting of this one file.
- All browser storage access (localStorage, IndexedDB) is inside try/catch or promise rejection handling (section 16).
- No emojis anywhere in the UI, help text or code comments.

## 4. The page: art grid and screen grid (ported)

The page is drawn on an offscreen art canvas of 600 by 800 px (one art px = one unit), then scaled 2x with `imageSmoothingEnabled = false` onto the 1200 by 1600 screen canvas, which is what the preview shows and the export saves. Photos are the exception: they are drawn onto the screen canvas with smoothing (section 12). The paper texture is applied on the screen canvas between those two steps (section 14).

Every drawing call on the art canvas is `fillRect` with integer coordinates and a solid colour, or `drawImage` of a sprite at integer coordinates with smoothing off. No strokes, no paths, no alpha, no anti-aliasing. The texture mask depends on exact colour equality.

Constants (art px):

| Name | Value | Meaning |
|---|---|---|
| W, H | 600, 800 | art canvas |
| LEFT, RIGHT | 17, 583 | content x range, RIGHT exclusive |
| FULL_W | 566 | RIGHT - LEFT |
| COL_X | 17, 211, 405 | column left edges |
| COL_W | 178 | column width; gutters are 16 |
| PAGE_BOTTOM | 784 | bottom edge of the footer band |
| FOOT_GAP | 8 | between the columns' end and the footer band |
| STORY_GAP | 14 | between items in a column |
| PARA_GAP | 6 | extra gap between paragraphs |
| BODY_PITCH | 12 | line pitch at scale 1 |
| HEAD_PITCH | 24 | line pitch at scale 2 |
| LEAD_W, LEAD_H | 372, 195 | lead photo across columns 1 and 2 |
| CAPTION_GAP | 7 | photo bottom to the caption's row 0 |
| PHOTO_MIN, PHOTO_MAX | 64, 168 | default flexible height range of a column photo |
| MAP_MIN, MAP_MAX | 112, 118 | flexible height range of the map box |
| BODY_TOP_FULL | 94 | body top under a full masthead (P1_TOP) |
| BODY_TOP_HALF | 61 | body top under a half masthead (P2_TOP) |
| FOOTER_TEXT_W | 532 | footer text width |

Palette (ported from palette.py; hex strings used as-is as canvas fill styles):

paper #EFE6D0, paper_shade #E3D8BD, paper_dark #CDBF9E, ink #1F1B17, ink_soft #5A5048, ink_faint #9C907E, teal #2E8B86, teal_dark #1F5F5C, teal_light #7FC4BF, copper #B8683A. The FIGURE tokens in palette.py are not needed: the figure comes from the skin file.

Helpers, 1:1 with render_issue.py: `rect(ctx, x0, y0, x1, y1, token)` (x1, y1 exclusive; no-op when ctx is null), `border(ctx, x0, y0, x1, y1, token, t = 1)`, `capTop(yCap, scale) = yCap - 2 * scale` (row 0 of the em for a cap line at yCap).

Measuring: every drawing function takes a ctx that may be `null`, in which case it measures and returns the same y values without drawing. The layout runs each column once with `null` to measure, balances, then draws. Section 11.

## 5. Text model (ported from salon_pixel.py)

Constants: ROWS 11, BASE_ROW 8, TRACK 1, SPACE_ADV 3.

- `width(text, scale = 1, trackingExtra = 0)`: sum of advances (glyph width + TRACK + trackingExtra; a space is SPACE_ADV + trackingExtra) minus the last glyph's TRACK + trackingExtra when the text does not end in a space, times scale. Empty text is 0.
- `drawText(ctx, x, y, text, scale, token, trackingExtra = 0, bold = false)`: row 0 of the em at y; each ink cell is a fillRect of scale by scale art px (plus 1 px right and down when bold). Returns `width(...) + (bold ? 1 : 0)`.
- `wrap(text, widthArtPx, scale = 1, firstLine = 0)`: breaks on spaces by measured width, never hyphenates. `widthArtPx` may be a number or a function of the line index (for text beside the figure). Units are built by `units(text)`: split on spaces, then glue a token to the next one when `glued(prev, next)`:
  - prev is exactly `x` or `z` (a coordinate);
  - prev is 1 or 2 digits and next, stripped of trailing `.,;:)`, is an English month name (day and month);
  - prev is `CC` and next starts with `BY`;
  - prev starts with `BY-` and next matches `^\d\.\d` (licence version).
  A unit wider than the limit goes on its own line and overruns; the layout reports it as a warning naming the unit and the block (the Python raises; the tool warns and draws).
- `paragraphs(ctx, x, y, paras, width, token = "ink")`: for each paragraph (after the first, y += PARA_GAP), for each wrapped line draw at y and y += BODY_PITCH; returns `{next: y, bottom: lastLineY + ROWS}`.
- `headline(ctx, x, y, text, width)`: wrap at scale 2, lines HEAD_PITCH apart; `ruleY = y + (n - 1) * HEAD_PITCH + 2 * ROWS + 3`; 1 px teal rule from x to x + width at ruleY; returns `ruleY + 1 + 8` (the body's top).

Paragraphs in a block's text are separated by a blank line; single newlines inside a paragraph are joined with a space, exactly as load_copy() in the Python does. The case register is the one block read line by line (section 10.6).

## 6. Salon Pixel (ported; the user's font, SIL OFL 1.1)

font.js carries the `G` table copied string for string from gazette/art/salon_pixel.py (the same data as the `G` table in F:\Projects\pet-salon-tycoon\src\ui\pixelFont.ts), with the comment: "Salon Pixel, copyright 2026 imperial64, SIL Open Font License 1.1. Data only; the TrueType writer is not ported."

Parsing, identical to `_parse` in the Python: a glyph is `|`-separated rows of `#` and `.`; rows start at row 2 unless the string starts with `N:`; the em is 11 rows; width is the longest row; rows outside the given range are blank. Build `GLYPHS` once at load: `{ch: {w, rows: string[11]}}`.

Missing glyph: a character with no glyph and not a space is drawn as a hollow box 5 wide, rows 2 to 8 (1 px ink outline), with advance 5 + TRACK, and the layout adds the warning "No glyph for 'ç' (U+00E7) in <block id>". The tool never adds glyphs; the Help panel says the font is the paper's own and lists the characters it has (generated from the table at runtime).

Bold is used only for the wordmark (scale 4, dilated 1 px right and down).

## 7. Embedded assets

Built into the HTML by build.py:

| Asset | Source | Form | Use |
|---|---|---|---|
| oxidized_copper_lantern.png | assets/modern-mizunos/ | PNG data URL, 16 by 16, ink bbox x 4 to 12, y 0 to 15 | masthead flankers, box title icon |
| copper_lantern.png | same | PNG data URL, 16 by 16, same bbox | footer icon |
| oxidized_copper_chain.png | same | PNG data URL, 16 by 16, ink bbox x 0 to 6, y 0 to 16 | gutter chains, masthead chains |
| Salon Pixel | src/font.js | code | all text |
| sample issue | sample/issue-001.json | JSON with embedded images | "Load sample" (section 16.5) |

Bounding boxes are computed at load from the decoded image's alpha, not hard-coded, so a replaced piece still works. The three pieces are drawn with smoothing off at integer scales. Nothing from Mizuno's 16 Craft is embedded (brief: screenshots only). The user's skin is in the sample issue as an image entry, not a tool asset.

## 8. Document model: the issue JSON

### 8.1 Shape

```json
{
  "format": "gazette-builder-issue",
  "version": 1,
  "title": "The Beeblecraft Gazette, No. 1",
  "paper": {
    "wordmark": "THE BEEBLECRAFT GAZETTE",
    "tagline": "Inspections, cases and notices from the Beeblecraft Inspection Office",
    "kickerLeft": "NO. 1",
    "kickerCentre": "BEEBLECRAFT INSPECTION OFFICE",
    "kickerRight": "OCTOBER 2026",
    "ornaments": true,
    "skin": "img-skin",
    "skinModel": "auto"
  },
  "pages": [
    {
      "masthead": "full",
      "lead": { "image": "img-lead", "zoom": 1, "focusX": 0.5, "focusY": 0.5, "caption": "The south line near the cherry trees: ..." },
      "columns": [
        [ { "type": "story", "id": "intro", "headline": "The office starts work", "body": "The Beeblecraft ...\n\nThe office looks after ..." },
          { "type": "photo", "id": "south-water", "image": "img-3", "zoom": 1, "focusX": 0.5, "focusY": 0.5, "headline": "", "caption": "Heading back toward spawn ...", "minH": 64, "maxH": 168 } ],
        [ ... ],
        [ ... ]
      ],
      "footer": "Continued on page 2: the west line ridden to the end, the east and north lines and the case register."
    }
  ],
  "images": {
    "img-skin": { "name": "character-skin.png", "kind": "skin", "data": "data:image/png;base64,...", "w": 64, "h": 64 },
    "img-lead": { "name": "2026-10-02_17.13.46.png", "kind": "photo", "data": "data:image/jpeg;base64,...", "w": 1200, "h": 631 }
  }
}
```

Field rules:

- `title`: free text; its slug (lowercase, runs of non-alphanumerics to `-`, trimmed) names exported files. Empty title slugs to `gazette`.
- `paper.wordmark`, `kicker*`: drawn as typed; the kicker and wordmark are not forced to capitals (the sample is capitals by copy, matching issue 1).
- `paper.ornaments`: true draws the Modern Mizunos pieces (lanterns, chains, box icons, footer lantern); false draws none of them, so a player who does not want the CC BY-NC-SA share-alike condition can turn them off. Section 9 says what changes.
- `paper.skin`: an image id of kind `skin`, or null. `skinModel`: `auto` | `classic` | `slim`.
- `pages[].masthead`: `full` | `half`. `lead`: object or null. `columns`: exactly three arrays. `footer`: text; empty string means no footer band (then columns end FOOT_GAP above PAGE_BOTTOM).
- Block `id`: a short label shown in the panel and in warnings; generated as `<type>-<n>` and editable; uniqueness is not required.
- `images[id].data`: a data URL. `kind`: `photo` or `skin`. `w`, `h`: the stored pixel size. `name`: the original file name, kept for the user's own records and for re-import matching (section 16.3).

Unknown fields are kept on load and written back on save (so a later version can add fields without a migration). A file with the wrong `format` or a `version` above 1 is refused with a message.

### 8.2 Images: embedded, not referenced (proposal, with reasons)

Saved issues embed every image as a data URL. Reasons: a page cannot read arbitrary paths from disk (even with File System Access it only gets the files the user picks), so a referenced path could never be reopened without the user re-picking every file; the file must open the same from the Pages site, from a USB stick, or on another player's machine; and a Discord-sized issue is small once images are downsized on import (section 12.1): about 10 photos at 150 to 250 KB each, so a saved issue is 2 to 3 MB. The cost is that the JSON is not pleasant to read past the `images` key, which is why `images` is written last.

The only referenced form is `"file": "photos/2026-10-02_17.13.46.jpg"` in sample/issue-001.json, which build.py resolves against sample/. The tool itself treats an image with neither `data` nor a decodable data URL as missing (section 16.3).

### 8.3 Presets

Presets are page templates offered by "Add page". A preset is a page object with placeholder copy; adding a page deep-copies it. Placeholder text is literal and short so it is obviously placeholder: headlines "Headline", bodies "Body text.", captions "Caption.", box titles "Box title", register lines "C-000 Case".

| Preset | masthead | lead | col 1 | col 2 | col 3 | footer |
|---|---|---|---|---|---|---|
| Front page | full | yes (no image) | story, photo | story, photo | desk, map, photo | "Continued on page 2." |
| Inside page | half | none | story, photo | story, photo | story, photo | "" |
| Back page | half | yes (no image) | story, photo | photo (with headline "Gallery"), photo, box | story, story, photo, register | the credits template below |
| Issue 1, page 1 | the sample's page 1 with its copy and photos | | | | | |
| Issue 1, page 2 | the sample's page 2 | | | | | |

Credits template (Back page footer; the player edits it): "Out of character. Names appear in the paper only with the player's permission. Screenshots taken with [texture pack] and [shader]. Lantern and chain pieces from Modern Mizunos v0.5.2 by Kchem and Garden Gals, CC BY-NC-SA 4.0 (modrinth.com/organization/garden-gals). This page: CC BY-NC-SA 4.0, [your name]."

"New issue" creates: paper defaults as in 8.1 (Beeblecraft values, ornaments on, no skin), one Front page, no images.

The map preset values (used by Front page and by "Add block: map"): blocksPerPx 200, four lines east/north/south/west with blocks 0 (a 0-length line is not drawn and gets no label), labels "", style solid, caption "Caption.".

### 8.4 The sample: issue 1

sample/issue-001.json is hand-written by the implementer from beeblecraft-mc/journal/J-001.md and render_issue.py. The ten screenshots are imported once with `build.py --import-photos` (section 2.1) from beeblecraft-mc/screenshots/INS-003 and INS-004 into sample/photos/ as .jpg files of the same base names; the skin is copied to sample/character-skin.png.

- `title` "The Beeblecraft Gazette, No. 1"; paper fields from the `kicker-*`, `wordmark`, `tagline` blocks; ornaments true; skin `character-skin.png`, skinModel auto.
- Page 1: masthead full; lead image 2026-10-02_17.13.46 (INS-003), caption `lead-caption`; columns exactly as page_one() in the Python: col 1 [story intro-headline/intro, photo south-water (17.14.43)], col 2 [story south-headline/south, photo south-snow (17.04.07)], col 3 [desk (desk-title, desk, desk-signature), map, photo south-bridge (17.12.22)]; footer `page1-footer`.
- Page 2: masthead half; lead INS-004 17.42.47 with `west-lead-caption`; col 1 [story west, photo west-tunnel (17.44.30)], col 2 [photo west-bridge (17.38.08) with headline `gallery-headline`, photo west-temple (17.36.15), box followup-title/followup], col 3 [story east, story north, photo west-maze (17.59.43), register cases-title/cases]; footer `footer`.
- Map: blocksPerPx 200; east 9210 "x 9210", north 7433 "z -7433", south 10121 "z 10121", west 9995 "x -9995", all solid; caption `map-caption`.
- All photos zoom 1, focus 0.5/0.5, minH 64, maxH 168. Block ids are the J-001 block ids.

Copy is pasted verbatim, including the two credit placeholders exactly as J-001.md has them today. Paragraph breaks become `\n\n`. The implementer does not edit the copy.

Once the tool runs, Save with the sample loaded writes the embedded form of the same issue (about 2.5 MB). Whether that file is kept in beeblecraft-mc as gazette/issues/001/issue.json, and whether it or J-001.md is then the source of the copy, is questionnaire Q2; the build does not need it.

## 9. Page anatomy (ported)

Drawn in this order on the art canvas: paper fill, masthead, lead photo frame placeholder (the photo itself comes later), columns, chains, footer. Then the 2x upscale, texture, photos with frames.

### 9.1 Masthead

Wordmark: `ww = width(wordmark, 4) + 1`; `wx = LEFT + floor((FULL_W - ww) / 2)`. If ww > FULL_W: draw at scale 3 bold instead (recomputing ww and the lantern positions from scale 3) and warn "Wordmark is N art px wide at scale 4, more than 566; drawn smaller"; if still wider, draw clipped at the content edges and warn (proposal).

Full masthead:

| y | Element |
|---|---|
| 16 | 1 px ink rule, LEFT to RIGHT |
| capTop(20, 1) = 18 | kicker, scale 1, ink_soft, trackingExtra 1: left at LEFT; centre at LEFT + floor((FULL_W - width(centre, 1, 1)) / 2); right at RIGHT - width(right, 1, 1) |
| 31 | 1 px ink rule |
| capTop(36, 4) = 28 | wordmark at wx, scale 4, bold, ink |
| 68 to 70 | 2 px teal rule |
| capTop(73, 1) | tagline, scale 1, ink_soft, centred like the kicker centre |
| 85 to 87 | 2 px ink rule |
| 88 | 1 px ink rule |

Body top is 94. Any kicker part or the tagline that is empty is skipped. Half masthead: 1 px ink rule at 16; wordmark cap at 21 (row 0 at 13); 2 px teal rule at 53 to 55; body top 61.

Lanterns (ornaments on): `base = capTop(wordCap, s) + (BASE_ROW + 1) * s` where wordCap is 36 or 21 and s the wordmark scale; `ly = base - lanternBbox.y1`; left lantern image origin x = LEFT - bbox.x0, right = RIGHT - bbox.x1; chain x = lantern x + 4; chain tiles of 16 rows (the last cropped) from `ruleBottom` (32 full, 17 half) to ly + 1 exclusive. If `wx - (LEFT + bboxWidth) < 10`: warn "Masthead lantern only N art px from the wordmark" (the Python fails; the tool warns).

### 9.2 Lead photo (optional, spans columns 1 and 2)

Rect (LEFT, bodyTop, LEAD_W, LEAD_H). Caption at `bodyTop + LEAD_H + CAPTION_GAP`, scale 1, ink_soft, wrapped to LEAD_W. Columns 1 and 2 resume at `captionY + (n - 1) * BODY_PITCH + ROWS + CAPTION_GAP`, or at `bodyTop + LEAD_H + STORY_GAP` when the caption is empty; column 3 starts at bodyTop. Without a lead, all three start at bodyTop. No image assigned: the placeholder of section 12.4.

### 9.3 Columns and chains

Each column is a stack of blocks: the first at the column's start y, each next at `previousBottom + STORY_GAP`. Target bottom for every column: `PAGE_BOTTOM - footerHeight - FOOT_GAP` (footerHeight 0 when the footer text is empty). Section 11 balances flexible blocks to end there.

Chains (ornaments on): in gutter 1|2 (x from COL_X[0] + COL_W = 195) from the y where column 2 starts, and gutter 2|3 (x from 389) from the y where column 3 starts, down to the target bottom; tile x = gutterLeft + floor((16 - chainInkWidth) / 2) - chainBbox.x0; tiles of 16 rows with the last cropped.

### 9.4 Footer band

Lines = wrap(footer, FOOTER_TEXT_W, 1). `footerHeight = max(23 + (n - 1) * BODY_PITCH, 27)`; y0 = PAGE_BOTTOM - footerHeight; fill paper_shade, 1 px ink border, 2 px teal at y0 + 1 to y0 + 3 inside the border; innerTop = y0 + 3, innerBottom = PAGE_BOTTOM - 1; `ink = (n - 1) * BODY_PITCH + 9`; `cap = innerTop + floor((innerBottom - innerTop - ink) / 2)`; lines at x 45, row 0 at `cap - 2 + i * BODY_PITCH`, scale 1, ink_soft. Warm lantern (ornaments on) at x 23: for one line, image y = innerTop + floor((innerBottom - innerTop - bboxHeight) / 2) - bbox.y0; for more, `cap - 1 - bbox.y0`. Ornaments off: text at x 23, width 554.

## 10. Block types and fields

Every block has `type` and `id`. The panel form for each type lists exactly the fields below. Each block exposes `run(ctx, x, y, h)` returning its ink bottom; `h` is used only by flexible blocks (photo, map). Fixed blocks ignore it.

### 10.1 story

Fields: headline (one line of text; wrapped at scale 2), body (paragraphs). Draw: `bodyY = headline(ctx, x, y, headline, COL_W)`; `paragraphs(ctx, x, bodyY, paras, COL_W)`; bottom = paragraphs' bottom. Empty headline: no headline and no rule, body starts at y. Empty body: bottom is the rule's y + 1.

### 10.2 photo (flexible)

Fields: image (pick from the issue's photos or add one), zoom (1 to 3, step 0.05), focusX and focusY (0 to 1, step 0.01), headline (optional, drawn above the photo like a story headline), caption (paragraphs, ink_soft), minH and maxH (integers, defaults 64 and 168; a fixed height is minH = maxH). Draw: optional headline; record the photo rect (x, y, COL_W, h) for the screen pass; caption at `y + h + CAPTION_GAP`; bottom = caption bottom, or `y + h` when the caption is empty.

### 10.3 map (flexible, MAP_MIN to MAP_MAX)

Fields: blocksPerPx (default 200), four lines east/north/south/west each with blocks (integer, 0 = not drawn), label (text), style (solid | dashed), caption. Port of line_map():

- `n[dir] = round(blocks / blocksPerPx)`; box width bw = COL_W, height h; spawn x `cx = 89`; `cy = floor((h + n.north - n.south) / 2)`.
- Fill paper, 1 px ink border; grid dots (1 px paper_dark) at x in `cx % 10, cx % 10 + 10, ...` and y likewise from `cy % 10`, only where 2 <= gx < bw - 2 and 2 <= gy < h - 2.
- Lines 2 px teal: east `rect(x+cx, y+cy-1, x+cx+n.east, y+cy+1)`; west `rect(x+cx-n.west, y+cy-1, x+cx, y+cy+1)`; north `rect(x+cx-1, y+cy-n.north, x+cx+1, y+cy)`; south `rect(x+cx-1, y+cy, x+cx+1, y+cy+n.south)`. Dashed: the same rect drawn as 3 px on, 2 px off from the spawn outward.
- Spawn: 4 by 4 teal_dark at (x+cx-2, y+cy-2).
- Labels, scale 1, ink_soft: "N" at (x+4, y+capTop(4,1)); east at (x+cx+n.east+4, y+capTop(cy-4,1)); west at (x+cx-n.west, y+capTop(cy-13,1)); north at (x+cx+5, y+capTop(cy-n.north,1)); south at (x+cx+5, y+capTop(cy+n.south-7,1)). A line with blocks 0 draws no label.
- Fit checks become warnings (named "Map: ..."): east label past bw - 2; west line left of x 4; west label reaching cx - 2; north or south label past bw - 2; a line taller than the box.
- Caption at y + h + CAPTION_GAP; bottom = caption bottom.

### 10.4 box

Fields: title (wrapped at scale 2), body (paragraphs). Port of box() with para_body: `cx = x + 6`, `cw = COL_W - 12`; with ornaments, icon ink width iw = 8, `tx = cx + iw + 4`, `tw = cw - iw - 4`; without, tx = cx, tw = cw. `ty = y + 6`; title lines at scale 2, HEAD_PITCH apart; `hairY = ty + (n - 1) * HEAD_PITCH + 2 * ROWS + 3`; `bodyY = hairY + 7`; `contentBottom = body(ctx, cx, bodyY, cw)`; `y1 = contentBottom + 6`. Draw order: paper_shade fill (x, y) to (x + COL_W, y1); 1 px ink border; teal 2 px at y + 1 to y + 3 from x + 1 to x + COL_W - 1; icon at (cx - bbox.x0, ty + 3); title; 1 px ink_faint hairline at hairY from cx to cx + cw; body in ink. Returns y1.

### 10.5 desk (the officer's column)

Fields: title, body (paragraphs), signature (one line, right-aligned). The box of 10.4 with the desk body (port of desk_body): figure from the paper's skin (section 13) at (cx, bodyY), size figW by figH (28 by 64 for slim, 32 by 64 for classic); `narrowX = cx + figW + 6`, `narrowW = cw - figW - 6`, `besideUntil = bodyY + figH + 8`. Each paragraph is wrapped with a width function: line i of a paragraph starting at `top` gets narrowW when `top + i * BODY_PITCH < besideUntil`, else cw; a line is drawn at narrowX when its y < besideUntil, else at cx. After the last paragraph y += PARA_GAP; the signature is drawn at `cx + cw - width(signature, 1)` (warn "Signature wider than its line" when wider than the width available at that y); bottom = max(signature bottom, bodyY + figH). No skin: figW = 0 and no figure (text runs full width).

### 10.6 register (case register)

Fields: title, lines (one entry per line, no paragraph logic). The box of 10.4 with cases_body: each line at scale 1 ink_soft, BODY_PITCH apart; a line wider than cw gets the warning "Register line does not fit: '...'" and is drawn overrunning. Bottom = last line y + ROWS.

### 10.7 Lead photo (page-level, not a block)

Fields: image, zoom, focusX, focusY, caption. Section 9.2.

## 11. Layout: measuring, balancing, warnings

Port of balance() and stack(), per page:

1. `footerHeight` from the footer text; `target = PAGE_BOTTOM - footerHeight - FOOT_GAP`.
2. Column start y: from section 9.2.
3. For each column, with ctx null: set every flexible block's h to 0, run the stack, `spare = target - end`. Give every flexible block its minH, `extra = spare - sum(minH)`. Share `extra` out evenly, one pass at a time: `share, rest = divmod(extra, openCount)`; the first `rest` open blocks get one more; a block that reaches its maxH leaves the open set; stop when nothing more can be given. Then:
   - `extra < 0` (overflow): every flexible block gets `max(0, floor(spare / flexCount))`, which is below its minH; warning "Column N overflows by M art px: cut copy or remove a block" where M = -extra (so the user knows how much).
   - `extra > 0` after all are at maxH (gap): the last flexible block keeps maxH (the Python adds the extra and fails; the tool does not stretch past maxH); warning "Column N has a gap of M art px: add copy or a photo" where M = extra.
   - no flexible block: the column ends where it ends; if `end > target`, warning "Column N overflows by (end - target) art px"; if `end < target`, "Column N has a gap of (target - end) art px". An empty column (no blocks) gets the gap warning too.
4. Run every column again with the real ctx to draw.

Preview markers (never exported): an overflowing column gets a 2 px red (#C8321E) line across the column at `target` and a red hatched rectangle (diagonal 1 px lines every 6 px, alpha 0.35) from target to the column's actual end; a gap gets a hatched paper_dark rectangle from `end + STORY_GAP` to target. Markers are drawn on the screen canvas at the end, only when `preview === true`.

Warnings are collected in an array of `{page, column, block, text}` during the layout and shown above the preview (section 15.3). They never stop rendering or export; export confirms first (section 17).

## 12. Photos

### 12.1 Import

"Add image" opens a file input (`accept="image/*"`, multiple allowed). Each file is decoded with `createImageBitmap` or an `Image`, drawn to a canvas scaled so the longer side is at most 1200 px (two-step halving for large sources, then the final resize with `imageSmoothingQuality = "high"`), and stored as `image/jpeg` quality 0.85 with kind `photo`. Files smaller than that are stored at their size, still re-encoded as JPEG (a PNG screenshot of 1920 by 1009 is 3 to 4 MB; the stored JPEG is about 150 KB). Skins go through the skin control (section 13), never this path.

The limit is proposal: the lead is 744 screen px wide and the zoom goes to 3, so 1200 px covers zoom 1.6 on the lead without upscaling; higher zoom softens, which the Help text says.

### 12.2 Framing

A photo rect (ax, ay, aw, ah) in art px is sw = 2 aw by sh = 2 ah on the screen canvas. The source image (iw, ih) is scaled by `s = max(sw / iw, sh / ih) * zoom` (cover, then zoom), giving rw = round(iw s), rh = round(ih s). The crop origin is `left = clamp(round(focusX * rw - sw / 2), 0, rw - sw)`, `top = clamp(round(focusY * rh - sh / 2), 0, rh - sh)`. With zoom 1 and focus 0.5, this is the Python's centre crop.

### 12.3 Drawing

On the screen canvas after the texture: `imageSmoothingEnabled = true`, quality high; for a downscale of more than 2x, pre-shrink by halving on a temp canvas until within 2x, then draw the crop. Then the frame on the art grid: `border(screen, 2ax, 2ay, 2(ax+aw), 2(ay+ah), ink, 4)` and `border(screen, 2ax+4, 2ay+4, 2(ax+aw)-4, 2(ay+ah)-4, paper_dark, 2)`.

### 12.4 No image

A photo block or lead without an image draws, on the art canvas, a paper_dark fill with the 2 px ink and 1 px paper_dark frame and the text "no photo" centred at scale 1 in ink_soft, and the warning "<block id>: no photo". The export includes it as drawn.

### 12.5 Image list

The Images section of the panel lists every photo: thumbnail (CSS-scaled), name, stored size, where it is used (page and block ids). Remove is enabled only for unused images. Importing a file whose name matches an existing image with no data (section 16.3) replaces that entry's data instead of adding a new one.

## 13. Skin front-view renderer (ported from sprites.py)

Control in the Paper section: "Officer skin" file input (`accept="image/png"`), model select auto/classic/slim, and a preview of the front view at 4x (CSS `image-rendering: pixelated`). The file must decode to exactly 64 by 64; anything else is refused with "Needs a 64 by 64 skin PNG (the old 64 by 32 layout is not supported)". Stored as kind `skin`, PNG data URL, unchanged.

Model: `auto` reads the alpha of the slim-only gaps: x 50 to 51, y 16 to 19; x 54 to 55, y 20 to 31; x 46 to 47, y 52 to 63. All transparent means slim (a = 3), else classic (a = 4). The select can override.

Front view, on a (2a + 8) by 32 canvas with smoothing off, each part = base face then overlay face alpha-composited on top (drawImage of the two crops in order), pasted at its destination:

| Part | Base (x, y, w, h) | Overlay (x, y) | Destination |
|---|---|---|---|
| head, hat | 8, 8, 8, 8 | 40, 8 | a, 0 |
| body, jacket | 20, 20, 8, 12 | 20, 36 | a, 8 |
| right arm, sleeve (reader's left) | 44, 20, a, 12 | 44, 36 | 0, 8 |
| left arm, sleeve | 36, 52, a, 12 | 52, 52 | a + 8, 8 |
| right leg, trouser | 4, 20, 4, 12 | 4, 36 | a, 20 |
| left leg, trouser | 20, 52, 4, 12 | 4, 52 | a + 4, 20 |

The figure on the page is this view at 2x nearest-neighbour: 28 by 64 art px (slim) or 32 by 64 (classic), drawn with `drawImage` and smoothing off at the desk box's left padding. Fully transparent pixels stay paper_shade (they get the texture; that matches the Python, which pastes with the alpha mask).

## 14. Paper texture (ported, re-implemented)

After the 2x upscale, only pixels whose art colour is exactly paper or paper_shade get the texture. Ink, rules, sprites, photos keep exact colours.

- Mask: compare the art canvas's pixels to the two tokens (getImageData on the 600 by 800 canvas); expand 2x.
- Seeded PRNG: mulberry32 with seed `1001 + pageIndex`. Deterministic, so re-exports of an unchanged page are identical.
- Layer (1200 by 1600, one value per pixel centred on 128), summed:
  - grain: per pixel `128 + floor((r - 128) * 3 / 128)` with r a random byte, so -3 to +3;
  - tone: a 13 by 17 field of random bytes mapped to `128 + floor((r - 128) * 4 / 128)`, drawn to full size with smoothing on (bilinear where the Python used bicubic; accepted);
  - fibres: 1100 polylines on a 128-grey canvas, each starting at a uniform point, angle uniform in 0 to pi, segment length uniform 3 to 8, 2 to 5 segments with the angle drifting by uniform -0.5 to 0.5 per segment, 1 px wide, level 128 + one of (-7, -6, -5, 4) chosen at random; the fibre canvas is then drawn through `ctx.filter = "blur(0.5px)"` (if `filter` is unsupported, as in some Safari versions, skip the blur: the fibres are a little crisper, nothing else changes).
  - value = grain + (tone - 128) + (fibres - 128), clamped 0 to 255.
- Apply: for masked pixels, each channel = clamp(channel + value - 128).

The layer is built once per page index and cached; the mask and the apply step run on every render. Both are getImageData loops over 1.92 M pixels, which is about 20 to 40 ms; acceptable. A "Texture" checkbox in the preview bar (default on) skips the whole step for faster editing of long copy; export always applies it.

## 15. Editor UI (proposal; plain and functional, the page is the design)

### 15.1 Layout

Three regions, CSS grid: a top bar; a left panel (360 px, scrolls); the preview (the rest). Below 900 px wide: single column, top bar, then preview, then panel. System font, 14 px, native form controls, 8 px spacing, no icons, no animation. Buttons are `<button>`; sections are `<details open>` with a `<summary>`.

Top bar, left to right: issue title input; New; Open (.json); Save (Ctrl+S; overwrites the opened file where the browser allows it, else downloads, section 16); Save as (always picks a new file or downloads); Export page; Export all; Load sample; Help (toggles a panel of static text); on the right a status line: "Draft saved 18:32", "Draft saved without images (too large)", "Draft storage unavailable", and after a file save "Saved issue-1.json 18:33".

### 15.2 Left panel sections (in order)

1. **Paper**: wordmark, tagline, kicker left / centre / right (text inputs), ornaments checkbox with the label "Modern Mizunos lanterns and chains (CC BY-NC-SA 4.0; credit them in the footer)", officer skin control (section 13).
2. **Pages**: a list with one row per page ("Page 1: full masthead, lead photo"), click to select; buttons per row: up, down, duplicate, delete (confirm). Below: a preset select and "Add page".
3. **Page** (selected page): masthead select full/half; lead checkbox, and when on: image select, zoom, focus X, focus Y, caption; footer textarea (3 rows).
4. **Columns**: three sub-lists headed "Column 1" to "Column 3". A block row shows its type and id; click to select; buttons: up, down, "to 1/2/3" (move to another column's end; the current column's button is disabled), delete (confirm). Under each list: a type select (story, photo, map, box, desk, register) and "Add".
5. **Block** (selected block): the fields of section 10 for its type. Text inputs for one-liners, textareas (6 rows, body 10 rows) for paragraphs. The image select lists the issue's photos by name plus "Add image..." which opens the file input and assigns the first imported file. Zoom and focus are range inputs with the value shown.
6. **Images**: section 12.5.

Every change re-renders the selected page after a 150 ms debounce and schedules the autosave (section 16.2). Selecting a page renders it. Keyboard: none beyond native controls.

### 15.3 Preview

A bar with: page tabs ("1", "2", ...), zoom buttons 50 / 100 / Fit (default Fit: the 1200 px canvas scaled with CSS `width` to the region; `image-rendering: auto` so the smoothed photos stay smooth), the Texture checkbox, and the warnings list: one line per warning, "Page 2, column 3, west-maze: no photo"; green "No warnings" when empty. The canvas sits on a neutral grey (#8A8A8A light, #3A3A3A dark) with 16 px padding.

### 15.4 Reminders (not enforcement)

Static text under the Export buttons in the Help panel and repeated in the export confirm dialog: "Before posting: no player names or coordinates of anyone's build without that player's permission (the office's consent rules). Credit the texture pack and shader in the screenshots. With the Modern Mizunos pieces on, the issue must carry their credit and the CC BY-NC-SA 4.0 line." In addition, one layout warning: when ornaments are on and no page footer contains both "Modern Mizunos" and "CC BY-NC-SA", warn "Ornaments are on but no footer credits Modern Mizunos (CC BY-NC-SA 4.0)".

## 16. Saving: three client-side layers (answer)

All saving is in the browser or on the user's disk. Nothing is sent anywhere. The three layers, from least to most deliberate:

1. a draft the browser keeps on its own (16.2), so closing the tab loses nothing;
2. the issue as a .json file with images embedded, saved and opened by the user (16.1), which works in every browser and is the way to move an issue between machines or hand it to someone;
3. in Chrome and Edge, Save and Ctrl+S overwrite the file that was opened, through the File System Access API (16.4); elsewhere they download a new copy.

### 16.1 Save, Save as, Open

The issue JSON is section 8, 2-space indent, `images` serialised last. File name `<slug>.json`.

- **Open**: in a browser with File System Access, `showOpenFilePicker({types: [{description: "Gazette issue", accept: {"application/json": [".json"]}}]})`, keeping the returned handle as the issue's file handle; elsewhere a hidden `<input type="file" accept=".json">`. Either way the text is read, `format` and `version` validated, every image's data URL decoded into an Image object cached by id, the current issue replaced (confirm when it has any copy or image), and page 1 rendered.
- **Save** (button and Ctrl+S, the keyboard shortcut intercepted with `preventDefault` so the browser does not offer to save the HTML page): if the issue has a file handle, write to it (16.4); otherwise behave as Save as.
- **Save as**: with File System Access, `showSaveFilePicker` with the suggested name `<slug>.json`, then write and keep the new handle; elsewhere the download of 17.3.

Open, Save and Save as are the only places the file system is touched, and each is a user click or Ctrl+S. The tool never writes a file on its own.

### 16.2 Draft autosave

Written 1 s after the last change (debounced), restored on load without asking (status "Draft restored"; a "Discard draft" button in the Help panel clears it and loads a new issue). The draft is the same JSON string, in two stores:

- **localStorage**, key `gazette-builder.draft.v1`, tried first because it is synchronous and available in every browser. Typical quota is 5 MB per origin; an issue with ten photos is 2 to 3 MB, so it fits most of the time.
- **IndexedDB**, database `gazette-builder`, store `drafts`, key `draft`, used when localStorage throws (quota or unavailable). Its quota is far larger (hundreds of MB).

```
async function saveDraft(json) {
  try { localStorage.setItem(KEY, json); try { await idbDelete("draft"); } catch (e) {} return status("Draft saved " + time()); }
  catch (e) {}
  try { await idbPut("draft", json); try { localStorage.removeItem(KEY); } catch (e) {} return status("Draft saved " + time()); }
  catch (e) {}
  try { localStorage.setItem(KEY, jsonWithoutImageData); return status("Draft saved without images (too large): save the issue file"); }
  catch (e) { status("Draft storage unavailable: save the issue file"); }
}
```

Reading on load tries localStorage, then IndexedDB, each in try/catch or with the promise's rejection caught; whichever has a draft wins (localStorage first). `jsonWithoutImageData` keeps every image entry with `data` null. The IndexedDB helpers are twenty lines of plain `indexedDB.open` with `onupgradeneeded` creating the store; no library. Drafts are per browser profile and per origin (the Pages site and a local file are different origins), which the Help text says; the .json file is how an issue travels.

A file handle (16.4) cannot be put in localStorage; it is stored alongside the draft in IndexedDB (key `handle`) when available, so that after a reload Save can still overwrite the same file once the browser re-asks permission.

### 16.3 Missing images

An image entry with `data` null (a stripped draft, or a hand-edited JSON) is "missing": photo blocks using it draw the 12.4 placeholder with the image name instead of "no photo", the Images section shows it greyed with "re-import <name>", and importing a file of the same name fills it in.

### 16.4 File System Access (Chrome and Edge; proposal for the details)

Detected by `"showSaveFilePicker" in window`. Firefox and Safari do not have it (as of 2026) and get the download path with no message beyond the Help text.

- Writing: `const w = await handle.createWritable(); await w.write(json); await w.close();` then status "Saved <name> <time>".
- Permission: before writing to a handle restored from IndexedDB, `await handle.queryPermission({mode: "readwrite"})`; if not "granted", `await handle.requestPermission({mode: "readwrite"})` inside the click or key handler (the browser requires a user gesture). A denial falls back to Save as.
- Errors: an `AbortError` from a picker is the user cancelling (no message). Any other error shows "Could not write <name>; saving a copy instead" and runs the download path.
- Export PNGs also use `showSaveFilePicker` when available (one picker per file, suggested names from 17.1) so the user chooses where they go; elsewhere downloads.

### 16.5 Load sample

Replaces the current issue (confirm as in 16.1) with a deep copy of the embedded sample and clears any file handle. The sample's images get fresh decoded Image objects.

## 17. Export

### 17.1 Pages

"Export page" saves the selected page; "Export all" saves every page in order. Each page is rendered fresh with `preview = false` (no markers, texture on) and saved via `canvas.toBlob("image/png")` as `<slug>-page-<n>.png`, 1200 by 1600. A 390 px phone preview is not exported (later).

### 17.2 Confirm

If the warnings list is not empty, a confirm dialog lists the warnings (first 12, then "and N more") and the reminder text of 15.4, with OK to export anyway. With no warnings, only the reminder text.

### 17.3 Download path

One function `saveFile(filename, blob, kind)`:

1. With File System Access (16.4): `showSaveFilePicker({suggestedName: filename, types: [kind]})`, then write the blob through `createWritable`. `AbortError` is a cancel, silent.
2. Otherwise an `<a download>` with an object URL, clicked, then revoked after 1 s.

"Export all" calls it once per page and awaits each: with pickers the user places each file; with downloads Chrome asks once to allow multiple downloads and Firefox saves them to the download folder (the Help text says so). A ZIP of all pages is later.

## 18. Publishing (answer: "Both", on GitHub Pages)

Two copies of the same build, both from the new repository:

1. **The site**: GitHub Pages serving the repository root of `imperial64/beeblecraft-gazette` at https://imperial64.github.io/beeblecraft-gazette/. The built index.html is committed; there is no Pages build step, no Actions workflow, no Jekyll (a `.nojekyll` file at the root keeps Pages from processing anything). Enabling Pages (Settings, Pages, deploy from branch, root) is done once by the user in GitHub's UI; the repository must be public for Pages on a free account.
2. **The file**: the same index.html, downloaded from the repository (the README links the raw file) and opened from disk. It is the same bytes, so the two never drift.

Releasing a change is `python build.py`, commit index.html with the sources, push. Pages serves it within a minute or two.

Nothing a player does leaves their browser: their images are in their draft store and in the .json files they save, never on the site. The page carries only the tool, the font data, three 16 by 16 sprites and the downsized sample (about 2.5 MB; build.py refuses anything over 8 MB).

Licences in the file header (section 2) and the README cover both copies.

## 19. Acceptance: the implementer's own check

No audit. The implementer ticks these, then the parent sends the exported sample pages to the user next to page.png and page-2.png.

1. `python build.py` in F:\Projects\beeblecraft-gazette writes index.html under 8 MB with no reference to any path in beeblecraft-mc; opening it from disk with the network off shows the editor with a restored or new issue and no console errors; the browser's network panel shows no request.2. Load sample, export all: two 1200 by 1600 PNGs. Put each beside the Python page: masthead, kicker, wordmark and lantern positions identical; every column ends at the same y; the balance log (print it to the console on every layout: column label, flexible block ids and heights) reads page 1 south-water 94, south-snow 82, map 118, south-bridge 82; page 2 west-tunnel 65, west-bridge 85, west-temple 84, west-maze 103, matching render_issue.py's output. Text breaks identically (spot-check the "2 October" and "CC BY-NC-SA 4.0" lines and the desk column beside the figure). Differences allowed: the texture's random pattern, the photos' resampling, JPEG re-encoding.
3. Zoom into the exported masthead and a headline: no single-pixel edges; the photo frames are crisp; photos are smooth.
4. Warnings: add two paragraphs to the south story: overflow warning names column 2 with a px amount, and the red marker shows in the preview but not in the export. Delete the south-snow photo: gap warning. Type "ç" into a caption: missing glyph warning and a hollow box in the preview. Set the wordmark to 30 characters: wordmark warning. Turn ornaments off: no lanterns, chains or icons, and the credit warning does not fire; turn them on and clear the page 2 footer: it fires.
5. Save as, then New, then Open the saved file: the issue comes back identical (compare the JSON strings after a re-save). Reload the browser tab: the draft is restored. Force the localStorage path to throw (temporarily wrap setItem to throw over 1 MB): the draft lands in IndexedDB and restores after a reload; force both to throw: the stripped draft path runs, the status says so, photos show "re-import", and re-importing by name fills them.
6. In Chrome or Edge: Open a saved .json with the picker, change a caption, press Ctrl+S: the file on disk changes and no download happens; reload the tab, press Ctrl+S again: the browser asks for permission once, then overwrites. In Firefox: Save downloads a copy. Cancelling a picker shows no error.
7. Skin: the sample's skin is detected slim and matches figure-check.png at 2x; a classic skin (any 64 by 64 with opaque arm gaps; the implementer can paint the gaps on a copy of the sample skin) renders 32 wide and the desk text wraps at 128.
8. Served over https from the Pages URL (or, before Pages is enabled, from a local static server such as `python -m http.server` in the repository root): Load sample, Export page saves a PNG that opens; Save as writes the JSON.
9. At 400 px wide (device toolbar): no horizontal scroll, panels stacked, preview fits.
10. Text in the file and the README: no emojis; the header comment carries the three licence notices; the README has the Pages link, the offline instructions and the Support link.

## 20. Later (not in v1)

- Auto-flow of blocks across columns with story continuation ("continued in column 2"); v1 places blocks in the column the user chose.
- A lead photo across all three columns, or in columns 2 and 3.
- Export of the copy as journal Markdown (J-### block format) and import from it. Becomes v1 if questionnaire Q2 is answered A; then: "Export copy (Markdown)" writes `## \`<block id>\`` headings in page and column order with the paper fields first, paragraphs separated by blank lines, the register one line per entry; photo captions as `<id>-caption`, story headlines as `<id>-headline`, desk signature as `<id>-signature`, box and register titles as `<id>-title`.
- ZIP export of all pages; the 390 px phone preview.
- Shared online saving, for instance a small Cloudflare Worker with a key per paper so two people can open the same issue from anywhere. Nice-to-have only; v1 is entirely client-side.
- 64 by 32 legacy skins; a skin fetched by player name (needs the network).
- "Contain" fit for photos; rotation.
- Custom palette and paper colour; a second font. Other page sizes: not planned; portrait 1200 by 1600 is the format.
- Arbitrary polyline maps beyond the four lines from spawn.
- Adding glyphs to Salon Pixel (the user's font; done in pet-salon-tycoon, then re-ported).

## 21. Open questions

beeblecraft-mc/gazette/tool-questionnaire.md, three questions: the tool's licence (the LICENSE file of the new repository), which file is the source of truth for issue copy once the tool exists, and whether the Beeblecraft sample (with its screenshots) ships inside the public repository and site. Defaults to build against are stated there; none blocks the build.
