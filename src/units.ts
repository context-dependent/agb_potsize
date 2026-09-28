import type { Unit } from './types';

// Display-side unit helpers only. Measurement, rounding and pricing all happen in the backend.
export const MM_IN = 25.4;
export const IN3_PER_L = 61.0237;

export const toU = (unit: Unit, mm: number) => (unit === 'in' ? mm / MM_IN : mm / 10);
export const fromU = (unit: Unit, v: number) => (unit === 'in' ? v * MM_IN : v * 10);

export function fmt(unit: Unit, v: number): string {
  return unit === 'in' ? v.toFixed(2).replace(/0$/, '').replace(/\.0$/, '') : v.toFixed(1).replace(/\.0$/, '');
}
export const money = (v: number) => '$' + v.toFixed(2);
