"""Build index.html, the Gazette Builder, from src/, assets/ and sample/.

Usage:
    python build.py                          write index.html
    python build.py --import-photos FILE...  downsize screenshots into sample/photos/ (one-time helper)

Needs Python 3 and Pillow. See docs/design.md section 2.1 and docs/design-v2.md section 3.
"""

import base64
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
PIECES_DIR = ROOT / "assets" / "modern-mizunos"
SAMPLE_DIR = ROOT / "sample"
OUT = ROOT / "index.html"
MAX_BYTES = 8 * 1024 * 1024
PIECES = ("oxidized_copper_lantern.png", "copper_lantern.png", "oxidized_copper_chain.png")
# Inlined in this order, one <script> each (docs/design-v2.md section 3).
SCRIPTS = ("font.js", "text.js", "model.js", "layout.js", "render.js", "editor.js", "ui.js")
PHOTO_MAX = 1200  # longer side, px
PHOTO_QUALITY = 85


def data_url(path, mime):
    return "data:%s;base64,%s" % (mime, base64.b64encode(path.read_bytes()).decode("ascii"))


def import_photos(files):
    """Copy screenshots into sample/photos/ as JPEG, longer side at most 1200 px."""
    out_dir = SAMPLE_DIR / "photos"
    out_dir.mkdir(parents=True, exist_ok=True)
    for name in files:
        src = Path(name)
        with Image.open(src) as im:
            im = im.convert("RGB")
            s = PHOTO_MAX / max(im.size)
            if s < 1:
                im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
            dest = out_dir / (src.stem + ".jpg")
            im.save(dest, "JPEG", quality=PHOTO_QUALITY, optimize=True)
            print("wrote %s %dx%d %d KB" % (dest.relative_to(ROOT), im.width, im.height,
                                            dest.stat().st_size // 1024))


def embedded_sample():
    """sample/issue-001.json with every "file" image replaced by its data URL and size."""
    sample = json.loads((SAMPLE_DIR / "issue-001.json").read_text(encoding="utf-8"))
    for key, entry in sample["images"].items():
        if "file" not in entry:
            continue
        path = SAMPLE_DIR / entry["file"]
        with Image.open(path) as im:
            w, h = im.size
            fmt = im.format
        mime = {"PNG": "image/png", "JPEG": "image/jpeg"}.get(fmt)
        if mime is None:
            raise SystemExit("build: %s is %s, expected PNG or JPEG" % (path, fmt))
        if entry.get("kind") == "skin" and (fmt != "PNG" or (w, h) != (64, 64)):
            raise SystemExit("build: %s must be a 64 by 64 PNG skin" % path)
        new = {}
        for k, v in entry.items():
            if k == "file":
                new["data"] = data_url(path, mime)
                new["w"] = w
                new["h"] = h
            else:
                new[k] = v
        sample["images"][key] = new
    return sample


def script_json(obj):
    """JSON that is safe inside a <script type="application/json"> element."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def build():
    template = (SRC / "index.html").read_text(encoding="utf-8")
    scripts = []
    for name in SCRIPTS:
        js = (SRC / name).read_text(encoding="utf-8")
        if re.search(r"</script", js, re.I):
            raise SystemExit("build: src/%s contains a closing script tag" % name)
        scripts.append("<script>\n" + js + "</script>")
    assets = {name: data_url(PIECES_DIR / name, "image/png") for name in PIECES}
    slots = {
        "SCRIPTS": "\n".join(scripts),
        "ASSETS_JSON": script_json(assets),
        "SAMPLE_JSON": script_json(embedded_sample()),
    }
    out = re.sub(r"\{\{([A-Z_]+)\}\}", lambda m: slots[m.group(1)], template)
    if re.search(r"""\b(?:src|href)\s*=\s*["'](?!data:|#)""", out):
        raise SystemExit("build: the output references an outside file")
    data = out.encode("utf-8")
    if len(data) > MAX_BYTES:
        raise SystemExit("build: index.html would be %.2f MB, over the 8 MB limit" % (len(data) / 1048576))
    OUT.write_bytes(data)
    print("wrote index.html, %.2f MB (%d bytes)" % (len(data) / 1048576, len(data)))


def main():
    args = sys.argv[1:]
    if args and args[0] == "--import-photos":
        if len(args) < 2:
            raise SystemExit("usage: python build.py --import-photos FILE...")
        import_photos(args[1:])
    elif not args:
        build()
    else:
        raise SystemExit("usage: python build.py [--import-photos FILE...]")


if __name__ == "__main__":
    main()
