// Генератор демонстрационного DXF: участок 20×30 м с домом, террасой, газоном,
// прудом, дорожками, парковкой, деревьями и грядками. Слои — по-русски, как в
// реальных ландшафтных проектах.

function fx(v: number): string {
  return v.toFixed(4);
}

export function generateDemoDxf(): string {
  const out: string[] = [];

  const pair = (code: number, value: string | number) => {
    out.push(String(code));
    out.push(String(value));
  };

  const layer = (name: string, color: number) => {
    pair(0, 'LAYER');
    pair(2, name);
    pair(70, 0);
    pair(62, color);
    pair(6, 'CONTINUOUS');
  };

  const poly = (lay: string, pts: [number, number][], closed: boolean) => {
    pair(0, 'LWPOLYLINE');
    pair(8, lay);
    pair(90, pts.length);
    pair(70, closed ? 1 : 0);
    for (const [x, y] of pts) {
      pair(10, fx(x));
      pair(20, fx(y));
    }
  };

  const circle = (lay: string, x: number, y: number, r: number) => {
    pair(0, 'CIRCLE');
    pair(8, lay);
    pair(10, fx(x));
    pair(20, fx(y));
    pair(40, fx(r));
  };

  const text = (lay: string, x: number, y: number, s: string, h: number, rot = 0) => {
    pair(0, 'TEXT');
    pair(8, lay);
    pair(10, fx(x));
    pair(20, fx(y));
    pair(40, fx(h));
    pair(1, s);
    if (rot !== 0) pair(50, fx(rot));
  };

  const line = (lay: string, x1: number, y1: number, x2: number, y2: number) => {
    pair(0, 'LINE');
    pair(8, lay);
    pair(10, fx(x1));
    pair(20, fx(y1));
    pair(11, fx(x2));
    pair(21, fx(y2));
  };

  // ---------- HEADER ----------
  pair(0, 'SECTION');
  pair(2, 'HEADER');
  pair(9, '$INSUNITS');
  pair(70, 6); // метры
  pair(0, 'ENDSEC');

  // ---------- TABLES ----------
  pair(0, 'SECTION');
  pair(2, 'TABLES');
  pair(0, 'TABLE');
  pair(2, 'LAYER');
  pair(70, 11);
  layer('Забор', 7);
  layer('Дом', 30);
  layer('Терраса', 32);
  layer('Газон', 84);
  layer('Вода', 140);
  layer('Дорожка', 8);
  layer('Парковка', 9);
  layer('Деревья', 92);
  layer('Грядки', 62);
  layer('Аннотация', 7);
  pair(0, 'ENDTAB');
  pair(0, 'ENDSEC');

  // ---------- ENTITIES ----------
  pair(0, 'SECTION');
  pair(2, 'ENTITIES');

  // Граница участка (забор) 20 × 30 м
  poly('Забор', [[0, 0], [20, 0], [20, 30], [0, 30]], true);

  // Дом 10 × 10 м
  poly('Дом', [[2, 18], [12, 18], [12, 28], [2, 28]], true);
  text('Дом', 7, 22.6, 'Дом 10×10', 0.55);

  // Терраса 5 × 10 м
  poly('Терраса', [[13, 18], [18, 18], [18, 28], [13, 28]], true);
  text('Терраса', 15.5, 22.7, 'Терраса', 0.45);

  // Газон
  poly('Газон', [[1.5, 2.5], [18.5, 2.5], [18.5, 15.5], [13, 17], [7, 16.5], [1.5, 15.8]], true);
  text('Газон', 6.0, 11.8, 'Газон', 0.5);

  // Пруд
  poly('Вода', [[4, 6.3], [4.7, 7.6], [6.2, 8.0], [7.4, 6.9], [6.6, 5.3], [5.0, 4.9], [4.1, 5.6]], true);
  text('Вода', 5.55, 6.5, 'Пруд', 0.4);

  // Дорожки
  poly('Дорожка', [[9.4, 0], [10.6, 0], [10.6, 17.2], [9.4, 17.2]], true);
  poly('Дорожка', [[10.6, 15.6], [18, 15.6], [18, 17.2], [10.6, 17.2]], true);
  text('Дорожка', 14.2, 16.05, 'Дорожка', 0.35);

  // Парковка 3 × 3 м
  poly('Парковка', [[15.4, 0.6], [18.4, 0.6], [18.4, 3.6], [15.4, 3.6]], true);
  text('Парковка', 16.9, 1.35, 'Парковка', 0.32);

  // Деревья (кроны)
  circle('Деревья', 3.2, 14.2, 1.7);
  circle('Деревья', 16.6, 12.6, 2.1);
  circle('Деревья', 17.6, 9.6, 1.4);
  circle('Деревья', 2.6, 10.6, 1.5);
  circle('Деревья', 3.1, 3.9, 1.3);
  circle('Деревья', 16.6, 5.2, 1.6);
  circle('Деревья', 13.6, 13.4, 1.8);
  text('Деревья', 3.2, 14.05, 'Клён', 0.3);
  text('Деревья', 16.6, 12.45, 'Берёза', 0.3);
  text('Деревья', 2.6, 10.45, 'Рябина', 0.3);

  // Грядки
  poly('Грядки', [[2.2, 1.4], [3.0, 1.4], [3.0, 5.4], [2.2, 5.4]], true);
  poly('Грядки', [[3.8, 1.4], [4.6, 1.4], [4.6, 5.4], [3.8, 5.4]], true);
  text('Грядки', 3.4, 0.85, 'Грядки', 0.32);

  // Аннотации: размеры, ворота, север
  text('Аннотация', 10, -1.1, '20.00', 0.5);
  text('Аннотация', -1.1, 15, '30.00', 0.5, 90);
  text('Аннотация', 11.4, 0.45, 'Ворота', 0.32);
  line('Аннотация', 19.2, 27.6, 19.2, 29.0);
  poly('Аннотация', [[19.2, 29.4], [19.05, 28.95], [19.35, 28.95]], true);
  text('Аннотация', 19.2, 27.15, 'С', 0.4);

  pair(0, 'ENDSEC');
  pair(0, 'EOF');

  return out.join('\r\n') + '\r\n';
}
