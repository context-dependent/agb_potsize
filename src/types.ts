export type Unit = 'in' | 'cm';
export type Vec = [number, number];

export interface Settings {
  size: number;
  id: string;
  tol: number;
}

export interface MarkerInfo {
  id: number;
  corners: Vec[];
  sidePx: number;
  tilt: number;
  ham: number;
}

export interface Pot {
  wMm: number;
  hMm: number;
  edge: boolean;
  bbox: [number, number, number, number];
  area: number;
  boxImg: Vec[];
  /** Outline polygons in segmentation-resolution pixels. */
  outline: Vec[][];
}

/** Response of POST /api/analyze. */
export interface Analysis {
  ok: boolean;
  stage: 'marker' | 'pot' | null;
  ids: number[];
  touchesCard: boolean;
  marker: MarkerInfo | null;
  pots: Pot[];
  segSize: [number, number];
  fs: number;
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
export interface QuoteItem {
  dims: Dims;
  vol: number;
  fee: number;
  atMin: boolean;
  qty: number;
}
/** Response of POST /api/quote. */
export interface Quote {
  items: QuoteItem[];
  totalVol: number;
  totalFee: number;
}
export interface Firing {
  id: string;
  label: string;
  rate: number;
}
