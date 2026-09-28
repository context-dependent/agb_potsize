import './styles.css';
import { analyze } from './core/analyze';
import { scaled } from './core/image';
import { FIRINGS } from './core/pricing';
import { IN3_PER_L, type Unit } from './core/units';
import { makeSample, SAMPLE_NAMES } from './core/sample';
import { renderChecks } from './ui/checks';
import { $, $i, $s, plural, toast } from './ui/dom';
import { draw, watchRedraw } from './ui/draw';
import { renderPieces, syncMeta, updatePieces } from './ui/pieces';
import { initSlip, renderSlip } from './ui/slip';
import { resetMeta, settings, state, store, type ViewKey } from './ui/state';

function refresh() { syncMeta(); draw(); renderChecks(); renderPieces(); }

function rerun() {
  for (const k of ['front', 'side'] as const) {
    const v = state.views[k];
    if (v) v.result = analyze(v.canvas, settings());
  }
  refresh();
}
let rerunT: number | undefined;
const rerunSoon = () => { clearTimeout(rerunT); rerunT = window.setTimeout(rerun, 250); };

function setView(v: ViewKey) {
  state.cur = v;
  $('vFront').setAttribute('aria-pressed', String(v === 'front'));
  $('vSide').setAttribute('aria-pressed', String(v === 'side'));
  $('shootLbl').textContent = v === 'front' ? 'Photograph front view' : 'Photograph side view';
  refresh();
}

function process(canvas: HTMLCanvasElement, sample: boolean) {
  $('busy').hidden = false;
  setTimeout(() => {
    const work = scaled(canvas, 2400);
    const view = { canvas: work, sample, result: analyze(work, settings()) };
    state.views[state.cur] = view;
    $('busy').hidden = true;
    const r = view.result;
    if (state.cur === 'front') resetMeta(r.ok ? r.pots.length : 0, sample ? SAMPLE_NAMES : null);
    refresh();
    toast(r.ok ? `Measured ${plural(r.pots.length, 'piece')}` : 'Could not measure. See the checks under the photo.');
  }, 30);
}

function showRate() {
  const r = state.rates[$s('firing').value], inch = state.unit === 'in';
  $i('rate').value = inch ? r.toFixed(3) : (r * IN3_PER_L).toFixed(2);
  $i('rate').step = inch ? '0.001' : '0.05';
  $('rateUnit').textContent = inch ? 'in³' : 'litre';
}

function setUnit(u: Unit) {
  state.unit = u;
  store.set('unit', u);
  $('uIn').setAttribute('aria-pressed', String(u === 'in'));
  $('uCm').setAttribute('aria-pressed', String(u === 'cm'));
  $('stepLbl').textContent = u === 'in' ? '½ in' : '1 cm';
  showRate();
  refresh();
  renderSlip();
}

function initControls() {
  const mIdSel = $s('mId');
  { const o = document.createElement('option'); o.value = 'any'; o.textContent = 'Any 4×4 marker'; mIdSel.append(o);
    for (let i = 0; i < 50; i++) { const o = document.createElement('option'); o.value = String(i); o.textContent = 'ID ' + i; mIdSel.append(o); } }
  $i('mSize').value = String(store.get('mSize', 80));
  mIdSel.value = store.get('mId', 'any');
  $i('tol').value = String(store.get('tol', 2));
  $('tolVal').textContent = '×' + (+$i('tol').value).toFixed(1);
  $i('mSize').oninput = () => { store.set('mSize', parseFloat($i('mSize').value) || 80); rerunSoon(); };
  mIdSel.onchange = () => { store.set('mId', mIdSel.value); rerun(); };
  $i('tol').oninput = () => { store.set('tol', +$i('tol').value); $('tolVal').textContent = '×' + (+$i('tol').value).toFixed(1); rerunSoon(); };

  $('vFront').onclick = () => setView('front');
  $('vSide').onclick = () => setView('side');
  $('clearViewBtn').onclick = () => { state.views.side = null; refresh(); };
  $('sampleBtn').onclick = () => { setView('front'); state.views.side = null; process(makeSample(), true); };
  $i('file').onchange = e => {
    const input = e.target as HTMLInputElement, f = input.files && input.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f), im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      c.getContext('2d')!.drawImage(im, 0, 0);
      URL.revokeObjectURL(url);
      if (state.cur === 'front') state.views.side = null;
      process(c, false);
    };
    im.onerror = () => toast('That file could not be opened as an image. Try a JPG or PNG.');
    im.src = url;
    input.value = '';
  };

  FIRINGS.forEach(f => { const o = document.createElement('option'); o.value = f.id; o.textContent = f.label; $('firing').append(o); });
  $s('firing').value = store.get('firing', 'c6');
  $i('minFee').value = (+store.get('minFee', 1)).toFixed(2);
  $i('potter').value = store.get('potter', '');
  $i('roundUp').onchange = updatePieces;
  $s('firing').onchange = () => { store.set('firing', $s('firing').value); showRate(); };
  $i('rate').oninput = () => {
    const v = parseFloat($i('rate').value);
    if (!(v >= 0)) return;
    state.rates[$s('firing').value] = state.unit === 'in' ? v : v / IN3_PER_L;
    store.set('rates', state.rates);
    updatePieces();
  };
  $i('minFee').oninput = () => { store.set('minFee', parseFloat($i('minFee').value) || 0); updatePieces(); };
  $i('potter').oninput = () => store.set('potter', $i('potter').value);
  $('uIn').onclick = () => setUnit('in');
  $('uCm').onclick = () => setUnit('cm');
}

initControls();
initSlip();
watchRedraw();
if (!state.slip) state.slip = [{ name: 'Example: mug', firing: 'c6', h: 4, w: 5, d: 3.5, vol: 70, fee: 2.45 }];
setUnit(state.unit);
renderSlip();
const front = scaled(makeSample(), 2400);
state.views.front = { canvas: front, sample: true, result: analyze(front, settings()) };
{ const r = state.views.front.result; resetMeta(r.ok ? r.pots.length : 0, SAMPLE_NAMES); }
refresh();

// Debug hook, kept from the prototype so the two builds can be compared in a browser.
(window as unknown as { __ksm: unknown }).__ksm = { analyze: (c: HTMLCanvasElement) => analyze(c, settings()), views: state.views };
