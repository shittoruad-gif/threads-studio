/**
 * Threads 連携の「つなぎたいアカウントか」の確かめ（2026-10-29 三上様「人間では考えられないレベルのクオリティで作り込んで」）。
 *
 * きっかけ：インスタを複数お持ちのお客様が、交流会用のアカウントをつなぎたかったのに、
 *   ブラウザ／Threadsアプリでログイン中の別のアカウント（同じ表示名の別のアカウント）がつながって止まった。
 *   Threads の許可画面は、そのときログインしているアカウントをそのまま使う（Meta の仕様で止められない）。
 *   表示名が同じだと、ご本人も違うアカウントだと気づけない。
 *
 * 決めたこと：
 *   1. 連携の前に「つなぎたいアカウントの @ユーザー名」を聞く（任意。分からなければ飛ばせる）
 *   2. 戻ってきたら、つながったアカウントと突き合わせる。違えば保存しない・投稿も作らない
 *      → 「このアカウントで使う」か「正しいアカウントでやり直す」をご本人に選んでいただく
 *   3. 「別のアカウントを追加」で、もうつながっているアカウントが戻ってきたら、それも同じ扱い
 *   4. やり直し方は端末ごと（Android・iPhone・パソコン）に出す。一覧に出ない＝まだThreadsを始めていない、も出す
 */

/** @ や空白・URL を外して、Threads のユーザー名として比べられる形にする（大文字小文字は区別しない） */
export function normalizeThreadsUsername(raw: string | null | undefined): string {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  // URL（https://www.threads.com/@name ・ instagram.com/name/）を貼られても名前だけ取り出す
  const m = s.match(/(?:threads\.(?:net|com)|instagram\.com)\/@?([A-Za-z0-9._]+)/i);
  if (m) s = m[1]!;
  s = s.replace(/^[@＠]+/, "").replace(/[\s　]+/g, "");
  // 全角英数字を半角に（スマホの入力で混ざる）
  s = s.replace(/[Ａ-Ｚａ-ｚ０-９．＿]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  s = s.replace(/[/?#].*$/, "");
  return s.toLowerCase();
}

/** Threads（＝Instagram）のユーザー名として使える形か。英数字・ピリオド・アンダーバーで30文字まで */
export function isValidThreadsUsername(name: string): boolean {
  return /^[a-z0-9._]{1,30}$/.test(name) && !/^\.|\.$/.test(name) && !/\.\./.test(name);
}

export type ConnectIntent = "first" | "add" | "reconnect";

export type ConnectJudgement =
  | { kind: "ok" }
  /** つなぎたいと言われた名前と違うアカウントがつながった */
  | { kind: "mismatch"; expected: string; got: string }
  /** 別のアカウントを足したいのに、もうつながっているアカウントが戻ってきた（ログイン中のアカウントが使われた） */
  | { kind: "same_as_existing"; got: string };

export function judgeConnect(input: {
  expected?: string | null;
  got: string;
  intent?: ConnectIntent | null;
  /** このお客様に今つながっているアカウントのユーザー名 */
  existingUsernames: readonly string[];
}): ConnectJudgement {
  const got = normalizeThreadsUsername(input.got);
  const expected = normalizeThreadsUsername(input.expected);
  if (expected && isValidThreadsUsername(expected) && expected !== got) {
    return { kind: "mismatch", expected, got };
  }
  if (input.intent === "add" && input.existingUsernames.map(normalizeThreadsUsername).includes(got) && !expected) {
    return { kind: "same_as_existing", got };
  }
  return { kind: "ok" };
}

export type ConnectDevice = "android" | "iphone" | "pc";

export function connectDeviceOf(ua: string, maxTouchPoints = 0): ConnectDevice {
  const s = String(ua || "");
  if (/Android/i.test(s)) return "android";
  if (/iPhone|iPod|iPad/i.test(s)) return "iphone";
  if (/Macintosh/i.test(s) && maxTouchPoints > 1) return "iphone"; // iPadOS の Safari は Mac と同じ表記
  return "pc";
}

export interface GuideStep { text: string; note?: string }
export interface ConnectGuide { title: string; steps: GuideStep[] }

/**
 * つなぎたいアカウントでやり直す手順（端末ごと）。wanted は @ を付けずに渡す（無ければ「つなぎたいアカウント」）。
 * 文はお客様が読むものなので、画面の言葉（ボタン名）をそのまま使う。
 */
export function retryGuide(device: ConnectDevice, wanted?: string | null): ConnectGuide[] {
  const who = wanted ? `@${wanted}` : "つなぎたいアカウント";
  const finish: GuideStep = { text: `この画面に戻り「正しいアカウントでやり直す」を押す → ${who} でログインして「許可」を押す` };
  const pc: ConnectGuide = {
    title: "パソコンで行う（いちばん確実です）",
    steps: [
      { text: "同じブラウザで別のタブを開き、threads.com を開く" },
      { text: "左下のメニュー → 「ログアウト」を押す", note: "ログアウトしても、投稿やフォロワーは消えません" },
      finish,
      { text: "うまくいかないときは、シークレットウィンドウで threads-studio.com/login を開いてログインし、同じように進める" },
    ],
  };
  const android: ConnectGuide = {
    title: "Android のスマホで行う",
    steps: [
      { text: "スマホの「設定」→「アプリ」→「Threads」→「デフォルトで開く」を開く" },
      { text: "「対応リンクを開く」をオフにする", note: "これで連携の画面が Threads アプリではなく Chrome で開きます。終わったらオンに戻して大丈夫です" },
      { text: "Chrome で threads.com を開き、ログイン中なら一度ログアウトする" },
      finish,
    ],
  };
  const iphone: ConnectGuide = {
    title: "iPhone で行う",
    steps: [
      { text: "Threads アプリを開き、プロフィール → 右上のメニュー → 「ログアウト」を押す", note: "iPhone は連携の画面が Threads アプリで開いてしまうことがあるため、先にアプリ側を切り替えます" },
      { text: `Threads アプリのログイン画面で ${who} でログインし直す` },
      finish,
      { text: "それでも別のアカウントになるときは、パソコンでの手順が確実です" },
    ],
  };
  const order: ConnectGuide[] = device === "android" ? [android, pc] : device === "iphone" ? [iphone, pc] : [pc];
  return order;
}

/** ログインの一覧に、つなぎたいアカウントが出てこないとき（いちばん多いのは「まだ Threads を始めていない」） */
export function notListedGuide(wanted?: string | null): ConnectGuide {
  const who = wanted ? `@${wanted}` : "つなぎたいアカウント";
  return {
    title: `ログインの一覧に ${who} が出てこないとき`,
    steps: [
      { text: "一覧には、その端末に保存されているアカウントだけが出ます。一覧から選ばずに「別のプロフィールを使用」（パソコンは「Instagramでログイン」）を押す" },
      { text: `${who} のインスタのユーザーネームとパスワードを入力する` },
      { text: "そのインスタで Threads を使うのが初めてなら、プロフィール作成の画面が出ます。最後まで進めると Threads が始まります" },
      { text: "表示名が同じでも、別のアカウントのことがあります。必ず @ から始まるユーザー名で見分けてください" },
    ],
  };
}

/** 運営への知らせ（社内のメール・ログ）。お客様には送らない */
export function mismatchOwnerNote(p: { userId: number; storeName?: string | null; expected?: string | null; got: string; kind: "mismatch" | "same_as_existing"; device: ConnectDevice; decided?: "accepted" | "rejected" | null }): { title: string; content: string } {
  const what = p.kind === "mismatch"
    ? `つなぎたいのは @${p.expected} でしたが、@${p.got} がつながりかけました。`
    : `別のアカウントを足そうとして、もうつながっている @${p.got} が戻ってきました（ログイン中のアカウントが使われた形）。`;
  const decided = p.decided === "accepted" ? "ご本人が「このアカウントで使う」を選びました。" : p.decided === "rejected" ? "ご本人が「正しいアカウントでやり直す」を選びました（保存していません）。" : "保存せず、ご本人の選択を待っています。";
  return {
    title: `Threads連携：つなぎたいアカウントと違う（user=${p.userId}）`,
    content: `${p.storeName ? `${p.storeName}（user=${p.userId}）` : `user=${p.userId}`}\n${what}\n${decided}\n端末：${p.device === "android" ? "Android" : p.device === "iphone" ? "iPhone" : "パソコン"}\n止まっていたら、端末ごとの手順（Threads連携の画面に出ています）をLINEでご案内してください。`,
  };
}
