# Gazette builder v3: design spec

Written 2026-10-02 from the user's feedback on v2, the v2 spec (docs/design-v2.md, with its build log), and the v2 code (src/model.js, layout.js, render.js, editor.js, ui.js, index.html, build.py). v3 removes redaction, makes the masthead and the footer blocks, lets any placed block be dragged anywhere, replaces the thin drop line with a ghost of the page as it will be after the drop, and replaces the single column set per page with a stack of bands that each have their own columns, with spanning blocks that keep their span whatever is placed above them.

Everything in docs/design-v2.md (and through it docs/design.md) that this file does not change still holds; where they disagree, this file wins. "v2 section N" points into docs/design-v2.md.

Authority labels:

- **feedback**: the user's v3 feedback, quoted from the planning repository's feedback file, each point once where it is settled.
- **answer**: a decision the user made earlier that still applies: GitHub Pages hosting, all saving client-side, MIT code licence, portrait 1200 by 1600, Salon Pixel as the default font, the theme pane, the canvas renderer for preview and export, photos fill the column by default (questionnaire 2, Q3), the masthead texts shared across the issue (questionnaire 2, Q4), no mention of any AI vendor anywhere in the tool repository.
- **ported**: taken from v2 unchanged.
- **proposal**: my design decision, made so the implementer has none to make.
- **later**: out of scope for v3, section 14.
- **TBD**: waits on gazette/tool-questionnaire-3.md in the planning repository. Each TBD names its default; the build proceeds against the default. Section 15.

No audit and no review pass (user instruction). Each chunk in section 13 ends with the implementer's own checks. The implementer appends a build log at the end of this file, one entry per chunk, as v2 did.

## 1. What v3 changes, point by point

| Feedback (quoted) | Where it is settled |
|---|---|
| "redaction is not how i intended it to work, we can just straight up remove it." | Section 3 |
| "blocks should have masthead and footer as well that can be dragged onto the page." | Section 5 |
| "placed blocks should be moveable without losing context, if i put something down i should be able to just move it anywhere else by dragging it." | Sections 8.2, 8.6 |
| "placing down a block should give a preview of how it will look like once dorpped in. right now it gives a barely noticeable blue bar but it should just show what it will look like in a ghost view kind of way." | Section 9 |
| "putting anything on top between masthead and a 3 column spanning element immediately breaks the layout by forcing the 3 column spanning element to shrink down to a 1 column element fixed at the most left column. i think it needs to keep its properties regardless. the page should allow dynamic layouts, like for example in my paint illustration." | Sections 4, 6 |

The paint illustration (gazette/refs/tool-feedback-2/wanted-layout-sketch.png), top to bottom: the masthead; two columns; a photo across the full width; three columns, and lower down in that part a block across columns 2 and 3 while column 1 runs on beside it. In v3 terms (section 4): a masthead band, a two-column band, a one-column band holding the photo, and a three-column band whose column 2 holds, below its other blocks, a block with span 2.

## 2. Kept from v2 (ported)

The architecture of v2 section 2 (canvas renderer, overlay layer, hidden textarea editing), the art grid and constants of v2 section 4, the text engine of v2 section 5 (minus skip ranges, section 3), the theme of v2 section 6.3 (minus the redaction colour), the editor shell of v2 section 8, in-place editing of v2 section 11 (minus Redact), photos in place of v2 section 12, the theme pane of v2 section 13, saving and exporting of v2 section 15, the runtime rules of v2 section 17. Section 7 lists the editor changes.

The same repository, the same single-file deliverable, the same build (`python build.py`), the same file list (section 3 of v2); no new source files. The 8 MB limit and the no-outside-reference check stay.

## 3. Redaction is removed (feedback)

Removed from the tool, the model and the documents:

- The `redaction` block type: toolbox tile, `BLOCK_TYPES`, `BLOCK_FIELDS`, block defaults, the inspector case, the layout case.
- Inline marks: `redactions` objects on `paper`, pages and blocks; `rangesOf`, the skip ranges in `drawField`; `TX.draw` loses its `skip` and `redColour` parameters and vector runs lose `skip`; `normRanges`, `setRanges`, `adjustRanges`, `toggleRange`, `toggleRedact` and the calls to `adjustRanges` from `onEditInput` and from the inspector's text inputs; the Redact button in the text toolbar, its `#tbRedact` styling and its `aria-pressed` handling; the toolbar is `[Font select] [Size] [Colour swatch] · "applies to this text"`.
- The theme colour token `redaction`: gone from the default theme, the colour rows and the colour popover. An imported theme or an opened issue that still carries `colours.redaction` has it dropped on load; the theme file format stays version 1.
- `redactedText` in the Markdown export: text is written as it is.
- Every mention in Help, README, the header comment and the toolbox descriptions.

Old files (proposal, my call): a version 1 or 2 issue that carries redaction ranges opens with the ranges dropped and the text shown in full; the text was always in the file (questionnaire 2, Q1, answer A), so nothing new is exposed. Redaction blocks are removed on load. When either happened the status line says "Opened <name>: redaction marks dropped" or "Opened <name>: 2 redaction blocks removed" (or both, joined with "; "); the conversion note of section 4.7 comes first in the message.

## 4. The page model: bands, columns, entries, spans

### 4.1 Shape (proposal)

A page is a vertical stack of **bands**. A band has its own columns, `n >= 1`, of equal width by the v2 formula (v2 section 4.1, as implemented: n = 4 gives 130, 130, 129, 129). Each column is a list of **entries**. An entry is a block, or a **ref** `{"ref": "<block id>"}` that marks where a spanning block from a column to the left crosses this column.

A block in column `c` with `span` `s >= 2` covers columns `c .. c + s - 1` of its band from its own top down to its own bottom; each covered column holds one ref to it at the position where the block interrupts that column's stack. Spans go rightward only (to span left, move the block to the left column). Any block in a column may span, at any index, not only the first (changes v2 section 4.2). What is placed above or beside a block never changes its span, its height mode, its photo crop or its styles (feedback).

Masthead and footer blocks (section 5) always sit alone in a one-column band.

```json
{
  "format": "gazette-builder-issue",
  "version": 3,
  "title": "The Beeblecraft Gazette, No. 1",
  "paper": { "wordmark": "...", "tagline": "...", "kickerLeft": "...", "kickerCentre": "...", "kickerRight": "...",
             "ornaments": true, "skin": "img-skin", "skinModel": "auto", "styles": {} },
  "theme": { "...": "v2 section 6.3 without colours.redaction" },
  "pages": [
    {
      "bands": [
        { "columns": [ [ { "type": "masthead", "id": "masthead", "variant": "full" } ] ] },
        { "columns": [
            [ { "type": "photo", "id": "lead", "span": 2, "image": "img-lead", "zoom": 1, "focusX": 0.5, "focusY": 0.5,
                "headline": "", "caption": "...", "minH": 195, "maxH": 195 },
              { "type": "story", "id": "intro", "headline": "The office starts work", "body": "..." },
              { "type": "photo", "id": "south-water", "...": "..." } ],
            [ { "ref": "lead" },
              { "type": "story", "id": "south", "...": "..." },
              { "type": "photo", "id": "south-snow", "...": "..." } ],
            [ { "type": "desk", "id": "desk", "...": "..." }, { "type": "map", "id": "map", "...": "..." }, { "type": "photo", "id": "south-bridge", "...": "..." } ]
        ] },
        { "columns": [ [ { "type": "footer", "id": "page1-footer", "text": "Continued on page 2: ..." } ] ] }
      ]
    }
  ],
  "images": { "...": "v2" }
}
```

Field rules, where they differ from v2 section 6.1:

- `version` is 3. Version 1 and 2 files are migrated on load (section 4.7). A version above 3 is refused.
- `pages[].bands` replaces `pages[].masthead`, `pages[].columns`, `pages[].footer`, `pages[].styles` and `pages[].footerId`. A band is `{columns: [[entry, ...], ...]}`; unknown keys on a band or a page are kept and written back.
- `span` is allowed on any block that is not a masthead or footer; `styles` as v2; `redactions` is gone everywhere.
- Block ids are unique within a page (refs need it). Section 4.4.
- `paper.styles` keeps the overrides for the five masthead texts (they stay issue-level, answer).

### 4.2 Effective span and refs (proposal)

For a block at column `c` of a band with `n` columns, the effective span is `s = min(span, n - c)`; `span` is stored only when it is 2 or more. The invariant: for every spanner the band holds exactly one ref in each of columns `c + 1 .. c + s - 1` and none elsewhere; a ref never points at a block in its own column, at a block to its right, or at a block whose span does not reach it. Refs are not blocks: they are not selectable, not draggable, not listed in the inspector and not counted when a column or band is checked for emptiness.

Refs within one band must be consistently ordered: if two spanners share a column, their entries (own or ref) appear in the same order in every column they share. The editor keeps this by always inserting refs by vertical position (section 8.5); normalisation checks it (section 4.4) and the layout tolerates a violation (section 6.3).

### 4.3 Structure helpers (model.js)

Pure functions over a page object; every editor operation and the ghost preview (section 9) go through them, so the two can never disagree.

- `isRef(entry)`, `blocksOf(column)` (entries that are blocks), `findBlock(page, id)` returning `{band, col, idx, block}`.
- `blockPos(page, block)`: position by object identity.
- `removeBlock(page, block)`: splice the block out and every ref to it; returns its old position.
- `insertBlock(page, bandIdx, colIdx, idx, block, yHint, geometry)`: splice the block in, clamp `span` to `n - colIdx` (status "Span reduced to N to fit the band" when it changed), then place refs: in each covered column insert the ref before the first entry whose rect (from `geometry`, section 6.5; a ref's rect is its spanner's rect) has its vertical centre below `yHint`, else append. Without a geometry (load, keyboard moves): index 0 when the block is at index 0 of its own column, else the end of the covered column.
- `setSpan(page, block, s, yHint, geometry)`: remove the block's refs, store or delete `span`, place refs as above.
- `insertColumn(page, bandIdx, at, column)`: splice; then for every spanner at `c < at` whose effective span reached `at - 1` and beyond (`c + s - 1 >= at`), `span += 1` and a ref is inserted in the new column (index 0 when `yHint` is below the spanner's rect bottom, else after the new column's own blocks). The drop code passes `yHint`.
- `removeColumn(page, bandIdx, at)`: splice; every spanner at `c < at` with `c + s - 1 >= at` gets `span -= 1` (deleted when it reaches 1); refs to blocks that were in the removed column go too.
- `insertBand(page, at, band)`, `removeBand(page, at)`.
- `compact(page)`: remove every column that holds no block (refs do not count) through `removeColumn`, keeping at least one column per band; remove every content band with no block; if no content band remains, insert an empty one-column content band after the leading masthead band (or at the start when there is none) and before a trailing footer band; then `syncRefs(page)`.
- `syncRefs(page)`: restore the invariant of 4.2: clamp spans, drop refs that point nowhere or to a block that does not cover them, add missing refs (index 0 or the end, as above), drop duplicate refs.
- `renameBlock(page, block, id)`: set the id and rewrite its refs; used by the inspector's Id field.
- `uniqueIds(page)`: section 4.4.

### 4.4 Normalisation on load (proposal, extends v2 `normalize`)

For each page: `bands` must be an array of objects with `columns` arrays of arrays, else `[]`; entries that are neither an object with `type` nor `{ref}` are dropped; masthead and footer blocks that are not alone in a one-column band are moved into their own band at the same place (before the band for a masthead, after it for a footer); block defaults filled as v2; single-line and paragraph fields normalised as v2; `span` as v2 (deleted when 1).

Ids: within a page, a block whose id repeats an earlier one is renamed `<id>-2`, `<id>-3`, ...; refs are resolved before renaming: a ref with id X in column d matches the first block with id X in a column to the left whose span covers d; the matched block's new id is written into the ref. Then `syncRefs`, then the order check: simulate the layout order of 6.3 with no geometry; a spanner that can never become ready loses its span (`span` deleted, refs removed) and the status line says "Opened <name>: a span on <id> could not be laid out and was reset". A page with no bands gets a blank page's bands (section 5.4). `images` written last as v2.

### 4.5 Column arithmetic (ported)

`columnGeometry(n)` as implemented in v2. The width of a spanner at column c with effective span s is the sum of the covered widths plus `GUTTER * (s - 1)`. The 3-column note and the warning for more than 3 columns apply per band (section 6.6).

### 4.6 The sample (answer: issue 1 must still load and look as it does now)

sample/issue-001.json is rewritten in version 3 form by the implementer in chunk 1: each page becomes a masthead band (`variant` from the old `masthead`), one content band with the old columns and a `{ref: "lead"}` / `{ref: "west-lead"}` at index 0 of column 2, and a footer band with the old footer text and the old `footerId` as the block id. Copy is otherwise untouched. The sample loads with no reports and exports two pages that match the v2 exports pixel for pixel apart from photo resampling (the rules of section 6 reproduce v2's numbers for this structure; the chunk 1 checks say how to verify).

### 4.7 Migration (proposal)

Version 1 files run v2's `migrateV1` and then `migrateV2`; version 2 files run `migrateV2`:

1. For each page: bands = []. If `masthead` is "full" or "half" (v2 always set it), push a masthead band with that `variant`; a page that had no `masthead` key at all gets "full". Push a content band with `columns` (v2 shape) where every block at index 0 with `span >= 2` gets a ref at index 0 of each covered column, and (should a v2 file carry a span on a later block) a ref at the end of each covered column. Redaction blocks are dropped (counted for the status). If `footer` is not blank, push a footer band with `{type: "footer", id: footerId || "page<n>-footer", text: footer, styles: {text: styles.footer}}` (the `styles` key only when the page had a footer override). Delete `masthead`, `columns`, `footer`, `styles`, `redactions`, `footerId`.
2. `paper.redactions` and every block's `redactions` are deleted (counted as "marks dropped" when any was non-empty). `theme.colours.redaction` is deleted.
3. `version` = 3. The status line says "Opened <name> (converted from version 2)" (or "version 1"), followed by the redaction notes of section 3.

Draft keys: `gazette-builder.draft.v3`; on start, with no v3 draft, a v2 draft (`gazette-builder.draft.v2`) is migrated and its key removed, else a v1 draft likewise. Undo snapshots are version 3 documents (v2 section 8.5 unchanged).

## 5. Masthead and footer as blocks (feedback)

### 5.1 Block types (proposal; scope is TBD Q1, default A)

| Type | Text fields (role) | Other fields | Drawn as |
|---|---|---|---|
| masthead | the five `paper` texts (wordmark, tagline, kickerLeft, kickerCentre, kickerRight), shared across the issue (answer); the geometry records them with the masthead block as their owner | `variant`: "full" or "half" | v2 section 4.4 with rule 1 at the band's top instead of 16 |
| footer | `text` (footer) | | v2 section 4.5 at the band's top; an empty text draws the band at its minimum height (27) with no text, so it can be clicked and typed into |

Both live alone in a one-column band and are drawn across FULL_W. They may appear anywhere in the stack and more than once per page (default of TBD Q1): a masthead lower down is a section head drawn exactly like the top one (lanterns, chains, rules, the shared texts; "half" shows only the wordmark); a footer band in the middle is a shaded notice strip. The questionnaire's option B restricts them to the top and the bottom; section 15 says what changes then.

Toolbox tiles: "Masthead" first, "Wordmark, kickers and tagline", and "Footer" last, "Credits strip in a shaded band". Dragging either onto the page can only make a new band (section 8.3); clicking the Masthead tile adds a masthead band at the top of the page (index 0; below an existing top masthead when there is one), clicking the Footer tile adds a footer band at the end. Block defaults: masthead `variant` "full" on page 1 and "half" on later pages (as blank pages had), footer `text` "Footer text.". Ids `masthead`, `masthead-2`, ...; `footer`, `footer-2`, ... by the v2 id rule.

### 5.2 Inspector

Masthead block: heading "Masthead"; Wordmark, Tagline, Kicker left, Kicker centre, Kicker right (bound to `paper`, with the v2 note that they are shared by every page); "Variant: full | half"; the Ornaments checkbox and "Edit theme"; Id; Duplicate block, Delete block. Footer block: heading "Footer"; Text (textarea, 4 rows); Id; Duplicate, Delete. Neither shows "Span columns".

The Page inspector (v2 section 9.1) loses Masthead and Footer and gains a one-line description of the page's bands, "Layout: masthead · 2 columns · 1 column · 3 columns · footer", above the 3-column note. The v2 selection kinds `masthead` and `footer` go: everything selectable is a block, `{kind: "block", band, col, idx}`. The issues popover's click-to-select and the hit order of v2 section 9 work on blocks only; the masthead area and the footer band are the rects of their blocks.

### 5.3 Deleting and pages without them

Deleting a masthead or footer block is an ordinary delete (undo covers it). A page with no masthead starts its first band at `TOP = 16` (the y of the masthead's first rule); a page with no trailing footer ends its last content band at `PAGE_BOTTOM = 784` (as v2 did for an empty footer). The v2 inspector note "An empty footer removes the band" becomes "Delete the footer block to let the columns run to the bottom of the page".

### 5.4 New pages and presets

"New" and "Blank page" give `[masthead band, empty one-column content band]`, the masthead "full" on page 1 and "half" otherwise (ported rule). The blank-page hint of v2 section 8.3 shows whenever a page has no block in any content band, placed over the body area between the leading masthead band and the trailing footer band. The presets (front, inside, back, issue 1 pages) are rewritten in band form: front = masthead full, the v2 columns with the lead's ref, footer "Continued on page 2."; inside = masthead half, three columns, no footer band; back = masthead half, the v2 columns, footer with the credits template; the sample pages copied as 4.6 says.

### 5.5 Markdown export and the credit warning

`issueMarkdown` writes the five paper texts once at the top as v2, then each page's blocks band by band and column by column (refs skipped, masthead blocks write nothing); a footer block writes `## <id>` with its text, so the sample's `page1-footer` and `footer` headings are unchanged. The credit warning (v2 section 7.4) looks at the text of every footer block on every page.

## 6. Layout (layout.js)

### 6.1 Page assembly (proposal)

```
TOP = 16                       first band's top when no masthead leads
PAGE_BOTTOM = 784              last band's bottom when no footer trails
gap(a, b) between consecutive bands a then b:
  a masthead:      0           (the masthead's own 5 px margin is inside its height)
  b footer:        FOOT_GAP 8
  otherwise:       STORY_GAP 14 (also masthead after content, footer followed by content)
```

Band heights: a masthead band's height is `mastheadBottom - top` from v2 section 4.4 with every y shifted by `top - 16` (78 for the default full masthead, 45 for half); a footer band's is v2 section 4.5's `footerHeight` (27 minimum). Each content band is solved by section 6.3, which gives its minimum height `hMin` (every column's tail at natural height, flexible items at their minimum) and its gap-free maximum `hMax` (the smallest height any column can reach without a gap: `min over columns of colMin + tailCapacity`, where `tailCapacity` is the sum of `hi - lo` over the flexible items in that column's tail, section 6.3).

A trailing footer band (the page's last band, type footer) is pinned: its top is `PAGE_BOTTOM - height`, and `target = its top - FOOT_GAP`; otherwise `target = PAGE_BOTTOM`. Everything else stacks from `TOP` with the gaps above. Spare `S = target - (TOP + sum of heights + sum of gaps)` over the bands before the trailing footer, with content bands at `hMin`:

- `S >= 0`: walk the content bands from the last upward; each takes `min(S, hMax - hMin)` and S shrinks. Whatever is left goes to the last content band, whose columns then report gaps (6.6).
- `S < 0`: the last content band's height is `hMin + S` (it may be less than its minimum); its columns overflow and say so.

Then every band is laid out at its assigned top and height. A page with no content band is only mastheads and footers stacked from TOP; nothing reports.

The v2 page (masthead, one content band, trailing footer) comes out exactly as v2: the content band starts at 94, its target is `PAGE_BOTTOM - footerHeight - FOOT_GAP`, and the one band takes all the spare.

### 6.2 Masthead and footer bands (ported, shifted)

`masthead(ctx, issue, variant, top)`: v2 section 4.4 with `16` replaced by `top` everywhere (rule 1 at `top`, kickers at `top + 2`, chains from the rule bottom to the lantern, body top `last rule bottom + 5`); returns `{bottom, fields}`; the block rect recorded in the geometry is `{x: LEFT, y: top - 4, w: FULL_W, h: bottom - top - 1}`. The wordmark shrink, clip and lantern-gap reports are unchanged; their owner is the masthead block. `drawFooter(ctx, block, plan, orn, top)`: v2 section 4.5 drawn from `top` instead of `PAGE_BOTTOM - height`; the block rect is the band.

### 6.3 Content band solver (proposal)

Input: the band, its top `y0`, its assigned height `H` (or none, for measuring), the column geometry. Entries per column, with a spanner's own entry and its refs being the same **sync point**.

Segments: each column's entries split at sync points: `seg0, sync A, seg1, sync B, seg2 ...`. A spanner's members are columns `c .. c + s - 1`.

Order: a spanner is **ready** when, in every member column, the entry before it is laid out (its preceding segment is next in line). Spanners are processed in ready order; among several ready ones, the one whose own column index is lowest first. If none is ready while some remain (an inconsistent file; the editor never produces one), the remaining spanner with the lowest own column index and lowest entry index is demoted for this layout: treated as span 1, its refs ignored, and the issue "<id>: span could not be laid out; drawn in one column" reported.

Phase A, sync placement, top to bottom:

```
cursor[c] = y0 for every column                 (where the column's next segment starts)
for each ready spanner P:
  for each member m:
    seg = the segment of m before P
    minEnd[m] = seg empty ? cursor[m] : natural end of seg from cursor[m] with flex at lo, + STORY_GAP
  syncY = max over members of minEnd[m]
  for each member m with a non-empty seg: balance seg from cursor[m] to syncY - STORY_GAP
      (v2 balanceColumn with that target; the segment cannot overflow because syncY is the
       largest minimum; a shortfall reports "Column m has a gap of G art px above <P.id>")
  P.y = syncY; P.h = P.lo (fixed), unless P is tail-flexible (below)
  for each member m: cursor[m] = P's ink bottom + STORY_GAP
```

The spanner's run draws its headline, photo and caption as v2 (`makeItem(b, issue, photos, spanW, true)`); its ink bottom includes the caption. The first segment of a column has no gap before it (it starts at `y0`); later ones start at the cursor, which already includes STORY_GAP.

Phase B, tails: a column's **tail** is its entries after its last sync point, or the whole column when it has none. A spanner is **tail-flexible** when it is the last entry of every member column: then it is the tail of each member, so balancing each member's tail to the band bottom gives it the same height in every member, `clamp(target - P.y, lo, hi)`. Every other spanning photo keeps `lo` (v2's rule, now only for spanners with something below them in some member). Each tail is balanced from `cursor[c]` to `y0 + H` with v2's `balanceColumn` (v1 section 11 rules: flexible items share the spare equally up to their maxima); overflow and gap statuses as 6.6.

Measuring (no `H`): run Phase A, then `colMin[c]` = the tail's natural end with flex at `lo` (or `cursor[c]` for an empty tail) minus `y0`; `hMin = max over columns of colMin`; `hMax = min over columns of (colMin[c] + tailCapacity[c])` where `tailCapacity` sums `hi - lo` over the tail's flexible items (a tail-flexible spanner counts in each member); `hMax` is at least `hMin`.

For the sample's content band: the lead is a spanner at column 0 index 0 with a ref at column 1 index 0; both preceding segments are empty, so `syncY = y0 = 94`, the lead sits at 94 with `lo = hi = 195`, both cursors move to the caption bottom + STORY_GAP, and the three tails balance to the target exactly as v2's columns did. Column 3 has no sync point and starts at 94. Identical numbers.

### 6.4 Gutters and chains (ported, generalised)

Each content band has a gutter between adjacent columns, from the band's top to its bottom. With ornaments on, the chain is tiled in every gutter over that range except across spanners: over a spanner covering the gutter the chain stops `STORY_GAP / 2` (7) above the spanner's top and resumes `STORY_GAP` (14) below its ink bottom (the v2 resume y, so the sample's chains are unchanged; a spanner at the band top simply has no chain above it). Masthead bands tile their own lantern chains as v2; nothing is tiled in band gaps or footer bands. The geometry records each gutter's `breaks` (the ranges with no chain) for the drop zones of section 8.3.

### 6.5 Geometry record (proposal, replaces v2 section 7.3)

```
geometry = {
  top: TOP, target,
  bands: [{index, kind: "masthead" | "footer" | "content", y, h,
           columns: [{index, x, w, top, bottom}],            // content bands; top = band y
           gutters: [{after, x, w, top, bottom, breaks: [[y0, y1], ...]}],
           entries: [[{idx, ref, block: <geometry block>, y, h}, ...], ...]}],   // per column, refs included
  boundaries: [{at, y}],      // one per band boundary: before band 0, between bands, after the last; y = the bar centre of 9.2
  blocks: [{band, col, idx, type, id, span, members: [col, ...], x, y, w, h, fields, photo, flexible, obj}],
  texts: [textField, ...]
}
textField = {owner: {kind: "block", band, col, idx}, obj, name, role, single, style, x, y, w, h, lines}
```

`obj` is the object that holds the text (`issue.paper` for masthead fields, else the block), so the editor needs no owner-to-object mapping; the record is rebuilt on every render and never cached across renders (ported rule). A spanner's rect is its full width; `members` lists its columns. `RCTX` carries `band` too, so reports have `{level, text, page, band, column, block, owner}`.

### 6.6 Reports (feedback: warnings and issues, generalised)

Texts as v2 section 7.4 with the place named: "Page 2, band 3, column 1, west-maze: no photo". "band N" counts content bands only and is omitted when the page has one content band, so the sample's reports read as they did. New or changed:

Issues:

- "Column N overflows by M art px: cut copy or remove a block" (only the last content band can overflow; a band above the last always gets at least its minimum)
- "<id>: span could not be laid out; drawn in one column" (6.3)

Warnings:

- "Column N has a gap of M art px: add copy or a photo" (a tail ending short of the band bottom)
- "Column N has a gap of M art px above <id>" (a segment ending short of a spanner)
- "Column N is empty" (a column with no block on a page that has content blocks; the blank page's one empty column is silent, as chunk 5 of v2 settled)
- "Band N has C columns; the format was designed for 3" (per band, C > 3)
- "Span on <id> reduced to N to fit the band" is not a report; it is a status message at the time of the move (4.3)

Everything else (no photo, missing photo, glyphs, units, register lines, signature, map checks, skin, fonts, wordmark, lantern gap, upscaled photo, Modern Mizunos credit) is unchanged. Overflow and gap markers on the preview canvas are drawn per column as v2, gaps above spanners included (from the segment's end to the spanner's top minus STORY_GAP).

## 7. Editor changes outside drag and drop (ui.js, editor.js)

- Selection: `{kind: "block", band, col, idx}` only; `validSel`, `selectedBlock`, `blockAt`, `geoBlock`, `selRect`, `sameSel`, `locateBlock`, `selectDropped` take the band into account. `hitTest` order: text fields, photo rects, block rects, else the page.
- Inspector per block as v2 section 9.3, plus section 5.2, with "Span columns" shown on every block except masthead and footer, offering 1 to `n - col`; changing it calls `setSpan` with the block's current top as `yHint` and the current geometry. The Id field calls `renameBlock`. "Duplicate block" inserts the copy right after the original in the same column, keeps its span, and places its refs right after the original's in each covered column (changes v2, which dropped the span). "Delete block" calls `removeBlock` then `compact`.
- Photo controls (v2 section 12): a spanning photo shows Flexible and Fixed like any other, with the note "A photo across several columns stretches only when nothing follows it in any of its columns" (6.3).
- Toolbox order: Masthead, Story, Photo, Box, Desk, Register, Map, Footer. Click-to-add for content types: the end of the selected block's column; else the first column of the last content band; the blank page's empty column when there is nothing. Masthead and Footer as 5.1.
- Keyboard (v2 section 8.4): Alt+Up/Down swaps the block with the previous or next entry of its column (a ref counts as an entry, so a block can step past a spanner); Alt+Left/Right moves it to the end of the previous or next column of the same band; Delete and Backspace delete; the moved block keeps its span (clamped, 4.3) and its refs are re-placed without a geometry hint.
- Page inspector as 5.2. Page tabs, the `+` menu, undo and redo, the issues indicator and popover as v2 with the new owners.
- The status line after a drop into a narrower band: "Span on <id> reduced to N to fit the band".

## 8. Drag and drop (editor.js)

### 8.1 Two kinds of drag (proposal)

Block drags (a tile from the toolbox, a placed block, the grip) are done with pointer events, not the HTML5 drag-and-drop API: pointerdown on the source, a move of more than 4 CSS px starts the drag, `setPointerCapture` keeps the events on the source element, `artPoint(ev)` converts `clientX/Y` to art px through the overlay's bounding rect whatever element has capture, pointerup drops, Escape cancels. This is what lets a drag start from a block body after the threshold (8.2), makes the tiles plain elements again, and gives touch a path (`touch-action: none` on the tiles and the overlay; v2's "later" item for touch is thereby covered for moves and tile drags, pinch zoom stays later). File drags from the file explorer keep the HTML5 events (`dragover`, `drop`) of v2 section 10.5, because they come from outside the page; both kinds call the same `dropTarget` and the same ghost (section 9).

`DRAG = {kind: "new" | "move" | "files", type, from: {band, col, idx, block}, start: {x, y}, active, target, key}`; `active` becomes true past the threshold. While a drag is active a small chip follows the pointer (12 px, editor-styled, the block type for new blocks or "<type> · <id>" for a move) so that a drag is visible even off the page; the chip is in the document body, `pointer-events: none`.

Auto-scroll: when the pointer is within 24 CSS px of the stage's top or bottom edge during an active drag, the stage scrolls 8 px per animation frame in that direction.

### 8.2 Moving a placed block (feedback; TBD Q2, default A)

- Pointerdown on a block that is not the selected block, followed by a move past the threshold, drags that block (kind "move") wherever the pointer went down on it, text or photo included. Pointerup without a move is the v2 click: select, and start editing when it was on text.
- On the selected block the body keeps its v2 jobs (a drag on text selects text, a drag on a photo pans it); the grip above the frame drags the block, as in v2, and stays the handle that always moves.
- A masthead or footer block drags the same way; it can only land as a band (8.3).
- The hover outline (v2 section 8.2) shows the `grab` cursor over an unselected block's non-text area and `text` over its text, as v2.

Option B of Q2 keeps v2's grip-only moving (with the grip shown on hover as well); option C moves on any drag and needs a double-click to start editing text. Section 15.

### 8.3 Drop targets (proposal, replaces v2 section 10.3)

`dropTarget(p, drag)` classifies the pointer in art px, in this order:

1. **Photo (files only)**: over the photo rect of a photo block → `{kind: "photo", band, col, idx}` (v2 section 10.5).
2. **Masthead or footer payload** (a tile of that type, or a move of such a block): the nearest band boundary by `|p.y - boundary.y|` → `{kind: "band", at}`; a move excludes the boundaries just before and just after its own band (self).
3. **Band bars**: `p.y` within a boundary's bar (section 9.2: 6 art px centred on `boundary.y`) → `{kind: "band", at}`. The new band's column count is TBD Q3 (default: one column, the dropped block full width).
4. **Page margins**: `p.x < LEFT + 20` or `p.x > RIGHT - 20` → a new column at the left or right of the content band under `p.y` → `{kind: "newcol", band, at: 0 | n}`; over a masthead or footer band, or outside every band, → `none`.
5. **Gutters** of the content band under `p.y`: `p.x` within a gutter widened by 4 px each side and `p.y` not inside one of the gutter's `breaks` (a spanner across it) → `{kind: "newcol", band, at: after + 1}`.
6. **Into a column** of the content band under `p.y` (the column whose x range contains `p.x`, else the nearest): index among the column's entries, refs included: the first entry whose vertical centre is below `p.y` gives the index before it, else the end → `{kind: "col", band, col, idx}`.
7. Over a masthead or footer band with a content payload, or above the first boundary's bar, or below the last: `none`.

The band "under `p.y`" is the band whose `[y, y + h)` contains it, where the last content band reaches `target`; between bands (outside the bars) the nearer band.

Self, for moves: `col` with the same column and `idx` equal to the block's index or index + 1; `newcol` beside a column whose only block is the moved one; `band` just before or after a band whose only block is the moved one. A self target shows no ghost and drops nothing.

### 8.4 Applying a drop (proposal)

`applyDrop(page, target, payload, geometry)` mutates `page` (the real page on drop, a clone for the ghost) and returns the landed block and its position. `payload` is `{kind: "new", type}`, `{kind: "move", block}` (the block object; for a clone, the block at the same position in the clone), or `{kind: "photos", images: [id | null, ...]}` (one photo block per image; nulls draw the "no photo" placeholder, which the ghost uses before the files are imported).

1. A move first calls `removeBlock`, then `compact` on the source. Targets name positions by index from the pre-drop geometry, so after the removal they are re-resolved: the target band and column were remembered as objects before the removal; if compaction removed one of them, the index they had is used, clamped. For the `col` target the entry before which to insert was remembered as an object too; if it is gone, the end of the column.
2. `band`: `insertBand(page, at, {columns: [[block]]})`; with Q3 option B the new band copies the column count of the nearest content band above (or below, or 1) and the block goes in column 1. `newcol`: `insertColumn(page, band, at, [block])` with `yHint = p.y`. `col`: `insertBlock(page, band, col, idx, block, p.y, geometry)`. Photos: the first image lands at the target, the rest follow it in the same column.
3. `compact(page)`; a toolbox drop no longer keeps empty columns (changes chunk 3 of v2: the ghost shows the result, so a blank page's empty column vanishing when a block is dropped at its right edge is what the user sees before dropping; the v2 check "a story dropped at the right edge of a blank page gives 2 columns" becomes 1 column).
4. On the real page: select the landed block, `structural()`, one undo snapshot.

A masthead or footer payload only ever reaches step 2 as `band`. Spans survive a move (4.3), including through `insertColumn` and `removeColumn`'s span adjustments; "keeping its content and properties" holds because the same block object is moved.

### 8.5 Refs on insertion (summary of 4.3 for the implementer)

When a spanner lands at `(band, col, idx)` with the pointer at `p.y`, each covered column gets its ref before the first entry whose centre is below `p.y`, so the spanner interrupts every covered column at the height where it was dropped; the ghost shows the result. The same rule serves "Span columns" in the inspector with the block's own top as `p.y`.

### 8.6 File drops (ported, generalised)

As v2 section 10.5 through `dropTarget` and `applyDrop` with a `photos` payload; `dragover` shows the ghost with placeholder photos (one per file in `dataTransfer.items` of an image type, at least one), the drop imports the images and then applies. Non-image files are skipped with the v2 status.

## 9. Ghost preview and the "+" affordances (feedback)

### 9.1 The ghost (proposal)

While a drag has a valid, non-self target, the overlay shows `<canvas id="ghost">` (1200 by 1600, the page's CSS size, `pointer-events: none`, placed exactly over the page canvas) instead of the v2 line and rectangle:

1. On every target change (the target's JSON as the change key, one render per animation frame at most): clone the current page, apply the drop to the clone (8.4), build a shallow issue copy with that page, and `renderPage(copy, pi, ghost, {fast: true})` (no texture, no markers), which draws the whole page as it would be after the drop: columns narrowed or widened, blocks reflowed, the moved block gone from its old place, photos drawn through the normal screen pass.
2. The landed block's rect (from the returned geometry, by the position `applyDrop` returned) is then faded: fill it with the theme's paper colour at alpha 0.45 and stroke a 2 screen px dashed outline in `--accent`. That is the "ghost view": the rest of the page is the real reflowed page, the new block reads as translucent.
3. The ghost canvas is shown opaque over the page canvas, so the page appears to have already reflowed; the selection frame, hover outline, issue dots, photo controls and the text caret are hidden while the ghost shows. Leaving the page, a `none` or self target, drop and cancel hide it; the page canvas underneath is untouched.

The ghost render is the v2 fast path (an art pass and the 2x upscale), already used on every keystroke, so it is cheap enough per target change. `drawMarkers` is not called for the ghost; reports from the ghost layout are discarded (`REP` stays null).

### 9.2 Bars, strips and the "+" (feedback: "+" previews, ported from v2 and extended)

While any drag is active the overlay also shows, in `--accent` at 30 percent alpha, `pointer-events: none`:

- a **bar** for every band boundary: 6 art px tall, from LEFT to RIGHT, centred on the boundary's y: `TOP - 7` before the first band; the centre of the gap between two bands (for the 0 gap after a masthead, `next top - 3`); `bottom + 5` after the last band (`target + 5` after a content band, `PAGE_BOTTOM + 5` after a trailing footer);
- a **strip** at each page margin of the content band under the pointer, 6 art px wide at `LEFT - 10` and `RIGHT + 4`, the band's height, and one in each of that band's gutters, 6 px wide centred, over the gutter's chain ranges (not over `breaks`).

The one the pointer is on draws at full alpha with a 28 px circle in `--accent` and a white "+" (v2's) at its centre (bars: horizontally at the pointer's x; strips: at the pointer's y). When the result would have more than 3 columns, a chip under the circle reads "4 columns; the format was designed for 3" (the number filled in), as v2's label did. The v2 "New column" rectangle and its label are gone: the ghost is the preview. Masthead and footer payloads show only the bars, since those are their only targets.

## 10. Saving, exporting, help (ported, renamed where needed)

Buttons, files and status messages as v2 section 15. Help panel sections: Making an issue (toolbox, drag, click to type, photos by drop); Bands and columns ("a page is a stack of bands, each with its own columns; drop a block on a band bar for a new band, at an edge or in a gutter for a new column, and set Span columns to let a block run across several; a block keeps its span whatever you put above it"); Moving blocks (drag an unplaced tile or a placed block; the strip above a selected block always drags it; the ghost shows the page as it will be); Masthead and footer (blocks like any other; delete them for a bare page; the texts are shared); Text; Photos; Theme; Issues and warnings; Save versus export; Before posting; The font; Licences. No Redact anywhere. README's "Making an issue" steps are rewritten to match (step 3 bands and columns, step 4 without Redact, masthead and footer as blocks); the issue-file paragraph points to this file's section 4. The header comment is unchanged apart from the redaction mention, if any.

## 11. Runtime rules (ported)

All of v2 section 17. Pointer drags need `touch-action: none` on the tiles and the overlay and must not break stage scrolling by wheel or by touch outside a drag (the threshold ensures a tap does not start one). The sample, New, Open, Save, Export page, Export all pages and Export text must work end to end from `file://` with no console errors and no requests after every chunk.

## 12. Removed from v2

The `redaction` block, inline marks, the Redact button and colour token (section 3); `pages[].masthead`, `pages[].columns`, `pages[].footer`, `pages[].styles`, `pages[].footerId` (section 4); the selection kinds `masthead` and `footer` (section 5.2); `fixSpans` (spans are allowed anywhere; `syncRefs` replaces it); HTML5 drag for tiles and the grip (8.1); the drop line, the new-column rectangle and its label (9.2); the v2 rule that only the first block of a column may span and that a moved spanner loses its span (4.1); the v2 rule that a spanning photo is always fixed (6.3); the chunk-3 deviation that toolbox drops keep empty columns (8.4).

## 13. Build chunks

Each chunk leaves a working tool: `python build.py` succeeds, index.html opens from disk with no console errors, the sample loads with no reports and exports, Save then Open round-trips. Chunks are built in order; a chunk's checks are the implementer's own (no audit, user instruction). The implementer appends the build log entry at the end of this file after each chunk.

### Chunk 1: model v3, layout, masthead and footer blocks, redaction gone

Scope: sections 3, 4, 5, 6, 7, 10's Markdown and credit changes. Model helpers of 4.3, normalisation of 4.4, migrations of 4.7 and the draft keys, the sample rewritten (4.6), presets in band form (5.4). Layout: page assembly, masthead and footer bands, the band solver, gutters with breaks, the geometry record, reports with bands. Editor: block-only selection, the inspectors of 5.2 and 7, toolbox tiles for Masthead and Footer with click-to-add, "Span columns" on every block through `setSpan`, Duplicate with span, Delete through `removeBlock` and `compact`, keyboard moves. The v2 drag and drop stays running on top with the least change: `dropTarget` classifies within the content band under the pointer (edge, gutter, column with refs as entries) and keeps the v2 line and rectangle previews; drops go through `applyDrop` (8.4) without the `band` target (bands come from migration, mastheads and footers until chunk 2); masthead and footer tiles are not draggable yet.

Checks: the sample loads with no reports and both exported pages are pixel-identical to the v2 exports apart from photo pixels (compare with the chunk 6 exports of v2; the balance log per column is unchanged: page 1 south-water 81, south-snow 63, map 118, south-bridge 82; page 2 west-tunnel 58, west-bridge 81, west-temple 81, west-maze 103). A v2 file with a redaction range and a redaction block opens with the text in full, the block gone and the status naming both; a v1 file converts through both steps and re-saves as version 3; Save, New, Open gives a byte-identical file. On the sample, a story inserted at the top of column 1 above the lead (Alt+Up after a click-to-add, or the inspector) pushes the lead down in both columns, keeps its span and width, and column 2 reports "Column 2 has a gap of M art px above lead". Setting span 2 on a block at the bottom of column 2 of a three-column page puts a ref at the end of column 3, draws the block across columns 2 and 3 with column 1 running on beside it, and the chain in gutter 2|3 stops above it; setting span back to 1 removes the ref. Deleting the masthead block starts the content at y 16; deleting the footer block runs the columns to 784; a second masthead added mid-page draws rules, lanterns and the wordmark at its band. Duplicate on the lead gives a second span-2 photo right below it with a ref right after the lead's in column 2. A hand-made file with inconsistent refs opens with the status of 4.4. The Markdown export of the sample is unchanged. `grep -ri redact src docs/design-v3.md README.md` finds nothing.

### Chunk 2: pointer drag and drop, free moving, bands and columns by drop

Scope: section 8 in full, section 9.2's bars and strips (with the v2 insertion line kept as the interim in-column preview and the strip and bar highlight as the interim new-column and new-band preview; the ghost comes in chunk 3). Tiles, block bodies and the grip drag with pointer events; the chip; auto-scroll; Escape cancels; `dropTarget` of 8.3 with the band bars and masthead and footer snapping; `applyDrop` for all targets including `band` and `photos`; spans kept on moves with `insertColumn` and `removeColumn` adjustments; file drops through the same path; the 3-column chip.

Checks: on a blank page a story dropped on the bar below the content band makes a second band with the story full width (TBD Q3 default); dropped at the right margin of the first band it makes a second column there and the blank band's empty column goes (one column, then two after a second drop). Dragging a placed story by its body (not selected) moves it; clicking it without moving selects it and a click on its text starts editing as before; with the story selected, dragging its text selects text and the grip moves it. The lead dragged into column 3 of the sample keeps span 2 clamped to 1 with the status "Span on lead reduced to 1 to fit the band", its caption, crop and fixed height intact; dragged back to column 1 index 0 it is span 1 (the stored span was reduced) and the inspector sets it to 2 again. A span-2 block dragged from a three-column band into a one-column band is full width in that band's single column and spans 1. Dropping a block in a gutter inside a spanner's range makes four columns with the spanner's span grown to 3 and a ref in the new column. A masthead tile dropped anywhere on the page lands on the nearest band boundary; a footer dropped mid-page is a shaded strip there and a footer dropped at the end is pinned to the page bottom. Two PNG files dropped on the bar below the last band make a one-column band with two photo blocks. Touch: a tile dragged with a touch pointer on a phone-width layout drops on the page. Undo reverses each drop in one step. Dropping on a self target does nothing. The sample still exports unchanged.

### Chunk 3: the ghost preview

Scope: section 9.1; the interim line and highlight previews are removed, bars and strips stay as 9.2.

Checks: dragging a story over the sample's column 2 shows the page reflowed with the story faded where it would land and the blocks below it moved down, updating as the pointer moves between slots; over a gutter the ghost shows four narrower columns with the chip "4 columns; the format was designed for 3"; dragging the lead by its body shows the page without it in columns 1 and 2 and with it faded at the target; a masthead tile dragged over the middle of the page shows the ghost masthead band at the nearest boundary; the ghost disappears on Escape, on leaving the page and after the drop, and the page underneath is unchanged until the drop; the ghost never shows texture or markers; ghost renders happen at most once per animation frame (count them with a counter while moving the pointer continuously). Reports are unaffected by ghost renders (the indicator does not change while dragging).

### Chunk 4: help, README, final pass

Scope: section 10; the v2 acceptance checks that still apply (saving layers, File System Access, skin, phone width, no emojis, no vendor names); the header comment.

Checks: Help and README have no Redact and describe bands, moving by drag and the masthead and footer blocks; `grep -ri` for vendor names and emojis over the repository finds nothing; the build is under 8 MB; from `file://` the sample loads, exports two pages, saves, reopens after New and re-saves byte-identical with no console errors and no requests; a v1 file and a v2 file open and convert; at 400 px wide the panes stack, a tile drags onto the page by touch, and nothing scrolls sideways.

## 14. Later (not in v3)

- Per-block masthead texts (a mid-page masthead with its own wordmark); the texts stay shared (answer).
- Dragging a block's right edge to set its span; spanning leftward.
- Nested splits (a region spanning two columns that is itself divided), beyond what bands and spans express.
- Pinch zoom on photos; keyboard moves between bands.
- Everything in v2 section 19 not covered here (word-level styles, editable layout constants, pixel-font mode for TTFs, ZIP export, phone preview, shared saving, 64 by 32 skins, contain fit and rotation, auto-flow of stories).

## 15. Open questions

gazette/tool-questionnaire-3.md in the planning repository holds the user decisions. Each has a default; the build proceeds on it until answered.

- **Q1, masthead and footer scope** (section 5.1). Default A: free blocks, anywhere, more than one per page. Option B (top and bottom only, one each): `dropTarget` step 2 snaps a masthead to the first boundary and a footer to the last, the tiles are disabled while the page has one, and a mid-page masthead or footer in a file is moved to its end on load; nothing else changes, so chunk 1 can build the general case and chunk 2 restricts it.
- **Q2, moving by dragging the body** (section 8.2). Default A. Option B: no body drags; the grip shows on hover as well as on selection. Option C: any drag on any block moves it, a double-click starts text editing and a single click only selects; the v2 "click to type" sentence in Help changes.
- **Q3, the column count of a new band** (section 8.4). Default A: one column. Option B: the column count of the nearest content band above (else below, else 1), the block in column 1; the ghost shows either.

Decisions (answered 2026-10-02, gazette/tool-answers-3.md): Q1 is A and Q3 is A, as built. Q2 is B, "Handle on hover": the strip above a block stays the only move handle and shows on hover as well as on selection, so every block has a visible handle without being selected first; a drag on a block's body always edits (text selection, photo pan) as in v2. Section 8.2's first and last bullets and the "drag a placed block by its body" wording of sections 8.1, 9.1, 10 and the chunk 2 and 3 checks are read with that change.

## Build log

(The implementer appends one entry per chunk here, as in docs/design-v2.md: what was built, what was checked, deviations and decisions, notes for the next chunk.)

### Chunk 1 (2026-10-02)

- Redaction is gone from the tool: the block type, inline marks, skip ranges in the text engine, the Redact button, the colour token, the Markdown blackout, Help and README. What is left in src/model.js is the migration that drops old marks and blocks and its status notes.
- Issue format version 3 (section 4): pages are stacks of bands. model.js has the structure helpers of 4.3 (`isRef`, `blocksOf`, `findBlock`, `blockPos`, `removeBlock`, `insertBlock`, `setSpan`, `insertColumn`, `removeColumn`, `insertBand`, `removeBand`, `compact`, `syncRefs`, `renameBlock`, `uniqueIds`) plus `effSpan`, `clampSpan`, `placeRefs`, `bandKind` and `spanOrder` (the ready order of 6.3, shared by the layout and by the order check on load). Normalisation (4.4), `migrateV2` after `migrateV1` (4.7), the v3, v2 and v1 draft keys, the rewritten sample (4.6, with `masthead` as the id of each page's masthead block) and the presets in band form are in.
- layout.js: page assembly (6.1), masthead and footer bands drawn from their top (6.2), the band solver with sync points, segments, tail-flexible spanners and measuring (6.3), gutters with breaks (6.4), the geometry record of 6.5 (bands, boundaries, blocks with `obj`, texts with `obj`) and reports with bands (6.6).
- Editor: block-only selection with the band in it, the masthead and footer inspectors (5.2), the Page inspector's Layout line, Span columns on every block through `setSpan`, Id through `renameBlock`, Duplicate with span and refs, Delete through `removeBlock` and `compact`, the Masthead and Footer tiles with click-to-add, keyboard moves. Text editing sessions now hold the edited object (`ED.obj`), so masthead texts and footer texts need no owner mapping. The v2 HTML5 drag stays on top with `dropTarget` and `applyDrop` of section 8 (no band target; masthead and footer tiles are not draggable yet).
- Checked: the sample loads with no reports, the balance log is page 1 south-water 81, south-snow 63, map 118, south-bridge 82 and page 2 west-tunnel 58, west-bridge 81, west-temple 81, west-maze 103, and both pages rendered to canvas are identical to the v2 build's in every pixel; through Export all pages each PNG differs from the v2 render in one photo pixel by one level (resampling, as v2 chunk 2 noted). The Markdown export is byte-identical to v2's. A v2 file with a range over "Beeblecraft" in the intro and a redaction block opens with "Opened v2-redact.json (converted from version 2): redaction marks dropped; 1 redaction block removed", the text in full and no redaction key left. The v1 issue 1 file says "converted from version 1" and saves as version 3. Sample, Save, New, Open, Save gives a byte-identical file. A story added to column 1 and moved up three times with Alt+Up sits above the lead; the lead keeps span 2 and width 372 and moves down to y 153 in both columns, and column 2 reports "Column 2 has a gap of 59 art px above lead" (the columns also overflow, since issue 1 was full). Span 2 on south-snow draws it across columns 2 and 3 at 372 wide with column 1 running on beside it, the chain in gutter 2|3 breaks from 625 (7 above it) and the ref sits in column 3; span 1 removes the ref. Deleting the masthead starts the content band at 16; deleting the footer too runs it to 784. A second full masthead inserted after the content band draws rules, lanterns, kickers, wordmark and tagline at 671. Duplicate on the lead gives photo-10, span 2, right below it, with its ref right after the lead's in column 2. The hand-made file with crossed refs opens with "a span on a could not be laid out and was reset". From file:// the sample loads, Export all pages saves two PNGs, Save, New, Open and Save again are byte-identical, with no console errors and no requests.
- Deviations and decisions:
  - Empty segments: a spanner with nothing above it in a member column while another member pushes it down reports "Column N has a gap of M art px above <id>" for that column too (the space from the column's cursor to the spanner). Section 6.3's pseudocode only reports non-empty segments; the chunk 1 check expects the report in column 2, whose segment above the lead is empty.
  - The ref of a spanner placed by Span columns goes by the block's top (section 7). On issue 1, south-snow's top is above south-bridge's centre, so its ref lands before south-bridge, not at the end of column 3 as the chunk 1 check expects; the check's wording fits a column 3 that ends above the block.
  - `compact` keeps a page's first empty content band where it is when no content band has a block, instead of removing it and inserting a new one after the leading masthead; otherwise adding a second masthead to a blank page would move the empty band above it.
  - Masthead block rects follow 6.2 (`top - 4` to `bottom - 1`), so a masthead selection frame is 12 to 89 instead of v2's 12 to 92.
  - A footer block with empty text still draws its band at 27 with the lantern, so it can be clicked and typed into (5.1).
  - Duplicating a masthead or footer puts the copy in a band of its own right below, since those blocks live alone in their band.
  - The issue-level credit warning counts only content blocks, so New (a masthead and an empty band) still has no reports.
  - `grep -ri redact src README.md` finds only the migration code and its status notes, which section 3 requires; this file keeps its own description of the removal.
- For chunk 2: `dropTarget(p, drag)` with `drag = {kind: "new" | "move" | "files", type, from: {band, col, idx, block}}` and `selfCheck` are in editor.js; `applyDrop(page, target, payload, geometry, yHint)` already handles the `band` and `photos` payloads and re-resolves positions after a move; `commitDrop` selects the landed block, takes one undo snapshot and sets the span status. `bandUnder(G, y)` gives the band under the pointer. The geometry has `boundaries` (bar centres of 9.2) and `bands[].gutters[].breaks`.

### Chunk 2 (2026-10-02)

- Built to the Q2 answer B (see Decisions above): the strip above a block is its only move handle and shows on the hovered block (`#ovHoverGrip`, inside the hover outline) as well as on the selected one (`#ovGrip`); a drag on a block's body selects text or pans a photo as in v2. The hover outline stays on its block while the pointer travels up to the handle.
- Tiles and handles drag with pointer events (8.1): 4 CSS px threshold, pointer capture, a chip ("story", "photo · lead") next to the pointer, auto-scroll within 24 CSS px of the stage's top or bottom edge (the window at phone width, where the stage does not scroll itself), Escape cancels. File drags keep the HTML5 events and go through the same `dropTarget`, previews and `applyDrop` with a `photos` payload. `dropTarget` has all of 8.3: photos for files, masthead and footer payloads snapping to the nearest band boundary (not the ones beside a moved band), band bars, margins, gutters outside their breaks, columns with refs as entries, and self targets. The interim previews of chunk 2 are in: bars at every band boundary, strips at the margins and in the gutters of the band under the pointer, the one the pointer is on at full strength with the "+" circle and the "N columns; the format was designed for 3" note, v2's insertion line inside a column and the photo-frame highlight. The v2 new-column rectangle is gone.
- Checked with real mouse drags (playwright-cli, http and file://): on a blank page a story dropped on the bar below the band, and one dropped at the right margin, each give one band with one column holding the story; a second right-margin drop gives two columns. Dragging a fourth column in shows the bars, four strips, the "+" and "4 columns; the format was designed for 3"; Escape leaves the page as it was and removes the chip. A drag across the intro's body selects 60 characters of it and moves nothing; the hover handle moves intro into column 2 between south and south-snow in one undo step, and Ctrl+Z puts it back. A click on the map selects it without editing; a click on south's body starts editing. The lead dragged into column 3 lands between map and south-bridge with "Span on lead reduced to 1 to fit the band", minH and maxH 195, zoom 1 and focus 0.5 and its caption intact; dragged back to the top of column 1 it is span 1, and Span columns 2 puts its ref back at the top of column 2. A box dropped on the bar above the footer makes a one-column band; the lead dragged into it is 566 wide, span 1, with the status. A story dropped in gutter 1|2 below the lead makes four columns, the lead spans 3 at 421 wide and column 2 starts with its ref; one Ctrl+Z undoes it. A masthead tile dropped in the middle of the page lands on the nearest boundary (after the top masthead); a footer dropped at y 330 lands there too and draws as a shaded strip at 94; after the page's footer is deleted, a footer dropped below the last band is pinned at 757. Two PNG files dropped on the bar below the last band make a one-column band with photo-10 and photo-11 ("Imported 2 images"). Dropping a block on its own place changes nothing and adds no undo step. At 400 px wide with touch emulation a story tile dragged by a touch pointer lands in the page's band, and nothing scrolls sideways. At 200 percent zoom the stage scrolls while the pointer holds near its bottom edge, and the wheel still scrolls it afterwards. A v2 draft is migrated on start and its key removed. The sample still exports two pages equal to the v2 exports apart from one photo pixel by one level each, its Markdown is unchanged, the v2 and v1 files open as in chunk 1, and from file:// Save, New, Open, Save is byte-identical with no console errors and no requests. The vendor and emoji grep over the repository finds nothing.
- Deviations and decisions:
  - Q2 B (Decisions): no drags start from a block's body, so `touch-action: none` is on the tiles and the handles only, not on the overlay; touch scrolling over the page keeps working.
  - A drop on a blank page compacts the blank band away (8.4 step 3), so "a story dropped on the bar below the content band makes a second band" gives one band holding the story, like the right-margin drop.
  - A footer dropped "mid-page" snaps to the nearest boundary (8.3 step 2); with the sample's tall content band that is the boundary under the top masthead, not the middle of the page.
  - Two photos dropped on the bar below the sample's trailing footer go in a band after it; the footer is then no longer trailing (not pinned), and on that full page the new band overflows.
  - Bug fixed from chunk 1: `syncRefs` filtered columns into new arrays, so a move's remembered target column was lost after `compact` and the block landed at the end of the column. It now filters in place. Several photos dropped at once got the same id; `newBlocks` numbers them in turn.
  - The click that ends a tile drag is swallowed (`DRAG.dropped`); any other click on a tile adds the block.
  - The drag chip sits above and right of the pointer so it does not cover the "+" note.
- For chunk 3: `updateTarget()` runs on every pointer move (and on auto-scroll) and stores `DRAG.target`; `showDropPreview(t, drag, p)` is where the ghost goes, and `hideDropPreview()` clears it. `applyDrop` resolves the target through the objects it names and the geometry by block id, so it works on a cloned page if the move payload is the block at the same position in the clone (`blockAt`-style lookup by `DRAG.from`'s band, col and idx). `#ovBars` holds the bars, strips and "+"; `#ovDropLine` and `#ovPhotoHi` are the interim previews to remove.

### Chunk 3 (2026-10-02)

- The ghost of 9.1 replaces the interim previews (`#ovDropLine` and `#ovPhotoHi` are gone). `showDropPreview` draws the bars and strips of 9.2 as before and then `showGhost`: the shown page is copied, the drop is applied to the copy through `applyDrop` (a move takes the block at `DRAG.from`'s band, column and index in the copy; a file drag uses one placeholder photo per image file in `dataTransfer.items`, and over a photo the photo keeps its current image), and the copy is drawn with `renderPage(..., {fast: true})` on `<canvas id="ghost">` over the page canvas. `applyDrop` now also returns `blocks`, every landed block; each is faded with the paper colour at 0.45 and outlined with a 2 CSS px dashed line in `--accent`. While the ghost shows, the overlay has the class `ghosting`, which hides everything in it except the ghost and the bars (selection frame, hover outline, handles, issue dots, Add photo buttons, the height handle, the caret, the hint). Self, none and off-page targets hide it, as do Escape, the drop and leaving the page; the page canvas is never touched.
- The change key is the drop's result (the copied page as JSON plus where the landed blocks are), so a pointer moving within one slot draws nothing new; a changed result waits for the next animation frame and only the latest one is drawn. `GHOST.renders` counts the draws.
- Span by drag (see deviations): a tab on the right edge of the selected block and of the hovered block (`#ovSpan`, `#ovHoverSpan`, class `ov-span`) drags the block's span. It shows on content blocks in bands of two or more columns. A drag of kind "span" takes the column under the pointer as the block's last column (1 to n - col), shows the ghost of the page with that span (`setSpan` on the copy with the block's top as the hint, as the inspector does) and a chip "box-1 · 2 columns"; the drop calls `setSpan`, selects the block, takes one undo step and says "Span on box-1 set to 2". Bars and strips do not show during a span drag.
- Checked with real mouse drags through playwright-cli (http): a story tile over the sample's column 2 shows the page reflowed with the story faded between south and south-snow and the column below pushed down; moving to the top of column 3 shows desk, map and south-bridge pushed down instead; over gutter 2|3 the ghost shows four narrower columns with "4 columns; the format was designed for 3"; the lead dragged by its hover handle to column 3 shows columns 1 and 2 without it and the lead faded at 178 wide between map and south-bridge; a masthead tile over the middle shows a ghost masthead band under the top one; two PNGs dragged over the last bar show the ghost with a band target and two files counted, and over south-water the ghost shows south-water faded with its own image and a faded placeholder photo below it for the second file. Leaving the page, Escape and the drop hide the ghost, the page canvas is unchanged after a cancelled drag, and the indicator stays "No issues" throughout. For seven drags (story into column 2, into gutter 2|3, masthead mid-page, footer on the bar above the footer, the lead to column 3, intro to the top of column 2, desk to the left margin) the ghost just before the drop equals a fast render of the page after the drop, faded the same way, in every pixel outside photo frames; photo frames differ in at most 2 pixels (resampling of a photo drawn at a new size for the first time). Twenty pointer moves dispatched inside one task give no draw during the task and one draw after it. The user's sketch (gazette/refs/tool-feedback-2/wanted-layout-sketch.png) was built from New with drags only: a story on the blank band, a story at its right margin (2 columns), a photo on the bar below (a one-column band, full width), a story on the bar below that and two at its right margin (3 columns), a story under the first story of column 1, a box under the story of column 2, and the box's span tab dragged over column 3 (the ref lands at the end of column 3, the chain in gutter 2|3 stops above the box and resumes below it, column 1 runs on beside it). From file:// the sample loads with no reports, Export all pages gives two PNGs that differ from the v2 exports in one pixel each by under 8 levels, the Markdown export is byte-identical, Save, New, Open, Save is byte-identical, the v1 issue 1 file and the v2 redaction file open with their conversion notes, with no console errors and no requests.
- Deviations and decisions:
  - Span by drag is section 14's "dragging a block's right edge to set its span", brought into v3 so the sketch layout can be built by dragging alone: no other drag gives a block a span (a block placed in a band is span 1, `insertColumn` grows only an existing span). It is a separate tab, so Q2 B still holds (a drag on a block's body never moves or resizes it).
  - The landed block also gets a 0.12 wash of `--accent` under its dashed outline, so the faded block stands out from the reflowed page (the user's feedback: the old preview was "barely noticeable").
  - The outline is 2 CSS px at any zoom, not 2 canvas px, which would be 1 CSS px or less at Fit.
  - The bars and strips still come from the page before the drop (9.2), so a gutter strip can cross the ghost's new block.
- For chunk 4: Help and README describe the ghost and the span tab.

### Chunk 4 (2026-10-02)

- Help (section 10): Making an issue (the ghost while dragging), Bands and columns (bars, edges and gutters, the span tab and Span columns, a block keeps its span), Moving blocks (the strip above a block, the ghost, Escape, keyboard moves), Masthead and footer (blocks like any other, a band of their own anywhere, shared texts), then Text, Photos (a photo across several columns stretches only when nothing follows it), Theme, Issues and warnings, Save versus export, Before posting, The font, Licences. README's steps 2, 3 and 6 describe the ghost, bands and columns with the span tab, moving by the strip and the masthead and footer blocks. The header comment of editor.js names the ghost and span by drag; the file header of index.html had no redaction mention and is unchanged.
- Checked: `grep -rniI` for vendor names over the repository finds nothing, an emoji scan over every text file finds nothing, and `grep -ri redact src README.md` finds only the migration in model.js. The build is 1.67 MB (1750981 bytes). From file:// with the dialogs stubbed and the file pickers removed: the sample loads with no reports, Export all pages saves two PNGs, Export text .md is byte-identical to v2's, Save as, New (no reports), Open and Save as again give byte-identical files, issue-001-v1.json opens "converted from version 1" and v2-redact.json opens "converted from version 2: redaction marks dropped; 1 redaction block removed", both as version 3, with no console errors, no warnings and no requests. The two exported pages matched the v2 exports exactly in two of three runs; one run differed inside south-snow's photo frame only (photo resampling, as noted since v2 chunk 2). Help opens and has the new sections and no Redact. At 400 by 800 with touch emulation the toolbox, page and inspector stack, a story tile dragged by touch shows the ghost over the page and lands in its band, and the page is 400 wide with nothing to scroll sideways. A span-tab drag of the sample's lead back over column 1 sets span 1 ("Span on lead set to 1", its ref gone) and one Ctrl+Z restores span 2 with the ref at the top of column 2.
- Not rechecked in this chunk: saving layers and File System Access write-back in a real Chrome file picker (the pickers were stubbed out, as in earlier chunks), and the skin import.
