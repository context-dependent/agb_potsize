import type { Gray, Marker, Quad, Vec } from './types';
import { dist, hApply, homography, hull, polyArea, quadFromHull, samp } from './math';
import { label } from './image';

// ArUco DICT_4X4_50 inner 4x4 bits, row-major, MSB first, white = 1 (from OpenCV).
export const DICT4 = [46386,3994,13101,39238,21662,31181,40494,50418,65242,53078,63889,4519,3767,10767,9393,9790,18021,26112,27742,30383,34443,45099,52437,56706,65095,38001,44260,42324,8483,13423,17429,22450,40655,61643,2222,2345,6261,1279,3574,7258,5912,10792,12940,14514,9448,12011,11583,19300,20526,20499];

function decodeQuad(G: Gray, q: Quad): Marker | null {
  const H = homography([[0, 0], [6, 0], [6, 6], [0, 6]], q);
  if (!H) return null;
  const vals: number[] = [];
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 6; c++) {
      let s = 0;
      for (const oy of [-.2, 0, .2])
        for (const ox of [-.2, 0, .2]) {
          const [x, y] = hApply(H, c + .5 + ox, r + .5 + oy);
          s += samp(G, x, y);
        }
      vals.push(s / 9);
    }
  const mn = Math.min(...vals), mx = Math.max(...vals);
  if (mx - mn < 30) return null;
  const thr = (mn + mx) / 2;
  const bits = vals.map(v => (v > thr ? 1 : 0));
  let bErr = 0;
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 6; c++) if ((r === 0 || r === 5 || c === 0 || c === 5) && bits[r * 6 + c]) bErr++;
  if (bErr > 1) return null;
  let g: number[][] = [];
  for (let r = 1; r < 5; r++) {
    const row: number[] = [];
    for (let c = 1; c < 5; c++) row.push(bits[r * 6 + c]);
    g.push(row);
  }
  for (let k = 0; k < 4; k++) {
    let code = 0;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) code = (code << 1) | g[r][c];
    let bestId = -1, bestD = 9;
    for (let id = 0; id < DICT4.length; id++) {
      let x = code ^ DICT4[id], d = 0;
      while (x) { d += x & 1; x >>= 1; }
      if (d < bestD) { bestD = d; bestId = id; }
    }
    if (bestD <= 1) return { id: bestId, ham: bestD, corners: [0, 1, 2, 3].map(i => q[(4 - k + i) % 4]) };
    g = g[0].map((_, c) => g.map(row => row[c]).reverse()); // rotate 90° clockwise
  }
  return null;
}

/** Find all decodable 4x4 ArUco markers in a gray image. */
export function detectMarkers(G: Gray): Marker[] {
  const { w, h, d } = G, W = w + 1, I = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) { s += d[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + s; }
  }
  for (const div of [30, 14, 60]) {
    const r = Math.max(5, Math.round(Math.min(w, h) / div)), bin = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const ya = Math.max(0, y - r), yb = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const xa = Math.max(0, x - r), xb = Math.min(w, x + r + 1);
        const m = (I[yb * W + xb] - I[ya * W + xb] - I[yb * W + xa] + I[ya * W + xa]) / ((yb - ya) * (xb - xa));
        bin[y * w + x] = d[y * w + x] < m - 7 ? 1 : 0;
      }
    }
    const L = label(bin, w, h), cand = new Uint8Array(L.n + 1), pts: Record<number, Vec[]> = {};
    for (let i = 1; i <= L.n; i++) {
      const bw = L.x1[i] - L.x0[i] + 1, bh = L.y1[i] - L.y0[i] + 1, fill = L.area[i] / (bw * bh);
      if (L.area[i] >= 120 && bw >= 12 && bh >= 12 && bw < w * .9 && bh < h * .9 && bw / bh < 4 && bh / bw < 4 && fill > .15 && fill < .97) {
        cand[i] = 1;
        pts[i] = [];
      }
    }
    const lab = L.lab;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = y * w + x, l = lab[p];
        if (!l || !cand[l]) continue;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || lab[p - 1] !== l || lab[p + 1] !== l || lab[p - w] !== l || lab[p + w] !== l) pts[l].push([x, y]);
      }
    const found: Marker[] = [];
    for (const k in pts) {
      const hl = hull(pts[k]);
      const q = quadFromHull(hl);
      if (!q) continue;
      const qa = polyArea(q), ha = polyArea(hl);
      if (qa < 100 || qa / ha < .88) continue;
      const sides = [0, 1, 2, 3].map(i => dist(q[i], q[(i + 1) % 4]));
      if (Math.min(...sides) < 10 || Math.max(...sides) / Math.min(...sides) > 3) continue;
      const m = decodeQuad(G, q);
      if (m) { m.area = qa; found.push(m); }
    }
    if (found.length) return found;
  }
  return [];
}

/** Sub-pixel refinement of the marker corners by fitting lines to its edges. */
export function refineCorners(G: Gray, c: Vec[]): Vec[] {
  const cen: Vec = [c.reduce((s, p) => s + p[0], 0) / 4, c.reduce((s, p) => s + p[1], 0) / 4];
  const lines: { p: Vec; d: Vec }[] = [];
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4], L = dist(a, b), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    let nx = uy, ny = -ux;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (nx * (mid[0] - cen[0]) + ny * (mid[1] - cen[1]) < 0) { nx = -nx; ny = -ny; }
    const R = Math.max(3, .07 * L), st = .5, P: Vec[] = [];
    for (let t = .12; t <= .881; t += .035) {
      const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
      const gr: number[] = [];
      for (let s = -R; s <= R; s += st) gr.push(samp(G, px + nx * (s + st / 2), py + ny * (s + st / 2)) - samp(G, px + nx * (s - st / 2), py + ny * (s - st / 2)));
      let j = 0;
      for (let k = 1; k < gr.length; k++) if (gr[k] > gr[j]) j = k;
      if (gr[j] < 12 || j === 0 || j === gr.length - 1) continue;
      const den = gr[j - 1] - 2 * gr[j] + gr[j + 1], off = den < 0 ? .5 * (gr[j - 1] - gr[j + 1]) / den : 0;
      const s = -R + (j + off) * st;
      P.push([px + nx * s, py + ny * s]);
    }
    if (P.length < 8) return c;
    const mx = P.reduce((s, p) => s + p[0], 0) / P.length, my = P.reduce((s, p) => s + p[1], 0) / P.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of P) { const dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const th = .5 * Math.atan2(2 * sxy, sxx - syy);
    lines.push({ p: [mx, my], d: [Math.cos(th), Math.sin(th)] });
  }
  const out: Vec[] = [];
  for (let i = 0; i < 4; i++) {
    const l1 = lines[(i + 3) % 4], l2 = lines[i];
    const den = l1.d[0] * l2.d[1] - l1.d[1] * l2.d[0];
    if (Math.abs(den) < 1e-6) return c;
    const t = ((l2.p[0] - l1.p[0]) * l2.d[1] - (l2.p[1] - l1.p[1]) * l2.d[0]) / den;
    const q: Vec = [l1.p[0] + t * l1.d[0], l1.p[1] + t * l1.d[1]];
    if (dist(q, c[i]) > Math.max(3, .08 * dist(c[i], c[(i + 1) % 4]))) return c;
    out.push(q);
  }
  return out;
}
