"""Full analysis of one photo: marker -> mm-per-pixel calibration -> traced pieces in millimetres."""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import cv2
import numpy as np

from .aruco import detect_markers, refine_corners
from .geometry import dist, h_apply, homography
from .segmentation import Pot, segment_pots

MAX_WORK_DIM = 2400


@dataclass
class Settings:
    marker_size_mm: float = 80.0
    marker_id: str = "any"  # 'any' or an ID as a string
    tol: float = 2.0


@dataclass
class Analysis:
    ok: bool
    stage: str | None = None  # 'marker' or 'pot' when not ok
    ids: list[int] = field(default_factory=list)
    touches_card: bool = False
    marker: dict | None = None
    pots: list[Pot] = field(default_factory=list)
    seg_size: tuple[int, int] = (0, 0)
    fs: float = 1.0


def _resize(img: np.ndarray, max_dim: int) -> np.ndarray:
    k = min(1.0, max_dim / max(img.shape[:2]))
    if k == 1.0:
        return img
    h, w = img.shape[:2]
    return cv2.resize(img, (max(1, round(w * k)), max(1, round(h * k))), interpolation=cv2.INTER_AREA)


def _gray(img: np.ndarray) -> np.ndarray:
    r, g, b = (img[..., i].astype(np.float32) for i in range(3))
    return 0.299 * r + 0.587 * g + 0.114 * b


def analyze(rgb: np.ndarray, cfg: Settings) -> Analysis:
    """`rgb` is an HxWx3 uint8 array in RGB order."""
    work = _resize(rgb, MAX_WORK_DIM)
    det = _resize(work, 1000)
    markers = detect_markers(_gray(det))
    all_ids = sorted({m.id for m in markers})
    if cfg.marker_id != "any":
        markers = [m for m in markers if m.id == int(cfg.marker_id)]
    if not markers:
        return Analysis(False, stage="marker", ids=all_ids)
    m = max(markers, key=lambda k: k.area)
    f = work.shape[1] / det.shape[1]
    corners = [((x + 0.5) * f - 0.5, (y + 0.5) * f - 0.5) for x, y in m.corners]
    corners = refine_corners(_gray(work), corners)
    S = cfg.marker_size_mm
    plane = [(0, 0), (S, 0), (S, S), (0, S)]
    H, Hi = homography(corners, plane), homography(plane, corners)
    side = [dist(corners[i], corners[(i + 1) % 4]) for i in range(4)]
    side_px = sum(side) / 4
    ux, uy = corners[3][0] - corners[0][0], corners[3][1] - corners[0][1]
    tilt = abs(math.atan2(ux, uy) * 180 / math.pi)
    seg_img = _resize(work, 900)
    fs = work.shape[1] / seg_img.shape[1]
    sc = [(x / fs, y / fs) for x, y in corners]
    pad = 0.25 * max(side) / fs
    zone = (min(p[0] for p in sc) - pad, min(p[1] for p in sc) - pad, max(p[0] for p in sc) + pad, max(p[1] for p in sc) + pad)
    seg = segment_pots(seg_img, zone, cfg.tol)
    marker = {"id": m.id, "corners": [list(c) for c in corners], "side_px": side_px, "tilt": tilt, "ham": m.ham}
    seg_size = (seg_img.shape[1], seg_img.shape[0])
    if not seg.ok:
        return Analysis(False, stage="pot", touches_card=seg.touches_card, marker=marker, seg_size=seg_size, fs=fs)
    for pot in seg.pots:
        # pixel-corner extent of the outline, mapped into marker millimetres
        px = pot.edge_pts[:, 0].astype(float)
        py = pot.edge_pts[:, 1].astype(float)
        us, vs = [], []
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            u, v = h_apply(H, (px + dx) * fs - 0.5, (py + dy) * fs - 0.5)
            us.append(u)
            vs.append(v)
        us, vs = np.concatenate(us), np.concatenate(vs)
        x0, x1, y0, y1 = us.min(), us.max(), vs.min(), vs.max()
        pot.w_mm, pot.h_mm = float(x1 - x0), float(y1 - y0)
        pot.box_img = [list(h_apply(Hi, x, y)) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    return Analysis(True, marker=marker, pots=seg.pots, seg_size=seg_size, fs=fs)
