import { FIRINGS, feeFor, pieceDims as calcDims, volIn3, type Dims } from '../core/pricing';
import { IN3_PER_L, fromU, money, toU } from '../core/units';
import type { Pot } from '../core/types';
import { $, $i, $s, plural } from './dom';
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

export function pieceDims(i: number): Dims {
  const p = frontOk()!.pots[i], m = state.meta[i], sp = sidePots(), sd = sp ? sp[i] : null;
  return calcDims(state.unit, { wMm: p.wMm, hMm: p.hMm, side: sd ? { hMm: sd.hMm, wMm: sd.wMm } : null, round: m.round, depthMm: m.depthMm }, roundOn());
}
export const volOf = (d: Dims) => volIn3(state.unit, d);
export const feeOf = (v3: number, firing: string) => feeFor(v3, firing, state.rates, minFee());

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
    FIRINGS.forEach(f => { const o = document.createElement('option'); o.value = f.id; o.textContent = f.label; fs.append(o); });
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

export function updatePieces() {
  const { unit, meta } = state;
  const F = frontOk(), n = F ? F.pots.length : 0, items = F ? meta.reduce((a, m) => a + (m.qty || 1), 0) : 0;
  $('piecesTitle').textContent = n ? `${plural(n, 'piece')} in this photo` : 'Pieces in this photo';
  $('addBtn').textContent = items > 1 ? `Add ${plural(items, 'item')} to firing slip` : 'Add to firing slip';
  $i('addBtn').disabled = !n;
  if (!F) { $('oVol').textContent = '–'; $('oCost').textContent = '–'; $('oExplain').textContent = ''; return; }
  const sp = sidePots();
  let tv = 0, tf = 0;
  F.pots.forEach((_, i) => {
    const q = meta[i].qty || 1, d = pieceDims(i), v3 = volOf(d), { fee, atMin } = feeOf(v3, meta[i].firing);
    tv += v3 * q;
    tf += fee * q;
    $('pf' + i).textContent = money(fee * q);
    const src = d.src === 'side' ? 'depth from side view' : d.src === 'round' ? 'depth = width' : 'depth entered';
    $('pd' + i).innerHTML = `<span class="num">${fmtU(d.h)} × ${fmtU(d.w)} × ${fmtU(d.d)} ${unit}</span><span class="num">${volStr({ vol: v3 })}${q > 1 ? ' each' : ''}</span>${q > 1 ? `<span class="raw">${q} × ${money(fee)}${atMin ? ' minimum fee' : ''}</span>` : atMin ? '<span class="raw">minimum fee</span>' : ''}<span class="raw">H × W × D · ${src}${roundOn() ? ` · measured ${fmtU(d.hRaw)} × ${fmtU(d.wRaw)}` : ''}</span>`;
    $('prl' + i).hidden = !!sp;
    const dp = $i('pdep' + i);
    dp.hidden = !!sp || meta[i].round;
    dp.placeholder = `Depth (${unit})`;
    if (document.activeElement !== dp && meta[i].depthMm != null) dp.value = fmtU(toU(unit, meta[i].depthMm!));
  });
  $('oVol').innerHTML = unit === 'in' ? Math.round(tv).toLocaleString() + ' <em>in³ total</em>' : (tv / IN3_PER_L).toFixed(2) + ' <em>litres total</em>';
  $('oCost').textContent = money(tf);
  const S = state.views.side && state.views.side.result;
  $('oExplain').textContent = sp ? 'Each depth comes from the side view.' : S && S.ok ? 'The side view shows a different number of pieces, so it is not used.' : 'Round pieces use their width as depth. Untick “Round” to enter a depth, or add a side view.';
}
