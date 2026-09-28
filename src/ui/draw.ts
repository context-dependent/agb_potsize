import type { Pot } from '../core/types';
import { toU } from '../core/units';
import { $ } from './dom';
import { fmtU } from './format';
import { settings, state, type View } from './state';

const cv = $<HTMLCanvasElement>('cv');
const ctx = cv.getContext('2d')!;
const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const overlayCache = new WeakMap<object, HTMLCanvasElement>();

/** Translucent pot fill plus solid outline, at segmentation resolution. */
function maskOverlay(v: View): HTMLCanvasElement {
  const r = v.result;
  if (!r.ok) throw new Error('no mask');
  if (overlayCache.has(r)) return overlayCache.get(r)!;
  const [w, h] = r.segSize, c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!, im = g.createImageData(w, h), d = im.data, lab = r.seg.lab, ids = new Set(r.pots.map(p => p.id));
  for (let i = 0; i < w * h; i++) if (ids.has(lab[i])) { d[4 * i] = 240; d[4 * i + 1] = 180; d[4 * i + 2] = 40; d[4 * i + 3] = 70; }
  for (const p of r.pots) for (const [x, y] of p.pts) { const i = y * w + x; d[4 * i] = 255; d[4 * i + 1] = 196; d[4 * i + 2] = 40; d[4 * i + 3] = 255; }
  g.putImageData(im, 0, 0);
  overlayCache.set(r, c);
  return c;
}

function poly(p: number[][]) {
  ctx.beginPath();
  p.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
  ctx.closePath();
}

function tag(t: string, x: number, y: number, col: string, align: 'center' | 'left' = 'center') {
  const dpr = window.devicePixelRatio || 1;
  ctx.font = `600 ${12 * dpr}px "IBM Plex Mono", monospace`;
  const w = ctx.measureText(t).width + 10 * dpr, h = 18 * dpr;
  let lx = align === 'center' ? x - w / 2 : x;
  lx = Math.max(2, Math.min(cv.width - w - 2, lx));
  const ly = Math.max(2, Math.min(cv.height - h - 2, y - h / 2));
  ctx.fillStyle = 'rgba(0,0,0,.75)';
  ctx.fillRect(lx, ly, w, h);
  ctx.fillStyle = col;
  ctx.textBaseline = 'middle';
  ctx.fillText(t, lx + 5 * dpr, ly + h / 2);
}

function drawPot(pt: Pot, i: number, S: number, dpr: number, POT: string) {
  const b = pt.boxImg.map(p => [p[0] * S, p[1] * S]);
  ctx.setLineDash([8 * dpr, 6 * dpr]);
  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = '#fff';
  poly(b);
  ctx.stroke();
  ctx.setLineDash([]);
  const tx = (b[0][0] + b[1][0]) / 2, ty = Math.min(b[0][1], b[1][1]) - 16 * dpr;
  ctx.beginPath();
  ctx.arc(tx, Math.max(14 * dpr, ty), 12 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = POT;
  ctx.fill();
  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.fillStyle = '#1D2824';
  ctx.font = `700 ${13 * dpr}px "IBM Plex Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(i + 1), tx, Math.max(14 * dpr, ty) + 1);
  ctx.textAlign = 'left';
  const lbl = `${fmtU(toU(state.unit, pt.wMm))} × ${fmtU(toU(state.unit, pt.hMm))}`;
  ctx.font = `600 ${12 * dpr}px "IBM Plex Mono", monospace`;
  if (ctx.measureText(lbl).width + 14 * dpr < Math.abs(b[2][0] - b[3][0]) + 8 * dpr) tag(lbl, (b[2][0] + b[3][0]) / 2, Math.max(b[2][1], b[3][1]) + 16 * dpr, POT);
}

/** Paint the current view's photo with mask, piece boxes and marker overlay. */
export function draw() {
  const v = state.views[state.cur];
  $('emptyView').hidden = !!v || state.cur === 'front';
  cv.hidden = !v;
  $('badge').hidden = !(v && v.sample);
  if (!v) return;
  const stage = $('stage'), W = v.canvas.width, Hh = v.canvas.height;
  const sc = Math.min(stage.clientWidth / W, Math.max(260, window.innerHeight * .62) / Hh), dpr = window.devicePixelRatio || 1;
  const w = Math.round(W * sc), h = Math.round(Hh * sc);
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const S = sc * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(v.canvas, 0, 0, cv.width, cv.height);
  const r = v.result;
  if (!r) return;
  const REF = css('--ref'), POT = css('--pot');
  if (r.ok) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(maskOverlay(v), 0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = true;
    r.pots.forEach((pt, i) => drawPot(pt, i, S, dpr, POT));
  }
  if (r.marker) {
    const q = r.marker.corners.map(p => [p[0] * S, p[1] * S]);
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = REF;
    poly(q);
    ctx.stroke();
    ctx.fillStyle = REF;
    ctx.beginPath();
    ctx.arc(q[0][0], q[0][1], 5 * dpr, 0, Math.PI * 2);
    ctx.fill();
    tag('ID ' + r.marker.id + ' · ' + settings().size + ' mm', (q[0][0] + q[1][0]) / 2, Math.min(q[0][1], q[1][1]) - 14 * dpr, REF);
  }
}

export function watchRedraw() {
  new ResizeObserver(() => draw()).observe($('stage'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', draw);
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
