'use client';

// Панель AI-консультанта: история диалога, подсказки-вопросы, контекст участка.

import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Send, Leaf, Loader2 } from 'lucide-react';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'Что посадить в тени у забора с северной стороны?',
  'Как рассчитать мощность системы полива для газона?',
  'Какой дренаж подойдёт для глинистой почвы?',
  'На каком расстоянии сажать деревья от дома и забора?',
];

export function ChatPanel({ context }: { context: string }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        'Здравствуйте! Я AI-консультант по ландшафтному дизайну. Спросите меня о растениях, зонировании, дренаже, поливе — я учитываю контекст загруженной схемы участка.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setError(null);
    const next: Msg[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
      const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(1), context }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setMessages((m) => [...m, { role: 'assistant', content: data.reply as string }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        `Не удалось получить ответ (${msg}). Серверная часть доступна в полной версии приложения; на статической странице (GitHub Pages) AI-консультант отключён.`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-220px)] min-h-[480px] w-full max-w-3xl flex-col rounded-sm border border-zinc-300 bg-white">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center border border-zinc-300 bg-zinc-50">
          <Leaf className="h-4 w-4 text-green-700" />
        </span>
        <div>
          <div className="font-mono text-sm font-semibold text-zinc-900">AI-консультант</div>
          <div className="font-mono text-[10px] text-zinc-400">ландшафтный дизайнер · знает контекст вашего участка</div>
        </div>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] border px-3 py-2 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'border-zinc-800 bg-zinc-900 text-zinc-50'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-800'
              } [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_ol_li]:list-decimal [&_p+p]:mt-2 [&_ul]:space-y-1`}
            >
              <Markdown>{m.content}</Markdown>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            консультант думает…
          </div>
        )}
      </div>

      {error && (
        <div className="mx-4 mb-2 border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="border border-zinc-300 bg-white px-2.5 py-1 font-mono text-[11px] text-zinc-600 transition-colors hover:border-zinc-900 hover:text-zinc-900"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex gap-2 border-t border-zinc-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Вопрос об участке, растениях, поливе…"
          className="flex-1 border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900"
          disabled={loading}
        />
        <Button type="submit" size="sm" className="h-10 gap-1.5 bg-zinc-900 font-mono text-xs hover:bg-zinc-700" disabled={loading || !input.trim()}>
          <Send className="h-3.5 w-3.5" />
          Отправить
        </Button>
      </form>
    </div>
  );
}
