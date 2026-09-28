import { describe, it, expect, vi, afterEach } from 'vitest';
import { cancelSubscription, getSubscription } from './univapay';

// 2026-09-28 朝の照合：解約（DELETE）が本文なしで返り、json() が
// 「Unexpected end of JSON input」で落ちて「反映できません」と誤報していた。
describe('univapayRequest：本文が空の応答', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('204（本文なし）の解約は成功として扱う', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await expect(cancelSubscription('sub-1')).resolves.toBeNull();
  });

  it('200 で本文が空でも成功として扱う', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));
    await expect(cancelSubscription('sub-1')).resolves.toBeNull();
  });

  it('本文があれば今までどおり JSON を返す', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'x', status: 'current' }), { status: 200 })));
    await expect(getSubscription('x')).resolves.toMatchObject({ id: 'x', status: 'current' });
  });

  it('エラー応答は今までどおり失敗にする', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"code":"NOT_FOUND"}', { status: 404 })));
    await expect(cancelSubscription('sub-1')).rejects.toThrow(/404/);
  });
});
