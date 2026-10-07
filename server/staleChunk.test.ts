import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 2026-10-07 06:48 本番ログ「Cannot read properties of undefined (reading 'default')」。
 * vite:preloadError で preventDefault すると import が undefined で解決し、React.lazy が
 * これを投げる。再読み込みを始めた後は ErrorBoundary が見分けられること。
 */
describe("staleChunk: 再読み込み中の副次エラーを見分ける", () => {
  let store: Record<string, string>;
  const reload = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    store = {};
    reload.mockClear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });
    vi.stubGlobal("window", { location: { reload } });
  });

  it("再読み込みを始めるまでは false、始めたら true", async () => {
    const m = await import("../client/src/lib/staleChunk");
    expect(m.isReloadingForStaleChunk()).toBe(false);
    expect(m.reloadOnceForStaleChunk()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(m.isReloadingForStaleChunk()).toBe(true);
  });

  it("すでに1回再読み込みした後（フラグあり）は再読み込みせず、再読み込み中にもならない", async () => {
    store["ts_stale_chunk_reloaded"] = "1";
    const m = await import("../client/src/lib/staleChunk");
    expect(m.reloadOnceForStaleChunk()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(m.isReloadingForStaleChunk()).toBe(false);
  });

  it("lazy の .default 読みのエラー自体は旧チャンクのエラーと判定しない（本物の不具合を隠さない）", async () => {
    const m = await import("../client/src/lib/staleChunk");
    expect(m.isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'default')"))).toBe(false);
  });
});
