// DXF-парсер (ASCII). Поддержка: LINE, LWPOLYLINE, POLYLINE/VERTEX, CIRCLE,
// ARC (аппроксимация), TEXT, MTEXT, POINT, SPLINE, INSERT (встраивание блоков),
// таблица слоёв, единицы чертежа ($INSUNITS).

export type DxfEntityType = 'line' | 'polyline' | 'circle' | 'text' | 'point';

export interface DxfEntity {
  id: number;
  type: DxfEntityType;
  layer: string;
  points: [number, number][];
  closed: boolean;
  radius: number;
  text: string;
  height: number;
  rotation: number;
}

export interface DxfLayerInfo {
  name: string;
  color: number;
}

export interface DxfDocument {
  sourceName: string;
  layers: DxfLayerInfo[];
  entities: DxfEntity[];
  /** Метка единицы измерения после приведения к метрам */
  unitsLabel: string;
  /** true — единицы не были указаны в файле и приняты эвристически */
  unitsAssumed: boolean;
  warnings: string[];
}

interface Pair {
  code: number;
  value: string;
}

interface Group {
  type: string;
  sub: Pair[];
}

interface Ctx {
  blocks: Map<string, DxfEntity[]>;
  warnings: string[];
  nextId: () => number;
  hasBulge: boolean;
  layerColor: Map<string, number>;
}

// ------------------------------------------------------------------ декодер

export function decodeDxf(buffer: ArrayBuffer): { text: string; encoding: string } {
  const bytes = new Uint8Array(buffer);
  if (bytes.length > 20) {
    const head = String.fromCharCode(...Array.from(bytes.slice(0, 20)));
    if (head.startsWith('AutoCAD Binary DXF')) {
      throw new Error(
        'Бинарные DXF не поддерживаются. Пересохраните файл в формате «ASCII DXF» (AutoCAD: SAVEAS → DXF → ASCII).'
      );
    }
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1251').decode(bytes), encoding: 'windows-1251' };
  }
}

// ------------------------------------------------------------------ токенизация

function tokenize(text: string): Pair[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; ) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) {
      i += 1; // рассинхронизация пар — сдвигаемся на строку
      continue;
    }
    pairs.push({ code, value: lines[i + 1] });
    i += 2;
  }
  return pairs;
}

function splitGroups(pairs: Pair[]): Group[] {
  const groups: Group[] = [];
  let cur: Group | null = null;
  for (const p of pairs) {
    if (p.code === 0) {
      cur = { type: p.value.trim().toUpperCase(), sub: [] };
      groups.push(cur);
    } else if (cur) {
      cur.sub.push(p);
    }
  }
  return groups;
}

// ------------------------------------------------------------------ утилиты

function num(sub: Pair[], code: number, fallback = NaN): number {
  const p = sub.find((s) => s.code === code);
  if (!p) return fallback;
  const v = parseFloat(p.value);
  return Number.isFinite(v) ? v : fallback;
}

function int(sub: Pair[], code: number, fallback = 0): number {
  const v = num(sub, code, NaN);
  return Number.isFinite(v) ? Math.round(v) : fallback;
}

function str(sub: Pair[], code: number, fallback = ''): string {
  return (sub.find((s) => s.code === code)?.value ?? fallback).trim();
}

function cleanText(raw: string): string {
  return raw
    .replace(/\\P/g, '\n')
    .replace(/\\f[^;]*;/gi, '')
    .replace(/\\[AHWTQCS][^;]*;/gi, '')
    .replace(/\\[LOKPQ]/g, '')
    .replace(/[{}]/g, '')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[pP]/g, '±')
    .trim();
}

// ------------------------------------------------------------------ объекты

function arcToPoints(cx: number, cy: number, r: number, a1: number, a2: number): [number, number][] {
  if (!(r > 0)) return [];
  if (a2 <= a1) a2 += 360;
  const sweep = Math.min(a2 - a1, 360.0001);
  const steps = Math.min(72, Math.max(8, Math.ceil(sweep / 9)));
  const pts: [number, number][] = [];
  for (let k = 0; k <= steps; k++) {
    const a = ((a1 + (sweep * k) / steps) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

interface InsertTransform {
  ix: number;
  iy: number;
  sx: number;
  sy: number;
  rot: number; // градусы
}

function transformEntity(e: DxfEntity, t: InsertTransform, layerOverride: string, id: number): DxfEntity {
  const th = (t.rot * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const tp = (p: [number, number]): [number, number] => [
    t.ix + (p[0] * cos - p[1] * sin) * t.sx,
    t.iy + (p[0] * sin + p[1] * cos) * t.sy,
  ];
  const s = Math.abs((t.sx + t.sy) / 2) || 1;
  return {
    ...e,
    id,
    layer: e.layer === '0' ? layerOverride : e.layer,
    points: e.points.map(tp),
    radius: e.radius * s,
    height: e.height * s,
    rotation: e.rotation + t.rot,
  };
}

function buildEntity(type: string, sub: Pair[], ctx: Ctx, out: DxfEntity[]): DxfEntity | null {
  const layer = str(sub, 8, '0') || '0';
  const base = {
    layer,
    closed: false,
    radius: 0,
    text: '',
    height: 0,
    rotation: 0,
  };

  switch (type) {
    case 'LINE': {
      const x1 = num(sub, 10);
      const y1 = num(sub, 20);
      const x2 = num(sub, 11);
      const y2 = num(sub, 21);
      if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
      return { ...base, id: ctx.nextId(), type: 'line', points: [[x1, y1], [x2, y2]] };
    }

    case 'LWPOLYLINE': {
      const pts: [number, number][] = [];
      let x = NaN;
      let bulge = false;
      for (const p of sub) {
        if (p.code === 10) x = parseFloat(p.value);
        else if (p.code === 20 && Number.isFinite(x)) {
          pts.push([x, parseFloat(p.value)]);
          x = NaN;
        } else if (p.code === 42) bulge = true;
      }
      if (bulge) ctx.hasBulge = true;
      if (pts.length < 2) return null;
      return { ...base, id: ctx.nextId(), type: 'polyline', points: pts, closed: (int(sub, 70) & 1) === 1 };
    }

    case 'CIRCLE': {
      const cx = num(sub, 10);
      const cy = num(sub, 20);
      const r = num(sub, 40);
      if (![cx, cy, r].every(Number.isFinite) || r <= 0) return null;
      return { ...base, id: ctx.nextId(), type: 'circle', points: [[cx, cy]], radius: r };
    }

    case 'ARC': {
      const cx = num(sub, 10);
      const cy = num(sub, 20);
      const r = num(sub, 40);
      const a1 = num(sub, 50, 0);
      const a2 = num(sub, 51, 0);
      if (![cx, cy, r].every(Number.isFinite)) return null;
      const pts = arcToPoints(cx, cy, r, a1, a2);
      if (pts.length < 2) return null;
      return { ...base, id: ctx.nextId(), type: 'polyline', points: pts };
    }

    case 'TEXT': {
      const t = cleanText(str(sub, 1));
      const x = num(sub, 10);
      const y = num(sub, 20);
      const h = num(sub, 40, 0.25);
      if (!t || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { ...base, id: ctx.nextId(), type: 'text', points: [[x, y]], text: t, height: Math.max(h, 0.01), rotation: num(sub, 50, 0) };
    }

    case 'MTEXT': {
      let t = '';
      for (const p of sub) if (p.code === 3) t += p.value;
      t += str(sub, 1);
      t = cleanText(t);
      const x = num(sub, 10);
      const y = num(sub, 20);
      const h = num(sub, 40, 0.25);
      if (!t || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { ...base, id: ctx.nextId(), type: 'text', points: [[x, y]], text: t, height: Math.max(h, 0.01), rotation: num(sub, 50, 0) };
    }

    case 'POINT': {
      const x = num(sub, 10);
      const y = num(sub, 20);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { ...base, id: ctx.nextId(), type: 'point', points: [[x, y]] };
    }

    case 'SPLINE': {
      const ctrl: [number, number][] = [];
      const fit: [number, number][] = [];
      let cx = NaN;
      let fx = NaN;
      for (const p of sub) {
        if (p.code === 10) cx = parseFloat(p.value);
        else if (p.code === 20 && Number.isFinite(cx)) {
          ctrl.push([cx, parseFloat(p.value)]);
          cx = NaN;
        } else if (p.code === 11) fx = parseFloat(p.value);
        else if (p.code === 21 && Number.isFinite(fx)) {
          fit.push([fx, parseFloat(p.value)]);
          fx = NaN;
        }
      }
      const pts = fit.length >= 2 ? fit : ctrl;
      if (pts.length < 2) return null;
      return { ...base, id: ctx.nextId(), type: 'polyline', points: pts, closed: (int(sub, 70) & 1) === 1 };
    }

    case 'INSERT': {
      const name = str(sub, 2).toUpperCase();
      const ix = num(sub, 10, 0);
      const iy = num(sub, 20, 0);
      const sx = num(sub, 41, 1) || 1;
      const sy = num(sub, 42, 1) || 1;
      const rot = num(sub, 50, 0);
      const block = ctx.blocks.get(name);
      if (!block) {
        ctx.warnings.push(`Блок «${name}» не найден — объект INSERT пропущен.`);
        return null;
      }
      const t: InsertTransform = { ix, iy, sx, sy, rot };
      for (const be of block) {
        out.push(transformEntity(be, t, layer, ctx.nextId()));
      }
      return null;
    }

    default:
      return null;
  }
}

// ------------------------------------------------------------------ секции

function parseHeader(pairs: Pair[]): number {
  for (let i = 0; i < pairs.length - 1; i++) {
    if (pairs[i].code === 9 && pairs[i].value.trim() === '$INSUNITS') {
      if (pairs[i + 1].code === 70) {
        const v = parseInt(pairs[i + 1].value, 10);
        if (Number.isFinite(v)) return v;
      }
    }
  }
  return -1;
}

function parseTables(pairs: Pair[], layerColor: Map<string, number>): DxfLayerInfo[] {
  const layers: DxfLayerInfo[] = [];
  for (const g of splitGroups(pairs)) {
    if (g.type !== 'LAYER') continue;
    const name = str(g.sub, 2);
    if (!name) continue;
    const color = Math.abs(int(g.sub, 62, 7)) || 7;
    layers.push({ name, color });
    layerColor.set(name.toLowerCase(), color);
  }
  return layers;
}

function parseBlocks(pairs: Pair[], ctx: Ctx): void {
  let current: { name: string; entities: DxfEntity[] } | null = null;
  for (const g of splitGroups(pairs)) {
    if (g.type === 'BLOCK') {
      current = { name: str(g.sub, 2).toUpperCase(), entities: [] };
    } else if (g.type === 'ENDBLK') {
      if (current && current.name) ctx.blocks.set(current.name, current.entities);
      current = null;
    } else if (current) {
      if (g.type === 'POLYLINE') {
        current.entities.push(...buildPolyline([g], ctx));
      } else {
        const e = buildEntity(g.type, g.sub, ctx, current.entities);
        if (e) current.entities.push(e);
      }
    }
  }
}

/** POLYLINE + следующие VERTEX до SEQEND. На вход — очередь групп, начиная с POLYLINE. */
function buildPolyline(queue: Group[], ctx: Ctx): DxfEntity[] {
  const result: DxfEntity[] = [];
  const head = queue[0];
  if (!head || head.type !== 'POLYLINE') return result;
  const layer = str(head.sub, 8, '0') || '0';
  const closed = (int(head.sub, 70) & 1) === 1;
  const pts: [number, number][] = [];
  for (const g of queue.slice(1)) {
    if (g.type === 'SEQEND') break;
    if (g.type !== 'VERTEX') continue;
    const x = num(g.sub, 10);
    const y = num(g.sub, 20);
    if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
  }
  if (pts.length >= 2) {
    result.push({ id: ctx.nextId(), type: 'polyline', layer, points: pts, closed, radius: 0, text: '', height: 0, rotation: 0 });
  }
  return result;
}

function parseEntities(pairs: Pair[], ctx: Ctx): DxfEntity[] {
  const out: DxfEntity[] = [];
  const groups = splitGroups(pairs);
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (g.type === 'POLYLINE') {
      const queue: Group[] = [g];
      let j = i + 1;
      while (j < groups.length && groups[j].type !== 'SEQEND') {
        queue.push(groups[j]);
        j++;
      }
      out.push(...buildPolyline(queue, ctx));
      i = j; // продолжим после SEQEND
      continue;
    }
    const e = buildEntity(g.type, g.sub, ctx, out);
    if (e) out.push(e);
  }
  return out;
}

// ------------------------------------------------------------------ главный вход

const UNIT_TABLE: Record<number, { factor: number; label: string }> = {
  1: { factor: 0.0254, label: 'дюймы' },
  2: { factor: 0.3048, label: 'футы' },
  3: { factor: 1609.344, label: 'мили' },
  4: { factor: 0.001, label: 'мм' },
  5: { factor: 0.01, label: 'см' },
  6: { factor: 1, label: 'м' },
  7: { factor: 1000, label: 'км' },
};

export function parseDxf(text: string, sourceName: string): DxfDocument {
  const pairs = tokenize(text);
  const ctx: Ctx = {
    blocks: new Map(),
    warnings: [],
    layerColor: new Map(),
    hasBulge: false,
    nextId: (() => {
      let n = 0;
      return () => ++n;
    })(),
  };

  const layers: DxfLayerInfo[] = [];
  let entities: DxfEntity[] = [];
  let insunits = -1;

  let i = 0;
  const n = pairs.length;
  while (i < n) {
    const p = pairs[i];
    if (p.code === 0 && p.value.trim() === 'SECTION') {
      const name = pairs[i + 1]?.code === 2 ? pairs[i + 1].value.trim().toUpperCase() : '';
      let j = i + 2;
      while (j < n && !(pairs[j].code === 0 && pairs[j].value.trim() === 'ENDSEC')) j++;
      const sectionPairs = pairs.slice(i + 2, j);
      if (name === 'HEADER') insunits = parseHeader(sectionPairs);
      else if (name === 'TABLES') layers.push(...parseTables(sectionPairs, ctx.layerColor));
      else if (name === 'BLOCKS') parseBlocks(sectionPairs, ctx);
      else if (name === 'ENTITIES') entities = parseEntities(sectionPairs, ctx);
      i = j + 1;
    } else {
      i++;
    }
  }

  if (entities.length === 0) {
    throw new Error('В файле не найдено ни одного объекта (секция ENTITIES пуста). Проверьте, что это DXF-чертёж.');
  }

  // --- единицы измерения
  let factor = 1;
  let unitsLabel = 'м';
  let unitsAssumed = true;
  const known = insunits >= 0 ? UNIT_TABLE[insunits] : undefined;
  if (known) {
    factor = known.factor;
    unitsLabel = known.label === 'м' ? 'м' : `${known.label} → м`;
    unitsAssumed = false;
  } else {
    // эвристика: очень большие габариты характерны для миллиметровых чертежей
    let maxC = 0;
    for (const e of entities) {
      for (const [x, y] of e.points) maxC = Math.max(maxC, Math.abs(x), Math.abs(y));
      maxC = Math.max(maxC, Math.abs(e.radius));
    }
    if (maxC > 2000) {
      factor = 0.001;
      unitsLabel = 'мм → м';
      ctx.warnings.push('Единицы не указаны в файле; по габаритам чертёж распознан как миллиметровый (пересчёт в метры).');
      unitsAssumed = false;
    } else {
      ctx.warnings.push('Единицы измерения не указаны в файле — приняты метры.');
    }
  }

  if (factor !== 1) {
    entities = entities.map((e) => ({
      ...e,
      points: e.points.map(([x, y]): [number, number] => [x * factor, y * factor]),
      radius: e.radius * factor,
      height: e.height * factor,
    }));
  }

  if (ctx.hasBulge) {
    ctx.warnings.push('Дуги в полилиниях (bulge) аппроксимированы отрезками.');
  }

  // отсев вырожденных
  entities = entities.filter((e) => {
    if (e.type === 'circle') return e.radius > 0;
    if (e.type === 'text') return e.text.length > 0;
    return e.points.length >= 2 || e.type === 'point';
  });

  return {
    sourceName,
    layers,
    entities,
    unitsLabel,
    unitsAssumed,
    warnings: ctx.warnings.slice(0, 6),
  };
}
