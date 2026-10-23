'use client';

// Интерактивная карта участка (SVG): CAD-сетка, зум/пан, перекрестие,
// подсветка объектов при наведении, инспектор выбранного объекта.
// Авто-вписывание реализовано как «отложенное состояние»: пока manualView === null,
// вид пересчитывается из габаритов (без эффектов с setState).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { DxfDocument, DxfEntity } from '@/lib/dxf/parser';
import { classifyLayer, ZONE_MAP, type ZoneId } from '@/lib/dxf/classify';
import { bboxOfEntities, entityArea, entityLength, formatArea, formatLen } from '@/lib/geometry';
import { Button } from '@/components/ui/button';
import { Maximize2, Minus, Plus, Grid3x3, FileDown } from 'lucide-react';

interface MapCanvasProps {
  doc: DxfDocument;
  hiddenZones: Set<ZoneId>;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onExportPdf: () => void;
  exporting: boolean;
}

interface View {
  scale: number; // px на метр
  ox: number;
  oy: number;
}

const TYPE_LABEL: Record<string, string> = {
  line: 'Отрезок',
  polyline: 'Полилиния',
  circle: 'Окружность',
  text: 'Текст',
  point: 'Точка',
};

function fitView(bbox: { minX: number; minY: number; maxX: number; maxY: number } | null, w: number, h: number): View {
  if (!bbox) return { scale: 20, ox: w / 2, oy: h / 2 };
  const bw = Math.max(bbox.maxX - bbox.minX, 0.1);
  const bh = Math.max(bbox.maxY - bbox.minY, 0.1);
  const scale = Math.max(Math.min((w * 0.86) / bw, (h * 0.86) / bh), 0.5);
  return {
    scale,
    ox: (w - bw * scale) / 2 - bbox.minX * scale,
    oy: (h - bh * scale) / 2,
  };
}

export function MapCanvas({ doc, hiddenZones, selectedId, onSelect, onExportPdf, exporting }: MapCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [manualView, setManualView] = useState<View | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [cursor, setCursor] = useState<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const [hover, setHover] = useState<{ e: DxfEntity; sx: number; sy: number } | null>(null);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const bbox = useMemo(() => bboxOfEntities(doc.entities), [doc]);
  const autoView = useMemo(() => fitView(bbox, size.w, size.h), [bbox, size.w, size.h]);
  const view = manualView ?? autoView;

  // актуальный вид для «замороженных» слушателей (колесо мыши)
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // размеры контейнера
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.max(r.width, 100), h: Math.max(r.height, 100) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // зум колесом (не-пассивный слушатель)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      const v = viewRef.current;
      const f = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
      const scale = Math.min(Math.max(v.scale * f, 0.5), 4000);
      setManualView({
        scale,
        ox: mx - ((mx - v.ox) * scale) / v.scale,
        oy: my - ((my - v.oy) * scale) / v.scale,
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toModel = (sx0: number, sy0: number): [number, number] => {
    const maxY = bbox ? bbox.maxY : 0;
    return [(sx0 - view.ox) / view.scale, maxY - (sy0 - view.oy) / view.scale];
  };

  const sx = (x: number) => view.ox + x * view.scale;
  const sy = (y: number) => view.oy + (bbox ? bbox.maxY - y : -y) * view.scale;

  const zoomBy = (f: number) => {
    const cx = size.w / 2;
    const cy = size.h / 2;
    const v = viewRef.current;
    const scale = Math.min(Math.max(v.scale * f, 0.5), 4000);
    setManualView({
      scale,
      ox: cx - ((cx - v.ox) * scale) / v.scale,
      oy: cy - ((cy - v.oy) * scale) / v.scale,
    });
  };

  const handlePointerDown = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (ev.button !== 0) return;
    drag.current = { px: ev.clientX, py: ev.clientY, ox: view.ox, oy: view.oy };
    svgRef.current?.setPointerCapture?.(ev.pointerId);
  };

  const handlePointerMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    if (drag.current) {
      const d = drag.current;
      setManualView((v) => {
        const cur = v ?? viewRef.current;
        return { ...cur, ox: d.ox + (ev.clientX - d.px), oy: d.oy + (ev.clientY - d.py) };
      });
    }
    const [mxm, mym] = toModel(mx, my);
    setCursor({ x: mxm, y: mym, sx: mx, sy: my });
  };

  const endDrag = () => {
    drag.current = null;
  };

  // ---- видимые объекты (порядок отрисовки не зависит от вида)
  const visible = useMemo(() => {
    const vis = doc.entities.filter((e) => !hiddenZones.has(classifyLayer(e.layer)));
    const order = (e: DxfEntity): number => {
      const z = classifyLayer(e.layer);
      if (e.type === 'text') return 3;
      if (z === 'fence' || z === 'annotation') return 2;
      if (e.type === 'circle' || (e.type === 'polyline' && e.closed)) return 0;
      return 1;
    };
    return [...vis].sort((a, b) => order(a) - order(b));
  }, [doc, hiddenZones]);

  const selected = useMemo(() => visible.find((e) => e.id === selectedId) ?? null, [visible, selectedId]);

  // ---- сетка (пересчёт при смене вида — дёшево)
  const grid = useMemo(() => {
    if (!showGrid || !bbox) return null;
    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];
    const step = steps.find((s) => s * view.scale >= 44) ?? 100;
    const gx0 = Math.floor(bbox.minX / step) * step;
    const gy0 = Math.floor(bbox.minY / step) * step;
    const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean; label?: string }[] = [];
    for (let gx = gx0; gx <= bbox.maxX; gx += step) {
      const major = Math.abs(gx / step) % 5 < 1e-9;
      lines.push({
        x1: view.ox + gx * view.scale,
        y1: 0,
        x2: view.ox + gx * view.scale,
        y2: size.h,
        major,
        label: major ? gx.toFixed(step < 1 ? 1 : 0) : undefined,
      });
    }
    for (let gy = gy0; gy <= bbox.maxY; gy += step) {
      const major = Math.abs(gy / step) % 5 < 1e-9;
      lines.push({
        x1: 0,
        y1: view.oy + (bbox.maxY - gy) * view.scale,
        x2: size.w,
        y2: view.oy + (bbox.maxY - gy) * view.scale,
        major,
        label: major ? gy.toFixed(step < 1 ? 1 : 0) : undefined,
      });
    }
    return { lines, step };
  }, [showGrid, bbox, view, size.w, size.h]);

  const entityPath = (e: DxfEntity): string => {
    if (e.type === 'circle') return '';
    const d = e.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`).join(' ');
    return e.closed && e.points.length > 2 ? `${d} Z` : d;
  };

  const hoverAt = (e: DxfEntity, ev: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ e, sx: ev.clientX - rect.left, sy: ev.clientY - rect.top });
  };

  return (
    <div className="flex h-full min-h-[420px] flex-col rounded-sm border border-zinc-300 bg-white">
      {/* панель инструментов */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-200 px-2 py-1.5">
        <Button variant="outline" size="sm" className="h-8 gap-1 border-zinc-300 font-mono text-xs" onClick={() => zoomBy(1.3)} title="Приблизить">
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1 border-zinc-300 font-mono text-xs" onClick={() => zoomBy(1 / 1.3)} title="Отдалить">
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 border-zinc-300 font-mono text-xs"
          onClick={() => setManualView(null)}
          title="Вписать в окно"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant={showGrid ? 'secondary' : 'outline'}
          size="sm"
          className="h-8 gap-1 border-zinc-300 font-mono text-xs"
          onClick={() => setShowGrid((s) => !s)}
          title="Сетка"
        >
          <Grid3x3 className="h-3.5 w-3.5" />
          {showGrid && grid ? `${grid.step < 1 ? grid.step.toFixed(1) : grid.step} м` : ''}
        </Button>
        <div className="mx-1 h-5 w-px bg-zinc-200" />
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-zinc-300 font-mono text-xs"
          onClick={onExportPdf}
          disabled={exporting}
        >
          <FileDown className="h-3.5 w-3.5" />
          {exporting ? 'Формирование…' : 'Экспорт PDF (A3)'}
        </Button>
        <span className="ml-auto hidden font-mono text-[10px] text-zinc-400 sm:block">колесо — зум · перетаскивание — панорама</span>
      </div>

      {/* поле карты */}
      <div ref={wrapRef} className="relative flex-1 overflow-hidden bg-white">
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${size.w} ${size.h}`}
          className="block cursor-crosshair select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerLeave={() => {
            endDrag();
            setCursor(null);
            setHover(null);
          }}
          onClick={() => onSelect(null)}
          role="img"
          aria-label="Схема участка"
        >
          {/* сетка */}
          {grid && (
            <g>
              {grid.lines.map((l, i) => (
                <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.major ? '#e4e4e7' : '#f4f4f5'} strokeWidth={l.major ? 1 : 0.75} />
              ))}
              {grid.lines
                .filter((l) => l.label !== undefined)
                .map((l, i) => {
                  const isVertical = l.x1 === l.x2;
                  return isVertical ? (
                    <text
                      key={`t${i}`}
                      x={l.x1 + 3}
                      y={Math.min(Math.max(l.y1 + 12, 12), size.h - 4)}
                      className="fill-zinc-400"
                      fontSize={9}
                      fontFamily="var(--font-geist-mono), monospace"
                    >
                      {l.label}
                    </text>
                  ) : (
                    <text
                      key={`t${i}`}
                      x={Math.min(Math.max(l.x1 + 4, 4), size.w - 30)}
                      y={l.y1 - 3}
                      className="fill-zinc-400"
                      fontSize={9}
                      fontFamily="var(--font-geist-mono), monospace"
                    >
                      {l.label}
                    </text>
                  );
                })}
            </g>
          )}

          {/* перекрестие */}
          {cursor && (
            <g>
              <line x1={cursor.sx} y1={0} x2={cursor.sx} y2={size.h} stroke="#d4d4d8" strokeWidth={0.75} strokeDasharray="4 4" />
              <line x1={0} y1={cursor.sy} x2={size.w} y2={cursor.sy} stroke="#d4d4d8" strokeWidth={0.75} strokeDasharray="4 4" />
            </g>
          )}

          {/* объекты */}
          <g>
            {visible.map((e) => {
              const zone = ZONE_MAP[classifyLayer(e.layer)];
              const isSel = e.id === selectedId;
              const isHov = hover?.e.id === e.id;
              if (e.type === 'circle') {
                const [cx, cy] = e.points[0];
                return (
                  <circle
                    key={e.id}
                    cx={sx(cx)}
                    cy={sy(cy)}
                    r={Math.max(e.radius * view.scale, 1.2)}
                    fill={zone.fill ?? 'none'}
                    fillOpacity={zone.fill ? 0.55 : 0}
                    stroke={zone.stroke}
                    strokeWidth={isSel ? 3 : isHov ? 2.5 : 1.4}
                    strokeDasharray={zone.dash ?? undefined}
                    className="cursor-pointer"
                    onMouseEnter={(ev) => hoverAt(e, ev)}
                    onMouseMove={(ev) => hoverAt(e, ev)}
                    onMouseLeave={() => setHover(null)}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onSelect(e.id);
                    }}
                  >
                    <title>{`${TYPE_LABEL[e.type]} · ${e.layer}`}</title>
                  </circle>
                );
              }
              if (e.type === 'text') {
                const [tx, ty] = e.points[0];
                const fs = Math.min(Math.max(e.height * view.scale, 8), 64);
                return (
                  <text
                    key={e.id}
                    x={sx(tx)}
                    y={sy(ty)}
                    fontSize={fs}
                    fill={zone.stroke}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${-(e.rotation || 0)} ${sx(tx)} ${sy(ty)})`}
                    className="cursor-pointer"
                    onMouseEnter={(ev) => hoverAt(e, ev)}
                    onMouseLeave={() => setHover(null)}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onSelect(e.id);
                    }}
                  >
                    {e.text.slice(0, 80)}
                    <title>{`${TYPE_LABEL[e.type]} · ${e.layer}`}</title>
                  </text>
                );
              }
              if (e.type === 'point') {
                const [px, py] = e.points[0];
                return (
                  <circle
                    key={e.id}
                    cx={sx(px)}
                    cy={sy(py)}
                    r={2.5}
                    fill={zone.stroke}
                    className="cursor-pointer"
                    onMouseEnter={(ev) => hoverAt(e, ev)}
                    onMouseLeave={() => setHover(null)}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onSelect(e.id);
                    }}
                  >
                    <title>{`${TYPE_LABEL[e.type]} · ${e.layer}`}</title>
                  </circle>
                );
              }
              return (
                <path
                  key={e.id}
                  d={entityPath(e)}
                  fill={e.closed && zone.fill ? zone.fill : 'none'}
                  fillOpacity={e.closed && zone.fill ? 0.55 : 0}
                  stroke={zone.stroke}
                  strokeWidth={isSel ? 3 : isHov ? 2.5 : zone.id === 'fence' ? 2 : 1.4}
                  strokeDasharray={zone.dash ?? undefined}
                  strokeLinejoin="round"
                  className="cursor-pointer"
                  onMouseEnter={(ev) => hoverAt(e, ev)}
                  onMouseMove={(ev) => hoverAt(e, ev)}
                  onMouseLeave={() => setHover(null)}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelect(e.id);
                  }}
                >
                  <title>{`${TYPE_LABEL[e.type]} · ${e.layer}`}</title>
                </path>
              );
            })}
          </g>
        </svg>

        {/* всплывающая подсказка */}
        {hover && (
          <div
            className="pointer-events-none absolute z-10 max-w-56 border border-zinc-300 bg-white/95 px-2 py-1 font-mono text-[10px] leading-tight text-zinc-700 shadow-sm"
            style={{ left: Math.min(hover.sx + 12, Math.max(size.w - 130, 8)), top: Math.max(hover.sy - 36, 4) }}
          >
            <span className="font-semibold">{TYPE_LABEL[hover.e.type]}</span> · слой «{hover.e.layer}»
            <br />
            зона: {ZONE_MAP[classifyLayer(hover.e.layer)].label}
          </div>
        )}
      </div>

      {/* инспектор выбранного объекта */}
      {selected && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-[11px] text-zinc-600">
          <span className="rounded-sm bg-zinc-800 px-1.5 py-0.5 text-white">{TYPE_LABEL[selected.type]}</span>
          <span>
            слой: <b className="text-zinc-900">{selected.layer}</b>
          </span>
          <span>зона: {ZONE_MAP[classifyLayer(selected.layer)].label}</span>
          {selected.type === 'circle' && (
            <span>
              R = {selected.radius.toFixed(2)} м · S = {formatArea(entityArea(selected))}
            </span>
          )}
          {(selected.type === 'polyline' || selected.type === 'line') && (
            <span>
              L = {formatLen(entityLength(selected))}
              {selected.closed ? ` · S = ${formatArea(entityArea(selected))}` : ''}
            </span>
          )}
          {selected.type === 'text' && <span>«{selected.text.slice(0, 40)}»</span>}
          <button
            className="ml-auto text-zinc-400 underline hover:text-zinc-900"
            onClick={() => onSelect(null)}
          >
            закрыть
          </button>
        </div>
      )}

      {/* строка состояния */}
      <div className="flex items-center gap-4 border-t border-zinc-200 bg-zinc-50 px-3 py-1.5 font-mono text-[11px] text-zinc-600">
        <span>
          X: <b className="text-zinc-900">{cursor ? cursor.x.toFixed(2) : '—'}</b> м
        </span>
        <span>
          Y: <b className="text-zinc-900">{cursor ? cursor.y.toFixed(2) : '—'}</b> м
        </span>
        <span className="hidden sm:inline">
          зум: <b className="text-zinc-900">{Math.round((view.scale / 20) * 100)}%</b>
        </span>
        <span className="ml-auto hidden text-zinc-400 md:inline">
          объектов: {visible.length} / {doc.entities.length}
        </span>
      </div>
    </div>
  );
}
