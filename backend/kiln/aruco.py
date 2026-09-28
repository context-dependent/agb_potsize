"""ArUco 4x4 marker detection: threshold, find square candidates, decode, refine corners."""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .geometry import dist, h_apply, homography, hull, poly_area, quad_from_hull, samp, samp_many

# ArUco DICT_4X4_50 inner 4x4 bits, row-major, MSB first, white = 1 (from OpenCV).
DICT4 = [46386, 3994, 13101, 39238, 21662, 31181, 40494, 50418, 65242, 53078, 63889, 4519, 3767, 10767, 9393, 9790, 18021, 26112, 27742, 30383, 34443, 45099, 52437, 56706, 65095, 38001, 44260, 42324, 8483, 13423, 17429, 22450, 40655, 61643, 2222, 2345, 6261, 1279, 3574, 7258, 5912, 10792, 12940, 14514, 9448, 12011, 11583, 19300, 20526, 20499]


@dataclass
class Marker:
    id: int
    ham: int
    corners: list  # four (x, y), starting at the marker's top-left
    area: float = 0.0


def _decode_quad(gray: np.ndarray, q) -> Marker | None:
    H = homography([(0, 0), (6, 0), (6, 6), (0, 6)], q)
    if H is None:
        return None
    off = (-0.2, 0.0, 0.2)
    cells = np.array([(c + 0.5 + ox, r + 0.5 + oy) for r in range(6) for c in range(6) for oy in off for ox in off])
    xs, ys = h_apply(H, cells[:, 0], cells[:, 1])
    vals = samp_many(gray, xs, ys).reshape(36, 9).mean(axis=1)
    mn, mx = vals.min(), vals.max()
    if mx - mn < 30:
        return None
    bits = (vals > (mn + mx) / 2).astype(int).reshape(6, 6)
    border_err = bits[0].sum() + bits[5].sum() + bits[1:5, 0].sum() + bits[1:5, 5].sum()
    if border_err > 1:
        return None
    g = bits[1:5, 1:5].copy()
    for k in range(4):
        code = 0
        for bit in g.flatten():
            code = (code << 1) | int(bit)
        best_id, best_d = -1, 9
        for i, ref in enumerate(DICT4):
            d = bin(code ^ ref).count("1")
            if d < best_d:
                best_d, best_id = d, i
        if best_d <= 1:
            return Marker(best_id, best_d, [q[(4 - k + i) % 4] for i in range(4)])
        g = np.rot90(g, -1)  # rotate 90° clockwise
    return None


def detect_markers(gray: np.ndarray) -> list[Marker]:
    """Find all decodable markers in a float gray image, trying three local-threshold window sizes."""
    h, w = gray.shape
    integ = cv2.integral(gray.astype(np.float64))
    for div in (30, 14, 60):
        r = max(5, round(min(w, h) / div))
        ys = np.arange(h)
        xs = np.arange(w)
        ya, yb = np.maximum(0, ys - r), np.minimum(h, ys + r + 1)
        xa, xb = np.maximum(0, xs - r), np.minimum(w, xs + r + 1)
        s = integ[yb][:, xb] - integ[ya][:, xb] - integ[yb][:, xa] + integ[ya][:, xa]
        mean = s / ((yb - ya)[:, None] * (xb - xa)[None, :])
        binary = (gray < mean - 7).astype(np.uint8)
        n, lab, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=4)
        found: list[Marker] = []
        for i in range(1, n):
            x0, y0, bw, bh, area = stats[i]
            fill = area / (bw * bh)
            if not (area >= 120 and bw >= 12 and bh >= 12 and bw < w * 0.9 and bh < h * 0.9 and bw / bh < 4 and bh / bw < 4 and 0.15 < fill < 0.97):
                continue
            ys_, xs_ = np.nonzero(lab[y0:y0 + bh, x0:x0 + bw] == i)
            hl = hull(list(zip((xs_ + x0).tolist(), (ys_ + y0).tolist())))
            q = quad_from_hull(hl)
            if q is None:
                continue
            qa, ha = poly_area(q), poly_area(hl)
            if qa < 100 or qa / ha < 0.88:
                continue
            sides = [dist(q[j], q[(j + 1) % 4]) for j in range(4)]
            if min(sides) < 10 or max(sides) / min(sides) > 3:
                continue
            m = _decode_quad(gray, q)
            if m:
                m.area = qa
                found.append(m)
        if found:
            return found
    return []


def refine_corners(gray: np.ndarray, c):
    """Sub-pixel corner refinement: fit a line to each marker edge, then intersect neighbouring lines."""
    cen = (sum(p[0] for p in c) / 4, sum(p[1] for p in c) / 4)
    lines = []
    for i in range(4):
        a, b = c[i], c[(i + 1) % 4]
        L = dist(a, b)
        ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        nx, ny = uy, -ux
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        if nx * (mid[0] - cen[0]) + ny * (mid[1] - cen[1]) < 0:
            nx, ny = -nx, -ny
        R, st = max(3.0, 0.07 * L), 0.5
        ss = np.arange(-R, R + 1e-9, st)
        P = []
        t = 0.12
        while t <= 0.881:
            px, py = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            t += 0.035
            gr = samp_many(gray, px + nx * (ss + st / 2), py + ny * (ss + st / 2)) - samp_many(gray, px + nx * (ss - st / 2), py + ny * (ss - st / 2))
            j = int(np.argmax(gr))  # first maximum, as in the prototype
            if gr[j] < 12 or j == 0 or j == len(gr) - 1:
                continue
            den = gr[j - 1] - 2 * gr[j] + gr[j + 1]
            off = 0.5 * (gr[j - 1] - gr[j + 1]) / den if den < 0 else 0.0
            s = -R + (j + off) * st
            P.append((px + nx * s, py + ny * s))
        if len(P) < 8:
            return c
        P = np.array(P)
        mx, my = P.mean(axis=0)
        dx, dy = P[:, 0] - mx, P[:, 1] - my
        th = 0.5 * np.arctan2(2 * (dx * dy).sum(), (dx * dx).sum() - (dy * dy).sum())
        lines.append(((mx, my), (float(np.cos(th)), float(np.sin(th)))))
    out = []
    for i in range(4):
        (p1, d1), (p2, d2) = lines[(i + 3) % 4], lines[i]
        den = d1[0] * d2[1] - d1[1] * d2[0]
        if abs(den) < 1e-6:
            return c
        t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den
        q = (p1[0] + t * d1[0], p1[1] + t * d1[1])
        if dist(q, c[i]) > max(3.0, 0.08 * dist(c[i], c[(i + 1) % 4])):
            return c
        out.append(q)
    return out
