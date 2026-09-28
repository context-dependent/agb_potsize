"""HTTP API. Photos go up, measurements come back; the frontend only draws and edits."""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .analyze import Analysis, Settings, analyze
from .pricing import FIRINGS, Piece, default_rates, quote

ASSETS = Path(__file__).parent / "assets"
DIST = Path(__file__).resolve().parents[2] / "dist"
MAX_UPLOAD_BYTES = 40 * 1024 * 1024

app = FastAPI(title="Kiln Space Meter")


def decode_image(data: bytes) -> np.ndarray:
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)  # honours EXIF orientation
    if img is None:
        raise HTTPException(400, "That file could not be opened as an image. Try a JPG or PNG.")
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


def serialise(r: Analysis) -> dict:
    out: dict = {"ok": r.ok, "stage": r.stage, "ids": r.ids, "touchesCard": r.touches_card, "marker": None, "pots": []}
    if r.marker:
        m = r.marker
        out["marker"] = {"id": m["id"], "corners": m["corners"], "sidePx": m["side_px"], "tilt": m["tilt"], "ham": m["ham"]}
    for p in r.pots:
        contours, _ = cv2.findContours(p.mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        out["pots"].append({
            "wMm": p.w_mm, "hMm": p.h_mm, "edge": p.edge, "bbox": list(p.bbox), "area": p.area,
            "boxImg": p.box_img,
            "outline": [c[:, 0, :].tolist() for c in contours],  # segmentation-resolution pixels
        })
    out["segSize"] = list(r.seg_size)
    out["fs"] = r.fs
    return out


def run(data: bytes, size: float, marker_id: str, tol: float) -> dict:
    if not (size > 0 and tol > 0):
        raise HTTPException(422, "marker size and tolerance must be positive")
    return serialise(analyze(decode_image(data), Settings(size, marker_id, tol)))


@app.get("/api/config")
def config():
    return {"firings": FIRINGS}


@app.post("/api/analyze")
async def analyze_photo(
    image: UploadFile = File(...),
    marker_size: float = Form(80.0),
    marker_id: str = Form("any"),
    tol: float = Form(2.0),
):
    data = await image.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Photo is too large.")
    return run(data, marker_size, marker_id, tol)


@app.get("/api/sample.png")
def sample_image():
    return FileResponse(ASSETS / "sample.png", media_type="image/png")


class PieceIn(BaseModel):
    wMm: float
    hMm: float
    sideWMm: float | None = None
    sideHMm: float | None = None
    round: bool = True
    depthMm: float | None = None
    firing: str = "c6"
    qty: int = Field(1, ge=1, le=999)


class QuoteIn(BaseModel):
    unit: str = Field("in", pattern="^(in|cm)$")
    pieces: list[PieceIn]
    rates: dict[str, float] = Field(default_factory=default_rates)
    minFee: float = Field(0, ge=0)
    roundUp: bool = True


@app.post("/api/quote")
def price(q: QuoteIn):
    pieces = [Piece(p.wMm, p.hMm, p.sideWMm, p.sideHMm, p.round, p.depthMm, p.firing, p.qty) for p in q.pieces]
    res = quote(q.unit, pieces, q.rates, q.minFee, q.roundUp)
    return {
        "items": [
            {"dims": {"hRaw": i["dims"]["h_raw"], "wRaw": i["dims"]["w_raw"], "dRaw": i["dims"]["d_raw"], "h": i["dims"]["h"], "w": i["dims"]["w"], "d": i["dims"]["d"], "src": i["dims"]["src"]},
             "vol": i["vol"], "fee": i["fee"], "atMin": i["at_min"], "qty": i["qty"]}
            for i in res["items"]
        ],
        "totalVol": res["total_vol"], "totalFee": res["total_fee"],
    }


if DIST.is_dir():  # `npm run build` output, so one process serves the whole app
    app.mount("/", StaticFiles(directory=DIST, html=True), name="web")
