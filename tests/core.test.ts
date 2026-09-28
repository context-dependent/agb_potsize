import { describe, expect, it } from 'vitest';
import { hApply, homography, hull, polyArea, quadFromHull } from '../src/core/math';
import { FIRINGS, feeFor, pieceDims, roundUp, volIn3 } from '../src/core/pricing';
import { fmt, fromU, money, toU } from '../src/core/units';
import { DICT4 } from '../src/core/aruco';

describe('geometry', () => {
  it('homography maps source points onto destination', () => {
    const src: [number, number][] = [[0, 0], [80, 0], [80, 80], [0, 80]];
    const dst: [number, number][] = [[100, 200], [400, 210], [390, 500], [95, 480]];
    const H = homography(src, dst)!;
    src.forEach((p, i) => {
      const [x, y] = hApply(H, p[0], p[1]);
      expect(x).toBeCloseTo(dst[i][0], 6);
      expect(y).toBeCloseTo(dst[i][1], 6);
    });
  });
  it('rejects a singular homography', () => {
    expect(homography([[0, 0], [1, 1], [2, 2], [3, 3]], [[0, 0], [1, 0], [1, 1], [0, 1]])).toBeNull();
  });
  it('polyArea, hull and quadFromHull', () => {
    expect(polyArea([[0, 0], [4, 0], [4, 3], [0, 3]])).toBe(12);
    const h = hull([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5], [3, 7]]);
    expect(h).toHaveLength(4);
    expect(polyArea(quadFromHull(h)!)).toBeCloseTo(100);
    expect(quadFromHull([[0, 0], [1, 0], [0, 1]])).toBeNull();
  });
  it('has 50 distinct marker codes', () => {
    expect(new Set(DICT4).size).toBe(50);
  });
});

describe('units and formatting', () => {
  it('converts mm', () => {
    expect(toU('in', 25.4)).toBeCloseTo(1);
    expect(fromU('in', 2)).toBeCloseTo(50.8);
    expect(toU('cm', 120)).toBe(12);
  });
  it('formats', () => {
    expect(fmt('in', 2.5)).toBe('2.5');
    expect(fmt('in', 3)).toBe('3');
    expect(fmt('cm', 12)).toBe('12');
    expect(money(3.5)).toBe('$3.50');
  });
});

describe('kiln-space measurement and pricing', () => {
  const vase = { wMm: 120, hMm: 160, side: null, round: true, depthMm: null };
  it('rounds up to the next half inch, tolerating float noise', () => {
    expect(roundUp('in', 3, true)).toBe(3);
    expect(roundUp('in', 3.01, true)).toBe(3.5);
    expect(roundUp('in', 3.5 + 1e-12, true)).toBe(3.5);
    expect(roundUp('cm', 16.01, true)).toBe(17);
    expect(roundUp('in', 3.01, false)).toBe(3.01);
  });
  it('depth: side view wins, then entered, then width when round', () => {
    expect(pieceDims('in', { ...vase, side: { hMm: 158, wMm: 90 } }, false).src).toBe('side');
    expect(pieceDims('in', { ...vase, round: false, depthMm: 50 }, false).dRaw).toBeCloseTo(50 / 25.4);
    expect(pieceDims('in', vase, false).src).toBe('round');
    expect(pieceDims('in', { ...vase, round: false }, false).dRaw).toBe(0);
  });
  it('volume is the H×W×D bounding box', () => {
    expect(volIn3('in', pieceDims('in', vase, true))).toBeCloseTo(6.5 * 5 * 5);
    expect(volIn3('cm', { h: 10, w: 10, d: 10 })).toBeCloseTo(61.0237);
  });
  it('fee = volume × rate, floored at the minimum, rounded to cents', () => {
    const rates = { c6: 0.035, bisque: 0.02 };
    expect(feeFor(100, 'c6', rates, 1)).toEqual({ fee: 3.5, atMin: false });
    expect(feeFor(10, 'c6', rates, 1)).toEqual({ fee: 1, atMin: true });
    expect(feeFor(33.333, 'bisque', rates, 0).fee).toBe(0.67);
    expect(FIRINGS.map(f => [f.id, f.rate])).toEqual([['bisque', 0.02], ['c6', 0.035], ['c10', 0.045]]);
  });
  it('prices the sample vase at $5.69 (cone 6)', () => {
    const v = volIn3('in', pieceDims('in', vase, true));
    expect(feeFor(v, 'c6', { c6: 0.035 }, 1).fee).toBe(5.69);
  });
});
