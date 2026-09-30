/**
 * 1つのお店の情報を複数のアカウントで使っているときの確認（2026-09-30 三上様指示）。
 * 片方のために書き直すと、もう片方の投稿の内容も変わるので、書き直す前に必ず選んでいただく。
 */
export function sharedProjectQuestion(account: string, others: string[]): string {
  const list = others.filter(Boolean).map((u) => `@${u}`).join("・");
  return (
    `いま @${account} が使っているお店の情報は、${list} でも使っています。\n` +
    `このまま書き直すと、${list} の投稿の内容も一緒に変わります。\n\n` +
    `・このアカウントだけ変える：${list} の情報はそのまま残し、@${account} 用に新しく作ります\n` +
    `・両方とも変える：同じ情報を書き直します（どちらのアカウントも新しい内容で投稿します）`
  );
}
