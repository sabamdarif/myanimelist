#!/usr/bin/env python3
"""
build_nerd_icons.py — Scan the codebase for used Nerd Font icon classes,
download the full font if needed, subset it, and generate nerd_icons.css.

Usage:
    uv run --group dev scripts/build_nerd_icons.py

What it does:
  1. Scans core/ for all 'nf-<family>-<name>' class references
  2. Downloads the full Nerd Fonts CSS (webfont.css) to map classes → codepoints
  3. Downloads the full Nerd Fonts WOFF2 if not cached locally
  4. Uses fonttools/pyftsubset to create a subsetted WOFF2 with only used glyphs
  5. Writes core/static/core/css/nerd_icons.css
  6. Writes core/static/core/fonts/NerdFontsSubset.woff2
"""

import os
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
SCAN_DIR = ROOT / "core"
CSS_OUT = ROOT / "core" / "static" / "core" / "css" / "nerd_icons.css"
FONT_OUT = ROOT / "core" / "static" / "core" / "fonts" / "NerdFontsSubset.woff2"
CACHE_DIR = ROOT / ".cache" / "nerd-fonts"

WEBFONT_CSS_URL = "https://www.nerdfonts.com/assets/css/webfont.css"
WOFF2_URL = "https://www.nerdfonts.com/assets/fonts/Symbols-2048-em%20Nerd%20Font%20Complete.woff2"

# ── Helpers ─────────────────────────────────────────────────────────────


def scan_used_classes(scan_dir: Path) -> list[str]:
    """Scan all files under scan_dir for nf-<family>-<name> patterns."""
    pattern = re.compile(r"nf-[a-zA-Z0-9]+-[a-zA-Z0-9_]+")
    found: set[str] = set()

    extensions = {".html", ".js", ".py", ".css"}
    for root, _dirs, files in os.walk(scan_dir):
        # Skip __pycache__ and similar
        if "__pycache__" in root or "node_modules" in root:
            continue
        for fname in files:
            if Path(fname).suffix not in extensions:
                continue
            # Skip the generated CSS itself
            fpath = Path(root) / fname
            if fpath == CSS_OUT:
                continue
            try:
                text = fpath.read_text(errors="ignore")
            except OSError, UnicodeDecodeError:
                continue
            found.update(pattern.findall(text))

    return sorted(found)


def download_if_missing(url: str, dest: Path, label: str) -> Path:
    """Download a file if not cached."""
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  ✓ {label} cached at {dest.name}")
        return dest

    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  ↓ Downloading {label}...")
    urllib.request.urlretrieve(url, dest)
    size_kb = dest.stat().st_size / 1024
    print(f"    {size_kb:.0f} KB")
    return dest


def extract_codepoints(css_text: str, classes: list[str]) -> dict[str, str]:
    """Map class names to their Unicode codepoints from webfont.css."""
    result = {}
    missing = []
    for cls in classes:
        pattern = r"\.{}:before\{{content:\"\\([0-9a-fA-F]+)\"\}}".format(
            re.escape(cls)
        )
        match = re.search(pattern, css_text)
        if match:
            result[cls] = match.group(1)
        else:
            missing.append(cls)

    if missing:
        print(f"  ⚠ Could not find codepoints for: {', '.join(missing)}")

    return result


def generate_css(codepoints: dict[str, str]) -> str:
    """Generate the nerd_icons.css content."""
    lines = [
        "/* Auto-generated Nerd Font icon subset — DO NOT EDIT */",
        "/* Run: uv run --group dev scripts/build_nerd_icons.py */",
        f"/* Contains only the {len(codepoints)} icons actually used in the app */",
        "",
        "@font-face {",
        "  font-family: 'NerdFontsSymbols Nerd Font';",
        "  src: url('../fonts/NerdFontsSubset.woff2') format('woff2');",
        "  font-weight: normal;",
        "  font-style: normal;",
        "  font-display: swap;",
    ]

    # unicode-range
    ranges = sorted(codepoints.values(), key=lambda x: int(x, 16))
    unicode_ranges = ", ".join(f"U+{cp.upper()}" for cp in ranges)
    lines.append(f"  unicode-range: {unicode_ranges};")
    lines.append("}")
    lines.append("")

    lines.append(".nf, .nerd-font, .nerd-fonts {")
    lines.append("  font-family: 'NerdFontsSymbols Nerd Font';")
    lines.append("  font-style: normal;")
    lines.append("  font-weight: normal;")
    lines.append("  font-variant: normal;")
    lines.append("  text-transform: none;")
    lines.append("  line-height: 1;")
    lines.append("  -webkit-font-smoothing: antialiased;")
    lines.append("  -moz-osx-font-smoothing: grayscale;")
    lines.append("}")
    lines.append("")

    for cls, cp in sorted(codepoints.items()):
        lines.append(f'.nf-{cls.removeprefix("nf-")}:before {{ content: "\\{cp}"; }}')

    lines.append("")
    return "\n".join(lines)


def subset_font(full_font: Path, codepoints: dict[str, str], output: Path):
    """Use pyftsubset to create a subsetted WOFF2."""
    unicodes = ",".join(
        f"U+{cp.upper()}"
        for cp in sorted(codepoints.values(), key=lambda x: int(x, 16))
    )

    output.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,
        "-m",
        "fontTools.subset",
        str(full_font),
        f"--unicodes={unicodes}",
        "--flavor=woff2",
        f"--output-file={output}",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ✗ pyftsubset failed:\n{result.stderr}")
        sys.exit(1)


# ── Main ────────────────────────────────────────────────────────────────


def main():
    print("╔══════════════════════════════════════════╗")
    print("║  Nerd Font Icon Subset Builder           ║")
    print("╚══════════════════════════════════════════╝")
    print()

    # 1. Scan
    print("① Scanning codebase for icon classes...")
    classes = scan_used_classes(SCAN_DIR)
    print(f"  Found {len(classes)} unique icon classes")
    if not classes:
        print("  No icons found. Nothing to do.")
        return

    # 2. Download CSS mapping
    print("\n② Fetching codepoint mapping...")
    css_cache = CACHE_DIR / "webfont.css"
    download_if_missing(WEBFONT_CSS_URL, css_cache, "webfont.css")
    css_text = css_cache.read_text()

    # 3. Extract codepoints
    codepoints = extract_codepoints(css_text, classes)
    print(f"  Mapped {len(codepoints)}/{len(classes)} classes to codepoints")

    if not codepoints:
        print("  ✗ No codepoints found. Aborting.")
        sys.exit(1)

    # 4. Download full font
    print("\n③ Preparing full font for subsetting...")
    font_cache = CACHE_DIR / "NerdFontsFull.woff2"
    download_if_missing(WOFF2_URL, font_cache, "NerdFontsFull.woff2")

    # 5. Subset
    print("\n④ Creating subsetted font...")
    subset_font(font_cache, codepoints, FONT_OUT)
    font_size = FONT_OUT.stat().st_size
    print(f"  ✓ {FONT_OUT.name}: {font_size:,} bytes ({font_size / 1024:.1f} KB)")

    # 6. Generate CSS
    print("\n⑤ Generating CSS...")
    css_content = generate_css(codepoints)
    CSS_OUT.parent.mkdir(parents=True, exist_ok=True)
    CSS_OUT.write_text(css_content)
    print(f"  ✓ {CSS_OUT.name}: {len(css_content):,} bytes")

    # 7. Summary
    full_font_size = font_cache.stat().st_size
    full_css_size = css_cache.stat().st_size
    print("\n┌─────────────────────────────────────────┐")
    print("│  Summary                               │")
    print("├─────────────────────────────────────────┤")
    print(f"│  Icons:     {len(codepoints):>4}                       │")
    print(f"│  Font:  {font_size:>7,} B  (was {full_font_size:>10,} B) │")
    print(f"│  CSS:   {len(css_content):>7,} B  (was {full_css_size:>10,} B) │")
    savings = (
        ((full_font_size + full_css_size) - (font_size + len(css_content)))
        / (full_font_size + full_css_size)
        * 100
    )
    print(f"│  Saved: {savings:>5.1f}%                        │")
    print("└─────────────────────────────────────────┘")


if __name__ == "__main__":
    main()
