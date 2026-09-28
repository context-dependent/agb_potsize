import type { Gray } from './types';

export function scaled(src: HTMLCanvasElement | HTMLImageElement, maxDim: number): HTMLCanvasElement {
  const k = Math.min(1, maxDim / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * k));
  c.height = Math.max(1, Math.round(src.height * k));
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export function grayOf(c: HTMLCanvasElement): Gray {
  const px = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
  const n = c.width * c.height;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = 0.299 * px[4 * i] + 0.587 * px[4 * i + 1] + 0.114 * px[4 * i + 2];
  return { w: c.width, h: c.height, d, px };
}

export interface Components {
  lab: Int32Array;
  n: number;
  area: number[];
  x0: number[];
  y0: number[];
  x1: number[];
  y1: number[];
}

/** 4-connected component labelling of bin == 1. */
export function label(bin: Uint8Array, w: number, h: number): Components {
  const lab = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const area = [0], x0 = [0], y0 = [0], x1 = [0], y1 = [0];
  let n = 0;
  for (let s = 0; s < w * h; s++) {
    if (!bin[s] || lab[s]) continue;
    n++;
    let sp = 0;
    stack[sp++] = s;
    lab[s] = n;
    let a = 0, ax0 = w, ay0 = h, ax1 = 0, ay1 = 0;
    while (sp) {
      const p = stack[--sp];
      a++;
      const x = p % w, y = (p / w) | 0;
      if (x < ax0) ax0 = x;
      if (x > ax1) ax1 = x;
      if (y < ay0) ay0 = y;
      if (y > ay1) ay1 = y;
      if (x > 0 && bin[p - 1] && !lab[p - 1]) { lab[p - 1] = n; stack[sp++] = p - 1; }
      if (x < w - 1 && bin[p + 1] && !lab[p + 1]) { lab[p + 1] = n; stack[sp++] = p + 1; }
      if (y > 0 && bin[p - w] && !lab[p - w]) { lab[p - w] = n; stack[sp++] = p - w; }
      if (y < h - 1 && bin[p + w] && !lab[p + w]) { lab[p + w] = n; stack[sp++] = p + w; }
    }
    area.push(a); x0.push(ax0); y0.push(ay0); x1.push(ax1); y1.push(ay1);
  }
  return { lab, n, area, x0, y0, x1, y1 };
}
