import type { Analysis, Firing, Quote, Settings, Unit } from './types';

async function check(res: Response) {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (typeof j.detail === 'string') msg = j.detail;
    } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return res;
}

export async function fetchFirings(): Promise<Firing[]> {
  return (await (await check(await fetch('/api/config'))).json()).firings;
}

export async function fetchSample(): Promise<Blob> {
  return (await check(await fetch('/api/sample.png'))).blob();
}

export async function analyzePhoto(image: Blob, cfg: Settings): Promise<Analysis> {
  const form = new FormData();
  form.append('image', image, 'photo');
  form.append('marker_size', String(cfg.size));
  form.append('marker_id', cfg.id);
  form.append('tol', String(cfg.tol));
  return (await check(await fetch('/api/analyze', { method: 'POST', body: form }))).json();
}

export interface QuotePiece {
  wMm: number;
  hMm: number;
  sideWMm?: number;
  sideHMm?: number;
  round: boolean;
  depthMm: number | null;
  firing: string;
  qty: number;
}
export async function fetchQuote(body: { unit: Unit; pieces: QuotePiece[]; rates: Record<string, number>; minFee: number; roundUp: boolean }): Promise<Quote> {
  const res = await check(await fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  return res.json();
}
