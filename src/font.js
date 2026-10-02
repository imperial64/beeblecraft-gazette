// Salon Pixel, copyright 2026 imperial64, SIL Open Font License 1.1. Data only; the TrueType writer is not ported.
//
// A glyph is '|'-separated rows of '#' (ink) and '.' (gap), starting at row 2 (the cap line)
// unless the string starts with "N:". The em is 11 rows, row 8 is the baseline, the width is the
// longest row. Advance = width + 1 px tracking; a space advances 3 px. Text is drawn with
// integer fillRects only, so the page keeps hard pixel edges.

const Font = (() => {
  const ROWS = 11;
  const BASE_ROW = 8;
  const TRACK = 1;
  const SPACE_ADV = 3;
  const MISSING_W = 5;

  const G = {
    "A": ".###.|#...#|#...#|#####|#...#|#...#|#...#",
    "B": "####.|#...#|#...#|####.|#...#|#...#|####.",
    "C": ".###.|#...#|#....|#....|#....|#...#|.###.",
    "D": "####.|#...#|#...#|#...#|#...#|#...#|####.",
    "E": "#####|#....|#....|####.|#....|#....|#####",
    "F": "#####|#....|#....|####.|#....|#....|#....",
    "G": ".###.|#...#|#....|#.###|#...#|#...#|.####",
    "H": "#...#|#...#|#...#|#####|#...#|#...#|#...#",
    "I": "###|.#.|.#.|.#.|.#.|.#.|###",
    "J": "..###|...#.|...#.|...#.|...#.|#..#.|.##..",
    "K": "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#",
    "L": "#....|#....|#....|#....|#....|#....|#####",
    "M": "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#",
    "N": "#...#|##..#|#.#.#|#..##|#...#|#...#|#...#",
    "O": ".###.|#...#|#...#|#...#|#...#|#...#|.###.",
    "P": "####.|#...#|#...#|####.|#....|#....|#....",
    "Q": ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#",
    "R": "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
    "S": ".###.|#...#|#....|.###.|....#|#...#|.###.",
    "T": "#####|..#..|..#..|..#..|..#..|..#..|..#..",
    "U": "#...#|#...#|#...#|#...#|#...#|#...#|.###.",
    "V": "#...#|#...#|#...#|#...#|.#.#.|.#.#.|..#..",
    "W": "#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#",
    "X": "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
    "Y": "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..",
    "Z": "#####|....#|...#.|..#..|.#...|#....|#####",
    "a": "4:.###.|....#|.####|#...#|.####",
    "b": "#....|#....|####.|#...#|#...#|#...#|####.",
    "c": "4:.###|#...|#...|#...|.###",
    "d": "....#|....#|.####|#...#|#...#|#...#|.####",
    "e": "4:.###.|#...#|#####|#....|.###.",
    "f": "..##|.#..|####|.#..|.#..|.#..|.#..",
    "g": "4:.####|#...#|#...#|#...#|.####|....#|.###.",
    "h": "#....|#....|####.|#...#|#...#|#...#|#...#",
    "i": "#|.|#|#|#|#|#",
    "j": "..#|...|..#|..#|..#|..#|..#|#.#|.#.",
    "k": "#...|#...|#..#|#.#.|##..|#.#.|#..#",
    "l": "#.|#.|#.|#.|#.|#.|.#",
    "m": "4:####.|#.#.#|#.#.#|#.#.#|#.#.#",
    "n": "4:####.|#...#|#...#|#...#|#...#",
    "o": "4:.###.|#...#|#...#|#...#|.###.",
    "p": "4:####.|#...#|#...#|#...#|####.|#....|#....",
    "q": "4:.####|#...#|#...#|#...#|.####|....#|....#",
    "r": "4:#.##|##..|#...|#...|#...",
    "s": "4:.####|#....|.###.|....#|####.",
    "t": "3:.#..|####|.#..|.#..|.#..|..##",
    "u": "4:#...#|#...#|#...#|#...#|.####",
    "v": "4:#...#|#...#|.#.#.|.#.#.|..#..",
    "w": "4:#...#|#.#.#|#.#.#|#.#.#|.#.#.",
    "x": "4:#...#|.#.#.|..#..|.#.#.|#...#",
    "y": "4:#...#|#...#|#...#|#...#|.####|....#|.###.",
    "z": "4:#####|...#.|..#..|.#...|#####",
    "0": ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.",
    "1": "..#..|.##..|..#..|..#..|..#..|..#..|.###.",
    "2": ".###.|#...#|....#|...#.|..#..|.#...|#####",
    "3": ".###.|#...#|....#|..##.|....#|#...#|.###.",
    "4": "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.",
    "5": "#####|#....|####.|....#|....#|#...#|.###.",
    "6": ".###.|#....|#....|####.|#...#|#...#|.###.",
    "7": "#####|....#|...#.|..#..|.#...|.#...|.#...",
    "8": ".###.|#...#|#...#|.###.|#...#|#...#|.###.",
    "9": ".###.|#...#|#...#|.####|....#|....#|.###.",
    ".": "8:#",
    ",": "8:.#|.#|#.",
    ":": "4:#|.|.|.|#",
    ";": "4:.#|..|..|..|.#|.#|#.",
    "!": "#|#|#|#|#|.|#",
    "?": ".###.|#...#|....#|..##.|..#..|.....|..#..",
    "'": "#|#",
    "’": "#|#|.",
    "‘": "#|#",
    "\"": "#.#|#.#",
    "“": "#.#|#.#",
    "”": "#.#|#.#",
    "-": "6:####",
    "–": "6:#####",
    "—": "6:######",
    "+": "4:..#..|..#..|#####|..#..|..#..",
    "=": "5:#####|.....|#####",
    "/": "....#|...#.|...#.|..#..|.#...|.#...|#....",
    "(": "..#|.#.|#..|#..|#..|.#.|..#",
    ")": "#..|.#.|..#|..#|..#|.#.|#..",
    "[": "##|#.|#.|#.|#.|#.|##",
    "]": "##|.#|.#|.#|.#|.#|##",
    "{": "..#|.#.|.#.|#..|.#.|.#.|..#",
    "}": "#..|.#.|.#.|..#|.#.|.#.|#..",
    "<": "4:...#|.##.|#...|.##.|...#",
    ">": "4:#...|.##.|...#|.##.|#...",
    "%": "##..#|##.#.|...#.|..#..|.#...|.#.##|#..##",
    "&": ".##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#",
    "#": "3:.#.#.|#####|.#.#.|#####|.#.#.",
    "*": "3:..#..|#.#.#|.###.|#.#.#|..#..",
    "@": ".###.|#...#|#.###|#.#.#|#.###|#....|.###.",
    "_": "10:#####",
    "|": "#|#|#|#|#|#|#|#",
    "~": "5:.#..#|#.##.",
    "$": "1:..#..|.####|#.#..|#.#..|.###.|..#.#|..#.#|####.|..#..",
    "·": "6:#",
    "…": "8:#.#.#",
    "›": "4:#..|.#.|..#|.#.|#..",
    "‹": "4:..#|.#.|#..|.#.|..#",
    "→": "4:...#.|....#|#####|....#|...#.",
    "×": "4:#...#|.#.#.|..#..|.#.#.|#...#",
    "°": "##|##",
    "Ç": ".###.|#...#|#....|#....|#....|#...#|.###.|..#..|.#...",
    "Ğ": "0:#...#|.###.|.###.|#...#|#....|#.###|#...#|#...#|.####",
    "İ": "0:.#.|...|###|.#.|.#.|.#.|.#.|.#.|###",
    "Ö": "0:.#.#.|.....|.###.|#...#|#...#|#...#|#...#|#...#|.###.",
    "Ş": ".###.|#...#|#....|.###.|....#|#...#|.###.|..#..|.#...",
    "Ü": "0:.#.#.|.....|#...#|#...#|#...#|#...#|#...#|#...#|.###.",
    "Â": "0:..#..|.#.#.|.###.|#...#|#...#|#####|#...#|#...#|#...#",
    "ç": "4:.###|#...|#...|#...|.###|..#.|.#..",
    "ğ": "1:#...#|.###.|.....|.####|#...#|#...#|#...#|.####|....#|.###.",
    "ı": "4:#|#|#|#|#",
    "ö": "2:.#.#.|.....|.###.|#...#|#...#|#...#|.###.",
    "ş": "4:.####|#....|.###.|....#|####.|..#..|.#...",
    "ü": "2:.#.#.|.....|#...#|#...#|#...#|#...#|.####",
    "â": "2:..#..|.#.#.|.###.|....#|.####|#...#|.####",
    "î": "2:.#.|#.#|.#.|.#.|.#.|.#.|.#.",
    "û": "2:..#..|.#.#.|#...#|#...#|#...#|#...#|.####",
    "é": "2:...#.|..#..|.###.|#...#|#####|#....|.###.",
  };

  function parse(src) {
    let y0 = 2;
    let body = src;
    const m = /^(\d+):/.exec(src);
    if (m) {
      y0 = parseInt(m[1], 10);
      body = src.slice(m[0].length);
    }
    const part = body.split("|");
    const w = Math.max(...part.map((r) => r.length));
    const rows = [];
    const cells = [];
    for (let r = 0; r < ROWS; r++) {
      const i = r - y0;
      const row = (i >= 0 && i < part.length ? part[i] : "").padEnd(w, ".");
      rows.push(row);
      for (let c = 0; c < row.length; c++) if (row[c] === "#") cells.push(c, r);
    }
    return { w, rows, cells };
  }

  const GLYPHS = {};
  for (const ch of Object.keys(G)) GLYPHS[ch] = parse(G[ch]);

  // Hollow box for a character the font does not have: 5 wide, rows 2 to 8.
  const MISSING = (() => {
    const cells = [];
    for (let r = 2; r <= 8; r++) {
      for (let c = 0; c < MISSING_W; c++) {
        if (r === 2 || r === 8 || c === 0 || c === MISSING_W - 1) cells.push(c, r);
      }
    }
    return { w: MISSING_W, rows: null, cells };
  })();

  // Hooks the layout sets to collect warnings.
  const hooks = { missing: null, overrun: null };

  function glyph(ch) {
    const g = GLYPHS[ch];
    if (g) return g;
    if (hooks.missing) hooks.missing(ch);
    return MISSING;
  }

  function width(text, scale = 1, trackingExtra = 0) {
    if (!text) return 0;
    let total = 0;
    for (const ch of text) {
      if (ch === " ") total += SPACE_ADV + trackingExtra;
      else total += glyph(ch).w + TRACK + trackingExtra;
    }
    if (!text.endsWith(" ")) total -= TRACK + trackingExtra;
    return total * scale;
  }

  // Row 0 of the em at y. ctx null measures only. Returns the ink width (plus 1 when bold).
  function drawText(ctx, x, y, text, scale, colour, trackingExtra = 0, bold = false) {
    if (ctx && text) {
      ctx.fillStyle = colour;
      const grow = bold ? 1 : 0;
      const size = scale + grow;
      let cx = x;
      for (const ch of text) {
        if (ch === " ") {
          cx += (SPACE_ADV + trackingExtra) * scale;
          continue;
        }
        const g = glyph(ch);
        const cells = g.cells;
        for (let i = 0; i < cells.length; i += 2) {
          ctx.fillRect(cx + cells[i] * scale, y + cells[i + 1] * scale, size, size);
        }
        cx += (g.w + TRACK + trackingExtra) * scale;
      }
    }
    return width(text, scale, trackingExtra) + (bold ? 1 : 0);
  }

  const MONTHS = new Set([
    "January", "February", "March", "April", "May", "June", "July", "August", "September",
    "October", "November", "December",
  ]);

  // Non-breaking spaces: a coordinate ("x 6207"), a day and its month ("2 October") and a
  // licence name ("CC BY-NC-SA 4.0") stay on one line.
  function glued(prev, next) {
    if (prev === "x" || prev === "z") return true;
    if (/^\d{1,2}$/.test(prev) && MONTHS.has(next.replace(/[.,;:)]+$/, ""))) return true;
    if (prev === "CC" && next.startsWith("BY")) return true;
    if (prev.startsWith("BY-") && /^\d\.\d/.test(next)) return true;
    return false;
  }

  function units(text) {
    const out = [];
    let prev = null;
    for (const t of text.split(" ")) {
      if (!t) continue;
      if (prev !== null && out.length && glued(prev, t)) out[out.length - 1] += " " + t;
      else out.push(t);
      prev = t;
    }
    return out;
  }

  // Break on spaces by measured width; never hyphenates. widthArtPx is a number or a function
  // of the line index. A unit wider than its line goes on a line of its own and overruns.
  function wrap(text, widthArtPx, scale = 1, firstLine = 0) {
    const wfn = typeof widthArtPx === "function" ? widthArtPx : () => widthArtPx;
    const lines = [];
    let cur = "";
    for (const u of units(text || "")) {
      const limit = wfn(firstLine + lines.length);
      if (width(u, scale) > limit) {
        if (hooks.overrun) hooks.overrun(u);
        if (cur) lines.push(cur);
        lines.push(u);
        cur = "";
        continue;
      }
      const trial = cur ? cur + " " + u : u;
      if (width(trial, scale) <= limit) cur = trial;
      else {
        lines.push(cur);
        cur = u;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function characters() {
    return Object.keys(G).join("");
  }

  return { ROWS, BASE_ROW, TRACK, SPACE_ADV, MISSING_W, GLYPHS, hooks, width, drawText, wrap, units, glued, characters };
})();
