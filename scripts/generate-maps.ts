// Генерация готовых файлов ландшафтных карт для скачивания:
//  1) Демо-участок.dxf — исходный DXF-файл
//  2) Ландшафтный план (PDF A3) — через тот же движок, что в дашборде
//  3) Ландшафтная карта (SVG, вектор) — CAD-минимализм с сеткой и легендой
//  4) HTML-обёртка для последующего скриншота в PNG
// Запуск: bun scripts/generate-maps.ts

import { generateDemoDxf } from '../src/lib/dxf/demo';
import { parseDxf } from '../src/lib/dxf/parser';
import { classifyLayer, ZONE_MAP, ZONES, type ZoneDef, type ZoneId } from '../src/lib/dxf/classify';
import type { DxfDocument, DxfEntity } from '../src/lib/dxf/parser';
import { bboxOfEntities, summarize, formatArea, entityLength, entityArea, type PlotSummary } from '../src/lib/geometry';
import { exportPlanPdf } from '../src/lib/pdf-export';
import { mkdirSync } from 'node:fs';

const OUT = '/home/z/my-project/download';
const RENDER = '/home/z/my-project/scripts/out';
mkdirSync(OUT, { recursive: true });
mkdirSync(RENDER, { recursive: true });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (v: number) => v.toFixed(1).replace(/\.0$/, '');

// ---------------------------------------------------------------- документ
const dxfText = generateDemoDxf();
await Bun.write(`${OUT}/Демо-участок_20x30.dxf`, dxfText);
const doc: DxfDocument = parseDxf(dxfText, 'демо-участок-20x30.dxf');
const summary: PlotSummary = summarize(doc);
console.log(`DXF: ${doc.entities.length} объектов, слоёв: ${doc.layers.length}`);

// ---------------------------------------------------------------- PDF (A3)
const fontB64 = Buffer.from(await Bun.file('/home/z/my-project/public/fonts/DejaVuSans.ttf').arrayBuffer()).toString('base64');
const { bytes: pdfBytes } = await exportPlanPdf(doc, { fontB64, noSave: true });
await Bun.write(`${OUT}/Ландшафтный_план_участка_А3.pdf`, pdfBytes);
console.log('PDF готов');

// ---------------------------------------------------------------- SVG-карта
const W = 1680;
const H = 1120;
const FIELD = { x: 64, y: 112, w: 576, h: 928 }; // поле плана слева
const LX = 720; // левый край колонки легенды
const LR = 1648; // правый край

const bbox = bboxOfEntities(doc.entities)!;
const k = Math.floor(Math.min(FIELD.w / (bbox.maxX - bbox.minX), FIELD.h / (bbox.maxY - bbox.minY)));
const pw = (bbox.maxX - bbox.minX) * k;
const ph = (bbox.maxY - bbox.minY) * k;
const ox = FIELD.x + (FIELD.w - pw) / 2 - bbox.minX * k;
const oy = FIELD.y + (FIELD.h - ph) / 2 + bbox.maxY * k;
const px = (x: number) => ox + x * k;
const py = (y: number) => oy - y * k;

const parts: string[] = [];
const push = (s: string) => parts.push('  ' + s);

// фон и рамка листа
push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
push(`<rect x="16" y="16" width="${W - 32}" height="${H - 32}" fill="none" stroke="#18181b" stroke-width="2"/>`);

// заголовок
push(`<text x="${W / 2}" y="56" text-anchor="middle" font-family="DejaVu Sans, Noto Sans SC, sans-serif" font-size="24" font-weight="bold" fill="#18181b">ЛАНДШАФТНАЯ КАРТА УЧАСТКА</text>`);
push(`<text x="${W / 2}" y="82" text-anchor="middle" font-family="DejaVu Sans, Noto Sans SC, sans-serif" font-size="13" fill="#71717a">демо-участок 20×30 м · конвейер DXF → зоны → карта · ${doc.entities.length} объектов</text>`);

// ---- сетка (шаг 1 м, каждые 5 м — жирнее)
const gx0 = Math.floor(bbox.minX);
const gx1 = Math.ceil(bbox.maxX);
const gy0 = Math.floor(bbox.minY);
const gy1 = Math.ceil(bbox.maxY);
for (let gx = gx0; gx <= gx1; gx++) {
  if (px(gx) < FIELD.x - 1 || px(gx) > FIELD.x + FIELD.w + 1) continue;
  const major = gx % 5 === 0;
  push(`<line x1="${px(gx).toFixed(1)}" y1="${FIELD.y}" x2="${px(gx).toFixed(1)}" y2="${FIELD.y + FIELD.h}" stroke="${major ? '#e4e4e7' : '#f8f8f8'}" stroke-width="${major ? 1.2 : 0.6}"/>`);
}
for (let gy = gy0; gy <= gy1; gy++) {
  if (py(gy) < FIELD.y - 1 || py(gy) > FIELD.y + FIELD.h + 1) continue;
  const major = gy % 5 === 0;
  push(`<line x1="${FIELD.x}" y1="${py(gy).toFixed(1)}" x2="${FIELD.x + FIELD.w}" y2="${py(gy).toFixed(1)}" stroke="${major ? '#e4e4e7' : '#f8f8f8'}" stroke-width="${major ? 1.2 : 0.6}"/>`);
}
// подписи координат (моноширинные)
for (let gx = 0; gx <= gx1; gx += 5) {
  push(`<text x="${px(gx).toFixed(1)}" y="${FIELD.y + FIELD.h + 26}" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="12" fill="#71717a">${gx}</text>`);
}
push(`<text x="${FIELD.x + FIELD.w / 2}" y="${FIELD.y + FIELD.h + 48}" text-anchor="middle" font-family="DejaVu Sans, Noto Sans SC, sans-serif" font-size="11" fill="#a1a1aa">X, м</text>`);
for (let gy = 0; gy <= gy1; gy += 5) {
  push(`<text x="${FIELD.x - 30}" y="${(py(gy) + 4).toFixed(1)}" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="12" fill="#71717a">${gy}</text>`);
}
push(`<text x="${FIELD.x - 58}" y="${FIELD.y + FIELD.h / 2}" text-anchor="middle" font-family="DejaVu Sans, Noto Sans SC, sans-serif" font-size="11" fill="#a1a1aa" transform="rotate(-90 ${FIELD.x - 58} ${FIELD.y + FIELD.h / 2})">Y, м</text>`);

// ---- объекты: заливки → линии → тексты
const zoneOf = (e: DxfEntity): ZoneDef => ZONE_MAP[classifyLayer(e.layer)];
const fills: DxfEntity[] = [];
const strokes: DxfEntity[] = [];
const texts: DxfEntity[] = [];
for (const e of doc.entities) {
  const z = zoneOf(e);
  if (e.type === 'text') texts.push(e);
  else if (z.fill && (e.type === 'circle' || (e.type === 'polyline' && e.closed))) fills.push(e);
  else strokes.push(e);
}
for (const e of fills) {
  const z = zoneOf(e);
  if (e.type === 'circle') {
    const [cx, cy] = e.points[0];
    push(`<circle cx="${px(cx).toFixed(1)}" cy="${py(cy).toFixed(1)}" r="${(e.radius * k).toFixed(1)}" fill="${z.fill}" stroke="${z.stroke}" stroke-width="1.6"/>`);
  } else {
    const pts = e.points.map((p) => `${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(' ');
    const closed = e.closed ? ' Z' : '';
    push(`<path d="M ${pts}${closed}" fill="${z.fill}" stroke="${z.stroke}" stroke-width="1.6" stroke-linejoin="round"/>`);
  }
}
for (const e of strokes) {
  const z = zoneOf(e);
  const sw = z.id === 'fence' ? 3 : z.id === 'annotation' ? 1.1 : 1.4;
  const dash = z.dash ? ` stroke-dasharray="${z.dash}"` : '';
  const common = `fill="none" stroke="${z.stroke}" stroke-width="${sw}"${dash} stroke-linecap="round" stroke-linejoin="round"`;
  if (e.type === 'circle') {
    const [cx, cy] = e.points[0];
    push(`<circle cx="${px(cx).toFixed(1)}" cy="${py(cy).toFixed(1)}" r="${(e.radius * k).toFixed(1)}" ${common}/>`);
  } else if (e.type === 'line') {
    push(`<line x1="${px(e.points[0][0]).toFixed(1)}" y1="${py(e.points[0][1]).toFixed(1)}" x2="${px(e.points[1][0]).toFixed(1)}" y2="${py(e.points[1][1]).toFixed(1)}" ${common}/>`);
  } else {
    const pts = e.points.map((p) => `${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(' L ');
    const closed = e.closed ? ' Z' : '';
    push(`<path d="M ${pts}${closed}" ${common}/>`);
  }
}
for (const e of texts) {
  const z = zoneOf(e);
  const [cx, cy] = e.points[0];
  const fs = Math.max(10, e.height * k);
  const rot = e.rotation ? ` transform="rotate(${-e.rotation} ${px(cx).toFixed(1)} ${py(cy).toFixed(1)})"` : '';
  push(`<text x="${px(cx).toFixed(1)}" y="${(py(cy) + fs * 0.36).toFixed(1)}" text-anchor="middle" font-family="DejaVu Sans, Noto Sans SC, sans-serif" font-size="${fs.toFixed(1)}" fill="${z.stroke}"${rot}>${esc(e.text)}</text>`);
}

// ---- легенда
push(`<line x1="${LX}" y1="118" x2="${LR}" y2="118" stroke="#e4e4e7" stroke-width="1"/>`);
push(`<text x="${LX}" y="152" font-family="DejaVu Sans, Noto Sans SC, sans-serif" font-size="16" font-weight="bold" fill="#18181b">Условные обозначения</text>`);
const legendZones = ZONES.filter((z) => z.id !== 'annotation' && summary.zoneStats.has(z.id));
let ly = 186;
for (const z of legendZones) {
  const st = summary.zoneStats.get(z.id)!;
  const hasFill = !!z.fill;
  push(`<rect x="${LX}" y="${ly - 13}" width="34" height="20" fill="${z.fill ?? '#ffffff'}" stroke="${z.stroke}" stroke-width="1.4" ${z.dash ? `stroke-dasharray="${z.dash}"` : ''}/>`);
  push(`<text x="${LX + 46}" y="${ly + 1}" font-family="DejaVu Sans, Noto Sans SC, sans-serif" font-size="14" font-weight="bold" fill="#18181b">${esc(z.label)}</text>`);
  const area = st.area;
  const detail = area > 0.01 ? `${st.count} шт · ${formatArea(area)}` : `${st.count} шт · ${fmt(st.length)} м`;
  push(`<text x="${LX + 46}" y="${ly + 20}" font-family="DejaVu Sans Mono, monospace" font-size="11.5" fill="#71717a">${esc(detail)}</text>`);
  ly += 44;
}

// ---- сводка
ly += 18;
push(`<line x1="${LX}" y1="${ly}" x2="${LR}" y2="${ly}" stroke="#e4e4e7" stroke-width="1"/>`);
ly += 34;
push(`<text x="${LX}" y="${ly}" font-family="DejaVu Sans, Noto Sans SC, sans-serif" font-size="16" font-weight="bold" fill="#18181b">Сводка участка</text>`);
ly += 10;
const rows: [string, string][] = [
  ['Габариты', `${summary.width.toFixed(2)} × ${summary.height.toFixed(2)} м`],
  ['Площадь участка', formatArea(summary.totalArea)],
  ['Озеленение (газон, деревья, сад)', `${formatArea(summary.greenArea)} · ${Math.round(summary.greenRatio * 100)}%`],
  ['Объектов / слоёв DXF', `${summary.entityCount} / ${doc.layers.length}`],
];
for (const [lab, val] of rows) {
  ly += 32;
  push(`<text x="${LX}" y="${ly}" font-family="DejaVu Sans, Noto Sans SC, sans-serif" font-size="13" fill="#71717a">${esc(lab)}</text>`);
  push(`<text x="${LR}" y="${ly}" text-anchor="end" font-family="DejaVu Sans Mono, monospace" font-size="13" fill="#18181b">${esc(val)}</text>`);
}

// ---- штамп
const sy = Math.max(ly + 36, 860);
push(`<rect x="${LX}" y="${sy}" width="${LR - LX}" height="${1060 - sy}" fill="#ffffff" stroke="#18181b" stroke-width="2"/>`);
push(`<line x1="${LX}" y1="${sy + 56}" x2="${LR}" y2="${sy + 56}" stroke="#e4e4e7" stroke-width="1"/>`);
push(`<text x="${(LX + LR) / 2}" y="${sy + 36}" text-anchor="middle" font-family="DejaVu Sans, Noto Sans SC, sans-serif" font-size="20" font-weight="bold" fill="#18181b">ЛАНДШАФТНАЯ КАРТА УЧАСТКА</text>`);
push(`<text x="${(LX + LR) / 2}" y="${sy + 50}" text-anchor="middle" font-family="DejaVu Sans, Noto Sans SC, sans-serif" font-size="12" fill="#71717a">источник: демо-участок-20x30.dxf · экспорт ${new Date().toLocaleDateString('ru-RU')}</text>`);
const stampRows: [string, string][] = [
  ['Масштаб сетки', '1 м (каждые 5 м выделены)'],
  ['Площадь', formatArea(summary.totalArea)],
  ['Озеленение', `${Math.round(summary.greenRatio * 100)}%`],
  ['Форматы', 'SVG · PNG · PDF'],
];
let syy = sy + 56;
for (let i = 0; i < stampRows.length; i += 2) {
  syy += 34;
  push(`<text x="${LX + 20}" y="${syy}" font-family="DejaVu Sans, Noto Sans SC, sans-serif" font-size="12" fill="#71717a">${esc(stampRows[i][0])}</text>`);
  push(`<text x="${LX + 200}" y="${syy}" font-family="DejaVu Sans Mono, monospace" font-size="12.5" fill="#18181b">${esc(stampRows[i][1])}</text>`);
  if (stampRows[i + 1]) {
    push(`<text x="${(LX + LR) / 2 + 20}" y="${syy}" font-family="DejaVu Sans, Noto Sans SC, sans-serif" font-size="12" fill="#71717a">${esc(stampRows[i + 1][0])}</text>`);
    push(`<text x="${LR - 20}" y="${syy}" text-anchor="end" font-family="DejaVu Sans Mono, monospace" font-size="12.5" fill="#18181b">${esc(stampRows[i + 1][1])}</text>`);
  }
}

// ---- подвал
push(`<text x="40" y="${H - 26}" font-family="DejaVu Sans Mono, monospace" font-size="11" fill="#a1a1aa">Сетка 1 м · координаты в метрах · CAD-экспорт</text>`);
push(`<text x="${W - 40}" y="${H - 26}" text-anchor="end" font-family="DejaVu Sans Mono, monospace" font-size="11" fill="#a1a1aa">сгенерировано из DXF · ${new Date().toLocaleDateString('ru-RU')}</text>`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${parts.join('\n')}\n</svg>`;
await Bun.write(`${OUT}/Ландшафтная_карта_участка.svg`, svg);

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Карта</title><style>*{margin:0;padding:0}body{background:#fff}</style></head><body>${svg}</body></html>`;
await Bun.write(`${RENDER}/map.html`, html);
console.log('SVG + HTML готовы');
console.log(`Зоны: ${legendZones.map((z) => z.label).join('; ')}`);
