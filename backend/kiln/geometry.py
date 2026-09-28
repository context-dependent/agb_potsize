"""Small geometry helpers: homographies, convex hull, quad fitting, bilinear sampling."""
from __future__ import annotations

import math

import numpy as np

Point = tuple[float, float]


def homography(src, dst) -> np.ndarray | None:
    """3x3 homography mapping the 4 src points onto the 4 dst points, or None if degenerate."""
    A, b = [], []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        b.append(v)
    A = np.array(A, float)
    try:
        if np.linalg.cond(A) > 1e12:
            return None
        h = np.linalg.solve(A, np.array(b, float))
    except np.linalg.LinAlgError:
        return None
    return np.append(h, 1.0).reshape(3, 3)


def h_apply(H: np.ndarray, x, y):
    """Apply a homography to scalars or numpy arrays."""
    w = H[2, 0] * x + H[2, 1] * y + H[2, 2]
    return (H[0, 0] * x + H[0, 1] * y + H[0, 2]) / w, (H[1, 0] * x + H[1, 1] * y + H[1, 2]) / w


def dist(a, b) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def poly_area(p) -> float:
    s = 0.0
    n = len(p)
    for i in range(n):
        a, b = p[i], p[(i + 1) % n]
        s += a[0] * b[1] - b[0] * a[1]
    return abs(s) / 2


def hull(pts) -> list[Point]:
    """Convex hull (monotone chain), counter-clockwise, collinear points dropped."""
    pts = sorted(set(map(tuple, pts)))
    if len(pts) < 3:
        return list(pts)

    def cr(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lo: list = []
    for p in pts:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    up: list = []
    for p in reversed(pts):
        while len(up) >= 2 and cr(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]


def _order_cw(q):
    cx = sum(p[0] for p in q) / 4
    cy = sum(p[1] for p in q) / 4
    return sorted(q, key=lambda p: math.atan2(p[1] - cy, p[0] - cx))


def quad_from_hull(h):
    """Approximate a convex hull by a quadrilateral: its longest diagonal plus the furthest point either side."""
    n = len(h)
    if n < 4:
        return None
    best, i1, i2 = -1.0, 0, 0
    for i in range(n):
        for j in range(i + 1, n):
            d = (h[i][0] - h[j][0]) ** 2 + (h[i][1] - h[j][1]) ** 2
            if d > best:
                best, i1, i2 = d, i, j
    a, b = h[i1], h[i2]
    mx = mn = 0.0
    p3 = p4 = None
    for p in h:
        c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
        if c > mx:
            mx, p3 = c, p
        if c < mn:
            mn, p4 = c, p
    if p3 is None or p4 is None:
        return None
    return _order_cw([a, p3, b, p4])


def samp(gray: np.ndarray, x: float, y: float) -> float:
    """Bilinear sample of a 2-D float image, clamped to the edges."""
    h, w = gray.shape
    x = min(max(x, 0.0), w - 1.001)
    y = min(max(y, 0.0), h - 1.001)
    x0, y0 = int(x), int(y)
    fx, fy = x - x0, y - y0
    return float(
        gray[y0, x0] * (1 - fx) * (1 - fy)
        + gray[y0, x0 + 1] * fx * (1 - fy)
        + gray[y0 + 1, x0] * (1 - fx) * fy
        + gray[y0 + 1, x0 + 1] * fx * fy
    )


def samp_many(gray: np.ndarray, xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    """Vectorised `samp`."""
    h, w = gray.shape
    xs = np.clip(xs, 0, w - 1.001)
    ys = np.clip(ys, 0, h - 1.001)
    x0, y0 = xs.astype(int), ys.astype(int)
    fx, fy = xs - x0, ys - y0
    return (
        gray[y0, x0] * (1 - fx) * (1 - fy)
        + gray[y0, x0 + 1] * fx * (1 - fy)
        + gray[y0 + 1, x0] * (1 - fx) * fy
        + gray[y0 + 1, x0 + 1] * fx * fy
    )
