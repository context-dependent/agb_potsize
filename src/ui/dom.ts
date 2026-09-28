export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const $i = (id: string) => $<HTMLInputElement>(id);
export const $s = (id: string) => $<HTMLSelectElement>(id);

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export const esc = (s: unknown) =>
  String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

let tt: number | undefined;
export function toast(m: string) {
  const t = $('toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(tt);
  tt = window.setTimeout(() => t.classList.remove('show'), 2600);
}
