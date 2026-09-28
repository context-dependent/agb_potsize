# Kiln Space Meter

A phone-friendly web app for potters in a communal studio. Photograph one piece or a row of pieces in the studio photo booth; the app finds the ArUco marker card, traces each piece against the backdrop, and works out the **kiln space** each piece takes (bounding box H × W × D in cubic inches, not true pot volume) and what it costs to fire.

It runs entirely in the browser. Photos are never uploaded, and the firing slip is stored in `localStorage` on the device.

## Run it

Requires Node 20+.

```sh
npm install
npm run dev        # http://localhost:5173, with hot reload
```

Open it and the sample scene (three synthetic pots and an 80 mm ID 7 marker) loads automatically. Use **Load sample** to reload it, or **Photograph front view** to use a real photo. To try it on a phone, run `npm run dev -- --host` and open the printed network URL (camera capture needs HTTPS or localhost on most phones).

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run preview` | Serve the built app |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests for the geometry, measurement and pricing modules |

## Layout

```
index.html            page markup
src/main.ts           wiring: controls, photo intake, refresh loop
src/styles.css        styles (light and dark themes)
src/core/             the measuring pipeline, no UI state
  math.ts               linear solve, homography, hull, bilinear sampling
  image.ts              canvas scaling, grayscale, connected components
  aruco.ts              marker detection, decoding, corner refinement
  segmentation.ts       backdrop model and pot tracing
  analyze.ts            photo -> marker calibration -> pots in mm
  pricing.ts            depth rules, rounding, kiln-space volume, fees, firing rates
  units.ts              in/cm conversion and formatting
  sample.ts             synthetic sample scene
src/ui/               DOM rendering: draw, checks, pieces, slip, state
reference/            the original single-file prototype, kept as the behavioural reference
tests/                vitest
```

## How it measures

1. **Marker.** Finds a 4×4 ArUco marker (DICT_4X4_50) and refines its corners; its known size (default 80 mm) gives a homography from the photo to millimetres in the marker's plane.
2. **Segmentation.** Fits a smooth colour model of the backdrop from the photo's border, marks pixels far from it, cleans the mask, and keeps each blob that isn't the marker card. Pieces are numbered left to right.
3. **Size.** Each piece's width and height come from its outline mapped through the homography. Depth comes from an optional side view, an entered value, or (for round pieces) the width.
4. **Price.** Dimensions are optionally rounded up to the next ½ in (or 1 cm), multiplied for volume, then priced at the chosen firing rate with a per-piece minimum. The example rates are placeholders; set them to your studio's.

The piece must stand in the same plane as the marker card, so keep the two the same distance from the camera. See **Booth setup and marker** inside the app for the layout.

## Notes

`reference/kiln-space-meter.html` is the original prototype. The port keeps its behaviour: on the sample scene it produces a pixel-identical canvas and identical measurements, fees and totals.
