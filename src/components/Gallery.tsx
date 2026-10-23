'use client';

// Галерея готовых карт: «активные скриншоты» — клик открывает лайтбокс с зумом,
// каждая карточка и строка загрузок отдаёт реальные файлы (PNG/SVG/PDF/DXF).
// Путь к ассетам учитывает basePath статической сборки GitHub Pages.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Download, FileText, Image as ImageIcon, Layers, ZoomIn } from 'lucide-react';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const asset = (p: string) => `${BASE}${p}`;

export interface GalleryShot {
  id: string;
  title: string;
  desc: string;
  img: string;
  alt: string;
  downloads: { label: string; href: string }[];
}

export const GALLERY_SHOTS: GalleryShot[] = [
  {
    id: 'map',
    title: 'Ландшафтная карта участка',
    desc: 'CAD-минимализм: сетка 1 м, 8 цветовых зон, легенда с площадями, сводка и штамп. 1680×1120 px.',
    img: '/gallery/map.png',
    alt: 'Ландшафтная карта демо-участка 20×30 м',
    downloads: [
      { label: 'PNG', href: '/gallery/map.png' },
      { label: 'SVG', href: '/gallery/map.svg' },
    ],
  },
  {
    id: 'plan',
    title: 'Печатный план PDF A3',
    desc: 'Векторный план с масштабом, размерными линиями 20.00 / 30.00 м, легендой и штампом. Готов к печати.',
    img: '/gallery/plan-preview.png',
    alt: 'PDF-план участка, формат A3',
    downloads: [{ label: 'PDF', href: '/gallery/plan.pdf' }],
  },
  {
    id: 'dash',
    title: 'Дашборд в работе',
    desc: 'Интерактивная карта: зум и пан, инспектор объектов, тумблеры зон, статус-бар с координатами.',
    img: '/gallery/dashboard.png',
    alt: 'Дашборд с загруженным демо-участком',
    downloads: [{ label: 'PNG', href: '/gallery/dashboard.png' }],
  },
];

const ALL_FILES = [
  { label: 'План PDF A3', href: '/gallery/plan.pdf', icon: FileText, note: '171 КБ' },
  { label: 'Карта SVG', href: '/gallery/map.svg', icon: Layers, note: 'вектор' },
  { label: 'Карта PNG', href: '/gallery/map.png', icon: ImageIcon, note: '1680×1120' },
  { label: 'Демо-участок DXF', href: '/gallery/demo.dxf', icon: FileText, note: '20×30 м' },
];

export function Gallery() {
  const [open, setOpen] = useState<GalleryShot | null>(null);
  const [zoom, setZoom] = useState(false);

  const openShot = (s: GalleryShot) => {
    setZoom(false);
    setOpen(s);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-zinc-800">
          Готовые карты и скриншоты
        </h2>
        <p className="mt-1 font-mono text-[11px] text-zinc-500">
          демо-участок 20×30 м · конвейер DXF → зоны → карта · нажмите на снимок, чтобы открыть с зумом
        </p>
      </div>

      {/* активные скриншоты */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {GALLERY_SHOTS.map((s) => (
          <figure key={s.id} className="overflow-hidden rounded-sm border border-zinc-300 bg-white">
            <button
              type="button"
              onClick={() => openShot(s)}
              className="group relative block w-full cursor-zoom-in"
              aria-label={`Открыть: ${s.title}`}
            >
              <img
                src={asset(s.img)}
                alt={s.alt}
                className="h-52 w-full border-b border-zinc-200 bg-white p-2 object-contain transition-transform group-hover:scale-[1.02]"
              />
              <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center border border-zinc-300 bg-white/95 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100">
                <ZoomIn className="h-3.5 w-3.5" />
              </span>
            </button>
            <figcaption className="space-y-2 p-3">
              <div className="font-mono text-xs font-bold text-zinc-800">{s.title}</div>
              <p className="font-mono text-[10px] leading-relaxed text-zinc-500">{s.desc}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {s.downloads.map((d) => (
                  <a
                    key={d.label}
                    href={asset(d.href)}
                    download
                    className="inline-flex h-7 items-center gap-1 border border-zinc-300 px-2 font-mono text-[10px] text-zinc-600 transition-colors hover:border-zinc-900 hover:text-zinc-900"
                  >
                    <Download className="h-3 w-3" />
                    {d.label}
                  </a>
                ))}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>

      {/* строка общих загрузок */}
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-dashed border-zinc-300 bg-zinc-50 p-3">
        <span className="mr-1 font-mono text-[11px] text-zinc-500">Скачать файлы:</span>
        {ALL_FILES.map((f) => (
          <a
            key={f.href}
            href={asset(f.href)}
            download
            className="inline-flex h-8 items-center gap-1.5 border border-zinc-300 bg-white px-2.5 font-mono text-[11px] text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-900"
          >
            <f.icon className="h-3.5 w-3.5 text-zinc-500" />
            {f.label}
            <span className="text-[9px] text-zinc-400">{f.note}</span>
          </a>
        ))}
      </div>

      {/* лайтбокс */}
      <Dialog open={!!open} onOpenChange={(o) => (o ? null : setOpen(null))}>
        <DialogContent className="max-w-6xl gap-0 overflow-hidden border-zinc-300 p-0 sm:rounded-sm">
          <DialogTitle className="sr-only">{open?.title ?? 'Скриншот'}</DialogTitle>
          <DialogDescription className="sr-only">{open?.desc ?? ''}</DialogDescription>
          <div
            className="max-h-[74vh] cursor-zoom-in overflow-auto bg-[linear-gradient(#f4f4f5_1px,transparent_1px),linear-gradient(90deg,#f4f4f5_1px,transparent_1px)] bg-[size:24px_24px] p-3"
            onClick={() => setZoom((z) => !z)}
          >
            <img
              src={asset(open?.img ?? '')}
              alt={open?.alt ?? ''}
              className="w-full border border-zinc-300 bg-white shadow-sm transition-transform duration-200"
              style={{ transform: zoom ? 'scale(1.8)' : 'scale(1)', transformOrigin: 'center top' }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 bg-white px-3 py-2">
            <span className="mr-auto font-mono text-xs font-bold text-zinc-800">{open?.title}</span>
            <span className="font-mono text-[10px] text-zinc-400">
              клик по изображению — {zoom ? 'уменьшить' : 'увеличить'}
            </span>
            {open?.downloads.map((d) => (
              <a
                key={d.label}
                href={asset(d.href)}
                download
                className="inline-flex h-7 items-center gap-1 border border-zinc-300 px-2 font-mono text-[10px] text-zinc-600 transition-colors hover:border-zinc-900 hover:text-zinc-900"
              >
                <Download className="h-3 w-3" />
                {d.label}
              </a>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
