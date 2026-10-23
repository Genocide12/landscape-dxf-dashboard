// Геометрические помощники: bbox, длины, площади (формула шнурков), сводка по зонам.

import type { DxfEntity, DxfDocument } from './dxf/parser';
import { classifyLayer, ZONE_MAP, type ZoneId } from './dxf/classify';

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bboxOfEntities(entities: DxfEntity[]): BBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const e of entities) {
    for (const [x, y] of e.points) add(x, y);
    if (e.type === 'circle') {
      const [cx, cy] = e.points[0];
      add(cx - e.radius, cy - e.radius);
      add(cx + e.radius, cy + e.radius);
    }
  }
  if (minX === Infinity || minX > maxX || minY > maxY) return null;
  return { minX, minY, maxX, maxY };
}

export function polylineLength(pts: [number, number][], closed: boolean): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  if (closed && pts.length > 2) {
    len += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  }
  return len;
}

export function polygonArea(pts: [number, number][]): number {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function entityArea(e: DxfEntity): number {
  if (e.type === 'circle') return Math.PI * e.radius * e.radius;
  if (e.type === 'polyline' && e.closed) return polygonArea(e.points);
  return 0;
}

export function entityLength(e: DxfEntity): number {
  if (e.type === 'circle') return 2 * Math.PI * e.radius;
  if (e.type === 'line' || e.type === 'polyline') {
    return polylineLength(e.points, e.type === 'polyline' && e.closed);
  }
  return 0;
}

const fmt1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const fmt2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatArea(m2: number): string {
  if (m2 >= 10000) return `${fmt2.format(m2 / 10000)} га`;
  return `${fmt1.format(m2)} м²`;
}

export function formatLen(m: number): string {
  return `${fmt1.format(m)} м`;
}

export interface ZoneStat {
  count: number;
  area: number;
  length: number;
  layers: string[];
}

export interface PlotSummary {
  bbox: BBox | null;
  width: number;
  height: number;
  totalArea: number;
  greenArea: number;
  greenRatio: number;
  zoneStats: Map<ZoneId, ZoneStat>;
  entityCount: number;
}

export function summarize(doc: DxfDocument): PlotSummary {
  const bbox = bboxOfEntities(doc.entities);
  const perZone = new Map<ZoneId, ZoneStat>();
  const layerNames = new Map<ZoneId, Set<string>>();

  for (const e of doc.entities) {
    const zid = classifyLayer(e.layer);
    let s = perZone.get(zid);
    if (!s) {
      s = { count: 0, area: 0, length: 0, layers: [] };
      perZone.set(zid, s);
    }
    s.count += 1;
    s.area += entityArea(e);
    s.length += entityLength(e);

    let names = layerNames.get(zid);
    if (!names) {
      names = new Set<string>();
      layerNames.set(zid, names);
    }
    names.add(e.layer);
  }
  for (const [zid, names] of layerNames) {
    const s = perZone.get(zid);
    if (s) s.layers = Array.from(names).slice(0, 6);
  }

  const width = bbox ? bbox.maxX - bbox.minX : 0;
  const height = bbox ? bbox.maxY - bbox.minY : 0;
  const totalArea = bbox ? width * height : 0;
  let greenArea = 0;
  for (const [zid, s] of perZone) {
    if (ZONE_MAP[zid]?.green) greenArea += s.area;
  }

  return {
    bbox,
    width,
    height,
    totalArea,
    greenArea,
    greenRatio: totalArea > 0 ? greenArea / totalArea : 0,
    zoneStats: perZone,
    entityCount: doc.entities.length,
  };
}
