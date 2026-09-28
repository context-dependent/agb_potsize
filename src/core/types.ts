export type Vec = [number, number];
export type Quad = [Vec, Vec, Vec, Vec];

/** Grayscale float image plus the original RGBA bytes it was made from. */
export interface Gray {
  w: number;
  h: number;
  d: Float32Array;
  px: Uint8ClampedArray;
}

export interface Settings {
  /** Black-square size of the marker, mm. */
  size: number;
  /** Marker ID as a string, or 'any'. */
  id: string;
  /** Backdrop tolerance multiplier. */
  tol: number;
}

export interface Marker {
  id: number;
  ham: number;
  corners: Vec[];
  area?: number;
}

export interface Pot {
  id: number;
  pts: Vec[];
  edge: boolean;
  bbox: [number, number, number, number];
  area: number;
  wMm: number;
  hMm: number;
  boxImg: Vec[];
}

export interface Segmentation {
  ok: true;
  lab: Int32Array;
  pots: Omit<Pot, 'wMm' | 'hMm' | 'boxImg'>[];
  nearCard: boolean;
}

export interface MarkerInfo {
  id: number;
  corners: Vec[];
  sidePx: number;
  tilt: number;
  ham: number;
}

export interface AnalysisBase {
  marker: MarkerInfo;
  H: number[];
  Hi: number[];
  fs: number;
  segSize: [number, number];
  zone: number[];
}

export type Analysis =
  | { ok: false; stage: 'marker'; ids: number[]; marker?: undefined }
  | (AnalysisBase & { ok: false; stage: 'pot'; touchesCard: boolean })
  | (AnalysisBase & { ok: true; seg: Segmentation; pots: Pot[] });
