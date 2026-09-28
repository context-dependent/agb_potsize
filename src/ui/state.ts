import type { Analysis, Settings } from '../core/types';
import { FIRINGS, defaultRates, type Rates } from '../core/pricing';
import type { Unit } from '../core/units';
import { $i, $s } from './dom';

/** localStorage wrapper; every failure (private mode, quota) falls back to the default. */
export const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem('ksm2.' + k);
      return v == null ? d : (JSON.parse(v) as T);
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem('ksm2.' + k, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
};

export interface View {
  canvas: HTMLCanvasElement;
  sample?: boolean;
  result: Analysis;
}
export interface PieceMeta {
  name: string;
  firing: string;
  round: boolean;
  depthMm: number | null;
  qty: number;
}
export interface SlipItem {
  name: string;
  qty?: number;
  firing: string;
  h: number;
  w: number;
  d: number;
  vol: number;
  fee: number;
}
export type ViewKey = 'front' | 'side';

export const state = {
  unit: store.get<Unit>('unit', 'in'),
  rates: store.get<Rates>('rates', defaultRates()),
  slip: store.get<SlipItem[] | null>('slip', null) as SlipItem[],
  views: { front: null, side: null } as Record<ViewKey, View | null>,
  cur: 'front' as ViewKey,
  meta: [] as PieceMeta[],
};

export function settings(): Settings {
  return { size: parseFloat($i('mSize').value) || 80, id: $s('mId').value, tol: parseFloat($i('tol').value) || 2 };
}

export function resetMeta(n: number, names?: string[] | null) {
  const f = $s('firing').value;
  state.meta = Array.from({ length: n }, (_, i) => ({ name: (names && names[i]) || '', firing: f, round: true, depthMm: null, qty: 1 }));
}

export { FIRINGS };
