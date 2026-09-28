import { IN3_PER_L, fmt } from '../core/units';
import type { SlipItem } from './state';
import { state } from './state';

export const fmtU = (v: number) => fmt(state.unit, v);
export const volStr = (it: { vol: number }) =>
  state.unit === 'in' ? Math.round(it.vol).toLocaleString() + ' in³' : (it.vol / IN3_PER_L).toFixed(2) + ' L';
export function dimStr(it: SlipItem) {
  const f = (v: number) => (state.unit === 'in' ? fmtU(v) : fmtU(Math.round(v * 25.4) / 10));
  return `${f(it.h)}×${f(it.w)}×${f(it.d)} ${state.unit}`;
}
