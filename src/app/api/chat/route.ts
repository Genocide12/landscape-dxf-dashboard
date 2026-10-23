// Живой AI-консультант по ландшафтному дизайну (z-ai-web-dev-sdk, только сервер).

import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

export const runtime = 'nodejs';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  messages?: ChatMessage[];
  context?: string;
}

const SYSTEM_PROMPT = `Ты — опытный ландшафтный дизайнер-консультант в веб-приложении «Ландшафтная карта из DXF».
Пользователь работает с оцифровкой своего участка. Отвечай на русском языке, практично и по делу.
Структурируй ответ короткими абзацами и списками. Давай конкретные цифры (расстояния, размеры, уклоны, нормы),
когда это уместно. Если вопрос не про ландшафт, вежливо верни тему к участку.`;

export async function POST(req: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const history = Array.isArray(body.messages) ? body.messages : [];
  const context = typeof body.context === 'string' ? body.context.slice(0, 1500) : '';

  if (history.length === 0) {
    return NextResponse.json({ error: 'Пустая история сообщений' }, { status: 400 });
  }

  // последние 12 сообщений + текущее
  const trimmed = history.slice(-12).map((m) => ({
    role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    content: String(m.content ?? '').slice(0, 2000),
  }));

  try {
    const zai = await ZAI.create();
    const contextPart = context ? `\n\nКонтекст участка пользователя:\n${context}` : '';
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: SYSTEM_PROMPT + contextPart },
        ...trimmed,
      ],
      thinking: { type: 'disabled' },
    });
    const reply = completion.choices[0]?.message?.content;
    if (!reply || reply.trim().length === 0) {
      return NextResponse.json({ error: 'Пустой ответ модели' }, { status: 502 });
    }
    return NextResponse.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
    return NextResponse.json({ error: `Ошибка AI-сервиса: ${message}` }, { status: 500 });
  }
}
