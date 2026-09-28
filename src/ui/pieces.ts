import { fetchQuote, type QuotePiece } from '../api';
import type { Pot } from '../types';
import { IN3_PER_L, fromU, money, toU } from '../units';
import { $, $i, $s, plural, toast } from './dom';
import { fmtU, volStr } from './format';
import { resetMeta, state } from './state';

export function frontOk() {
  const F = state.views.front && state.views.front.result;
  return F && F.ok ? F : null;
}
export function sidePots(): Pot[] | null {
  const F = frontOk(), S = state.views.side && state.views.side.result;
  if (!F || !S || !S.ok) return null;
  return S.pots.length === F.pots.length ? S.pots : null;
}
export const roundOn = () => $i('roundUp').checked;
export const minFee = () => parseFloat($i('minFee').value) || 0;

/** Keep the per-piece metadata array the same length as the number of front-view pieces. */
export function syncMeta() {
  const F = state.views.front && state.views.front.result, n = F && F.ok ? F.pots.length : 0;
  if (state.meta.length !== n) resetMeta(n, state.meta.map(m => m.name));
}

export function renderPieces() {
  const el = $('pieces');
  el.innerHTML = '';
  const F = frontOk();
  if (!F) {
    el.innerHTML = `<p class="empty">${state.views.front ? 'Fix the front view to get measurements.' : 'Take a front-view photo in the booth to start.'}</p>`;
    updatePieces();
    return;
  }
  F.pots.forEach((p, i) => {
    const m = state.meta[i], d = document.createElement('div');
    d.className = 'piece';
    d.innerHTML = `<div class="phead"><span class="pnum" aria-hidden="true">${i + 1}</span><input type="text" id="pn${i}" aria-label="Name of piece ${i + 1}" placeholder="Piece ${i + 1} name"><span class="pfee" id="pf${i}"></span></div>
      <div class="pdims" id="pd${i}"></div>
      <div class="popts"><label class="qty" for="pq${i}"><span class="label">Qty</span><input type="number" id="pq${i}" min="1" max="999" step="1" inputmode="numeric"></label><select id="pfi${i}" aria-label="Firing for piece ${i + 1}"></select>
        <label class="check" id="prl${i}"><input type="checkbox" id="pr${i}"><span>Round: depth equals width</span></label>
        <input type="number" id="pdep${i}" min="0" step="0.1" aria-label="Depth of piece ${i + 1}"></div>`;
    el.append(d);
    const nm = $i('pn' + i);
    nm.value = m.name;
    nm.oninput = () => { m.name = nm.value; };
    const fs = $s('pfi' + i);
    state.firings.forEach(f => { const o = document.createElement('option'); o.value = f.id; o.textContent = f.label; fs.append(o); });
    fs.value = m.firing;
    fs.onchange = () => { m.firing = fs.value; updatePieces(); };
    const rd = $i('pr' + i);
    rd.checked = m.round;
    rd.onchange = () => { m.round = rd.checked; if (!m.round && m.depthMm == null) m.depthMm = p.wMm; updatePieces(); };
    const qt = $i('pq' + i);
    qt.value = String(m.qty);
    qt.oninput = () => { const v = Math.floor(+qt.value); m.qty = v >= 1 ? Math.min(v, 999) : 1; updatePieces(); };
    qt.onblur = () => { qt.value = String(m.qty); };
    const dp = $i('pdep' + i);
    dp.oninput = () => { const v = parseFloat(dp.value); m.depthMm = v > 0 ? fromU(state.unit, v) : 0; updatePieces(); };
  });
  updatePieces();
}

let quoteSeq = 0;

/** Ask the backend to measure and price every piece, then render the answer (stale replies are dropped). */
export function updatePieces() {
  const F = frontOk();
  const seq = ++quoteSeq;
  if (!F) { state.quote = null; renderTotals(); return; }
  const sp = sidePots();
  const pieces: QuotePiece[] = F.pots.map((p, i) => ({
    wMm: p.wMm, hMm: p.hMm, sideWMm: sp?.[i].wMm, sideHMm: sp?.[i].hMm,
    round: state.meta[i].round, depthMm: state.meta[i].depthMm, firing: state.meta[i].firing, qty: state.meta[i].qty || 1,
  }));
  fetchQuote({ unit: state.unit, pieces, rates: state.rates, minFee: minFee(), roundUp: roundOn() }).then(q => {
    if (seq !== quoteSeq) return;
    state.quote = q;
    renderTotals();
  }, e => { if (seq === quoteSeq) toast(`Could not price the pieces: ${e.message}`); });
  renderTotals(); // immediate pass for labels that don't need a price
}

function renderTotals() {
  const { unit, meta } = state, q = state.quote;
  const F = frontOk(), n = F ? F.pots.length : 0, items = F ? meta.reduce((a, m) => a + (m.qty || 1), 0) : 0;
  $('piecesTitle').textContent = n ? `${plural(n, 'piece')} in this photo` : 'Pieces in this photo';
  $('addBtn').textContent = items > 1 ? `Add ${plural(items, 'item')} to firing slip` : 'Add to firing slip';
  $i('addBtn').disabled = !n || !q || q.items.length !== n;
  if (!F) { $('oVol').textContent = '–'; $('oCost').textContent = '–'; $('oExplain').textContent = ''; return; }
  const sp = sidePots();
  if (!q || q.items.length !== n) return; // wait for the first price
  F.pots.forEach((_, i) => {
    const it = q.items[i], d = it.dims, qty = it.qty;
    $('pf' + i).textContent = money(it.fee * qty);
    const src = d.src === 'side' ? 'depth from side view' : d.src === 'round' ? 'depth = width' : 'depth entered';
    $('pd' + i).innerHTML = `<span class="num">${fmtU(d.h)} × ${fmtU(d.w)} × ${fmtU(d.d)} ${unit}</span><span class="num">${volStr({ vol: it.vol })}${qty > 1 ? ' each' : ''}</span>${qty > 1 ? `<span class="raw">${qty} × ${money(it.fee)}${it.atMin ? ' minimum fee' : ''}</span>` : it.atMin ? '<span class="raw">minimum fee</span>' : ''}<span class="raw">H × W × D · ${src}${roundOn() ? ` · measured ${fmtU(d.hRaw)} × ${fmtU(d.wRaw)}` : ''}</span>`;
    $('prl' + i).hidden = !!sp;
    const dp = $i('pdep' + i);
    dp.hidden = !!sp || meta[i].round;
    dp.placeholder = `Depth (${unit})`;
    if (document.activeElement !== dp && meta[i].depthMm != null) dp.value = fmtU(toU(unit, meta[i].depthMm!));
  });
  $('oVol').innerHTML = unit === 'in' ? Math.round(q.totalVol).toLocaleString() + ' <em>in³ total</em>' : (q.totalVol / IN3_PER_L).toFixed(2) + ' <em>litres total</em>';
  $('oCost').textContent = money(q.totalFee);
  const S = state.views.side && state.views.side.result;
  $('oExplain').textContent = sp ? 'Each depth comes from the side view.' : S && S.ok ? 'The side view shows a different number of pieces, so it is not used.' : 'Round pieces use their width as depth. Untick “Round” to enter a depth, or add a side view.';
}
