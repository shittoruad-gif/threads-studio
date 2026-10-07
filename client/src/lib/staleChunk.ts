/**
 * デプロイ跨ぎで古い画面が新しいチャンクを読めなくなったときの立て直し。
 *
 * ★本番のログに、デプロイのたびに
 *   「Failed to fetch dynamically imported module: /assets/CommentManager-xxxx.js」
 *   「'text/html' is not a valid JavaScript MIME type」
 *   が出ていた。デプロイ前から開いたままのタブが、遅延ロードのページへ移動した
 *   ときに、もう存在しない旧ハッシュのファイルを取りに行って失敗している。
 *   お客様には「予期しないエラー」の画面が出ていた。
 *
 * 対処: 1回だけ自動で再読み込みする（新しいindex.htmlを取り直せば直る）。
 * 無限に再読み込みしないよう、sessionStorageで1回に制限する。
 */
const KEY = "ts_stale_chunk_reloaded";

/**
 * ★vite:preloadError で preventDefault すると、Vite はエラーを投げずに import を
 *   undefined で解決する。すると React.lazy が「Cannot read properties of undefined
 *   (reading 'default')」を投げ、再読み込みが終わるまでの一瞬エラー画面が出て、
 *   /api/client-error にも報告されていた（2026-10-07 06:48 の本番ログ）。
 *   再読み込みを始めたことをここで覚えておき、ErrorBoundary はその間エラー画面を出さない。
 */
let reloading = false;

export function isReloadingForStaleChunk(): boolean {
  return reloading;
}

export function isStaleChunkError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? "");
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /is not a valid JavaScript MIME type/i.test(msg) ||
    /Loading chunk \d+ failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

/** 再読み込みを試みたら true（呼び出し側はそれ以上何もしない） */
export function reloadOnceForStaleChunk(): boolean {
  try {
    if (sessionStorage.getItem(KEY)) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // sessionStorage が使えない環境では、1回きりの保証ができないので再読み込みしない
    return false;
  }
  reloading = true;
  window.location.reload();
  return true;
}

/** 正常に描画できたら、次のデプロイ跨ぎに備えてフラグを消す */
export function clearStaleChunkFlag(): void {
  try { sessionStorage.removeItem(KEY); } catch {}
}
