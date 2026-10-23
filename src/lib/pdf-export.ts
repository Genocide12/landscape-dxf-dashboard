// Экспорт плана участка в PDF (A3 альбомный): векторная графика, CAD-сетка,
// легенда с площадями, штамп с масштабом и датой. Шрифт DejaVuSans (кириллица).

import type { DxfDocument, DxfEntity } from './dxf/parser';
import { classifyLayer, ZONE_MAP, ZONES, type ZoneId } from './dxf/classify';
import { bboxOfEntities, entityArea, formatArea } from './geometry';

const SCALES: { k: number; label: string }[] = [
  { k: 20, label: '1:50' },
  { k: 13.33, label: '1:75' },
  { k: 10, label: '1:100' },
  { k: 6.67, label: '1:150' },
  { k: 5, label: '1:200' },
  { k: 4, label: '1:250' },
  { k: 2, label: '1:500' },
  { k: 1, label: '1:1000' },
  { k: 0.5, label: '1:2000' },
];

// A3 landscape: 420 × 297 мм
const PAGE_W = 420;
const PAGE_H = 297;

const FRAME = { x: 10, y: 10, w: 400, h: 277 };
const PLAN = { x: 16, y: 14, w: 388, h: 212 }; // поле плана
const LEGEND = { x: 16, y: 232, w: 260, h: 48 };
const STAMP = { x: 300, y: 232, w: 110, h: 48 };

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

interface PdfApi {
  setDrawColor: (r: number, g: number, b: number) => void;
  setFillColor: (r: number, g: number, b: number) => void;
  setTextColor: (r: number, g: number, b: number) => void;
  setLineWidth: (w: number) => void;
  setFontSize: (s: number) => void;
  setFont: (f: string, s: string) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  circle: (x: number, y: number, r: number, style?: string) => void;
  text: (s: string, x: number, y: number, opts?: Record<string, unknown>) => void;
  lines: (lines: number[][], x: number, y: number, scale?: number[], style?: string, closed?: boolean) => void;
  addFileToVFS: (name: string, b64: string) => void;
  addFont: (name: string, family: string, style: string) => void;
  save: (name: string) => void;
  output: (type: string) => ArrayBuffer;
}

async function fetchFontBase64(): Promise<string> {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const res = await fetch(`${base}/fonts/DejaVuSans.ttf`);
  if (!res.ok) throw new Error('Не удалось загрузить шрифт для PDF');
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

export interface PdfExportOptions {
  /** скрытые зоны (не попадут в план) */
  hiddenZones?: Set<ZoneId>;
  /** базовый текст названия проекта */
  title?: string;
  /** для тестов: готовый base64 шрифта */
  fontB64?: string;
  /** не вызывать save — вернуть Uint8Array */
  noSave?: boolean;
}

export async function exportPlanPdf(doc: DxfDocument, opts: PdfExportOptions = {}): Promise<{ bytes: Uint8Array; filename: string }> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' }) as unknown as PdfApi;

  const fontB64 = opts.fontB64 ?? (await fetchFontBase64());
  pdf.addFileToVFS('DejaVuSans.ttf', fontB64);
  pdf.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  pdf.setFont('DejaVu', 'normal');

  const hidden = opts.hiddenZones ?? new Set<ZoneId>();
  const visible = doc.entities.filter((e) => !hidden.has(classifyLayer(e.layer)));
  const bbox = bboxOfEntities(visible);
  if (!bbox) throw new Error('План пуст — нечего экспортировать');

  const title = opts.title ?? 'Ландшафтная карта участка';
  const date = new Date().toLocaleDateString('ru-RU');

  // ---- масштаб
  const k = SCALES.find((s) => s.k * (bbox.maxX - bbox.minX) <= PLAN.w && s.k * (bbox.maxY - bbox.minY) <= PLAN.h) ?? SCALES[SCALES.length - 1];

  // ---- рамка
  pdf.setDrawColor(24, 24, 27);
  pdf.setLineWidth(0.5);
  pdf.rect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);

  // ---- план: центрируем в поле
  const pw = (bbox.maxX - bbox.minX) * k.k;
  const ph = (bbox.maxY - bbox.minY) * k.k;
  const ox = PLAN.x + (PLAN.w - pw) / 2 - bbox.minX * k.k;
  const oy = PLAN.y + (PLAN.h - ph) / 2 + bbox.maxY * k.k; // y модели ↑ → y бумаги ↓
  const px = (x: number) => ox + x * k.k;
  const py = (y: number) => oy - y * k.k;

  // ---- CAD-сетка (шаг подбираем: 8–25 мм на бумаге)
  const gridSteps = [0.5, 1, 2, 5, 10, 25, 50];
  const gstep = gridSteps.find((s) => s * k.k >= 8) ?? 50;
  pdf.setLineWidth(0.1);
  const gx0 = Math.ceil(bbox.minX / gstep) * gstep;
  const gy0 = Math.ceil(bbox.minY / gstep) * gstep;
  const gp = PLAN;
  for (let gx = gx0; gx <= bbox.maxX + 1e-9; gx += gstep) {
    const X = px(gx);
    if (X < gp.x || X > gp.x + gp.w) continue;
    const major = Math.abs(gx / gstep) % 5 < 1e-9;
    pdf.setDrawColor(major ? 203 : 241, major ? 213 : 245, major ? 225 : 249);
    pdf.line(X, gp.y, X, gp.y + gp.h);
  }
  for (let gy = gy0; gy <= bbox.maxY + 1e-9; gy += gstep) {
    const Y = py(gy);
    if (Y < gp.y || Y > gp.y + gp.h) continue;
    const major = Math.abs(gy / gstep) % 5 < 1e-9;
    pdf.setDrawColor(major ? 203 : 241, major ? 213 : 245, major ? 225 : 249);
    pdf.line(gp.x, Y, gp.x + gp.w, Y);
  }

  // ---- объекты: сначала залитые, потом линии, сверху текст
  const fillIds = new Set<number>();
  for (const e of visible) {
    if ((e.type === 'circle' || (e.type === 'polyline' && e.closed)) && ZONE_MAP[classifyLayer(e.layer)].fill) {
      fillIds.add(e.id);
    }
  }
  const fills = visible.filter((e) => fillIds.has(e.id));
  const strokes = visible.filter((e) => e.type === 'line' || e.type === 'point' || (e.type === 'polyline' && !fillIds.has(e.id)));
  const texts = visible.filter((e) => e.type === 'text');

  for (const e of fills) {
    const zone = ZONE_MAP[classifyLayer(e.layer)];
    const [r, g, b] = hexToRgb(zone.fill ?? '#ffffff');
    const [sr, sg, sb] = hexToRgb(zone.stroke);
    pdf.setFillColor(r, g, b);
    pdf.setDrawColor(sr, sg, sb);
    pdf.setLineWidth(e.type === 'circle' ? 0.25 : 0.3);
    if (e.type === 'circle') {
      const [cx, cy] = e.points[0];
      pdf.circle(px(cx), py(cy), e.radius * k.k, 'FD');
    } else {
      const pts = e.points.map((p) => [px(p[0]), py(p[1])] as [number, number]);
      const segs: number[][] = [];
      for (let i = 1; i < pts.length; i++) segs.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
      pdf.lines(segs, pts[0][0], pts[0][1], [1, 1], 'FD', true);
    }
  }

  for (const e of strokes) {
    const zone = ZONE_MAP[classifyLayer(e.layer)];
    const [sr, sg, sb] = hexToRgb(zone.stroke);
    pdf.setDrawColor(sr, sg, sb);
    pdf.setLineWidth(zone.id === 'fence' ? 0.45 : 0.25);
    if (e.type === 'point') {
      const [cx, cy] = e.points[0];
      const r = Math.max(0.6, 0.05 * k.k);
      pdf.circle(px(cx), py(cy), r, 'S');
    } else if (e.type === 'line') {
      pdf.line(px(e.points[0][0]), py(e.points[0][1]), px(e.points[1][0]), py(e.points[1][1]));
    } else {
      const pts = e.points.map((p) => [px(p[0]), py(p[1])] as [number, number]);
      const segs: number[][] = [];
      for (let i = 1; i < pts.length; i++) segs.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
      pdf.lines(segs, pts[0][0], pts[0][1], [1, 1], 'S', false);
      if (e.closed && pts.length > 2) {
        pdf.line(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1]);
      }
    }
  }

  for (const e of texts) {
    const zone = ZONE_MAP[classifyLayer(e.layer)];
    const [tr, tg, tb] = hexToRgb(zone.stroke);
    pdf.setTextColor(tr, tg, tb);
    const fs = Math.min(10, Math.max(4.5, e.height * k.k * 2.8346));
    pdf.setFontSize(fs);
    const [cx, cy] = e.points[0];
    pdf.text(e.text.slice(0, 60), px(cx), py(cy), { align: 'center', baseline: 'middle', angle: -e.rotation });
  }

  // ---- габаритные размеры (линии с засечками)
  pdf.setDrawColor(24, 24, 27);
  pdf.setTextColor(24, 24, 27);
  pdf.setLineWidth(0.2);
  const dy = py(bbox.minY) + 6;
  pdf.line(px(bbox.minX), dy, px(bbox.maxX), dy);
  pdf.line(px(bbox.minX), dy - 1.5, px(bbox.minX), dy + 1.5);
  pdf.line(px(bbox.maxX), dy - 1.5, px(bbox.maxX), dy + 1.5);
  pdf.setFontSize(7);
  pdf.text(`${(bbox.maxX - bbox.minX).toFixed(2)} м`, (px(bbox.minX) + px(bbox.maxX)) / 2, dy + 3, { align: 'center' });

  const dx = px(bbox.minX) - 6;
  pdf.line(dx, py(bbox.minY), dx, py(bbox.maxY));
  pdf.line(dx - 1.5, py(bbox.minY), dx + 1.5, py(bbox.minY));
  pdf.line(dx - 1.5, py(bbox.maxY), dx + 1.5, py(bbox.maxY));
  pdf.text(`${(bbox.maxY - bbox.minY).toFixed(2)} м`, dx - 3, (py(bbox.minY) + py(bbox.maxY)) / 2, { align: 'center', angle: 90 });

  // ---- легенда
  const zonesPresent = ZONES.filter((z) => z.id !== 'annotation' && visible.some((e) => classifyLayer(e.layer) === z.id));
  pdf.setDrawColor(63, 63, 70);
  pdf.setLineWidth(0.3);
  pdf.rect(LEGEND.x, LEGEND.y, LEGEND.w, LEGEND.h);
  pdf.setFontSize(8);
  pdf.setTextColor(24, 24, 27);
  pdf.text('Условные обозначения', LEGEND.x + 3, LEGEND.y + 5.5);
  const colW = LEGEND.w / 2;
  const zoneAgg = new Map<ZoneId, { count: number; area: number; length: number }>();
  for (const e of visible) {
    const zid = classifyLayer(e.layer);
    const a = zoneAgg.get(zid) ?? { count: 0, area: 0, length: 0 };
    a.count += 1;
    a.area += entityArea(e);
    a.length += e.type === 'line'
      ? Math.hypot(e.points[1][0] - e.points[0][0], e.points[1][1] - e.points[0][1])
      : e.type === 'polyline'
        ? e.points.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - e.points[i][0], p[1] - e.points[i][1]), 0)
        : 0;
    zoneAgg.set(zid, a);
  }

  zonesPresent.slice(0, 12).forEach((z, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const rx = LEGEND.x + 3 + col * colW;
    const ry = LEGEND.y + 9 + row * 7.2;
    const [fr, fg, fb] = hexToRgb(z.fill ?? '#ffffff');
    const [sr, sg, sb] = hexToRgb(z.stroke);
    pdf.setFillColor(fr, fg, fb);
    pdf.setDrawColor(sr, sg, sb);
    pdf.setLineWidth(0.25);
    pdf.rect(rx, ry, 7, 4, z.fill ? 'FD' : 'S');
    const a = zoneAgg.get(z.id) ?? { count: 0, area: 0, length: 0 };
    pdf.setFontSize(6.5);
    pdf.setTextColor(24, 24, 27);
    pdf.text(z.label, rx + 9, ry + 2.8);
    pdf.setTextColor(113, 113, 122);
    const detail = a.area > 0.01 ? `${a.count} шт · ${formatArea(a.area)}` : `${a.count} шт${a.length > 0 ? ` · ${a.length.toFixed(1)} м` : ''}`;
    pdf.text(detail, rx + 9, ry + 6.2);
  });

  // ---- штамп
  pdf.setDrawColor(24, 24, 27);
  pdf.setLineWidth(0.4);
  pdf.rect(STAMP.x, STAMP.y, STAMP.w, STAMP.h);
  pdf.setLineWidth(0.2);
  pdf.line(STAMP.x, STAMP.y + 12, STAMP.x + STAMP.w, STAMP.y + 12);
  pdf.line(STAMP.x, STAMP.y + 24, STAMP.x + STAMP.w, STAMP.y + 24);
  pdf.line(STAMP.x + STAMP.w / 2, STAMP.y + 12, STAMP.x + STAMP.w / 2, STAMP.y + STAMP.h);

  pdf.setFontSize(9.5);
  pdf.setTextColor(24, 24, 27);
  pdf.text(title, STAMP.x + STAMP.w / 2, STAMP.y + 7.5, { align: 'center' });

  pdf.setFontSize(6.5);
  pdf.setTextColor(113, 113, 122);
  pdf.text('Источник', STAMP.x + 3, STAMP.y + 15.5);
  pdf.text('Масштаб', STAMP.x + 3, STAMP.y + 21.5);
  pdf.text('Дата', STAMP.x + STAMP.w / 2 + 3, STAMP.y + 21.5);
  pdf.text('Площадь', STAMP.x + 3, STAMP.y + 27.5);
  pdf.text('Лист', STAMP.x + STAMP.w / 2 + 3, STAMP.y + 27.5);

  pdf.setTextColor(24, 24, 27);
  pdf.setFontSize(7);
  pdf.text(doc.sourceName.slice(0, 30), STAMP.x + 20, STAMP.y + 15.5);
  pdf.text(k.label, STAMP.x + 20, STAMP.y + 21.5);
  pdf.text(date, STAMP.x + STAMP.w / 2 + 14, STAMP.y + 21.5);
  const total = (bbox.maxX - bbox.minX) * (bbox.maxY - bbox.minY);
  pdf.text(formatArea(total), STAMP.x + 20, STAMP.y + 27.5);
  pdf.text('A3 · 1', STAMP.x + STAMP.w / 2 + 14, STAMP.y + 27.5);

  // ---- подпись над планом
  pdf.setFontSize(6);
  pdf.setTextColor(140, 140, 140);
  pdf.text(`Объектов: ${visible.length} · Сетка: ${gstep} м · Координаты в метрах`, PLAN.x, PLAN.y - 1.5);

  const filename = `landscape-plan-${new Date().toISOString().slice(0, 10)}.pdf`;
  const bytes = new Uint8Array(pdf.output('arraybuffer'));
  if (!opts.noSave) {
    pdf.save(filename);
  }
  return { bytes, filename };
}
