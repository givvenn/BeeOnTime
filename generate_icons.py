#!/usr/bin/env python3
"""Generate BeeOnTime icons using only Python builtins. Run: python3 generate_icons.py"""
import struct, zlib, os, subprocess

def make_png(width: int, height: int) -> bytes:
    """Create an amber circle on transparent background PNG."""
    cx, cy = width / 2.0, height / 2.0
    r_outer = min(width, height) * 0.44
    r_inner = r_outer * 0.0  # solid circle

    rows = []
    for y in range(height):
        row = bytearray([0])  # filter type: None
        for x in range(width):
            dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if dist <= r_outer:
                # Amber: #F5A623  →  R=245, G=166, B=35
                aa = 255
                row += bytes([245, 166, 35, aa])
            else:
                row += bytes([0, 0, 0, 0])
        rows.append(bytes(row))

    raw = b"".join(rows)
    compressed = zlib.compress(raw, 6)

    def chunk(name: bytes, data: bytes) -> bytes:
        payload = name + data
        crc = zlib.crc32(payload) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + payload + struct.pack(">I", crc)

    # IHDR: width, height, bit depth=8, color type=6 (RGBA)
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr_data)
        + chunk(b"IDAT", compressed)
        + chunk(b"IEND", b"")
    )


def make_ico(png_entries: list[tuple[bytes, int]]) -> bytes:
    """Wrap PNG images in ICO container (Vista+ PNG-in-ICO)."""
    num = len(png_entries)
    header = struct.pack("<HHH", 0, 1, num)

    dir_offset = 6 + num * 16
    entries = []
    cur_offset = dir_offset
    for png_data, size in png_entries:
        w = size if size < 256 else 0
        entries.append((w, png_data, cur_offset))
        cur_offset += len(png_data)

    result = header
    for w, png_data, off in entries:
        result += struct.pack("<BBBBHHII", w, w, 0, 0, 1, 32, len(png_data), off)
    for _, png_data, _ in entries:
        result += png_data

    return result


def main():
    out = "src-tauri/icons"
    os.makedirs(out, exist_ok=True)

    # Standard sizes
    for size in [32, 128, 256]:
        data = make_png(size, size)
        with open(f"{out}/{size}x{size}.png", "wb") as f:
            f.write(data)
        print(f"  ✓ {size}x{size}.png")

    # 128x128@2x is actually 256x256
    with open(f"{out}/128x128@2x.png", "wb") as f:
        f.write(make_png(256, 256))
    print("  ✓ 128x128@2x.png")

    # ICO (Windows)
    ico_data = make_ico([
        (make_png(16, 16), 16),
        (make_png(32, 32), 32),
        (make_png(48, 48), 48),
        (make_png(256, 256), 256),
    ])
    with open(f"{out}/icon.ico", "wb") as f:
        f.write(ico_data)
    print("  ✓ icon.ico")

    # ICNS (macOS) — use iconutil if available, else PNG fallback
    iconset_dir = f"{out}/AppIcon.iconset"
    os.makedirs(iconset_dir, exist_ok=True)

    iconset_sizes = [
        ("icon_16x16.png",      16,  16),
        ("icon_16x16@2x.png",   32,  32),
        ("icon_32x32.png",      32,  32),
        ("icon_32x32@2x.png",   64,  64),
        ("icon_128x128.png",   128, 128),
        ("icon_128x128@2x.png",256, 256),
        ("icon_256x256.png",   256, 256),
        ("icon_256x256@2x.png",512, 512),
        ("icon_512x512.png",   512, 512),
    ]
    for name, w, h in iconset_sizes:
        with open(f"{iconset_dir}/{name}", "wb") as f:
            f.write(make_png(w, h))

    try:
        subprocess.run(
            ["iconutil", "-c", "icns", iconset_dir, "-o", f"{out}/icon.icns"],
            check=True, capture_output=True
        )
        print("  ✓ icon.icns  (via iconutil)")
    except Exception:
        # Fallback: copy 256x256 PNG as .icns — works for dev builds
        with open(f"{out}/icon.icns", "wb") as f:
            f.write(make_png(256, 256))
        print("  ✓ icon.icns  (PNG fallback — install Xcode tools for proper .icns)")

    print("\nAll icons generated in src-tauri/icons/")


if __name__ == "__main__":
    main()
