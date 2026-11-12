#!/usr/bin/env python3
"""Generate product logo assets from the pinned AgentX Workmate artwork."""

import argparse
import io
from pathlib import Path

from PIL import Image

PNG_TARGETS = {
    "brand/icons/icon16.png": 16,
    "brand/icons/icon48.png": 48,
    "brand/icons/icon128.png": 128,
}
ICO_TARGETS = []
SVG_TARGETS = []


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/brand"


def outputs():
    master = Image.open(SOURCE / "workmate-1024.png").convert("RGBA")
    small = {
        size: Image.open(SOURCE / f"workmate-{size}.png").convert("RGBA")
        for size in (16, 32)
    }

    def render(size):
        return (
            small[size]
            if size in small
            else master.resize((size, size), Image.Resampling.LANCZOS)
        )

    for relative, size in PNG_TARGETS.items():
        buffer = io.BytesIO()
        render(size).save(buffer, format="PNG")
        yield ROOT / relative, buffer.getvalue()
    for relative in ICO_TARGETS:
        sizes = (16, 24, 32, 48, 64, 128, 256)
        frames = [render(size) for size in sizes]
        buffer = io.BytesIO()
        frames[-1].save(
            buffer,
            format="ICO",
            append_images=frames[:-1],
            sizes=[(s, s) for s in sizes],
        )
        yield ROOT / relative, buffer.getvalue()
    for relative in SVG_TARGETS:
        yield ROOT / relative, (SOURCE / "workmate.svg").read_bytes()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true", help="fail if generated assets are stale"
    )
    args = parser.parse_args()
    stale = []
    for path, content in outputs():
        if args.check:
            if not path.exists() or path.read_bytes() != content:
                stale.append(str(path.relative_to(ROOT)))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
    if stale:
        raise SystemExit("Stale brand assets: " + ", ".join(stale))
    print(
        "AgentX Workmate brand assets " + ("verified" if args.check else "synchronized")
    )


if __name__ == "__main__":
    main()
