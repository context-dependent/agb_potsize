# Printable ArUco markers

US Letter PDFs, **print at 100% (actual size)**. Each page shows the marker ID, dictionary (OpenCV `DICT_4X4_50`), black-square size in mm, a size-check line and 100 mm ruler to verify print scale, and brief placement instructions.

| File | ID | Black square |
| --- | --- | --- |
| `aruco-4x4-id07-80mm.pdf` | 7 | 80 mm (matches the app's sample/default size) |
| `aruco-4x4-id07-50mm.pdf` / `-100mm` / `-120mm` | 7 | 50 / 100 / 120 mm |
| `aruco-4x4-id00-80mm.pdf` … `id03-80mm.pdf` | 0–3 | 80 mm |

After printing, measure the black square and enter it under **Marker size** in Studio settings; pick the matching **Booth marker ID** (the app default is "Any 4×4 marker").

Regenerate (edit `VARIANTS` in the script to add IDs/sizes):

    pip install reportlab && python3 scripts/make_markers.py

Bit patterns are read from `DICT4` in `src/core/aruco.ts`. All PDFs were rendered and decoded with OpenCV's ArUco detector to confirm the right ID.
