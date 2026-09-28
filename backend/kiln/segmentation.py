"""Trace pieces against the backdrop.

The backdrop colour is modelled as a bilinear surface fitted to the photo's border;
pixels far from it (with luma down-weighted, so faint shadows count for little) are pot.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

_SQUARE = np.ones((3, 3), np.uint8)
_CROSS = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))


@dataclass
class Pot:
    id: int
    mask: np.ndarray  # bool, segmentation resolution, this pot only
    edge_pts: np.ndarray  # (n, 2) x, y of boundary pixels
    edge: bool  # touches the photo border
    bbox: tuple[int, int, int, int]
    area: int
    # filled in by analyze()
    w_mm: float = 0.0
    h_mm: float = 0.0
    box_img: list = field(default_factory=list)


@dataclass
class Segmentation:
    ok: bool
    pots: list[Pot] = field(default_factory=list)
    touches_card: bool = False
    near_card: bool = False


def _design(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    return np.stack([np.ones_like(x), x, y, x * y], axis=1)


def _fit(samples: np.ndarray) -> np.ndarray:
    """Least-squares bilinear surface per colour channel. Returns (4, 3) coefficients."""
    A = _design(samples[:, 0], samples[:, 1])
    coef, *_ = np.linalg.lstsq(A, samples[:, 2:5], rcond=None)
    return coef


def _dist(rgb: np.ndarray, pred: np.ndarray) -> np.ndarray:
    d = rgb - pred
    dr, dg, db = d[..., 0], d[..., 1], d[..., 2]
    dy = 0.299 * dr + 0.587 * dg + 0.114 * db
    return np.sqrt((0.5 * dy) ** 2 + (db - dy) ** 2 + (dr - dy) ** 2)


def segment_pots(rgb: np.ndarray, zone, tol: float) -> Segmentation:
    """`rgb` is an HxWx3 uint8 image; `zone` is (x0, y0, x1, y1) around the marker card, which is excluded."""
    h, w, _ = rgb.shape
    band = max(4, round(min(w, h) * 0.04))
    ys, xs = np.mgrid[0:h:2, 0:w:2]
    ys, xs = ys.ravel(), xs.ravel()
    border = (xs < band) | (xs >= w - band) | (ys < band) | (ys >= h - band)
    in_zone = (xs >= zone[0]) & (xs <= zone[2]) & (ys >= zone[1]) & (ys <= zone[3])
    keep = border & ~in_zone
    xs, ys = xs[keep], ys[keep]
    smp = np.column_stack([xs / w, ys / h, rgb[ys, xs].astype(float)])

    C = _fit(smp)
    res = _dist(smp[:, 2:5], _design(smp[:, 0], smp[:, 1]) @ C)
    cut = np.sort(res)[int(len(res) * 0.8)]
    smp = smp[res <= cut]
    C = _fit(smp)
    res = np.sort(_dist(smp[:, 2:5], _design(smp[:, 0], smp[:, 1]) @ C))
    p95 = res[int(len(res) * 0.95)] or 4
    T = max(10.0, p95 * tol * 1.6)

    gy, gx = np.mgrid[0:h, 0:w]
    pred = _design((gx / w).ravel().astype(float), (gy / h).ravel().astype(float)) @ C
    m = (_dist(rgb.reshape(-1, 3).astype(float), pred) > T).reshape(h, w).astype(np.uint8)
    m = cv2.erode(cv2.dilate(m, _SQUARE, iterations=2), _SQUARE, iterations=2)  # close
    m = cv2.dilate(cv2.erode(m, _SQUARE, iterations=1), _SQUARE, iterations=1)  # open

    # fill holes: background is whatever 4-connects to the border; everything else is pot
    n, lab = cv2.connectedComponents(1 - m, connectivity=4)
    on_border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, on_border[on_border > 0]) & (m == 0)
    m = (~bg).astype(np.uint8)

    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=4)
    z0, z1 = max(0, int(zone[1])), min(h - 1, int(zone[3]))
    x0, x1 = max(0, int(zone[0])), min(w - 1, int(zone[2]))
    zone_labels = set(np.unique(lab[z0:z1 + 1, x0:x1 + 1]).tolist()) - {0}
    area = stats[:, cv2.CC_STAT_AREA]
    cands = [i for i in range(1, n) if i not in zone_labels and area[i] >= w * h * 0.003]
    if not cands:
        return Segmentation(False, touches_card=any(area[l] > w * h * 0.02 for l in zone_labels))
    max_a = max(area[i] for i in cands)
    pots: list[Pot] = []
    for i in cands:
        if area[i] < max_a * 0.06:
            continue
        bx, by, bw, bh = (int(v) for v in stats[i, :4])
        mask = lab == i
        inner = cv2.erode(mask.astype(np.uint8), _CROSS, borderType=cv2.BORDER_CONSTANT, borderValue=0).astype(bool)
        ey, ex = np.nonzero(mask & ~inner)
        pots.append(Pot(
            id=i, mask=mask, edge_pts=np.column_stack([ex, ey]),
            edge=bx <= 1 or by <= 1 or bx + bw - 1 >= w - 2 or by + bh - 1 >= h - 2,
            bbox=(bx, by, bx + bw - 1, by + bh - 1), area=int(area[i]),
        ))
    pots.sort(key=lambda p: p.bbox[0] + p.bbox[2])
    near_card = any(area[l] > max_a * 0.5 for l in zone_labels)
    return Segmentation(True, pots=pots, near_card=near_card)
