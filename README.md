# Gazette Builder

A page editor for a pixel-art newspaper about a Minecraft server, in the style of the Beeblecraft Gazette. You drag stories, photos, a line map and boxes onto the page, type straight onto it, drop in your screenshots, and export each page as a 1200 by 1600 PNG ready to post on Discord. The masthead and the whole look are editable, so any player can run their own paper with it. It is one HTML file that runs entirely in your browser: no account, no server, nothing uploaded.

Use it here: https://imperial64.github.io/beeblecraft-gazette/

## Offline use

Download [index.html](https://raw.githubusercontent.com/imperial64/beeblecraft-gazette/main/index.html) (right click, save as) and open it in a browser. Nothing else is needed, and it works without a network connection.

## Making an issue

The editor has three parts: the inspector on the left, the page in the middle and the toolbox of blocks on the right.

1. New gives a blank page with the masthead. Load sample opens issue 1 of the Beeblecraft Gazette to look at.
2. Drag a block from the toolbox onto the page: masthead, story, photo, box, desk, case register, map or footer. While you drag, the page shows how it will look after the drop, with the new block faded where it will land. Clicking a tile adds the block instead, which also works on a phone.
3. A page is a stack of bands, each with its own columns, and starts with one column under the masthead. Drop a block on a bar between bands for a new band, or at the left or right edge or between two columns for another column; three is the format the paper was designed for. To run a block across several columns, drag the tab on its right edge sideways or set Span columns in the inspector; it keeps its span whatever is put above it. Point at a block and drag the strip above it to move it anywhere, and a column that loses its last block goes away.
4. Click any text on the page and type. The bar above it sets the font, size and colour of that text and uploads a font file.
5. Drop screenshots from your files onto a photo, or anywhere on the page for new photos. With a photo selected, the mouse wheel zooms it and dragging moves the crop. The strip along its bottom edge fixes its height.
6. Click a block to see its settings in the inspector. The masthead and the footer are blocks too: they can go anywhere on the page as a band of their own, and deleting them leaves a bare page. Theme in the top bar edits every colour as a hex code, the text styles, the lantern and chain sprites and the paper texture, and can export a theme to reuse.
7. The triangle above the page turns red for problems that would spoil the export (a column running over, a missing photo) and yellow for warnings. Click it for the list.
8. Export page PNG or Export all pages PNG saves the pictures. Export text .md writes only the words, block by block.

## Saving

The browser keeps a draft of your issue automatically. Save .json writes the whole issue to a file (layout, text, photos, fonts and theme) that you can reopen later, move to another machine or send to a co-editor. In Chrome and Edge, Save and Ctrl+S write straight back to the file you opened; other browsers download a new copy. Exporting pictures or text does not save the issue.

## The issue file

An issue is a JSON file: the paper's settings and theme, then the pages with their bands, columns and blocks, then every image as an embedded data URL at the end. The text sits near the top in plain form, one paragraph per line, so it can be written or edited in any text editor and opened in the tool afterwards. Files from the first two versions of the tool are converted when opened. The full format is in [docs/design-v3.md](docs/design-v3.md), section 4, which builds on [docs/design-v2.md](docs/design-v2.md), section 6.

## Building

index.html is built from src/, assets/ and sample/:

```
python build.py
```

It needs Python 3 and Pillow (`pip install pillow`). `python build.py --import-photos FILE...` downsizes screenshots into sample/photos/.

## Licences

- Tool code: MIT, see [LICENSE](LICENSE).
- Salon Pixel font: SIL Open Font License 1.1, copyright 2026 imperial64. See [assets/salon-pixel/LICENSE-OFL.txt](assets/salon-pixel/LICENSE-OFL.txt).
- Lantern and chain pieces: from Modern Mizunos v0.5.2 by Kchem and Garden Gals (https://modrinth.com/organization/garden-gals), CC BY-NC-SA 4.0. Pages exported with the ornaments on carry that licence and must credit them; the back page preset has a footer template for it. Turn the ornaments off, or replace all three pieces in the theme, to leave them out. See [assets/modern-mizunos/CREDIT.md](assets/modern-mizunos/CREDIT.md).
- Fonts and sprites you upload stay in your own issue and theme files under their own terms; they are never part of this site.

## Support

If the tool is useful to you, you can support it at https://buymeacoffee.com/imperial64
