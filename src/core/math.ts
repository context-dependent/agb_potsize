import type { Gray, Quad, Vec } from './types';

/** Gaussian elimination with partial pivoting. Returns null if singular. */
export function solveLin(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/** Homography (3x3, row-major, h[8] = 1) mapping the 4 src points to the 4 dst points. */
export function homography(src: Vec[], dst: Vec[]): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLin(A, b);
  return h ? [...h, 1] : null;
}

export function hApply(H: number[], x: number, y: number): Vec {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

export const dist = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function polyArea(p: Vec[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

/** Convex hull (monotone chain). */
export function hull(pts: Vec[]): Vec[] {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: Vec, a: Vec, b: Vec) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Vec[] = [];
  const up: Vec[] = [];
  for (const p of pts) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
    lo.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
    up.push(p);
  }
  up.pop();
  lo.pop();
  return lo.concat(up);
}

function orderCW(q: Vec[]): Quad {
  const cx = q.reduce((s, p) => s + p[0], 0) / 4;
  const cy = q.reduce((s, p) => s + p[1], 0) / 4;
  return q.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx)) as Quad;
}

/** Approximate a convex hull by a quadrilateral (the diagonal plus the two furthest points either side). */
export function quadFromHull(h: Vec[]): Quad | null {
  const n = h.length;
  if (n < 4) return null;
  let best = -1;
  let i1 = 0;
  let i2 = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const d = (h[i][0] - h[j][0]) ** 2 + (h[i][1] - h[j][1]) ** 2;
      if (d > best) {
        best = d;
        i1 = i;
        i2 = j;
      }
    }
  const a = h[i1];
  const b = h[i2];
  let mx = 0;
  let mn = 0;
  let p3: Vec | null = null;
  let p4: Vec | null = null;
  for (const p of h) {
    const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (c > mx) {
      mx = c;
      p3 = p;
    }
    if (c < mn) {
      mn = c;
      p4 = p;
    }
  }
  if (!p3 || !p4) return null;
  return orderCW([a, p3, b, p4]);
}

/** Bilinear sample of a gray image, clamped to the edges. */
export function samp(G: Pick<Gray, 'w' | 'h' | 'd'>, x: number, y: number): number {
  const { w, h, d } = G;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x > w - 1.001) x = w - 1.001;
  if (y > h - 1.001) y = h - 1.001;
  const x0 = x | 0;
  const y0 = y | 0;
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * w + x0;
  return d[i] * (1 - fx) * (1 - fy) + d[i + 1] * fx * (1 - fy) + d[i + w] * (1 - fx) * fy + d[i + w + 1] * fx * fy;
}
