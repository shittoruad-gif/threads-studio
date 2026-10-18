/**
 * 請求書・領収書の受け取り登録（2026-10-18 三上様「スレッズスタジオの公式LINEに登録してもらっている前提で」）。
 *   しっとるの契約管理（別のサーバー）が、請求書・領収書をこの公式LINEからお客様へ届ける。
 *   どのLINEの方がどのお客様かを結び付けるため、お客様にこのLINEで「書類 合言葉（6文字）」と送ってもらう。
 *   Threads Studio の会員でない方も送れる（会員登録の確認より先に受ける）。
 *   合言葉の照合と記録は契約管理側で行い、ここは中継して結果をお返しするだけ（お客様の名前はこのリポジトリに書かない）。
 */
export function parseDocsBind(text: string): string | undefined {
  const m = String(text ?? "").trim().match(/^書類[\s　]*([A-Za-z0-9]{6})$/);
  return m ? m[1]!.toUpperCase() : undefined;
}

export async function tryDocsBind(
  lineUserId: string,
  text: string,
  opts: { url?: string; secret?: string; fetchFn?: typeof fetch } = {},
): Promise<unknown[] | null> {
  if (!parseDocsBind(text)) return null;
  const url = opts.url ?? process.env.DOCS_BIND_URL;
  const secret = opts.secret ?? process.env.DOCS_BIND_SECRET;
  const reply = (t: string) => [{ type: "text", text: t }];
  if (!url || !secret) return reply("ただいま受け付けの準備中です。お手数ですが、担当者へお知らせください。");
  try {
    const res = await (opts.fetchFn ?? fetch)(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Docs-Secret": secret },
      body: JSON.stringify({ text: text.trim(), userId: lineUserId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const r = (await res.json()) as { ok: boolean; clientName?: string; reason?: string };
    if (r.ok) return reply(`${r.clientName ?? ""}様の請求書・領収書の受け取りを登録しました。\n今後の請求書・領収書は、このLINEにお送りします。`);
    return reply("合言葉が見つかりませんでした。\n「書類」のあとの6文字をもう一度お確かめのうえ、送り直してください。");
  } catch (e) {
    console.error("[docsBind] 受け取り登録の中継に失敗:", (e as Error).message);
    return reply("ただいま受け付けできませんでした。少し時間をおいて、もう一度送ってください。");
  }
}
