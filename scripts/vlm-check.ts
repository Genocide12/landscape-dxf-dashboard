// Визуальная проверка сгенерированных карт через VLM (z-ai-web-dev-sdk)
import ZAI from 'z-ai-web-dev-sdk';
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: bun scripts/vlm-check.ts <img.png> [...]'); process.exit(1); }

const zai = await ZAI.create();
for (const f of files) {
  const b64 = readFileSync(f).toString('base64');
  const res = await zai.chat.completions.create({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Это ландшафтная карта участка (CAD-минимализм). Проверь кратко по пунктам: 1) читается ли русские подписи (заголовок, названия зон, подписи на карте); 2) нет ли наложений текста или обрезанных элементов; 3) видны ли все зоны (дом, терраса, пруд, газон, дорожки, парковка, деревья, грядки, забор); 4) корректна ли легенда справа. Ответь списком: ОК или проблема по каждому пункту, в конце вердикт GOOD/BAD.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
        ],
      },
    ],
  });
  console.log(`\n=== ${f} ===`);
  console.log(res.choices[0]?.message?.content ?? '(нет ответа)');
}
