// Loads the measuring math straight out of reference/kiln-space-meter.html
// without modifying it. The prototype keeps everything inside one IIFE, so we
// slice the relevant source sections and evaluate them against a small state
// object that stands in for the UI (unit, rates, meta, views, DOM checkboxes).
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'reference', 'kiln-space-meter.html');

function slice(src, from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`markers not found: ${from} .. ${to}`);
  return src.slice(a, b);
}

function load() {
  const src = fs.readFileSync(HTML, 'utf8');
  const constants = slice(src, 'const MM_IN', 'const $ =');
  const maths = slice(src, '/* ================= small maths', '/* ================= image helpers');
  const measure = slice(src, '/* ---------- measurement maths', 'function renderPieces');
  const factory = new Function('state', `
    const $ = id => ({ checked: !!state.checks[id], value: state.values[id] });
    let unit, rates, meta, views;
    const sync = () => ({ unit, rates, meta, views } = state);
    sync();
    ${constants}
    ${maths}
    ${measure}
    return {
      sync, MM_IN, IN3_PER_L, FIRINGS,
      solveLin, homography, hApply, polyArea, hull, orderCW, quadFromHull,
      toU, fromU, up, fmt, pieceDims, volIn3, feeFor, money, sidePots,
    };
  `);
  const state = { unit: 'in', rates: {}, meta: [], views: {}, checks: {}, values: {} };
  const api = factory(state);
  // Tests mutate `state` then call this so the closure re-reads it.
  return { ...api, state, set(patch) { Object.assign(state, patch); api.sync(); } };
}

module.exports = { load };
