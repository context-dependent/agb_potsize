import type { Analysis, Pot, Settings } from './types';
import { dist, hApply, homography } from './math';
import { grayOf, scaled } from './image';
import { detectMarkers, refineCorners } from './aruco';
import { segmentPot } from './segmentation';

/** Full analysis of one photo: find the marker, calibrate mm-per-pixel, trace and measure each piece. */
export function analyze(work: HTMLCanvasElement, cfg: Settings): Analysis {
  const det = scaled(work, 1000), GD = grayOf(det);
  let ms = detectMarkers(GD);
  const allIds = [...new Set(ms.map(m => m.id))];
  if (cfg.id !== 'any') ms = ms.filter(m => m.id === +cfg.id);
  if (!ms.length) return { ok: false, stage: 'marker', ids: allIds };
  const m = ms.sort((a, b) => b.area! - a.area!)[0];
  const f = work.width / det.width;
  const GW = grayOf(work);
  let corners = m.corners.map<[number, number]>(p => [(p[0] + .5) * f - .5, (p[1] + .5) * f - .5]);
  corners = refineCorners(GW, corners);
  const S = cfg.size, plane: [number, number][] = [[0, 0], [S, 0], [S, S], [0, S]];
  const H = homography(corners, plane)!, Hi = homography(plane, corners)!;
  const side = [0, 1, 2, 3].map(i => dist(corners[i], corners[(i + 1) % 4])), sidePx = side.reduce((a, b) => a + b) / 4;
  const up = [corners[3][0] - corners[0][0], corners[3][1] - corners[0][1]];
  const tilt = Math.abs(Math.atan2(up[0], up[1]) * 180 / Math.PI);
  const segC = scaled(work, 900), SG = grayOf(segC), fs = work.width / segC.width;
  const sc = corners.map(p => [p[0] / fs, p[1] / fs]), mxs = Math.max(...side) / fs, pad = .25 * mxs;
  const zone = [Math.min(...sc.map(p => p[0])) - pad, Math.min(...sc.map(p => p[1])) - pad, Math.max(...sc.map(p => p[0])) + pad, Math.max(...sc.map(p => p[1])) + pad];
  const seg = segmentPot(SG, zone, cfg.tol);
  const base = { marker: { id: m.id, corners, sidePx, tilt, ham: m.ham }, H, Hi, fs, segSize: [segC.width, segC.height] as [number, number], zone };
  if (!seg.ok) return { ...base, ok: false, stage: 'pot', touchesCard: seg.touchesCard };
  const pots: Pot[] = seg.pots.map(pt => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [x, y] of pt.pts)
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const [u, v] = hApply(H, (x + dx) * fs - .5, (y + dy) * fs - .5);
        if (u < x0) x0 = u;
        if (u > x1) x1 = u;
        if (v < y0) y0 = v;
        if (v > y1) y1 = v;
      }
    return { ...pt, wMm: x1 - x0, hMm: y1 - y0, boxImg: ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as [number, number][]).map(p => hApply(Hi, p[0], p[1])) };
  });
  return { ...base, ok: true, seg, pots };
}
