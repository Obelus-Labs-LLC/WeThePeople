"""Generate per-site OG images for the WTP ecosystem.

Each subdomain — main, journal, verify, research — needs its own 1200×630
og-image.png so LinkedIn / Twitter / Slack previews show the right brand
identity. A single shared image makes every non-journal link look like
a journal link.

Output:
    frontend/public/og-image.png             (main: gold)
    sites/journal/public/og-image.png        (journal: crimson)
    sites/verify/public/og-image.png         (verify: emerald)
    sites/research/public/og-image.png       (research: violet)

This script renders pure-Python PIL images (no SVG / cairo dependency)
so it works on Windows without extra system libs. Fonts:
    - DejaVu Sans Bold for the title (always present on Linux,
      Pillow ships a copy on Windows under Pillow/Tests/fonts/)
    - DejaVu Sans for taglines

If the bundled DejaVu fonts can't be located on the host, we fall back
to PIL's bitmap default font and just upscale.

Re-run after a brand-token change or a tagline rewrite.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("ERROR: Pillow not installed. Run: pip install pillow", file=sys.stderr)
    sys.exit(2)


REPO_ROOT = Path(__file__).resolve().parents[1]

WIDTH, HEIGHT = 1200, 630
BG = (7, 9, 12)              # var(--color-bg)
TEXT_1 = (235, 229, 213)      # var(--color-text-1)
TEXT_2 = (235, 229, 213, 200) # half-strength
TEXT_3 = (235, 229, 213, 130) # muted

# Per-site brand tokens. Pulled from frontend/src/index.css and the
# matching css files on each site so the cards stay visually
# consistent with the live UI.
SITES = [
    {
        "out": "frontend/public/og-image.png",
        "title": "WeThePeople",
        "tagline": "Follow the Money from Industry to Politics",
        "metaline": "Lobbying  ·  Contracts  ·  Trades  ·  Donations  ·  Enforcement",
        "footer": "wethepeopleforus.com",
        "accent": (197, 160, 40),  # gold
    },
    {
        "out": "sites/journal/public/og-image.png",
        "title": "The Influence Journal",
        "tagline": "Data-Driven Civic Investigations",
        "metaline": "Lobbying  ·  Contracts  ·  Trades  ·  Donations  ·  Enforcement",
        "footer": "journal.wethepeopleforus.com",
        "accent": (230, 57, 70),  # crimson
    },
    {
        "out": "sites/verify/public/og-image.png",
        "title": "Veritas",
        "tagline": "Zero-LLM Claim Verification Engine",
        "metaline": "Paste a claim, article, or URL  ·  Scored evidence from 29+ government sources",
        "footer": "verify.wethepeopleforus.com",
        "accent": (16, 185, 129),  # emerald
    },
    {
        "out": "sites/research/public/og-image.png",
        "title": "WTP Research",
        "tagline": "Deep-Dive Civic Data Tools",
        "metaline": "Patents  ·  Drug Pipelines  ·  Clinical Trials  ·  Insider Trades  ·  Macro Indicators",
        "footer": "research.wethepeopleforus.com",
        "accent": (139, 92, 246),  # violet
    },
]


def _load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Find a usable TTF on the current host. We try a small list of
    fonts that ship with Pillow / Linux / Windows; if none resolve we
    fall back to PIL's bitmap default (which won't honour `size` but
    at least produces output)."""
    candidates_bold = [
        "DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",  # last-ditch — non-bold but TTF
    ]
    candidates_regular = [
        "DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/Library/Fonts/Arial.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for path in (candidates_bold if bold else candidates_regular):
        try:
            return ImageFont.truetype(path, size=size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def render_card(spec: dict) -> None:
    img = Image.new("RGB", (WIDTH, HEIGHT), color=BG)
    draw = ImageDraw.Draw(img, "RGBA")

    # Top accent bar — full-width, 6px, the site's accent colour.
    draw.rectangle([(0, 0), (WIDTH, 6)], fill=spec["accent"])

    # Subtle grid pattern in the right two-thirds. Same look as the
    # journal card (radial-gradient → flat dots since we don't have
    # gradient compositing in plain PIL without numpy).
    for x in range(560, WIDTH, 24):
        for y in range(80, HEIGHT - 80, 24):
            draw.ellipse(
                [(x - 1, y - 1), (x + 1, y + 1)],
                fill=(*spec["accent"], 35),
            )

    # ── Text block ──────────────────────────────────────────────────
    # Title sits at vertical centre, left-aligned, 100px high lines.
    title_font = _load_font(72, bold=True)
    tagline_font = _load_font(30, bold=False)
    meta_font = _load_font(20, bold=False)
    footer_font = _load_font(18, bold=False)

    title_x = 80
    title_y = 220
    draw.text((title_x, title_y), spec["title"], font=title_font, fill=TEXT_1)

    # Tagline directly under title.
    bbox = draw.textbbox((title_x, title_y), spec["title"], font=title_font)
    tagline_y = bbox[3] + 18
    draw.text((title_x, tagline_y), spec["tagline"], font=tagline_font, fill=TEXT_2)

    # Accent rule under tagline.
    bbox2 = draw.textbbox((title_x, tagline_y), spec["tagline"], font=tagline_font)
    rule_y = bbox2[3] + 28
    draw.rectangle(
        [(title_x, rule_y), (title_x + 240, rule_y + 4)],
        fill=spec["accent"],
    )

    # Metaline (data sources / features), one row of small text.
    meta_y = rule_y + 30
    draw.text((title_x, meta_y), spec["metaline"], font=meta_font, fill=TEXT_3)

    # Footer (domain) bottom-left.
    draw.text((title_x, HEIGHT - 70), spec["footer"], font=footer_font, fill=TEXT_3)

    # Bottom accent bar — short, 60×3, mirroring the title rule.
    draw.rectangle(
        [(title_x, HEIGHT - 32), (title_x + 60, HEIGHT - 29)],
        fill=spec["accent"],
    )

    out_path = REPO_ROOT / spec["out"]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, format="PNG", optimize=True)
    print(f"  wrote {spec['out']}  ({out_path.stat().st_size:,} bytes)")


def main():
    print("Generating per-site OG images...")
    for spec in SITES:
        render_card(spec)
    print("Done.")


if __name__ == "__main__":
    main()
