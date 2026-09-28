import type { Analysis } from '../types';
import { $, $s, plural } from './dom';
import { settings, state, type ViewKey } from './state';

type Check = [kind: 'ok' | 'warn' | 'bad', text: string, sub?: string];

/** Human-readable quality checks for one analysed photo. */
export function checksFor(r: Analysis | undefined, which: ViewKey): Check[] {
  const L: Check[] = [];
  if (!r) return L;
  if (!r.marker) {
    L.push(['bad', r.ids.length ? `Found marker ID ${r.ids.join(', ')}, but the booth is set to ID ${$s('mId').value}.` : 'No ArUco marker found. Make sure the whole card is in frame, in focus, and not in glare.']);
    return L;
  }
  const mk = r.marker, mmPerPx = settings().size / mk.sidePx;
  L.push(['ok', `Marker ID ${mk.id} found`, `${Math.round(mk.sidePx)} px across · ${mmPerPx.toFixed(2)} mm per pixel`]);
  if (mk.sidePx < 60) L.push(['warn', 'The marker is small in the photo. Move the phone closer or print a larger marker.']);
  if (mk.tilt > 25) L.push(['warn', `The marker is rotated ${Math.round(mk.tilt)}°. Mount the card with its UP arrow on top, or hold the phone level.`]);
  if (!r.ok) {
    L.push(['bad', r.touchesCard ? 'A piece seems to touch the marker card. Leave at least 5 cm between them.' : 'No pieces found against the backdrop. Check the lighting, or raise the backdrop tolerance in Studio settings.']);
    return L;
  }
  L.push(['ok', `${plural(r.pots.length, 'piece')} traced`, 'numbered left to right']);
  r.pots.forEach((p, i) => {
    if (p.edge) L.push(['warn', `Piece ${i + 1} touches the edge of the photo, so part of it may be cut off. Step back and retake.`]);
    if (p.hMm < 15 || p.wMm < 15) L.push(['warn', `Piece ${i + 1} measures under 15 mm. If it's a crumb or stray shadow, clear it away and retake.`]);
  });
  if (r.pots.some(p => p.wMm > 2.2 * p.hMm && p.wMm > 200)) L.push(['warn', 'One outline is unusually wide. Two pieces standing too close are counted as one, so leave about 2 cm between them.']);
  if (which === 'side') {
    const F = state.views.front && state.views.front.result;
    if (F && F.ok && F.pots.length !== r.pots.length) L.push(['warn', `The side view shows ${plural(r.pots.length, 'piece')} but the front view shows ${F.pots.length}. Keep the same pieces in the same order, each turned a quarter turn in place.`]);
  }
  return L;
}

export function renderChecks() {
  const v = state.views[state.cur], ul = $('checks');
  ul.innerHTML = '';
  const L = v ? checksFor(v.result, state.cur) : [];
  for (const [k, t, sub] of L) {
    const li = document.createElement('li');
    li.innerHTML = `<i class="dot ${k}"></i><span>${t}${sub ? ` <span class="num">· ${sub}</span>` : ''}</span>`;
    ul.append(li);
  }
  for (const k of ['front', 'side'] as const) {
    const v = state.views[k], dot = $(k === 'front' ? 'dFront' : 'dSide'), s = $(k === 'front' ? 'sFront' : 'sSide');
    if (!v) { dot.className = 'dot'; s.textContent = k === 'front' ? 'No photo' : 'Turn each piece 90°'; continue; }
    const r = v.result;
    if (r.ok) {
      const warn = checksFor(r, k).some(c => c[0] !== 'ok');
      dot.className = 'dot ' + (warn ? 'warn' : 'ok');
      s.textContent = plural(r.pots.length, 'piece') + ' measured';
    } else {
      dot.className = 'dot bad';
      s.textContent = r.stage === 'marker' ? 'Marker not found' : 'No pieces found';
    }
  }
  $('clearViewBtn').hidden = !(state.cur === 'side' && state.views.side);
}
