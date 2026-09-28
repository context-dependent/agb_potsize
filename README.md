# Kiln Space Meter

A phone-friendly web app for potters in a communal studio. Photograph one piece or a row of pieces in the studio photo booth; the app finds the ArUco marker card, traces each piece against the backdrop, and works out the **kiln space** each piece takes (bounding box H × W × D in cubic inches, not true pot volume) and what it costs to fire.

## Run it

Requires Node 20+ and Python 3.10+. The measuring runs in a Python service; the browser only takes the photo, draws the result and edits the slip.

```sh
# backend (FastAPI + OpenCV) on :8000
python -m venv .venv && . .venv/bin/activate
pip install -r backend/requirements.txt
cd backend && python -m uvicorn kiln.app:app --reload --port 8000

# frontend (Vite) on :5173, in a second terminal; proxies /api to :8000
npm install
npm run dev
```

Open http://localhost:5173. The sample scene (three synthetic pots and an 80 mm ID 7 marker) loads automatically. Use **Load sample** to reload it, or **Photograph front view** to use a real photo. To try it on a phone, run `npm run dev -- --host` and open the printed network URL (camera capture needs HTTPS or localhost on most phones).

To serve everything from one process, run `npm run build` and then only the backend: it serves `dist/` at http://localhost:8000.

| Command | What it does |
| --- | --- |
| `npm run build` | Typecheck and build the frontend to `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `python -m pytest backend` | Backend tests, including the sample scene compared with the prototype (`pip install -r backend/requirements-dev.txt` first) |
| `npm test` | Tests of the original prototype's maths, kept as the reference the port is checked against |

## Layout

```
index.html, src/        frontend (TypeScript, no measuring logic)
  api.ts                  calls to the backend
  ui/                     drawing the photo and overlay, checks list, piece cards, firing slip
backend/kiln/           the measuring service
  geometry.py             homography, convex hull, quad fitting, bilinear sampling
  aruco.py                marker detection, decoding, corner refinement
  segmentation.py         backdrop model and pot tracing
  analyze.py              photo -> marker calibration -> pots in mm
  pricing.py              depth rules, rounding, kiln-space volume, fees, firing rates
  units.py                in/cm conversion
  app.py                  HTTP API
  assets/sample.png       the prototype's sample scene, exported from it
backend/tests/          pytest, plus golden numbers taken from the prototype
reference/              the original single-file prototype
```

API: `POST /api/analyze` (multipart `image`, `marker_size`, `marker_id`, `tol`) returns the marker and each piece's size in mm with its outline; `POST /api/quote` takes those sizes plus depth, firing, quantity and rates and returns the dimensions, kiln-space volume and fee of each piece; `GET /api/sample.png` and `GET /api/config` serve the sample scene and firing types. Photos are processed in memory and not stored. The firing slip lives in `localStorage` on the device.

## How it measures

1. **Marker.** Finds a 4×4 ArUco marker (DICT_4X4_50) and refines its corners; its known size (default 80 mm) gives a homography from the photo to millimetres in the marker's plane.
2. **Segmentation.** Fits a smooth colour model of the backdrop from the photo's border, marks pixels far from it, cleans the mask, and keeps each blob that isn't the marker card. Pieces are numbered left to right.
3. **Size.** Each piece's width and height come from its outline mapped through the homography. Depth comes from an optional side view, an entered value, or (for round pieces) the width.
4. **Price.** Dimensions are optionally rounded up to the next ½ in (or 1 cm), multiplied for volume, then priced at the chosen firing rate with a per-piece minimum. The example rates are placeholders; set them to your studio's.

The piece must stand in the same plane as the marker card, so keep the two the same distance from the camera. See **Booth setup and marker** inside the app for the layout.

## Notes

`reference/kiln-space-meter.html` is the original prototype. On its sample scene the Python service finds the same marker (ID 7, 240.0 px, 2.55° tilt), traces the same three pieces to within a millimetre, and gives the same rounded dimensions, fees and totals (370 in³, $12.94). The only visible difference is the unrounded height of the mug (3.94 in against 3.96 in), from a one-pixel difference in the traced outline.
