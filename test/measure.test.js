const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load-math');

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);
const M = load();

/* ---------- homography ---------- */
test('homography maps its own source points onto the destination', () => {
  const src = [[0, 0], [80, 0], [80, 80], [0, 80]];
  const dst = [[100, 200], [400, 210], [390, 500], [95, 480]];
  const H = M.homography(src, dst);
  src.forEach((p, i) => {
    const [x, y] = M.hApply(H, ...p);
    near(x, dst[i][0]); near(y, dst[i][1]);
  });
});

test('homography of collinear points is rejected (singular)', () => {
  const line = [[0, 0], [1, 1], [2, 2], [3, 3]];
  assert.equal(M.homography(line, [[0, 0], [1, 0], [1, 1], [0, 1]]), null);
});

/* ---------- sample scene fixture ----------
   Mirrors makeSample(): marker card 80 mm, ID 7, sitting in the same plane as
   the pots at 3 px/mm, rotated -2.5deg. Ground-truth pot sizes from the
   prototype: vase 120x160, mug 105x95, bowl 150x70 (W x H mm).
   We can't rasterise in Node, so project the known geometry instead and
   check the marker homography recovers the true millimetres. */
const S = 3, ROT = -2.5 * Math.PI / 180;
function markerCornersPx(rotRad) {
  const ms = 80 * S, cardH = 122 * S, ccy = 1010 - 60 * S - cardH / 2, my0 = -cardH / 2 + 10 * S;
  const r = ([x, y]) => [x * Math.cos(rotRad) - y * Math.sin(rotRad), x * Math.sin(rotRad) + y * Math.cos(rotRad)];
  return [[-ms / 2, my0], [ms / 2, my0], [ms / 2, my0 + ms], [-ms / 2, my0 + ms]]
    .map(r).map(([x, y]) => [1560 + x, ccy + y]);
}
const potBox = (cx, w, h) => [[cx - w / 2 * S, 1010], [cx + w / 2 * S, 1010], [cx + w / 2 * S, 1010 - h * S], [cx - w / 2 * S, 1010 - h * S]];
const PLANE = [[0, 0], [80, 0], [80, 80], [0, 80]];
function spansMm(H, pts) {
  const mm = pts.map(([x, y]) => M.hApply(H, x, y));
  const xs = mm.map(p => p[0]), ys = mm.map(p => p[1]);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
const SAMPLE_POTS = [[260, 120, 160], [640, 105, 95], [1090, 150, 70]];

test('marker homography recovers pot width/height in mm from the sample scene (upright card)', () => {
  const H = M.homography(markerCornersPx(0), PLANE);
  for (const [cx, w, h] of SAMPLE_POTS) {
    const r = spansMm(H, potBox(cx, w, h));
    near(r.w, w, 0.01); near(r.h, h, 0.01);
  }
});

test('characterisation: the sample scene card is tilted 2.5deg, which inflates the bbox', () => {
  // analyze() takes the axis-aligned extent in marker coordinates, so an
  // in-plane rotation of the card inflates width/height. Bound it, don't hide it.
  const H = M.homography(markerCornersPx(ROT), PLANE);
  for (const [cx, w, h] of SAMPLE_POTS) {
    const r = spansMm(H, potBox(cx, w, h));
    assert.ok(r.w >= w && r.h >= h, 'never under-measures');
    assert.ok(r.w / w < 1.10 && r.h / h < 1.10, `${r.w} x ${r.h} vs ${w} x ${h}`);
  }
});

test('marker homography is scale-true for an axis-aligned square', () => {
  const H = M.homography([[10, 10], [250, 10], [250, 250], [10, 250]], [[0, 0], [80, 0], [80, 80], [0, 80]]);
  const [x, y] = M.hApply(H, 130, 130);
  near(x, 40); near(y, 40);
});

/* ---------- geometry helpers ---------- */
test('polyArea, hull and quadFromHull', () => {
  near(M.polyArea([[0, 0], [4, 0], [4, 3], [0, 3]]), 12);
  const pts = [[0, 0], [10, 0], [10, 10], [0, 10], [5, 5], [3, 7]];
  assert.equal(M.hull(pts).length, 4);
  const q = M.quadFromHull(M.hull(pts));
  near(M.polyArea(q), 100);
  assert.equal(M.quadFromHull([[0, 0], [1, 0], [0, 1]]), null);
});

/* ---------- height/width extraction, depth fallback rules ---------- */
const front = [{ hMm: 160, wMm: 120 }, { hMm: 95, wMm: 105 }];
function setup({ unit = 'in', round = true, roundUp = false, side = null, meta } = {}) {
  M.set({
    unit,
    views: { front: { result: { ok: true, pots: front } }, side: side && { result: { ok: true, pots: side } } },
    meta: meta || front.map(() => ({ round, depthMm: null, qty: 1, firing: 'c6' })),
    checks: { roundUp },
  });
}

test('depth fallback: side view wins, then entered depth, then round=width', () => {
  setup({ side: [{ hMm: 158, wMm: 90 }, { hMm: 97, wMm: 80 }] });
  let d = M.pieceDims(0);
  assert.equal(d.src, 'side'); near(d.dRaw, 90 / 25.4);
  near(d.hRaw, 160 / 25.4, 1e-9);           // taller of front/side
  assert.equal(M.pieceDims(1).hRaw, 97 / 25.4);

  setup({ round: false, meta: [{ round: false, depthMm: 50, qty: 1 }, { round: true, depthMm: null, qty: 1 }] });
  d = M.pieceDims(0); assert.equal(d.src, 'entered'); near(d.dRaw, 50 / 25.4);
  d = M.pieceDims(1); assert.equal(d.src, 'round'); near(d.dRaw, 105 / 25.4);

  setup({ meta: [{ round: false, depthMm: null }, { round: true }] });
  assert.equal(M.pieceDims(0).dRaw, 0);      // not round, nothing entered
});

test('side view with different piece count is ignored', () => {
  setup({ side: [{ hMm: 1, wMm: 1 }] });
  assert.equal(M.sidePots(), null);
  assert.equal(M.pieceDims(0).src, 'round');
});

test('round-up to the next half inch (or whole cm), with float tolerance', () => {
  setup({ roundUp: true });
  near(M.up(3.0), 3); near(M.up(3.01), 3.5); near(M.up(3.5 + 1e-12), 3.5);
  const d = M.pieceDims(0);                  // 160mm=6.30in, 120mm=4.72in
  near(d.h, 6.5); near(d.w, 5); near(d.d, 5);
  setup({ unit: 'cm', roundUp: true });
  near(M.up(16.0), 16); near(M.up(16.01), 17);
  setup({ roundUp: false });
  near(M.up(3.01), 3.01);
});

test('unit conversion helpers and formatting', () => {
  setup();
  near(M.toU(25.4), 1); near(M.fromU(2), 50.8);
  setup({ unit: 'cm' });
  near(M.toU(120), 12); near(M.fromU(12), 120);
  assert.equal(M.fmt(12), '12.0'.replace(/\.0$/, ''));
  setup();
  assert.equal(M.fmt(2.5), '2.5'); assert.equal(M.fmt(3), '3'); assert.equal(M.fmt(2.345), '2.35');
});

/* ---------- volume & pricing ---------- */
test('kiln-space volume is the H x W x D bounding box (in³)', () => {
  setup({ roundUp: true });
  near(M.volIn3(M.pieceDims(0)), 6.5 * 5 * 5);
});

test('metric volume converts cm³ to in³ via litres', () => {
  setup({ unit: 'cm' });
  near(M.volIn3({ h: 10, w: 10, d: 10 }), 61.0237);   // 1 L
});

test('fee = volume x rate, floored at the minimum, rounded to cents', () => {
  M.set({ rates: { c6: 0.035, bisque: 0.02 }, checks: {}, values: { minFee: '1' } });
  assert.deepEqual(M.feeFor(100, 'c6'), { fee: 3.5, atMin: false });
  assert.deepEqual(M.feeFor(10, 'c6'), { fee: 1, atMin: true });
  assert.deepEqual(M.feeFor(50, 'nope'), { fee: 1, atMin: true });   // unknown firing => rate 0
  M.set({ values: { minFee: '' } });
  assert.deepEqual(M.feeFor(10, 'c6'), { fee: 0.35, atMin: false });
  assert.equal(M.feeFor(33.333, 'bisque').fee, 0.67);   // rounds to cents
  assert.equal(M.money(3.5), '$3.50');
});

test('default firing rates and end-to-end price for the sample vase', () => {
  assert.deepEqual(M.FIRINGS.map(f => [f.id, f.rate]), [['bisque', 0.02], ['c6', 0.035], ['c10', 0.045]]);
  setup({ roundUp: true });
  M.set({ rates: Object.fromEntries(M.FIRINGS.map(f => [f.id, f.rate])), values: { minFee: '1' } });
  const v = M.volIn3(M.pieceDims(0));        // 162.5 in³
  assert.equal(M.feeFor(v, 'c6').fee, 5.69); // 162.5 * 0.035 = 5.6875
});
