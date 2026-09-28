import { IN3_PER_L, stepOf, toU, type Unit } from './units';

export interface Firing {
  id: string;
  label: string;
  /** Example rate, $ per cubic inch. */
  rate: number;
}

export const FIRINGS: Firing[] = [
  { id: 'bisque', label: 'Bisque · cone 04', rate: 0.020 },
  { id: 'c6', label: 'Glaze · cone 6 oxidation', rate: 0.035 },
  { id: 'c10', label: 'Glaze · cone 10 reduction', rate: 0.045 },
];

export type Rates = Record<string, number>;
export const defaultRates = (): Rates => Object.fromEntries(FIRINGS.map(f => [f.id, f.rate]));

export interface PieceInput {
  /** Measured front-view size, mm. */
  wMm: number;
  hMm: number;
  /** Matching side-view piece, if a usable side photo exists. */
  side: { hMm: number; wMm: number } | null;
  round: boolean;
  depthMm: number | null;
}

export interface Dims {
  hRaw: number;
  wRaw: number;
  dRaw: number;
  h: number;
  w: number;
  d: number;
  src: 'side' | 'round' | 'entered';
}

/** Round v up to the next unit step (with a tiny epsilon so exact steps are kept). */
export const roundUp = (unit: Unit, v: number, on: boolean) =>
  on ? Math.ceil(v / stepOf(unit) - 1e-9) * stepOf(unit) : v;

/** Kiln-space bounding box (H × W × D) of one piece, in the display unit. */
export function pieceDims(unit: Unit, p: PieceInput, round: boolean): Dims {
  const sd = p.side;
  const hMm = sd ? Math.max(p.hMm, sd.hMm) : p.hMm;
  const wMm = p.wMm;
  const dMm = sd ? sd.wMm : p.round ? wMm : p.depthMm || 0;
  const hRaw = toU(unit, hMm), wRaw = toU(unit, wMm), dRaw = toU(unit, dMm);
  return {
    hRaw, wRaw, dRaw,
    h: roundUp(unit, hRaw, round), w: roundUp(unit, wRaw, round), d: roundUp(unit, dRaw, round),
    src: sd ? 'side' : p.round ? 'round' : 'entered',
  };
}

export const volIn3 = (unit: Unit, d: Pick<Dims, 'h' | 'w' | 'd'>) =>
  unit === 'in' ? d.h * d.w * d.d : (d.h * d.w * d.d) / 1000 * IN3_PER_L;

export function feeFor(v3: number, firingId: string, rates: Rates, minFee: number) {
  const fee = v3 * (rates[firingId] || 0);
  return { fee: Math.round(Math.max(fee, minFee) * 100) / 100, atMin: fee < minFee };
}

