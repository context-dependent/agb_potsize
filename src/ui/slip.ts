import { money } from '../units';
import { $, $i, esc, plural, toast } from './dom';
import { dimStr, volStr } from './format';
import { frontOk } from './pieces';
import { state, store } from './state';

const Q = (it: { qty?: number }) => it.qty || 1;

export function renderSlip() {
  const el = $('slipTable'), { slip } = state;
  if (!slip.length) { el.innerHTML = '<p class="empty">No pieces yet. Measure your work and tap “Add to firing slip”.</p>'; return; }
  const total = slip.reduce((s, i) => s + i.fee * Q(i), 0), vol = slip.reduce((s, i) => s + i.vol * Q(i), 0), count = slip.reduce((s, i) => s + Q(i), 0);
  el.innerHTML = `<table><thead><tr><th>Piece</th><th class="r">Qty</th><th class="r">Space</th><th class="r">Fee</th><th></th></tr></thead><tbody>${
    slip.map((it, i) => `<tr><td>${esc(it.name)}<br><span class="note">${esc(state.firings.find(f => f.id === it.firing)?.label || it.firing)}</span><br><span class="note num">${dimStr(it)}</span></td><td class="r"><span class="num">${Q(it)}</span></td><td class="r"><span class="num">${volStr({ vol: it.vol * Q(it) })}</span></td><td class="r"><span class="num">${money(it.fee * Q(it))}</span>${Q(it) > 1 ? `<br><span class="note">${money(it.fee)} each</span>` : ''}</td><td class="r"><button class="x" data-i="${i}" aria-label="Remove ${esc(it.name)}">×</button></td></tr>`).join('')
  }</tbody><tfoot><tr><td>Total</td><td class="r"><span class="num">${count}</span></td><td class="r"><span class="num">${volStr({ vol })}</span></td><td class="r"><span class="num">${money(total)}</span></td><td></td></tr></tfoot></table>`;
  el.querySelectorAll<HTMLElement>('.x').forEach(b => (b.onclick = () => { slip.splice(+b.dataset.i!, 1); store.set('slip', slip); renderSlip(); }));
}

export function slipText() {
  const { slip } = state;
  const lines = [`FIRING SLIP · ${$('slipDate').textContent}`, `Potter: ${$i('potter').value || '(name)'}`, ''];
  slip.forEach((it, i) => lines.push(`${i + 1}. ${it.name}${Q(it) > 1 ? ` ×${Q(it)}` : ''} | ${state.firings.find(f => f.id === it.firing)?.label} | ${dimStr(it)} = ${volStr(it)}${Q(it) > 1 ? ' each' : ''} | ${Q(it) > 1 ? `${Q(it)} × ${money(it.fee)} = ` : ''}${money(it.fee * Q(it))}`));
  lines.push('', `Total: ${slip.reduce((s, i) => s + Q(i), 0)} item(s), ${volStr({ vol: slip.reduce((s, i) => s + i.vol * Q(i), 0) })}, ${money(slip.reduce((s, i) => s + i.fee * Q(i), 0))}`);
  return lines.join('\n');
}

export function initSlip() {
  $('slipDate').textContent = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  $('addBtn').onclick = () => {
    const F = frontOk();
    if (!F) { toast('Take a front view that measures first.'); return; }
    const { slip, meta, unit } = state, toIn = (v: number) => (unit === 'in' ? v : v / 2.54);
    let tot = 0;
    const q = state.quote;
    if (!q || q.items.length !== F.pots.length) { toast('Still pricing. Try again in a moment.'); return; }
    F.pots.forEach((_, i) => {
      const it = q.items[i], d = it.dims;
      tot += it.fee * it.qty;
      slip.push({ name: meta[i].name.trim() || `Piece ${slip.length + 1}`, qty: it.qty, firing: meta[i].firing, h: toIn(d.h), w: toIn(d.w), d: toIn(d.d), vol: it.vol, fee: it.fee });
    });
    store.set('slip', slip);
    renderSlip();
    toast(`Added ${plural(meta.reduce((a, m) => a + (m.qty || 1), 0), 'item')} · ${money(tot)}`);
  };
  $('copyBtn').onclick = () => {
    if (!state.slip.length) { toast('The slip is empty.'); return; }
    const t = slipText(), ta = $<HTMLTextAreaElement>('copyfallback');
    const fb = () => { ta.value = t; ta.hidden = false; ta.focus(); ta.select(); toast('Select all and copy the text below.'); };
    try { navigator.clipboard.writeText(t).then(() => { ta.hidden = true; toast('Slip copied'); }, fb); } catch { fb(); }
  };
  $('clearBtn').onclick = () => { if (state.slip.length) $('clearConfirm').hidden = false; };
  $('clearNo').onclick = () => { $('clearConfirm').hidden = true; };
  $('clearYes').onclick = () => { state.slip = []; store.set('slip', state.slip); renderSlip(); $('clearConfirm').hidden = true; toast('Slip cleared'); };
}
