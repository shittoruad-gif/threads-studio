/**
 * 同じキーの処理を、前のものが終わってから順に動かす（2026-11-11）。
 *
 * 見送った3件の「代わりを作る」を続けて押すと、代わりの生成が同じアカウントで同時に走り、
 * どちらも相手の文を知らないまま書くので、書き出しまで同じ2本が届いていた
 * （同じ分に作られた2本が、どちらも同じご質問の引用から始まっていた）。
 * 順に動かせば、2本目は1本目を「直近の投稿」として読んでから書ける。
 * 前の処理が失敗しても、次の処理は動かす。
 */
const tails = new Map<string, Promise<unknown>>();

export function serialByKey<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  const run = prev.then(task, task);
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  void tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
  return run;
}

/** テスト用：待ちの数 */
export function _serialPendingKeys(): number { return tails.size; }
