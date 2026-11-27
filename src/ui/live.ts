import { analyze } from '../core/analyze';
import { scaled } from '../core/image';
import { pieceDims, volIn3 } from '../core/pricing';
import type { Analysis } from '../core/types';
import { toU } from '../core/units';
import { $, $i, plural, toast } from './dom';
import { fmtU, volStr } from './format';
import { settings, state } from './state';

/** Longest side of the frame handed to the detector. Small keeps phones smooth. */
const WORK_MAX = 640;
const MIN_GAP_MS = 120;
/** Fraction of the way a drawn outline moves toward the newest detection each frame. */
const EASE = 0.35;

type Pts = number[][];
const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

let stream: MediaStream | null = null;
let raf = 0;
let lastRun = 0;
let gap = MIN_GAP_MS;
let latest: Analysis | null = null;
let lostAt = 0;
let marker: Pts | null = null;
let boxes: Pts[] = [];
let onCapture: (c: HTMLCanvasElement) => void = () => {};

const video = () => $<HTMLVideoElement>('liveVideo');
const overlay = () => $<HTMLCanvasElement>('liveOverlay');

function ease(cur: Pts | null, next: Pts): Pts {
  if (!cur || cur.length !== next.length) return next.map(p => [...p]);
  return cur.map((p, i) => [p[0] + (next[i][0] - p[0]) * EASE, p[1] + (next[i][1] - p[1]) * EASE]);
}

function poly(g: CanvasRenderingContext2D, p: Pts) {
  g.beginPath();
  p.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
  g.closePath();
}

function tag(g: CanvasRenderingContext2D, t: string, x: number, y: number, col: string, dpr: number) {
  g.font = `600 ${12 * dpr}px "IBM Plex Mono", monospace`;
  const w = g.measureText(t).width + 10 * dpr, h = 18 * dpr, W = g.canvas.width, H = g.canvas.height;
  const lx = Math.max(2, Math.min(W - w - 2, x - w / 2)), ly = Math.max(2, Math.min(H - h - 2, y - h / 2));
  g.fillStyle = 'rgba(0,0,0,.75)';
  g.fillRect(lx, ly, w, h);
  g.fillStyle = col;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText(t, lx + 5 * dpr, ly + h / 2);
}

/** One-line description of what the detector currently sees. */
function statusOf(r: Analysis | null): { kind: 'ok' | 'warn' | 'bad'; text: string } {
  if (!r) return { kind: 'warn', text: 'Starting…' };
  if (!r.marker) return { kind: 'bad', text: r.ids?.length ? `Wrong marker (ID ${r.ids.join(', ')})` : 'Looking for marker…' };
  if (r.marker.sidePx < 40) return { kind: 'warn', text: 'Marker too small. Move closer' };
  if (!r.ok) return { kind: 'warn', text: r.touchesCard ? 'Piece touches the marker card' : 'Marker found. Looking for pieces…' };
  if (r.pots.some(p => p.edge)) return { kind: 'warn', text: 'A piece touches the frame edge. Step back' };
  return { kind: 'ok', text: `${plural(r.pots.length, 'piece')} · ready to capture` };
}

function setStatus(s: { kind: string; text: string }) {
  const el = $('liveStatus');
  if (el.textContent !== s.text) el.textContent = s.text;
  el.dataset.kind = s.kind;
  $i('liveShoot').disabled = s.kind === 'bad' || !latest;
}

function detect(v: HTMLVideoElement, work: HTMLCanvasElement) {
  const k = Math.min(1, WORK_MAX / Math.max(v.videoWidth, v.videoHeight));
  work.width = Math.round(v.videoWidth * k);
  work.height = Math.round(v.videoHeight * k);
  work.getContext('2d')!.drawImage(v, 0, 0, work.width, work.height);
  const t0 = performance.now();
  try { latest = analyze(work, settings()); } catch { latest = null; }
  gap = Math.max(MIN_GAP_MS, (performance.now() - t0) * 1.5);
  if (latest?.marker) lostAt = 0;
  else if (!lostAt) lostAt = performance.now();
}

function paint(v: HTMLVideoElement, work: HTMLCanvasElement) {
  const cv = overlay(), g = cv.getContext('2d')!, dpr = window.devicePixelRatio || 1;
  const w = Math.round(v.clientWidth * dpr), h = Math.round(v.clientHeight * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  g.clearRect(0, 0, w, h);
  const r = latest;
  setStatus(statusOf(r));
  // Drop outlines a moment after the target disappears so they don't hang on a stale position.
  if (!r || !r.marker) { if (performance.now() - lostAt > 400) { marker = null; boxes = []; } }
  else {
    const S = w / work.width;
    marker = ease(marker, r.marker.corners.map(p => [p[0] * S, p[1] * S]));
    boxes = r.ok ? r.pots.map((p, i) => ease(boxes[i] ?? null, p.boxImg.map(q => [q[0] * S, q[1] * S]))) : [];
  }
  if (boxes.length && r?.ok) {
    const POT = css('--pot');
    r.pots.forEach((pt, i) => {
      const b = boxes[i];
      g.setLineDash([8 * dpr, 6 * dpr]);
      g.lineWidth = 2 * dpr;
      g.strokeStyle = '#fff';
      poly(g, b);
      g.stroke();
      g.setLineDash([]);
      const d = pieceDims(state.unit, { wMm: pt.wMm, hMm: pt.hMm, side: null, round: true, depthMm: null }, false);
      const vol = volStr({ vol: volIn3(state.unit, d) });
      const cx = (b[0][0] + b[1][0] + b[2][0] + b[3][0]) / 4;
      const stagger = (i % 2) * 20 * dpr, top = Math.min(b[0][1], b[1][1]);
      tag(g, `${i + 1} · ${fmtU(toU(state.unit, pt.wMm))} × ${fmtU(toU(state.unit, pt.hMm))} · ≈ ${vol}`, cx, top - 14 * dpr - stagger, POT, dpr);
    });
  }
  if (marker && r?.marker) {
    const REF = css('--ref');
    g.lineWidth = 3 * dpr;
    g.strokeStyle = REF;
    poly(g, marker);
    g.stroke();
    tag(g, `ID ${r.marker.id} · ${settings().size} mm`, (marker[0][0] + marker[1][0]) / 2, Math.min(marker[0][1], marker[1][1]) - 14 * dpr, REF, dpr);
  }
}

export async function startLive() {
  if (stream) return;
  if (!navigator.mediaDevices?.getUserMedia) { toast('Live camera needs HTTPS (or localhost). Use the photo button instead.'); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  } catch {
    toast('Camera access was blocked. Allow it in the browser, or use the photo button.');
    return;
  }
  const v = video();
  v.srcObject = stream;
  await v.play().catch(() => {});
  $('livePane').hidden = false;
  $('stage').classList.add('live');
  $('emptyView').hidden = true;
  const work = document.createElement('canvas');
  latest = null; marker = null; boxes = []; lostAt = 0;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (v.readyState < 2 || !v.videoWidth) return;
    if (now - lastRun >= gap) { lastRun = now; detect(v, work); }
    paint(v, work);
  };
  raf = requestAnimationFrame(tick);
}

export function stopLive() {
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
  video().srcObject = null;
  $('livePane').hidden = true;
  $('stage').classList.remove('live');
}

function capture() {
  const v = video();
  if (!v.videoWidth) return;
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext('2d')!.drawImage(v, 0, 0);
  stopLive();
  onCapture(c);
}

export function initLive(cb: (c: HTMLCanvasElement) => void) {
  onCapture = cb;
  $('liveBtn').onclick = () => { void startLive(); };
  $('liveShoot').onclick = capture;
  $('liveClose').onclick = () => stopLive;
  document.addEventListener('visibilitychange', () => { if (document.hidden && stream) stopLive(); });
}
