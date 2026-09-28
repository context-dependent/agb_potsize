import './styles.css';
import { analyzePhoto, fetchFirings, fetchSample } from './api';
import type { Analysis, Unit } from './types';
import { IN3_PER_L } from './units';
import { renderChecks } from './ui/checks';
import { $, $i, $s, plural, toast } from './ui/dom';
import { draw, watchRedraw } from './ui/draw';
import { renderPieces, syncMeta, updatePieces } from './ui/pieces';
import { initSlip, renderSlip } from './ui/slip';
import { resetMeta, settings, state, store, type View, type ViewKey } from './ui/state';

const SAMPLE_NAMES = ['Celadon vase', 'Mug', 'Tenmoku bowl'];
const MAX_DIM = 2400; // the backend uses the same working size, so overlay coordinates line up

/** Downscale to the working size. */
function scaled(src: CanvasImageSource & { width: number; height: number }, maxDim = MAX_DIM): HTMLCanvasElement {
  const k = Math.min(1, maxDim / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * k));
  c.height = Math.max(1, Math.round(src.height * k));
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const toBlob = (c: HTMLCanvasElement, sample: boolean) =>
  new Promise<Blob>((res, rej) => (sample ? c.toBlob(b => (b ? res(b) : rej(new Error('encode failed'))), 'image/png') : c.toBlob(b => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.92)));

async function measure(canvas: HTMLCanvasElement, sample: boolean): Promise<Analysis> {
  return analyzePhoto(await toBlob(canvas, sample), settings());
}


function refresh() { syncMeta(); draw(); renderChecks(); renderPieces(); }

let rerunSeq = 0;
async function rerun() {
  const seq = ++rerunSeq;
  try {
    const keys = (['front', 'side'] as const).filter(k => state.views[k]);
    const results = await Promise.all(keys.map(k => measure(state.views[k]!.canvas, !!state.views[k]!.sample)));
    if (seq !== rerunSeq) return;
    keys.forEach((k, i) => { state.views[k]!.result = results[i]; });
    refresh();
  } catch (e) { toast((e as Error).message); }
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

async function process(canvas: HTMLCanvasElement, sample: boolean) {
  $('busy').hidden = false;
  const key = state.cur;
  try {
    const work = scaled(canvas);
    const result = await measure(work, sample);
    const view: View = { canvas: work, sample, result };
    state.views[key] = view;
    if (key === 'front') resetMeta(result.ok ? result.pots.length : 0, sample ? SAMPLE_NAMES : null);
    refresh();
    toast(result.ok ? `Measured ${plural(result.pots.length, 'piece')}` : 'Could not measure. See the checks under the photo.');
  } catch (e) {
    toast((e as Error).message || 'Could not reach the measuring service.');
  } finally {
    $('busy').hidden = true;
  }
}

async function loadSample(): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(await fetchSample());
  return scaled(bmp);
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
  $('sampleBtn').onclick = async () => { setView('front'); state.views.side = null; try { await process(await loadSample(), true); } catch (e) { toast((e as Error).message); } };
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

  state.firings.forEach(f => { const o = document.createElement('option'); o.value = f.id; o.textContent = f.label; $('firing').append(o); });
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

async function boot() {
  state.firings = await fetchFirings();
  state.rates = { ...Object.fromEntries(state.firings.map(f => [f.id, f.rate])), ...(state.rates || {}) };
  initControls();
  initSlip();
  watchRedraw();
  if (!state.slip) state.slip = [{ name: 'Example: mug', firing: 'c6', h: 4, w: 5, d: 3.5, vol: 70, fee: 2.45 }];
  setUnit(state.unit);
  renderSlip();
  const front = await loadSample();
  const result = await measure(front, true);
  state.views.front = { canvas: front, sample: true, result };
  resetMeta(result.ok ? result.pots.length : 0, SAMPLE_NAMES);
  refresh();
}

boot().catch(e => toast(`Could not reach the measuring service: ${(e as Error).message}`));

// Debug hook: inspect what the backend returned for the current photos.
(window as unknown as { __ksm: unknown }).__ksm = { views: state.views, quote: () => state.quote };
