// Headless-тест: демо-DXF → парсер → сводка зон → PDF → проверка рендера.
import { readFileSync, writeFileSync } from 'node:fs';
import { generateDemoDxf } from '../src/lib/dxf/demo';
import { parseDxf } from '../src/lib/dxf/parser';
import { classifyLayer, ZONE_MAP } from '../src/lib/dxf/classify';
import { summarize } from '../src/lib/geometry';
import { exportPlanPdf } from '../src/lib/pdf-export';

async function main() {
  const text = generateDemoDxf();
  writeFileSync('/home/z/my-project/scripts/demo-test.dxf', text);
  const doc = parseDxf(text, 'демо-участок-20x30.dxf');

  console.log('=== ПАРСИНГ ===');
  console.log('объектов:', doc.entities.length, '| слоёв:', doc.layers.length, '| единицы:', doc.unitsLabel, doc.unitsAssumed ? '(предположены)' : '');
  console.log('типы:', doc.entities.reduce((m, e) => ({ ...m, [e.type]: (m[e.type] ?? 0) + 1 }), {} as Record<string, number>));

  const sum = summarize(doc);
  console.log('\n=== СВОДКА ===');
  console.log('габариты:', sum.width.toFixed(1), 'x', sum.height.toFixed(1), 'м | площадь:', sum.totalArea.toFixed(1), 'м² | озеленение:', Math.round(sum.greenRatio * 100) + '%');
  for (const [zid, s] of sum.zoneStats) {
    console.log(`  ${ZONE_MAP[zid].label}: ${s.count} шт, S=${s.area.toFixed(1)} м², L=${s.length.toFixed(1)} м [${s.layers.join(', ')}]`);
  }

  console.log('\n=== КЛАССИФИКАЦИЯ (проверка слоёв) ===');
  for (const l of doc.layers) {
    console.log(`  ${l.name} -> ${classifyLayer(l.name)}`);
  }

  // PDF
  const fontB64 = readFileSync('/home/z/my-project/public/fonts/DejaVuSans.ttf').toString('base64');
  const { bytes, filename } = await exportPlanPdf(doc, { fontB64, noSave: true });
  writeFileSync(`/home/z/my-project/download/${filename}`, bytes);
  console.log('\n=== PDF ===');
  console.log('файл:', filename, '| размер:', (bytes.length / 1024).toFixed(0), 'КБ');

  // Проверка дополнительная: INSERT-блоки — сгенерируем мини-DXF с блоком
  const blockDxf = [
    '0','SECTION','2','BLOCKS',
    '0','BLOCK','2','TREE','70','0','10','0','20','0','30','0',
    '0','CIRCLE','8','0','10','0','20','0','40','1.5',
    '0','ENDBLK',
    '0','ENDSEC',
    '0','SECTION','2','ENTITIES',
    '0','INSERT','8','Деревья','2','TREE','10','5','20','5','41','2','42','2','50','30',
    '0','ENDSEC','0','EOF',
  ].join('\n');
  const d2 = parseDxf(blockDxf, 'blocks-test.dxf');
  const ins = d2.entities[0];
  console.log('\n=== БЛОКИ (INSERT) ===');
  console.log('тип:', ins.type, '| слой:', ins.layer, '| центр:', ins.points[0].map(v => v.toFixed(2)).join(','), '| R:', ins.radius.toFixed(2), '(ожидается 10,10 / 3.00)');

  // Единицы: мм-чертёж
  const mmDxf = [
    '0','SECTION','2','ENTITIES',
    '0','LINE','8','Забор','10','0','20','0','11','20000','21','30000',
    '0','ENDSEC','0','EOF',
  ].join('\n');
  const d3 = parseDxf(mmDxf, 'mm-test.dxf');
  console.log('\n=== ЕДИНИЦЫ (мм-эвристика) ===');
  console.log('единицы:', d3.unitsLabel, '| длина линии:', Math.hypot(d3.entities[0].points[1][0], d3.entities[0].points[1][1]).toFixed(1), 'м (ожидается ~36)');
  console.log('\nOK');
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
