#!/usr/bin/env python3
"""Generate printable, annotated ArUco marker PDFs (US Letter, print at 100%).

Usage:  pip install reportlab && python3 scripts/make_markers.py

Marker bit patterns are read from DICT4 in src/core/aruco.ts, so the PDFs always
match what the app decodes (OpenCV DICT_4X4_50). Output goes to markers/.
"""
import re
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "markers"
DICT4 = [int(x) for x in re.search(r"DICT4 = \[([\d,]+)\]", (ROOT / "src/core/aruco.ts").read_text()).group(1).split(",")]

# (marker id, black-square size in mm). The app's sample/default is ID 7 at 80 mm.
VARIANTS = [(7, 80), (7, 50), (7, 100), (7, 120)] + [(i, 80) for i in (0, 1, 2, 3)]

PW, PH = letter
M = 20 * mm


def bits(mid):
    code = DICT4[mid]
    return [[(code >> (15 - (r * 4 + c))) & 1 for c in range(4)] for r in range(4)]


def draw_marker(c, x, y, size, mid):
    """Black square with lower-left corner (x, y); white cells = 1 bits."""
    cell = size / 6
    c.setFillGray(0)
    c.rect(x, y, size, size, stroke=0, fill=1)
    c.setFillGray(1)
    b = bits(mid)
    for r in range(4):
        for k in range(4):
            if b[r][k]:
                c.rect(x + (k + 1) * cell, y + size - (r + 2) * cell, cell, cell, stroke=0, fill=1)


def ruler(c, x, y, length_mm, label):
    c.setStrokeGray(0); c.setFillGray(0); c.setLineWidth(0.6)
    c.line(x, y, x + length_mm * mm, y)
    for i in range(0, int(length_mm) + 1):
        h = 4 if i % 10 == 0 else (3 if i % 5 == 0 else 1.5)
        c.line(x + i * mm, y, x + i * mm, y + h * mm)
        if i % 10 == 0:
            c.setFont("Helvetica", 7)
            c.drawCentredString(x + i * mm, y - 3.5 * mm, str(i))
    c.setFont("Helvetica", 8)
    c.drawString(x, y - 8 * mm, label)


def page(mid, size, path):
    c = canvas.Canvas(str(path), pagesize=letter)
    c.setTitle(f"ArUco 4x4 marker ID {mid}, {size} mm")
    c.setFillGray(0)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(M, PH - M - 6 * mm, f"Pot Size marker: ID {mid} · {size} mm")
    c.setFont("Helvetica", 10)
    c.drawString(M, PH - M - 13 * mm,
                 f"ArUco dictionary DICT_4X4_50 · marker ID {mid} · black square {size} mm × {size} mm")
    c.drawString(M, PH - M - 18 * mm, "PRINT AT 100% / ACTUAL SIZE. Turn off 'fit to page' and 'scale to fit'.")

    pad = 10 * mm  # white quiet zone / cut margin
    mx = (PW - size * mm) / 2
    top = PH - M - 28 * mm - pad
    my = top - size * mm
    # cut guide
    c.setDash(3, 3); c.setStrokeGray(0.5); c.setLineWidth(0.5)
    c.rect(mx - pad, my - pad, size * mm + 2 * pad, size * mm + 2 * pad, stroke=1, fill=0)
    c.setDash()
    draw_marker(c, mx, my, size * mm, mid)
    c.setFillGray(0.35); c.setFont("Helvetica", 7)
    c.drawCentredString(PW / 2, my + size * mm + pad - 3.5 * mm, "UP ↑".replace("↑", "^") + "  (this edge on top)")
    c.drawCentredString(PW / 2, my - pad + 2 * mm, "cut along dashed line; keep the white border")
    # size check beneath the marker: line exactly as long as the black square
    y = my - pad - 10 * mm
    c.setStrokeGray(0); c.setLineWidth(1)
    c.line(mx, y, mx + size * mm, y)
    c.line(mx, y - 2 * mm, mx, y + 2 * mm); c.line(mx + size * mm, y - 2 * mm, mx + size * mm, y + 2 * mm)
    c.setFillGray(0); c.setFont("Helvetica", 8)
    c.drawCentredString(PW / 2, y + 3 * mm, f"this line = black square width = {size} mm")

    ruler(c, M, y - 16 * mm, min(100, int((PW - 2 * M) / mm)),
          "Check: this ruler must measure 100 mm (10 cm). If not, reprint at 100% scale.")

    t = c.beginText(M, y - 38 * mm)
    t.setFont("Helvetica-Bold", 10); t.textLine("Using it"); t.setFont("Helvetica", 9); t.setLeading(12)
    for line in [
        f"1. Measure the black square with a ruler. Enter that value (nominally {size}) as 'Marker size' in Studio settings.",
        f"2. Set 'Booth marker ID' to ID {mid} (or 'Any 4x4 marker').",
        "3. Glue to flat, stiff board (foam core or card). Any curl or bend ruins the measurement.",
        "4. Stand it upright, facing the camera squarely, UP edge on top, on the same line as the pots.",
        "5. Leave at least 5 cm between the card and the nearest pot; keep it free of glare and shadow.",
        "6. Matte paper is best. Larger markers work better at longer phone distances.",
    ]:
        t.textLine(line)
    c.drawText(t)
    c.showPage(); c.save()


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for mid, size in VARIANTS:
        p = OUT / f"aruco-4x4-id{mid:02d}-{size}mm.pdf"
        page(mid, size, p)
        print(p.relative_to(ROOT))
