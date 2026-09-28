"""Kiln-space volume (bounding box H x W x D, not true pot volume) and firing fees."""
from __future__ import annotations

import math
from dataclasses import dataclass

from .units import IN3_PER_L, step, to_unit

FIRINGS = [
    {"id": "bisque", "label": "Bisque · cone 04", "rate": 0.020},
    {"id": "c6", "label": "Glaze · cone 6 oxidation", "rate": 0.035},
    {"id": "c10", "label": "Glaze · cone 10 reduction", "rate": 0.045},
]


def default_rates() -> dict[str, float]:
    return {f["id"]: f["rate"] for f in FIRINGS}


@dataclass
class Piece:
    w_mm: float
    h_mm: float
    side_w_mm: float | None = None  # matching piece in a usable side view
    side_h_mm: float | None = None
    round: bool = True
    depth_mm: float | None = None
    firing: str = "c6"
    qty: int = 1


def round_up(unit: str, v: float, on: bool) -> float:
    """Round up to the next ½ in / 1 cm, tolerating float noise."""
    return math.ceil(v / step(unit) - 1e-9) * step(unit) if on else v


def piece_dims(unit: str, p: Piece, round_dims: bool) -> dict:
    has_side = p.side_w_mm is not None
    h_mm = max(p.h_mm, p.side_h_mm or 0) if has_side else p.h_mm
    d_mm = p.side_w_mm if has_side else (p.w_mm if p.round else (p.depth_mm or 0))
    h_raw, w_raw, d_raw = to_unit(unit, h_mm), to_unit(unit, p.w_mm), to_unit(unit, d_mm)
    return {
        "h_raw": h_raw, "w_raw": w_raw, "d_raw": d_raw,
        "h": round_up(unit, h_raw, round_dims), "w": round_up(unit, w_raw, round_dims), "d": round_up(unit, d_raw, round_dims),
        "src": "side" if has_side else ("round" if p.round else "entered"),
    }


def volume_in3(unit: str, d: dict) -> float:
    v = d["h"] * d["w"] * d["d"]
    return v if unit == "in" else v / 1000 * IN3_PER_L


def fee_for(v3: float, firing: str, rates: dict[str, float], min_fee: float) -> tuple[float, bool]:
    fee = v3 * rates.get(firing, 0)
    # round half up to cents, as JavaScript's Math.round does
    return math.floor(max(fee, min_fee) * 100 + 0.5) / 100, fee < min_fee


def quote(unit: str, pieces: list[Piece], rates: dict[str, float], min_fee: float, round_dims: bool) -> dict:
    items = []
    tv = tf = 0.0
    for p in pieces:
        d = piece_dims(unit, p, round_dims)
        v3 = volume_in3(unit, d)
        fee, at_min = fee_for(v3, p.firing, rates, min_fee)
        q = max(1, p.qty)
        tv += v3 * q
        tf += fee * q
        items.append({"dims": d, "vol": v3, "fee": fee, "at_min": at_min, "qty": q})
    return {"items": items, "total_vol": tv, "total_fee": tf}
