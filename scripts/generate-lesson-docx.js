// Сценарий видеоурока «Ландшафтная карта из DXF» (~5 минут).
// Сцена: copywriting (Profile B) — без обложки и оглавления, одна секция,
// межстрочный интервал 400, разговорный стиль, ритм-маркеры.
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, AlignmentType, HeadingLevel, WidthType,
  BorderStyle, ShadingType,
} = require("docx");
const fs = require("fs");

// Палитра сцены copywriting
const P = {
  primary: "1A1A1A",
  body: "333333",
  secondary: "666666",
  accent: "E85D3A",
};

const FONTS = { ascii: "Calibri", eastAsia: "Microsoft YaHei" };

// ---------- помощники ----------
function title(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 80, line: 460, lineRule: "atLeast" },
    children: [new TextRun({ text, bold: true, size: 36, color: P.primary, font: FONTS })],
  });
}

function subtitle(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 240, line: 400 },
    children: [new TextRun({ text, size: 24, color: P.secondary, font: FONTS })],
  });
}

function h(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200, line: 400, lineRule: "atLeast" },
    children: [new TextRun({ text, bold: true, size: 28, color: P.primary, font: FONTS })],
  });
}

function voice(text, opts = {}) {
  // Абзац закадрового текста: разговорный, без выключки и отступа
  const runs = [];
  const parts = Array.isArray(text) ? text : [{ t: text }];
  for (const p of parts) {
    runs.push(
      new TextRun({
        text: p.t,
        size: 24,
        color: p.accent ? P.accent : p.grey ? P.secondary : P.body,
        bold: Boolean(p.bold),
        italics: Boolean(p.i),
        font: FONTS,
      })
    );
  }
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 200, after: 200, line: 400 },
    children: runs,
    ...(opts.keepNext ? { keepNext: true } : {}),
  });
}

function marker(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60, line: 400 },
    children: [new TextRun({ text, size: 21, color: "999999", italics: true, font: FONTS })],
  });
}

function note(text) {
  return new Paragraph({
    spacing: { before: 100, after: 100, line: 400 },
    children: [new TextRun({ text, size: 20, color: P.secondary, font: FONTS })],
  });
}

function cell(text, { bold = false, header = false, w = 25, align = AlignmentType.LEFT } = {}) {
  return new TableCell({
    width: { size: w, type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    shading: header ? { type: ShadingType.CLEAR, fill: "F1F5F9" } : undefined,
    children: [
      new Paragraph({
        alignment: align,
        spacing: { line: 300 },
        children: [
          new TextRun({ text, bold: bold || header, size: 21, color: header ? P.primary : P.body, font: FONTS }),
        ],
      }),
    ],
  });
}

const tableBorders = {
  top: { style: BorderStyle.SINGLE, size: 2, color: "9AA6B2" },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: "9AA6B2" },
  left: { style: BorderStyle.NONE },
  right: { style: BorderStyle.NONE },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "D0D0D0" },
  insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "D0D0D0" },
};

// ---------- паспорт урока ----------
const passportRows = [
  ["Тема", "Как за пять минут превратить DXF-чертёж участка в интерактивную ландшафтную карту и печатный план"],
  ["Хронометраж", "5 минут 00 секунд (7 блоков)"],
  ["Аудитория", "Ландшафтные дизайнеры, владельцы участков, студенты профильных курсов"],
  ["Цель урока", "Зритель загружает свой DXF-файл, получает карту с зонами и выгружает PDF-план"],
  ["Что нужно зрителю", "DXF-файл участка (или встроенный демо-участок), браузер, доступ к дашборду"],
];

// ---------- тайм-коды ----------
const timingRows = [
  ["1", "0:00–0:25", "Интро", "Заставка: чертёж «оживает» в цветную карту. Титры."],
  ["2", "0:25–1:10", "Что такое DXF", "Экран AutoCAD: SAVEAS → DXF. Слайд со сравнением ASCII и бинарного DXF."],
  ["3", "1:10–1:50", "Обзор дашборда", "Обзорный скринкаст: шапка, вкладки «Участок» и «AI-консультант», стиль CAD."],
  ["4", "1:50–3:00", "Загрузка файла", "Кнопка «Демо-участок 20×30 м», затем drag-and-drop своего файла. Панель зон."],
  ["5", "3:00–3:50", "Работа с картой", "Зум колесом, панорама, сетка, координаты, инспектор объекта, тумблеры зон."],
  ["6", "3:50–4:30", "Экспорт PDF", "Кнопка «Экспорт PDF (A3)». Открытие готового плана: легенда, штамп, масштаб."],
  ["7", "4:30–5:00", "AI-консультант и финал", "Вопрос в чате «Что посадить в тени?». Финальный кадр со ссылкой."],
];

// ---------- документ ----------
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: FONTS, size: 24, color: P.body },
        paragraph: { spacing: { line: 400 } },
      },
      heading1: {
        run: { font: FONTS, size: 28, bold: true, color: P.primary },
        paragraph: { spacing: { before: 400, after: 200, line: 400 } },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: P.secondary, font: FONTS })],
            }),
          ],
        }),
      },
      children: [
        title("Видеоурок: ландшафтная карта из DXF"),
        subtitle("Сценарий с тайм-кодами, закадровым текстом и методическими советами · хронометраж 5:00"),

        // ---------- паспорт ----------
        h("Паспорт урока"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: tableBorders,
          rows: passportRows.map(
            ([k, v]) =>
              new TableRow({
                cantSplit: true,
                children: [
                  cell(k, { bold: true, w: 28 }),
                  cell(v, { w: 72 }),
                ],
              })
          ),
        }),

        // ---------- тайминг ----------
        h("Тайминг и раскадровка"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: tableBorders,
          rows: [
            new TableRow({
              tableHeader: true,
              cantSplit: true,
              children: [
                cell("№", { header: true, w: 6 }),
                cell("Тайм-код", { header: true, w: 14 }),
                cell("Блок", { header: true, w: 20 }),
                cell("Что на экране", { header: true, w: 60 }),
              ],
            }),
            ...timingRows.map(
              ([n, t, b, s]) =>
                new TableRow({
                  cantSplit: true,
                  children: [
                    cell(n, { w: 6 }),
                    cell(t, { w: 14 }),
                    cell(b, { w: 20, bold: true }),
                    cell(s, { w: 60 }),
                  ],
                })
            ),
          ],
        }),
        note("Примечание: тайм-коды указаны для темпа 120–130 слов в минуту. При монтаже допускается отклонение ±5 секунд на блок."),

        // ---------- закадровый текст ----------
        h("Закадровый текст по блокам"),

        marker("Блок 1 · 0:00–0:25 · Интро"),
        voice([
          { t: "У вас есть чертёж участка в AutoCAD, а на участке до сих пор пусто? " },
          { t: "Через пять минут этот чертёж станет живой ландшафтной картой", bold: true, accent: true },
          { t: " — с газоном, прудом, дорожками и печатным планом. Меня зовут 【имя ведущего】, и сегодня мы превратим скучный DXF в рабочий инструмент ландшафтного дизайнера." },
        ]),
        marker("[пауза 1 сек, титр с названием урока]"),

        marker("Блок 2 · 0:25–1:10 · Что такое DXF"),
        voice([
          { t: "Начнём с формата. DXF — это обменный формат чертежей, который понимает практически любой CAD-редактор: AutoCAD, NanoCAD, Bricscad, даже бесплатные просмотрщики. Внутри — обычный текст: точки, линии, окружности и, главное, " },
          { t: "слои", bold: true },
          { t: ". Именно слои станут для нас волшебными словами: «Газон», «Вода», «Дорожки», «Деревья»." },
        ]),
        voice([
          { t: "Как подготовить файл? В AutoCAD нажмите «Сохранить как» и выберите тип " },
          { t: "DXF, обязательно ASCII", bold: true, accent: true },
          { t: " — бинарный вариант дашборд не примет и честно об этом скажет. Русские названия слоёв не страшны: кодировка Windows-1251 распознаётся автоматически." },
        ]),

        marker("Блок 3 · 1:10–1:50 · Обзор дашборда"),
        voice([
          { t: "Открываем дашборд. Интерфейс намеренно выдержан в духе CAD: белое поле, светлая сетка, моноширинные координаты — если вы работали в чертёжных программах, почувствуете себя дома. Слева — исходные данные и сводка участка, в центре — карта, а рядом — вкладка «AI-консультант», о ней в самом конце." },
        ]),

        marker("Блок 4 · 1:50–3:00 · Загрузка файла"),
        voice([
          { t: "Своего файла под рукой нет? Нажмите " },
          { t: "«Загрузить демо-участок 20 на 30 метров»", bold: true, accent: true },
          { t: " — и через секунду на карте появится типовой надел: дом десять на десять, терраса, газон, пруд, парковка и семь деревьев." },
        ]),
        voice([
          { t: "Теперь ваш чертёж. Просто перетащите DXF-файл в панель слева — или кликните по ней и выберите файл на диске. Парсинг занимает секунды. Смотрите, что произошло: дашборд разобрал все объекты, прочитал слои и " },
          { t: "сам определил ландшафтные зоны", bold: true },
          { t: " — по русским и английским названиям. Подсветились площади: газон двести тридцать шесть квадратных метров, дом — сто, пруд — семь. Итог — в сводке: габариты, площадь по границам и доля озеленения." },
        ]),
        marker("[если на экране предупреждение о единицах — покажите его и поясните словами ниже]"),
        voice([
          { t: "Если в файле не указаны единицы измерения, приложение либо определит миллиметры по габаритам, либо честно предупредит, что приняты метры." },
        ]),

        marker("Блок 5 · 3:00–3:50 · Работа с картой"),
        voice([
          { t: "Покажу карту ближе. Колесо мыши — масштаб, перетаскивание — панорама. Внизу — " },
          { t: "координаты курсора в метрах", bold: true },
          { t: " и шаг сетки. Наведите курсор на любой объект — всплывёт подсказка: тип, слой, зона. Кликните — в инспекторе появятся размеры: у окружности радиус и площадь, у дорожки — длина." },
        ]),
        voice([
          { t: "Не нужна какая-то зона на плане? Отключите её тумблером в списке слева — карта мгновенно перерисуется, а экспорт это учтёт. Так удобно проверять, как участок выглядит без построек или без деревьев." },
        ]),

        marker("Блок 6 · 3:50–4:30 · Экспорт PDF"),
        voice([
          { t: "Финальный аккорд — печатный план. Кнопка " },
          { t: "«Экспорт PDF, формат A3»", bold: true, accent: true },
          { t: " — и через мгновение готовый чертёжный лист: векторная графика, сетка, габаритные размеры с засечками, легенда с площадями и штамп с масштабом и датой. Масштаб подбирается автоматически — от одного к пятидесяти до одного к двум тысячам. Распечатывайте и идите к заказчику." },
        ]),

        marker("Блок 7 · 4:30–5:00 · AI-консультант и финал"),
        voice([
          { t: "И вишенка: во вкладке «AI-консультант» можно спросить живого дизайнера, например, что посадить в тени у забора. Ответ придёт с учётом именно вашего участка — консультант видит зоны и площади. " },
          { t: "Небольшая оговорка: чат работает в полной версии приложения, а на статической странице GitHub Pages он вежливо предложит открыть полную версию.", i: true },
        ]),
        voice([
          { t: "Ссылка на дашборд — под этим видео. Загрузите свой DXF и покажите в комментариях, какая карта получилась у вас. Удачного проектирования!" },
        ]),
        marker("[финальная заставка: ссылка + QR-код]"),

        // ---------- методические советы ----------
        h("Методические советы для записи"),
        voice([
          { t: "Темп и подача. ", bold: true },
          { t: "Говорите на 10–15 процентов медленнее обычного: зритель одновременно смотрит на экран и слушает. Ключевые действия озвучивайте глаголами в повелительном наклонении — «нажмите», «перетащите», «кликните»." },
        ]),
        voice([
          { t: "Кадры. ", bold: true },
          { t: "Записывайте скринкаст в разрешении не ниже 1920 на 1080, курсор подсветите. Каждый блок снимайте отдельным дублем — так монтаж не превратится в кошмар. Перед блоками 4 и 6 сделайте клин-кадры: реальное фото участка и распечатанный PDF-план." },
        ]),
        voice([
          { t: "Типичные вопросы зрителей. ", bold: true },
          { t: "Будьте готовы, что в комментариях спросят: почему не грузится бинарный DXF (пересохранить в ASCII), что делать с немецкими или казахскими названиями слоёв (переименовать или оставить в зоне «Прочее»), и уйдёт ли чертёж в облако (нет, парсинг идёт прямо в браузере)." },
        ]),

        // ---------- чек-лист ----------
        h("Чек-лист материалов"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: tableBorders,
          rows: [
            new TableRow({
              tableHeader: true,
              cantSplit: true,
              children: [
                cell("Материал", { header: true, w: 40 }),
                cell("Когда нужен", { header: true, w: 60 }),
              ],
            }),
            ...[
              ["Заставка с титрами (5 сек)", "Блок 1, начало"],
              ["Запись AutoCAD: SAVEAS → ASCII DXF", "Блок 2"],
              ["Скринкаст дашборда, широкий план", "Блоки 3–5"],
              ["DXF-файл демо-участка и тестовый файл зрителя", "Блок 4"],
              ["Готовый PDF-план A3 + клин: распечатка в руках", "Блок 6"],
              ["Финальная заставка со ссылкой и QR-кодом", "Блок 7"],
            ].map(([m, w]) => new TableRow({ cantSplit: true, children: [cell(m, { w: 40 }), cell(w, { w: 60 })] })),
          ],
        }),

        note("Ссылка для финального кадра: https://genocide12.github.io/landscape-dxf-dashboard/ · репозиторий: https://github.com/Genocide12/landscape-dxf-dashboard"),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync("/home/z/my-project/download/Сценарий_видеоурока_Ландшафтная_карта.docx", buf);
  console.log("OK: download/Сценарий_видеоурока_Ландшафтная_карта.docx");
});
