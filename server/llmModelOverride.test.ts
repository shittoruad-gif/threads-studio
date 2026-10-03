import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./_core/env', () => ({
  ENV: { geminiApiKey: 'test-key', forgeApiKey: '', geminiModel: '', forgeApiUrl: '', geminiBaseUrl: 'https://example.invalid/v1beta/openai' },
}));

const okBody = (text: string) => ({
  ok: true, status: 200, statusText: 'OK', headers: new Headers(),
  json: async () => ({ id: 'x', created: 0, model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }] }),
  text: async () => '',
});
const badBody = () => ({ ok: false, status: 404, statusText: 'Not Found', headers: new Headers(), json: async () => ({}), text: async () => 'model not found' });

describe('invokeLLM の model 指定', () => {
  const calls: any[] = [];
  beforeEach(() => { calls.length = 0; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('指定したモデルで呼ぶ', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) => { calls.push(JSON.parse(init.body)); return okBody('ok') as any; }));
    const { invokeLLM } = await import('./_core/llm');
    await invokeLLM({ model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'hi' }] });
    expect(calls.map((c) => c.model)).toEqual(['gemini-3.8-flash']);
  });

  it('指定モデルが失敗したら既定のモデルで1回やり直す', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) => {
      const b = JSON.parse(init.body); calls.push(b);
      return (b.model === 'gemini-3.8-flash' ? badBody() : okBody('fallback')) as any;
    }));
    const { invokeLLM } = await import('./_core/llm');
    const r = await invokeLLM({ model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'hi' }] });
    expect(calls.map((c) => c.model)).toEqual(['gemini-3.8-flash', 'gemini-2.5-flash']);
    expect(r.choices[0].message.content).toBe('fallback');
  });

  it('おかしなモデル名は使わず既定で呼ぶ', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) => { calls.push(JSON.parse(init.body)); return okBody('ok') as any; }));
    const { invokeLLM } = await import('./_core/llm');
    await invokeLLM({ model: '../../evil?x=1', messages: [{ role: 'user', content: 'hi' }] });
    expect(calls.map((c) => c.model)).toEqual(['gemini-2.5-flash']);
  });

  it('未指定なら既定のモデル', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) => { calls.push(JSON.parse(init.body)); return okBody('ok') as any; }));
    const { invokeLLM } = await import('./_core/llm');
    await invokeLLM({ messages: [{ role: 'user', content: 'hi' }] });
    expect(calls.map((c) => c.model)).toEqual(['gemini-2.5-flash']);
  });
});
