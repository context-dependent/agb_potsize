import json
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from kiln.analyze import Settings, analyze
from kiln.app import app
from kiln.geometry import h_apply, homography, hull, poly_area, quad_from_hull
from kiln.pricing import FIRINGS, Piece, fee_for, piece_dims, quote, round_up, volume_in3

HERE = Path(__file__).parent
SAMPLE = HERE.parent / "kiln" / "assets" / "sample.png"
GOLDEN = json.loads((HERE / "golden_sample.json").read_text())  # numbers produced by the JS prototype


@pytest.fixture(scope="module")
def sample_rgb():
    return cv2.cvtColor(cv2.imread(str(SAMPLE)), cv2.COLOR_BGR2RGB)


# ---------- geometry ----------
def test_homography_maps_source_to_destination():
    src = [(0, 0), (80, 0), (80, 80), (0, 80)]
    dst = [(100, 200), (400, 210), (390, 500), (95, 480)]
    H = homography(src, dst)
    for s, d in zip(src, dst):
        x, y = h_apply(H, *s)
        assert (x, y) == pytest.approx(d, abs=1e-6)


def test_homography_rejects_degenerate():
    assert homography([(0, 0), (1, 1), (2, 2), (3, 3)], [(0, 0), (1, 0), (1, 1), (0, 1)]) is None


def test_hull_and_quad():
    h = hull([(0, 0), (10, 0), (10, 10), (0, 10), (5, 5), (3, 7)])
    assert len(h) == 4
    assert poly_area(quad_from_hull(h)) == pytest.approx(100)
    assert quad_from_hull([(0, 0), (1, 0), (0, 1)]) is None


# ---------- sample scene vs the JS prototype ----------
def test_sample_scene_matches_prototype(sample_rgb):
    r = analyze(sample_rgb, Settings())
    assert r.ok
    assert r.marker["id"] == GOLDEN["marker"]["id"] == 7
    assert r.marker["side_px"] == pytest.approx(GOLDEN["marker"]["sidePx"], abs=0.05)
    assert r.marker["tilt"] == pytest.approx(GOLDEN["marker"]["tilt"], abs=0.05)
    assert len(r.pots) == len(GOLDEN["pots"]) == 3
    for p, g in zip(r.pots, GOLDEN["pots"]):
        assert p.w_mm == pytest.approx(g["wMm"], abs=1.0)
        assert p.h_mm == pytest.approx(g["hMm"], abs=1.0)
        assert not p.edge


def test_wrong_marker_id_is_reported(sample_rgb):
    r = analyze(sample_rgb, Settings(marker_id="3"))
    assert not r.ok and r.stage == "marker" and r.ids == [7]


def test_blank_image_has_no_marker():
    r = analyze(np.full((300, 400, 3), 128, np.uint8), Settings())
    assert not r.ok and r.stage == "marker"


# ---------- pricing ----------
VASE = Piece(w_mm=120, h_mm=160)


def test_round_up_half_inch_with_float_noise():
    assert round_up("in", 3.0, True) == 3
    assert round_up("in", 3.01, True) == 3.5
    assert round_up("in", 3.5 + 1e-12, True) == 3.5
    assert round_up("cm", 16.01, True) == 17
    assert round_up("in", 3.01, False) == 3.01


def test_depth_rules():
    assert piece_dims("in", Piece(120, 160, side_w_mm=90, side_h_mm=158), False)["src"] == "side"
    d = piece_dims("in", Piece(120, 160, round=False, depth_mm=50), False)
    assert d["src"] == "entered" and d["d_raw"] == pytest.approx(50 / 25.4)
    assert piece_dims("in", VASE, False)["src"] == "round"
    assert piece_dims("in", Piece(120, 160, round=False), False)["d_raw"] == 0
    # taller of front/side wins
    assert piece_dims("in", Piece(120, 160, side_w_mm=90, side_h_mm=170), False)["h_raw"] == pytest.approx(170 / 25.4)


def test_volume_is_bounding_box():
    assert volume_in3("in", piece_dims("in", VASE, True)) == pytest.approx(6.5 * 5 * 5)
    assert volume_in3("cm", {"h": 10, "w": 10, "d": 10}) == pytest.approx(61.0237)


def test_fee_floor_and_rounding():
    rates = {"c6": 0.035, "bisque": 0.02}
    assert fee_for(100, "c6", rates, 1) == (3.5, False)
    assert fee_for(10, "c6", rates, 1) == (1.0, True)
    assert fee_for(50, "nope", rates, 1) == (1.0, True)
    assert fee_for(33.333, "bisque", rates, 0)[0] == 0.67
    assert [(f["id"], f["rate"]) for f in FIRINGS] == [("bisque", 0.02), ("c6", 0.035), ("c10", 0.045)]


def test_sample_vase_prices_at_5_69():
    q = quote("in", [VASE], {"c6": 0.035}, 1.0, True)
    assert q["items"][0]["fee"] == 5.69 and q["total_fee"] == pytest.approx(5.69)


# ---------- HTTP ----------
client = TestClient(app)


def test_api_sample_end_to_end():
    png = client.get("/api/sample.png")
    assert png.status_code == 200
    res = client.post("/api/analyze", files={"image": ("s.png", png.content, "image/png")}, data={"marker_size": "80"})
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] and len(body["pots"]) == 3 and body["pots"][0]["outline"]
    pieces = [{"wMm": p["wMm"], "hMm": p["hMm"], "firing": "c6"} for p in body["pots"]]
    q = client.post("/api/quote", json={"unit": "in", "pieces": pieces, "minFee": 1.0, "roundUp": True}).json()
    # prototype's sample-scene result: 6.5×5×5, 4×4.5×4.5, 3.5×6×6 in => 370 in³, $12.94
    assert [round(i["vol"], 1) for i in q["items"]] == [162.5, 81.0, 126.0]
    assert round(q["totalVol"]) == 370
    assert round(q["totalFee"], 2) == 12.94


def test_api_rejects_non_image():
    res = client.post("/api/analyze", files={"image": ("x.txt", b"nope", "text/plain")})
    assert res.status_code == 400
