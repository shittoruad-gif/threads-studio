/**
 * LINEトーク内チャット操作のハンドラ（postback・テキストを解釈して返信を組み立てる）。
 * ここで返した messages を webhook が reply API でそのまま返す（通数を消費しない）。
 *
 * 方針: Webビューを開かせない。承認・書き直し・見送り・設定変更・成績確認まで
 * すべてトーク内の往復で完結させる。
 */
import * as db from "./db";
import {
  buildPostCards, textWithQuick, textWithChoices, parsePostback, fmtJst, REWRITE_KINDS,
  MENU_ITEMS, HELP_TOPICS, helpQuick, settingsQuick, settingsSummary,
} from "./lineChat";
import { COUNSELING_QUESTIONS } from "../shared/counseling";
import { applyPersonalOverrides } from "../shared/personalBrand";
import { saveCounselingAnswers } from "./counselingSave";

const MENU_HINT: { label: string; data: string }[] = MENU_ITEMS;

/**
 * 未連携ユーザーへの案内。
 * ★公式LINEから先に登録した方が戸惑わないよう、トーク内のボタンだけで
 *   連携まで進められるようにする（アプリ画面を探させない）。
 */
function notLinked(): unknown[] {
  return [textWithQuick(
    "まだアカウントとつながっていません。\n" +
    "下のボタンから、このトークの中で連携できます。",
    [
      { label: "連携する", data: "m=link" },
      { label: "アカウントを持っていない", data: "m=signup" },
    ],
  )];
}

/** 連携の入口（登録メールアドレスを聞く） */
async function startLinking(lineUserId: string): Promise<unknown[]> {
  await db.setLineChatState(lineUserId, "link_email");
  return [textWithQuick(
    "Threads Studio にご登録のメールアドレスを、このトークに送ってください。\n" +
    "そのアドレス宛に6桁の番号をお送りします。\n\n" +
    "（まだアカウントをお持ちでない場合は「アカウントを持っていない」を押してください）",
    [{ label: "アカウントを持っていない", data: "m=signup" }, { label: "やめる", data: "m=cancel" }],
  )];
}

/** アカウント未作成の方への案内（作成はご本人にお願いする） */
function signupGuide(): unknown[] {
  const base = process.env.APP_BASE_URL || "https://threads-studio.com";
  return [textWithQuick(
    "アカウントの作成は、こちらのページからお願いします（3分ほどで終わります）。\n" +
    `${base}/register\n\n` +
    "作成が終わったら、このトークで「連携する」を押してください。",
    [
      { label: "紹介コードをお持ちの方はこちら", data: "m=refcode" },
      { label: "連携する", data: "m=link" },
    ],
  )];
}

/** 紹介コードをお持ちの方: コードを受け取り、適用済みの登録リンクを返す */
async function askReferralCode(lineUserId: string): Promise<unknown[]> {
  await db.setLineChatState(lineUserId, "signup_code");
  return [{
    type: "text",
    text: "お持ちの紹介コードを、このトークに送ってください。\nそのコードが入った状態の登録ページのリンクをお返しします。",
  }];
}

function referralLink(lineUserId: string, code: string): Promise<unknown[]> | unknown[] {
  const base = process.env.APP_BASE_URL || "https://threads-studio.com";
  const c = code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
  if (!c) {
    return [{ type: "text", text: "コードを読み取れませんでした。もう一度送ってください。" }];
  }
  return [textWithQuick(
    `こちらのリンクから登録してください。紹介コード「${c}」が入った状態で開きます。\n` +
    `${base}/register?code=${encodeURIComponent(c)}\n\n` +
    "登録が終わったら、このトークで「連携する」を押してください。",
    [{ label: "連携する", data: "m=link" }],
  )];
}

/**
 * 入力されたメールアドレス宛に、連携用の6桁番号を送る。
 * ★存在しないアドレスでも同じ文面を返す（登録の有無を外から確かめられないようにするため）。
 */
async function sendLinkCodeByEmail(lineUserId: string, email: string): Promise<unknown[]> {
  await db.clearLineChatState(lineUserId);
  const addr = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
    await db.setLineChatState(lineUserId, "link_email");
    return [{ type: "text", text: "メールアドレスの形式が正しくないようです。もう一度送ってください。" }];
  }
  try {
    const user = await db.getUserByEmail(addr);
    if (user) {
      const { generateLinkCode, LINK_CODE_TTL_MS } = await import("./lineNotify");
      const code = generateLinkCode();
      await db.setLineLinkCode(user.id, code, new Date(Date.now() + LINK_CODE_TTL_MS));
      const { sendEmail } = await import("./_core/notification");
      await sendEmail({
        to: addr,
        subject: "【Threads Studio】LINE連携の番号（6桁）",
        html:
          "<p>公式LINEとの連携をリクエストいただきました。</p>" +
          `<p>次の6桁の番号を、LINEのトークにそのまま送ってください。</p>` +
          `<p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>` +
          "<p>この番号は10分間だけ有効です。<br>お心当たりがない場合は、このメールは破棄してください（連携は行われません）。</p>",
      });
    }
  } catch (e) {
    console.error("[LineChat] link code mail error:", e);
  }
  return [{
    type: "text",
    text:
      `${addr} 宛に6桁の番号をお送りしました。\n` +
      "届いた番号を、このトークにそのまま送ってください（10分間有効です）。\n\n" +
      "※ 数分待っても届かない場合は、ご登録のメールアドレスが違うか、迷惑メールフォルダに入っている可能性があります。",
  }];
}

/** 投稿にアカウント名（@username）を付ける。複数運用時にどれか分かるようにするため。 */
async function withAccountNames(userId: number, posts: any[]): Promise<any[]> {
  try {
    const accounts = await db.getThreadsAccountsByUserId(userId);
    const byId = new Map(accounts.map((a: any) => [a.id, a.threadsUsername]));
    return posts.map((p) => ({ ...p, accountName: byId.get(p.threadsAccountId) ?? null }));
  } catch {
    return posts;
  }
}

/** 承認待ちを1件だけ出す（1件ずつモード。残り件数も伝える） */
async function replyOneWaiting(userId: number, headText?: string): Promise<unknown[]> {
  const all = await db.getScheduledPostsByUserId(userId);
  const waiting = all
    .filter((p: any) => p.status === "awaiting_approval")
    .sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  if (waiting.length === 0) {
    return [textWithQuick((headText ? headText + "\n\n" : "") + "確認をお待ちしている投稿は、これで全部です。おつかれさまでした。", MENU_HINT)];
  }
  const withNames = await withAccountNames(userId, waiting);
  const head = (headText ? headText + "\n\n" : "") +
    (waiting.length === 1 ? "残り1件です。" : `残り${waiting.length}件です。まずこの1件から。`);
  return [{ type: "text", text: head }, buildPostCards([withNames[0]], { one: true })];
}

/** 承認待ちの投稿を出す（無ければ次の予定を伝える） */
async function repliesForPosts(userId: number, mode?: "one" | "all"): Promise<unknown[]> {
  const all = await db.getScheduledPostsByUserId(userId);
  const waiting = all
    .filter((p: any) => p.status === "awaiting_approval")
    .sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  if (waiting.length === 0) {
    const next = all
      .filter((p: any) => p.status === "pending" && new Date(p.scheduledAt).getTime() > Date.now())
      .sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];
    return [textWithQuick(
      next
        ? `いま確認をお待ちしている投稿はありません。\n次の投稿は ${fmtJst(next.scheduledAt)} に公開予定です。`
        : "いま確認をお待ちしている投稿はありません。新しい投稿ができたら、このトークでお知らせします。",
      MENU_HINT,
    )];
  }
  // 2件以上あるときは、まとめて見るか1件ずつ確認するかを選べるようにする。
  // （複数アカウント運用だと、まとめて出すとどれを処理したか分からなくなるため）
  if (waiting.length > 1 && !mode) {
    return [textWithQuick(
      `確認をお待ちしている投稿が${waiting.length}件あります。どちらで確認しますか？`,
      [
        { label: "1件ずつ確認する", data: "m=posts&one=1" },
        { label: "まとめて見る", data: "m=posts&all=1" },
      ],
    )];
  }
  if (mode === "one" || waiting.length === 1) return replyOneWaiting(userId);
  const withNames = await withAccountNames(userId, waiting);
  return [
    { type: "text", text: `確認をお待ちしている投稿が${waiting.length}件あります。内容を見て、下のボタンを押してください。` },
    buildPostCards(withNames as any),
  ];
}

/** 投稿の所有者チェック付き取得 */
async function ownedPost(userId: number, postId: number) {
  const post = await db.getScheduledPostById(postId);
  if (!post || post.userId !== userId) return null;
  return post;
}

/** 書き直し（AIに指示を渡して作り直す） */
async function rewritePost(userId: number, postId: number, instruction: string, one = false): Promise<unknown[]> {
  const post = await ownedPost(userId, postId);
  if (!post) return [{ type: "text", text: "その投稿が見つかりませんでした。" }];
  if (post.status !== "awaiting_approval") {
    return [textWithQuick("この投稿はすでに確認が終わっています。", MENU_HINT)];
  }
  try {
    const { invokeLLM } = await import("./_core/llm");
    const res = await invokeLLM({
      messages: [{
        role: "user",
        content:
          "次のSNS投稿を、指示に沿って書き直してください。\n" +
          "事実は元の文にあるものだけを使い、新しい数字・実績・料金を足さないでください。\n" +
          "ハッシュタグや絵文字は元の文の使い方に合わせてください。\n" +
          "出力は書き直した本文だけにしてください（説明や前置きは不要）。\n\n" +
          `【指示】${instruction}\n\n【元の文】\n${post.postContent || ""}`,
      }],
    });
    const next = String((res as any)?.choices?.[0]?.message?.content ?? "").trim().replace(/^["「]|["」]$/g, "");
    if (!next) throw new Error("empty");
    await db.updateScheduledPost(postId, { postContent: next });
    const updated = await db.getScheduledPostById(postId);
    const [withName] = await withAccountNames(userId, [updated as any]);
    return [
      { type: "text", text: "書き直しました。こちらでよろしければ「これで投稿する」を押してください。" },
      buildPostCards([withName], { one }),
    ];
  } catch {
    return [textWithQuick("うまく書き直せませんでした。もう一度お試しいただくか、別の言い方でお伝えください。", MENU_HINT)];
  }
}

/** 直近7日の成績（表示回数・いいねの内訳と、反応が良かった投稿） */
async function repliesForStats(userId: number): Promise<unknown[]> {
  try {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const rows = await db.getPostAnalyticsByUserId(userId);
    const recent = rows.filter((r: any) => r.postedAt && new Date(r.postedAt).getTime() >= since);
    if (recent.length === 0) {
      const all = await db.getScheduledPostsByUserId(userId);
      const posted = all.filter((p: any) => p.status === "posted" && p.postedAt && new Date(p.postedAt).getTime() >= since);
      return [textWithQuick(
        posted.length > 0
          ? `この7日間で${posted.length}件を公開しました。\n反応の数字はThreadsから取り込み中です。数時間後にもう一度ご確認ください。`
          : "この7日間に公開された投稿はまだありません。",
        MENU_HINT,
      )];
    }
    const accounts = await db.getThreadsAccountsByUserId(userId);
    const nameOf = new Map<number, string>(accounts.map((a: any) => [a.id, a.threadsUsername]));
    const sum = (k: string) => recent.reduce((n: number, r: any) => n + (Number(r[k]) || 0), 0);
    const imp = sum("impressions"), likes = sum("likes"), rep = sum("replies"), rt = sum("reposts");
    const avg = Math.round(imp / recent.length);

    // アカウントが複数あるときは内訳も出す（どのアカウントが伸びたか分かるように）
    const byAcc = new Map<number, { imp: number; likes: number; n: number }>();
    for (const r of recent as any[]) {
      const key = r.threadsAccountId ?? 0;
      const cur = byAcc.get(key) || { imp: 0, likes: 0, n: 0 };
      cur.imp += Number(r.impressions) || 0;
      cur.likes += Number(r.likes) || 0;
      cur.n += 1;
      byAcc.set(key, cur);
    }
    const accLines = byAcc.size > 1
      ? "\n\n【アカウント別】\n" + Array.from(byAcc.entries())
          .sort((a, b) => b[1].imp - a[1].imp)
          .map(([id, v]) => `・@${nameOf.get(id) ?? "（不明）"}：${v.n}件／${v.imp.toLocaleString()}回表示／いいね${v.likes}`)
          .join("\n")
      : "";

    const top = [...recent]
      .sort((a: any, b: any) => (Number(b.impressions) || 0) - (Number(a.impressions) || 0))
      .slice(0, 3)
      .map((r: any, i: number) =>
        `${i + 1}. ${(r.postContent || "").replace(/\n/g, " ").slice(0, 40)}…\n　　${(Number(r.impressions) || 0).toLocaleString()}回表示／いいね${Number(r.likes) || 0}`)
      .join("\n");

    return [textWithQuick(
      `直近7日の成績です。\n\n` +
      `・投稿数：${recent.length}件\n` +
      `・表示回数：${imp.toLocaleString()}回（1投稿あたり平均${avg.toLocaleString()}回）\n` +
      `・いいね：${likes}／返信：${rep}／リポスト：${rt}` +
      accLines +
      `\n\n【反応が良かった投稿】\n${top}`,
      MENU_HINT,
    )];
  } catch {
    return [textWithQuick("成績の取得に失敗しました。時間をおいてお試しください。", MENU_HINT)];
  }
}

/** お店・自分の情報の要約 */
async function repliesForProfile(userId: number): Promise<unknown[]> {
  try {
    const projects = await db.getProjectsByUserId(userId);
    const p: any = projects?.[0];
    if (!p) {
      return [textWithQuick(
        "まだお店の情報が登録されていません。\nこのトークで質問にお答えいただくだけで登録できます（10〜15分・全20問）。",
        [{ label: "はじめの設定を始める", data: "m=setup" }, ...MENU_HINT],
      )];
    }
    const lines = [
      p.businessType ? `・業種：${p.businessType}` : null,
      p.area ? `・エリア：${p.area}` : null,
      p.target ? `・届けたい方：${String(p.target).slice(0, 40)}` : null,
      p.strength ? `・強み：${String(p.strength).slice(0, 60)}` : null,
    ].filter(Boolean);
    return [textWithQuick(
      "登録されている内容です。\n\n" + lines.join("\n") +
      "\n\n登録し直したいときは「はじめの設定をやり直す」を押してください。",
      [{ label: "はじめの設定をやり直す", data: "m=setup" }, ...MENU_HINT],
    )];
  } catch {
    return [textWithQuick("お店の情報を読み込めませんでした。", MENU_HINT)];
  }
}


// ══════════ はじめの設定（20問）をトーク内で1問ずつ聞く ══════════
// 状態: state="counseling" / payload={mode, step, answers, projectId}
interface CounselingState { mode: "store" | "personal"; step: number; answers: Record<string, string>; projectId: string }

function questionsFor(mode: "store" | "personal") {
  return mode === "personal" ? applyPersonalOverrides(COUNSELING_QUESTIONS) : COUNSELING_QUESTIONS;
}

/** n問目を出す（選択肢はタップで送れるようにする） */
function askQuestion(st: CounselingState): unknown[] {
  const qs = questionsFor(st.mode);
  const q: any = qs[st.step];
  const total = qs.length;
  const head = `【${st.step + 1}／${total}】\n${q.prompt}`;
  const hint = q.helper ? `\n\n${q.helper}` : "";
  const skip = q.required ? "" : "\n\n（なければ「スキップ」と送ってください）";
  const choices: string[] = [];
  if (Array.isArray(q.choices)) for (const c of q.choices) choices.push(c.label);
  else if (Array.isArray(q.suggestions)) choices.push(...q.suggestions);
  if (!q.required) choices.push("スキップ");
  return [textWithChoices(head + hint + skip, choices)];
}

/** 回答を受け取り、次の質問へ進む。最後まで行ったら保存する。 */
async function advanceCounseling(userId: number, lineUserId: string, st: CounselingState, answer: string): Promise<unknown[]> {
  const qs = questionsFor(st.mode);
  const q: any = qs[st.step];
  const a = answer.trim();
  if (/^(やめる|中止|キャンセル)$/.test(a)) {
    await db.clearLineChatState(lineUserId);
    return [textWithQuick("はじめの設定を中断しました。「はじめの設定」からいつでも再開できます。", MENU_HINT)];
  }
  const skipped = /^(スキップ|なし|特になし)$/.test(a);
  if (q.required && skipped) {
    return [{ type: "text", text: "こちらは必要な項目です。おおよそで構いませんので、お答えください。" }, ...askQuestion(st)];
  }
  // choice型はラベル→valueに戻す
  let stored = skipped ? "" : a.slice(0, 500);
  if (Array.isArray(q.choices) && !skipped) {
    const hit = q.choices.find((c: any) => c.label === a || c.value === a);
    if (hit) stored = hit.value;
  }
  st.answers[q.id] = stored;
  st.step += 1;

  if (st.step < qs.length) {
    await db.setLineChatState(lineUserId, "counseling", JSON.stringify(st));
    return askQuestion(st);
  }

  // 全問終了 → 保存
  await db.clearLineChatState(lineUserId);
  const res = await saveCounselingAnswers({
    userId, projectId: st.projectId, mode: st.mode, answers: st.answers as any,
  });
  if (!res.ok) {
    return [textWithQuick("保存に失敗しました。時間をおいて「はじめの設定」からやり直してください。", MENU_HINT)];
  }
  return [textWithQuick(
    "ありがとうございました。設定が終わりました。\n\n" +
    "この内容をもとに、AIが毎日の投稿を作ります。できあがった投稿は、このトークでお知らせします。\n" +
    "内容を直したくなったら、いつでも「はじめの設定」からやり直せます。",
    MENU_HINT,
  )];
}

/** はじめの設定を開始（まず目的を選んでもらう） */
async function startCounseling(lineUserId: string): Promise<unknown[]> {
  return [textWithQuick(
    "はじめの設定を始めます（10〜15分・全20問）。\n\n" +
    "まず、何のための発信かを選んでください。\n" +
    "・お店の集客：お客様に来てもらうための発信\n" +
    "・個人にファンをつける：ご自身の名前での発信\n\n" +
    "途中でやめたいときは「やめる」と送ってください。",
    [
      { label: "お店の集客", data: "c=start&mode=store" },
      { label: "個人にファンをつける", data: "c=start&mode=personal" },
    ],
  )];
}

/**
 * postback（ボタン）を処理して返信メッセージを返す。
 */
export async function handlePostback(lineUserId: string, data: string): Promise<unknown[]> {
  const q = parsePostback(data);
  const user = await db.getUserByLineUserId(lineUserId);
  if (!user) {
    // 未連携でも、連携に関する操作だけは進められるようにする
    if (q.m === "link") return startLinking(lineUserId);
    if (q.m === "signup") return signupGuide();
    if (q.m === "refcode") return askReferralCode(lineUserId);
    if (q.m === "cancel") {
      await db.clearLineChatState(lineUserId);
      return notLinked();
    }
    return notLinked();
  }

  // ── メニュー ──
  if (q.m === "posts") return repliesForPosts(user.id, q.one ? "one" : q.all ? "all" : undefined);
  if (q.m === "stats") return repliesForStats(user.id);
  if (q.m === "profile") return repliesForProfile(user.id);
  if (q.m === "help") return [textWithQuick("よくあるご質問です。知りたいものを選んでください。", helpQuick())];
  if (q.m === "setup") return startCounseling(lineUserId);
  if (q.c === "start" && (q.mode === "store" || q.mode === "personal")) {
    // 既存プロジェクトがあればそれを更新、無ければ新規IDで作る
    const projects = await db.getProjectsByUserId(user.id);
    const projectId = (projects?.[0] as any)?.id || `line_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const st: CounselingState = { mode: q.mode, step: 0, answers: {}, projectId };
    await db.setLineChatState(lineUserId, "counseling", JSON.stringify(st));
    return [
      { type: "text", text: q.mode === "personal" ? "「個人にファンをつける」で進めます。" : "「お店の集客」で進めます。" },
      ...askQuestion(st),
    ];
  }
  if (q.m === "menu") return [textWithQuick("どれをご覧になりますか？", MENU_HINT)];
  if (q.m === "cancel") {
    await db.clearLineChatState(lineUserId);
    return [textWithQuick("中断しました。", MENU_HINT)];
  }
  if (q.m === "link" || q.m === "signup") {
    // ★連携より前から友だち追加していた方は、未連携むけメニューのまま残ってしまう。
    //   ここを押した＝そのメニューが出ている証拠なので、通常メニューに直す。
    try {
      const { switchToMainRichMenu } = await import("./lineNotify");
      await switchToMainRichMenu(lineUserId);
    } catch { /* 切替に失敗しても案内は返す */ }
    return [textWithQuick(
      "このLINEはすでに連携できています。\n下のメニューを、いつものメニュー（投稿の確認・設定など）に切り替えました。\n\n" +
      "※ 切り替わって見えないときは、トークをいったん閉じて開き直してください。",
      MENU_HINT,
    )];
  }
  if (q.m === "settings") {
    const s = (await db.getAutoPostSettings(user.id)) || {};
    return [textWithQuick(settingsSummary(s as any), settingsQuick(s as any))];
  }
  if (q.m === "comments") {
    return [textWithQuick(
      "新しいコメントが届いたときは、このトークで内容と返信の文案をお送りします。\n" +
      "※ コメントへの返信の送信は、現在Meta社の追加審査の承認待ちです。承認され次第、このトークから返信できるようにします。",
      MENU_HINT,
    )];
  }

  // ── 投稿の操作 ──
  if (q.a === "ok" && q.i) {
    const post = await ownedPost(user.id, Number(q.i));
    if (!post) return [{ type: "text", text: "その投稿が見つかりませんでした。" }];
    if (post.status !== "awaiting_approval") return [textWithQuick("この投稿はすでに確認が終わっています。", MENU_HINT)];
    const now = new Date();
    const scheduledAt = post.scheduledAt && new Date(post.scheduledAt) > now ? undefined : now;
    await db.updateScheduledPost(Number(q.i), { status: "pending", ...(scheduledAt ? { scheduledAt } : {}) });
    const when = scheduledAt ? "まもなく" : `${fmtJst(post.scheduledAt)} に`;
    const done = `承認しました。${when}公開されます。`;
    // 1件ずつモードなら、続けて次の1件を出す（どれを処理したか分からなくならない）
    if (q.o) return replyOneWaiting(user.id, done);
    return [textWithQuick(done, MENU_HINT)];
  }
  if (q.a === "skip" && q.i) {
    const post = await ownedPost(user.id, Number(q.i));
    if (!post) return [{ type: "text", text: "その投稿が見つかりませんでした。" }];
    await db.updateScheduledPost(Number(q.i), { status: "canceled" });
    const done = "この投稿は見送りにしました。明日の投稿はまた新しく作ります。";
    if (q.o) return replyOneWaiting(user.id, done);
    return [textWithQuick(done, MENU_HINT)];
  }
  if (q.a === "rw" && q.i) {
    const items = Object.entries(REWRITE_KINDS).map(([k, v]) => ({ label: v.label, data: `a=rw2&i=${q.i}&k=${k}${q.o ? "&o=1" : ""}` }));
    await db.setLineChatState(lineUserId, "rewrite_free", JSON.stringify({ i: q.i, o: q.o ? 1 : 0 }));
    return [textWithQuick(
      "どんなふうに直しますか？\n下から選ぶか、ご希望をそのまま文章で送ってください（例：「クーポンの話を入れて」）。",
      items,
    )];
  }
  if (q.a === "rw2" && q.i && q.k) {
    await db.clearLineChatState(lineUserId);
    const kind = REWRITE_KINDS[q.k];
    if (!kind) return [{ type: "text", text: "選択を読み取れませんでした。" }];
    return rewritePost(user.id, Number(q.i), kind.instruction, !!q.o);
  }

  // ── 設定 ──
  if (q.s === "auto") {
    await db.updateAutoPostSettings(user.id, { autoPostEnabled: q.v === "on" });
    return [textWithQuick(q.v === "on" ? "自動投稿を始めました。明日から毎日投稿します。" : "自動投稿を止めました。再開したいときは「設定」からどうぞ。", MENU_HINT)];
  }
  if (q.s === "appr") {
    await db.updateAutoPostSettings(user.id, { autoPostRequireApproval: q.v === "on" });
    return [textWithQuick(q.v === "on" ? "公開前に、このトークで確認できるようにしました。" : "確認なしで公開するようにしました。おまかせで毎日投稿されます。", MENU_HINT)];
  }
  if (q.s === "len") {
    const v = q.v === "long" ? "long" : q.v === "alt" ? "alternate" : "short";
    await db.updateAutoPostSettings(user.id, { postLength: v });
    return [textWithQuick(`投稿の長さを「${v === "long" ? "長め" : v === "alternate" ? "交互" : "短め"}」に変えました。`, MENU_HINT)];
  }
  if (q.s === "ng") {
    await db.setLineChatState(lineUserId, "ngword");
    return [{ type: "text", text: "投稿で使ってほしくない言葉を送ってください（いくつかある場合は、読点や改行で区切ってください）。" }];
  }

  // ── ヘルプ ──
  if (q.h) {
    const t = HELP_TOPICS.find((x) => x.key === q.h);
    if (t) return [textWithQuick(t.a, helpQuick())];
  }
  return [textWithQuick("うまく受け取れませんでした。下から選んでください。", MENU_HINT)];
}

/**
 * 自由文を処理する。入力待ちの状態があればそれとして扱い、無ければメニューを返す。
 * 連携コード・「解除」は webhook 側で先に処理される。
 */
export async function handleFreeText(lineUserId: string, text: string): Promise<unknown[] | null> {
  const user = await db.getUserByLineUserId(lineUserId);

  // ★未連携でも、メールアドレスの入力待ちなら受け付ける（LINE内で連携を完結させる）
  if (!user) {
    const pending = await db.getLineChatState(lineUserId);
    if (pending?.state === "link_email") return sendLinkCodeByEmail(lineUserId, text);
    if (pending?.state === "signup_code") {
      await db.clearLineChatState(lineUserId);
      return referralLink(lineUserId, text) as unknown[];
    }
    if (/^(連携|れんけい|連携する)$/.test(text.trim())) return startLinking(lineUserId);
    return notLinked();
  }

  const st = await db.getLineChatState(lineUserId);
  if (st?.state === "counseling" && st.payload) {
    try {
      const cs: CounselingState = JSON.parse(st.payload);
      return await advanceCounseling(user.id, lineUserId, cs, text);
    } catch {
      await db.clearLineChatState(lineUserId);
      return [textWithQuick("設定の途中で問題が起きました。「はじめの設定」からやり直してください。", MENU_HINT)];
    }
  }
  if (st?.state === "rewrite_free" && st.payload) {
    await db.clearLineChatState(lineUserId);
    let postId = 0, one = false;
    try {
      const p = JSON.parse(st.payload);
      postId = Number(p.i); one = !!p.o;
    } catch { postId = Number(st.payload); }
    return rewritePost(user.id, postId, text.slice(0, 200), one);
  }
  if (st?.state === "ngword") {
    await db.clearLineChatState(lineUserId);
    const words = text.split(/[、,\n]/).map((w) => w.trim()).filter(Boolean).slice(0, 20);
    if (words.length === 0) return [textWithQuick("言葉を読み取れませんでした。", MENU_HINT)];
    try {
      // NGワードはプロジェクト（お店の情報）側に保持している
      const projects = await db.getProjectsByUserId(user.id);
      const project: any = projects?.[0];
      if (!project) return [textWithQuick("先にお店の情報の登録が必要です。", MENU_HINT)];
      const cur = String(project.ngWords || "").split(/[、,\n]/).map((w: string) => w.trim()).filter(Boolean);
      const merged = Array.from(new Set([...cur, ...words]));
      await db.updateProject(project.id, { ngWords: merged.join("、") } as any);
      return [textWithQuick(`「${words.join("」「")}」を、使わない言葉として登録しました。以後の投稿では避けます。`, MENU_HINT)];
    } catch {
      return [textWithQuick("登録に失敗しました。時間をおいてお試しください。", MENU_HINT)];
    }
  }

  // 「メニュー」「使い方」などのキーワードにも反応する
  const t = text.trim();
  if (/^(メニュー|めにゅー|menu)$/i.test(t)) return [textWithQuick("どれをご覧になりますか？", MENU_HINT)];
  if (/(投稿|承認).{0,4}(確認|見たい|見る)|^今日の投稿$/.test(t)) return handlePostback(lineUserId, "m=posts");
  if (/^(設定|せってい)$/.test(t)) return handlePostback(lineUserId, "m=settings");
  if (/^(追加|ついか)$/.test(t)) {
    return [{ type: "text", text: "他の方も操作できるようにするには、アプリの設定画面で6桁のコードを発行し、そのコードをその方のLINEからこのトークに送ってもらってください。" }];
  }
  return [textWithQuick(
    "ご用件を下から選んでください。投稿の確認・書き直し・設定の変更は、このトークの中で終わります。",
    MENU_HINT,
  )];
}
