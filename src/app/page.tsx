'use client';

// Дашборд «Ландшафтная карта из DXF»: загрузка/демо → парсинг → карта → PDF.
// Стиль: CAD-минимализм (белый фон, сетка, моноширинные координаты).

import { useCallback, useMemo, useRef, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { MapCanvas } from '@/components/MapCanvas';
import { ChatPanel } from '@/components/ChatPanel';
import { decodeDxf, parseDxf, type DxfDocument } from '@/lib/dxf/parser';
import { generateDemoDxf } from '@/lib/dxf/demo';
import { classifyLayer, ZONES, type ZoneId } from '@/lib/dxf/classify';
import { summarize, formatArea, formatLen } from '@/lib/geometry';
import { exportPlanPdf } from '@/lib/pdf-export';
import { toast } from 'sonner';
import { Upload, Play, FileText, Eye, EyeOff, TriangleAlert, Github, Map, MessagesSquare } from 'lucide-react';

const MAX_SIZE = 15 * 1024 * 1024;

export default function Home() {
  const [doc, setDoc] = useState<DxfDocument | null>(null);
  const [hiddenZones, setHiddenZones] = useState<Set<ZoneId>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const summary = useMemo(() => (doc ? summarize(doc) : null), [doc]);

  const applyDoc = useCallback((d: DxfDocument) => {
    setDoc(d);
    setSelectedId(null);
    setParseError(null);
    setHiddenZones(new Set());
    for (const w of d.warnings) toast.warning(w);
  }, []);

  const loadDemo = useCallback(() => {
    try {
      const text = generateDemoDxf();
      const d = parseDxf(text, 'демо-участок-20x30.dxf');
      applyDoc(d);
      toast.success('Загружен демо-участок 20×30 м');
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
  }, [applyDoc]);

  const loadFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.dxf')) {
        setParseError('Поддерживаются только файлы .dxf (ASCII).');
        return;
      }
      if (file.size > MAX_SIZE) {
        setParseError('Файл слишком большой (более 15 МБ). Экспортируйте DXF без неиспользуемых слоёв.');
        return;
      }
      try {
        const buf = await file.arrayBuffer();
        const { text } = decodeDxf(buf);
        const d = parseDxf(text, file.name);
        applyDoc(d);
        toast.success(`Файл «${file.name}» разобран: ${d.entities.length} объектов, ${d.layers.length} слоёв`);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : String(e));
        toast.error('Не удалось разобрать DXF-файл');
      }
    },
    [applyDoc]
  );

  const toggleZone = (id: ZoneId) => {
    setHiddenZones((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleExportPdf = useCallback(async () => {
    if (!doc) return;
    setExporting(true);
    try {
      await exportPlanPdf(doc, { hiddenZones });
      toast.success('PDF-план сформирован (A3)');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка экспорта PDF');
    } finally {
      setExporting(false);
    }
  }, [doc, hiddenZones]);

  const chatContext = useMemo(() => {
    if (!doc || !summary) return 'Схема участка не загружена.';
    const lines = [
      `Источник: ${doc.sourceName}`,
      summary.bbox
        ? `Габариты участка: ${summary.width.toFixed(1)} × ${summary.height.toFixed(1)} м (${formatArea(summary.totalArea)})`
        : 'Габариты неизвестны',
      `Всего объектов: ${summary.entityCount}`,
    ];
    for (const z of ZONES) {
      const s = summary.zoneStats.get(z.id);
      if (!s) continue;
      const parts = [`${s.count} объектов`];
      if (s.area > 0.01) parts.push(formatArea(s.area));
      if (s.length > 0.01) parts.push(`длина линий ${formatLen(s.length)}`);
      lines.push(`Зона «${z.label}» (слои: ${s.layers.join(', ')}): ${parts.join(', ')}`);
    }
    lines.push(`Доля озеленения: ~${Math.round(summary.greenRatio * 100)}%`);
    return lines.join('\n');
  }, [doc, summary]);

  return (
    <div className="flex min-h-screen flex-col bg-white text-zinc-900">
      {/* шапка */}
      <header className="sticky top-0 z-20 border-b border-zinc-300 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center border border-zinc-800 bg-zinc-900 font-mono text-sm font-bold text-white">
            DXF
          </span>
          <div className="mr-auto">
            <h1 className="font-mono text-base font-bold leading-tight tracking-tight">Ландшафтная карта из DXF</h1>
            <p className="font-mono text-[10px] text-zinc-500">парсинг чертежа → интерактивная карта → план PDF</p>
          </div>
          <a
            href="https://github.com/Genocide12/landscape-dxf-dashboard"
            target="_blank"
            rel="noreferrer"
            className="flex h-9 items-center gap-1.5 border border-zinc-300 px-3 font-mono text-xs text-zinc-600 transition-colors hover:border-zinc-900 hover:text-zinc-900"
          >
            <Github className="h-3.5 w-3.5" />
            GitHub
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-4">
        <Tabs defaultValue="plot" className="w-full">
          <TabsList className="mb-4 border border-zinc-300 bg-zinc-50 font-mono">
            <TabsTrigger value="plot" className="gap-1.5 font-mono data-[state=active]:bg-zinc-900 data-[state=active]:text-white">
              <Map className="h-3.5 w-3.5" />
              Участок
            </TabsTrigger>
            <TabsTrigger value="chat" className="gap-1.5 font-mono data-[state=active]:bg-zinc-900 data-[state=active]:text-white">
              <MessagesSquare className="h-3.5 w-3.5" />
              AI-консультант
            </TabsTrigger>
          </TabsList>

          {/* ------------------------- вкладка «Участок» ------------------------- */}
          <TabsContent value="plot" className="mt-0">
            <div className="grid gap-4 lg:grid-cols-[330px_1fr]">
              {/* левая колонка */}
              <aside className="space-y-4">
                {/* загрузка */}
                <section className="rounded-sm border border-zinc-300 bg-white p-4">
                  <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-zinc-500">Исходные данные</h2>
                  <div
                    className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 border-2 border-dashed px-3 py-6 text-center transition-colors ${
                      dragOver ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-300 hover:border-zinc-500'
                    }`}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) void loadFile(f);
                    }}
                  >
                    <Upload className="h-5 w-5 text-zinc-400" />
                    <span className="font-mono text-xs text-zinc-600">Перетащите DXF-файл сюда</span>
                    <span className="font-mono text-[10px] text-zinc-400">или нажмите для выбора · до 15 МБ · ASCII DXF</span>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".dxf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void loadFile(f);
                        e.target.value = '';
                      }}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full gap-1.5 border-zinc-300 font-mono text-xs"
                    onClick={loadDemo}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Загрузить демо-участок 20×30 м
                  </Button>
                  {parseError && (
                    <div className="mt-3 flex gap-2 border border-red-300 bg-red-50 p-2.5 text-xs text-red-700">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{parseError}</span>
                    </div>
                  )}
                  {doc && (
                    <div className="mt-3 space-y-0.5 border-t border-zinc-200 pt-3 font-mono text-[10px] text-zinc-500">
                      <div className="truncate">файл: <b className="text-zinc-800">{doc.sourceName}</b></div>
                      <div>
                        объектов: <b className="text-zinc-800">{doc.entities.length}</b> · слоёв: <b className="text-zinc-800">{doc.layers.length}</b>
                      </div>
                      <div>
                        единицы: <b className="text-zinc-800">{doc.unitsLabel}</b>
                        {doc.unitsAssumed && <span className="text-amber-600"> (предположены)</span>}
                      </div>
                    </div>
                  )}
                </section>

                {/* статистика */}
                {summary && (
                  <section className="rounded-sm border border-zinc-300 bg-white p-4">
                    <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-zinc-500">Сводка участка</h2>
                    <dl className="space-y-1.5 font-mono text-xs">
                      <div className="flex justify-between">
                        <dt className="text-zinc-500">габариты</dt>
                        <dd className="font-bold">{summary.width.toFixed(1)} × {summary.height.toFixed(1)} м</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-zinc-500">площадь по габаритам</dt>
                        <dd className="font-bold">{formatArea(summary.totalArea)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-zinc-500">объектов</dt>
                        <dd className="font-bold">{summary.entityCount}</dd>
                      </div>
                    </dl>
                    <div className="mt-3 border-t border-zinc-200 pt-3">
                      <div className="mb-1 flex justify-between font-mono text-xs">
                        <span className="text-zinc-500">доля озеленения</span>
                        <span className="font-bold">{Math.round(summary.greenRatio * 100)}%</span>
                      </div>
                      <div className="h-2 w-full border border-zinc-300 bg-zinc-100">
                        <div className="h-full bg-green-600" style={{ width: `${Math.min(summary.greenRatio * 100, 100)}%` }} />
                      </div>
                      <p className="mt-1.5 font-mono text-[10px] text-zinc-400">газон + растения + огород, по замкнутым контурам</p>
                    </div>
                  </section>
                )}

                {/* зоны/слои */}
                {doc && summary && (
                  <section className="rounded-sm border border-zinc-300 bg-white p-4">
                    <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-wider text-zinc-500">Зоны и слои</h2>
                    <ul className="space-y-1.5">
                      {ZONES.filter((z) => summary.zoneStats.has(z.id)).map((z) => {
                        const s = summary.zoneStats.get(z.id)!;
                        const hidden = hiddenZones.has(z.id);
                        return (
                          <li key={z.id}>
                            <button
                              className={`flex w-full items-center gap-2 border px-2 py-1.5 text-left font-mono text-[11px] transition-colors ${
                                hidden ? 'border-zinc-200 opacity-50' : 'border-zinc-200 hover:border-zinc-400'
                              }`}
                              onClick={() => toggleZone(z.id)}
                              title={hidden ? 'Показать зону' : 'Скрыть зону'}
                            >
                              <span
                                className="h-4 w-4 shrink-0 border"
                                style={{ backgroundColor: z.fill ?? '#ffffff', borderColor: z.stroke }}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block font-bold text-zinc-800">{z.label}</span>
                                <span className="block truncate text-[10px] text-zinc-400">{s.layers.join(', ')}</span>
                              </span>
                              <span className="shrink-0 text-right">
                                <span className="block text-zinc-700">{s.count} шт</span>
                                {s.area > 0.01 && <span className="block text-[10px] text-zinc-500">{formatArea(s.area)}</span>}
                              </span>
                              {hidden ? <EyeOff className="h-3.5 w-3.5 shrink-0 text-zinc-400" /> : <Eye className="h-3.5 w-3.5 shrink-0 text-zinc-500" />}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-2 font-mono text-[10px] text-zinc-400">
                      категория определяется по названию слоя (RU/EN: «Газон», «Вода», «Дорожки», «Деревья»…)
                    </p>
                  </section>
                )}

                {!doc && (
                  <section className="rounded-sm border border-dashed border-zinc-300 bg-zinc-50 p-4">
                    <div className="flex gap-2.5">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                      <div className="font-mono text-[11px] leading-relaxed text-zinc-500">
                        Загрузите свой DXF-чертёж или откройте демо-участок. Приложение разберёт слои, определит
                        ландшафтные зоны (газон, вода, дорожки, постройки, деревья), построит интерактивную карту
                        и подготовит печатный план PDF.
                      </div>
                    </div>
                  </section>
                )}
              </aside>

              {/* карта */}
              <div className="min-h-[520px] lg:h-[calc(100vh-190px)]">
                {doc ? (
                  <MapCanvas
                    doc={doc}
                    hiddenZones={hiddenZones}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onExportPdf={handleExportPdf}
                    exporting={exporting}
                  />
                ) : (
                  <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-zinc-300 bg-[linear-gradient(#f4f4f5_1px,transparent_1px),linear-gradient(90deg,#f4f4f5_1px,transparent_1px)] bg-[size:24px_24px]">
                    <span className="font-mono text-sm text-zinc-400">Схема не загружена</span>
                    <span className="max-w-xs text-center font-mono text-[11px] text-zinc-400">
                      Перетащите DXF-файл в панель слева или нажмите «Загрузить демо-участок»
                    </span>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ------------------------- вкладка «AI-консультант» ------------------------- */}
          <TabsContent value="chat" className="mt-0">
            <ChatPanel context={chatContext} />
          </TabsContent>
        </Tabs>
      </main>

      {/* подвал */}
      <footer className="mt-auto border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 font-mono text-[10px] text-zinc-500">
          <span>DXF → SVG → PDF · Next.js 16</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">поддержка слоёв RU/EN · единицы $INSUNITS · блоки INSERT</span>
          <a
            className="ml-auto underline decoration-dotted hover:text-zinc-900"
            href="https://github.com/Genocide12/landscape-dxf-dashboard"
            target="_blank"
            rel="noreferrer"
          >
            github.com/Genocide12/landscape-dxf-dashboard
          </a>
        </div>
      </footer>
    </div>
  );
}
