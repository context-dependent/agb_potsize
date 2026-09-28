import type { Gray, Segmentation } from './types';
import { solveLin } from './math';
import { label } from './image';

/** Binary dilate (dil=true) or erode by a 3x3 cross, `it` times. */
function morph(m: Uint8Array, w: number, h: number, dil: boolean, it: number): Uint8Array {
  let a = m;
  for (let k = 0; k < it; k++) {
    const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const l = x > 0 ? a[p - 1] : a[p], r = x < w - 1 ? a[p + 1] : a[p];
        t[p] = dil ? (a[p] | l | r) : (a[p] & l & r);
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const u = y > 0 ? t[p - w] : t[p], d = y < h - 1 ? t[p + w] : t[p];
        o[p] = dil ? (t[p] | u | d) : (t[p] & u & d);
      }
    a = o;
  }
  return a;
}

type Sample = number[]; // [x/w, y/h, r, g, b]

/**
 * Trace the pieces against the backdrop. The backdrop colour is modelled as a
 * bilinear surface fitted to the photo's border; anything far from it is pot.
 * `zone` (x0,y0,x1,y1 in pixels) is the marker card and is excluded.
 */
export function segmentPot(S: Gray, zone: number[], tol: number): Segmentation | { ok: false; touchesCard: boolean } {
  const { w, h, px } = S, band = Math.max(4, Math.round(Math.min(w, h) * .04));
  const inZone = (x: number, y: number) => x >= zone[0] && x <= zone[2] && y >= zone[1] && y <= zone[3];
  let smp: Sample[] = [];
  for (let y = 0; y < h; y += 2)
    for (let x = 0; x < w; x += 2) {
      if (!(x < band || x >= w - band || y < band || y >= h - band)) continue;
      if (inZone(x, y)) continue;
      const i = 4 * (y * w + x);
      smp.push([x / w, y / h, px[i], px[i + 1], px[i + 2]]);
    }
  const fit = (S: Sample[]) => {
    const coef: number[][] = [];
    for (let ch = 0; ch < 3; ch++) {
      const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], b = [0, 0, 0, 0];
      for (const s of S) {
        const f = [1, s[0], s[1], s[0] * s[1]];
        for (let i = 0; i < 4; i++) {
          b[i] += f[i] * s[2 + ch];
          for (let j = 0; j < 4; j++) A[i][j] += f[i] * f[j];
        }
      }
      coef.push(solveLin(A, b) || [S.reduce((a, s) => a + s[2 + ch], 0) / S.length, 0, 0, 0]);
    }
    return coef;
  };
  const pred = (C: number[][], x: number, y: number) => C.map(c => c[0] + c[1] * x + c[2] * y + c[3] * x * y);
  // Colour distance: luma is down-weighted so shadows on the backdrop count for less than a colour change.
  const D = (r: number, g: number, b: number, p: number[]) => {
    const dr = r - p[0], dg = g - p[1], db = b - p[2], dY = .299 * dr + .587 * dg + .114 * db;
    return Math.hypot(.5 * dY, db - dY, dr - dY);
  };
  let C = fit(smp);
  let res = smp.map(s => D(s[2], s[3], s[4], pred(C, s[0], s[1])));
  const sorted = res.slice().sort((a, b) => a - b);
  const cut = sorted[Math.floor(sorted.length * .8)];
  smp = smp.filter((_, i) => res[i] <= cut);
  C = fit(smp);
  res = smp.map(s => D(s[2], s[3], s[4], pred(C, s[0], s[1]))).sort((a, b) => a - b);
  const p95 = res[Math.floor(res.length * .95)] || 4, T = Math.max(10, p95 * tol * 1.6);
  let m: Uint8Array = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const yy = y / h;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, p = pred(C, x / w, yy);
      m[i] = D(px[4 * i], px[4 * i + 1], px[4 * i + 2], p) > T ? 1 : 0;
    }
  }
  m = morph(morph(m, w, h, true, 2), w, h, false, 2); // close
  m = morph(morph(m, w, h, false, 1), w, h, true, 1); // open
  // fill holes: flood the background from the border, everything not reached is pot
  const bg = new Uint8Array(w * h), st = new Int32Array(w * h);
  let sp = 0;
  const push = (p: number) => { if (!m[p] && !bg[p]) { bg[p] = 1; st[sp++] = p; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (sp) {
    const p = st[--sp], x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }
  for (let i = 0; i < w * h; i++) if (!bg[i]) m[i] = 1;
  const L = label(m, w, h), zoneL = new Set<number>();
  for (let y = Math.max(0, zone[1] | 0); y <= Math.min(h - 1, zone[3] | 0); y++)
    for (let x = Math.max(0, zone[0] | 0); x <= Math.min(w - 1, zone[2] | 0); x++) {
      const l = L.lab[y * w + x];
      if (l) zoneL.add(l);
    }
  const cands: number[] = [];
  for (let i = 1; i <= L.n; i++) if (!zoneL.has(i) && L.area[i] >= w * h * .003) cands.push(i);
  if (!cands.length) return { ok: false, touchesCard: [...zoneL].some(l => L.area[l] > w * h * .02) };
  const maxA = Math.max(...cands.map(i => L.area[i])), lab = L.lab;
  const pots = cands.filter(i => L.area[i] >= maxA * .06).map(id => {
    const pts: [number, number][] = [];
    for (let y = L.y0[id]; y <= L.y1[id]; y++)
      for (let x = L.x0[id]; x <= L.x1[id]; x++) {
        const p = y * w + x;
        if (lab[p] !== id) continue;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || lab[p - 1] !== id || lab[p + 1] !== id || lab[p - w] !== id || lab[p + w] !== id) pts.push([x, y]);
      }
    return { id, pts, edge: L.x0[id] <= 1 || L.y0[id] <= 1 || L.x1[id] >= w - 2 || L.y1[id] >= h - 2, bbox: [L.x0[id], L.y0[id], L.x1[id], L.y1[id]] as [number, number, number, number], area: L.area[id] };
  }).sort((a, b) => (a.bbox[0] + a.bbox[2]) - (b.bbox[0] + b.bbox[2]));
  const nearCard = [...zoneL].some(l => L.area[l] > maxA * .5);
  return { ok: true, lab, pots, nearCard };
}
