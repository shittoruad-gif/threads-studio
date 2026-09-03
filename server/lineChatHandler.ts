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
  MENU_ITEMS, HELP_TOPICS, helpQuick, settingsQuick, settingsSummary, shouldClearPendingInput,
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
    "ご利用にはアカウントの登録が必要です。\n\n" +
    "はじめての方は「会員登録する」から、3分ほどで作れます。\n" +
    "すでにご登録済みの方は「登録済みの方はこちら」を押してください。",
    [
      { label: "会員登録する", data: "m=signup" },
      { label: "登録済みの方はこちら", data: "m=link" },
      { label: "紹介コードをお持ちの方", data: "m=refcode" },
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
    "こちらのページから、会員登録をお願いします（3分ほどで終わります）。\n" +
    `${base}/register\n\n` +
    "ご登録が終わると、そのまま料金プランの画面が開きます。\n" +
    "無料のフリープランから始めることもできます。\n\n" +
    "登録が終わったら、このトークで「登録済みの方はこちら」を押してください。",
    [
      { label: "紹介コードをお持ちの方", data: "m=refcode" },
      { label: "登録済みの方はこちら", data: "m=link" },
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

/**
 * 紹介コードを受け取ったときの案内。
 *
 * ★決済リンクを先にお渡ししてはいけない。
 *   お支払いとアプリのアカウントは「決済時のメールアドレス」で結び付けているため、
 *   アプリ登録より先にお支払いされると、どなたの契約か分からず反映されない。
 *   そのため必ず「登録 → 料金プランを選ぶ」の順にご案内する。
 *   （登録直後は料金ページに着くようにしてあるので、実際の手数は変わらない）
 */
async function referralLink(lineUserId: string, code: string, userId?: number): Promise<unknown[]> {
  const base = process.env.APP_BASE_URL || "https://threads-studio.com";
  const { normalizeCouponCode } = await import("@shared/inputNormalize");
  const c = normalizeCouponCode(code).replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
  if (!c) {
    return [{ type: "text", text: "コードを読み取れませんでした。もう一度送ってください。" }];
  }

  // そのコードが本当に使えるかを確かめる（間違ったコードで登録まで進ませない）
  let valid = false;
  let planLines = "";
  try {
    const { validateCoupon } = await import("./coupon");
    const v = await validateCoupon(c);
    valid = Boolean(v.valid);
    if (valid) {
      const { campaignTierForCode, getCampaignCounterpart } = await import("@shared/plans");
      const tier = campaignTierForCode(c);
      const rows = ["light", "pro", "business"]
        .map((id) => getCampaignCounterpart(id, tier))
        .filter(Boolean)
        .map((p: any) => `・${p.name}：月額 ${p.priceMonthly.toLocaleString()}円（税込）`);
      if (rows.length) {
        planLines = "\n\nこのコードで、次の価格でお申し込みいただけます。\n" + rows.join("\n");
      }
    }
  } catch (e) {
    console.error("[LineChat] 紹介コードの確認に失敗:", e);
  }

  if (!valid) {
    const base2 = process.env.APP_BASE_URL || "https://threads-studio.com";
    return [textWithQuick(
      `「${c}」という紹介コードは見つかりませんでした。\n` +
      "お手元の案内をもう一度ご確認のうえ、お送りください。\n\n" +
      "コードをお持ちでなくても、通常価格でご登録いただけます。\n" +
      `${base2}/register`,
      [{ label: "担当者に聞く", data: "m=staff" }],
    )];
  }

  // すでにアカウントとつながっている方は、その場でコードを適用して
  // 料金ページ（キャンペーン価格が出た状態）へご案内する。
  if (userId) {
    let applied = false;
    try {
      const { applyCoupon } = await import("./coupon");
      const res = await applyCoupon(userId, c);
      applied = Boolean(res.success);
    } catch (e) {
      console.error("[LineChat] 紹介コードの適用に失敗:", e);
    }
    return [textWithQuick(
      (applied
        ? `紹介コード「${c}」を適用しました。`
        : `紹介コード「${c}」は、すでに適用されています。`) +
      planLines +
      "\n\n下のリンクから、お申し込みいただけます。\n" +
      `${base}/pricing?openExternalBrowser=1\n\n` +
      "※ キャンペーン価格でのお申し込みには無料トライアルは付かず、お申し込み時に初回のお支払いが発生します。",
      MENU_HINT,
    )];
  }

  return [textWithQuick(
    `紹介コード「${c}」を確認しました。` + planLines +
    "\n\nこちらのリンクから、コードが入った状態でご登録いただけます。\n" +
    `${base}/register?code=${encodeURIComponent(c)}\n\n` +
    "ご登録が終わると、そのまま料金プランの画面が開きます。そこでプランを選ぶと、お支払いに進めます。\n" +
    "※ キャンペーン価格でのお申し込みには無料トライアルは付かず、お申し込み時に初回のお支払いが発生します。\n\n" +
    "お申し込みのあとで、このトークの「連携する」を押してください。",
    [{ label: "連携する", data: "m=link" }, { label: "担当者に聞く", data: "m=staff" }],
  )];
}

/**
 * 入力されたメールアドレス宛に、連携用の6桁番号を送る。
 * ★存在しないアドレスでも同じ文面を返す（登録の有無を外から確かめられないようにするため）。
 */
async function sendLinkCodeByEmail(lineUserId: string, email: string): Promise<unknown[]> {
  await db.clearLineChatState(lineUserId);
  const { normalizeEmail } = await import("@shared/inputNormalize");
  const addr = normalizeEmail(email);
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
        { label: `すべて承認する（${waiting.length}件）`, data: "a=okall" },
      ],
    )];
  }
  if (mode === "one" || waiting.length === 1) return replyOneWaiting(userId);
  const withNames = await withAccountNames(userId, waiting);
  return [
    { type: "text", text: `確認をお待ちしている投稿が${waiting.length}件あります。内容を見て、下のボタンを押してください。\n全部そのままでよければ「すべて承認する」で一度に終わります。` },
    buildPostCards(withNames as any, { bulk: true }),
  ];
}

/** ご契約プラン（実効プラン）を取得する。プランごとの上限判定に使う。 */
async function planOf(userId: number) {
  try {
    const sub = await db.getSubscriptionByUserId(userId);
    const { getPlan, resolveEffectivePlanId } = await import("@shared/plans");
    return { plan: getPlan(resolveEffectivePlanId(sub?.planId, sub?.status)) };
  } catch {
    return { plan: undefined as any };
  }
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

/**
 * Threadsアカウントの連携案内。
 * ★連携そのもの（Metaの認証）はブラウザでしか行えないため、
 *   トークでは「いま何件つないでいるか・あと何件つなげるか・どこから連携するか」を示す。
 */
async function repliesForConnect(userId: number): Promise<unknown[]> {
  const base = process.env.APP_BASE_URL || "https://threads-studio.com";
  try {
    const accounts = await db.getThreadsAccountsByUserId(userId);
    const active = accounts.filter((a: any) => a.isActive);
    const sub = await db.getSubscriptionByUserId(userId);
    const { getPlan, resolveEffectivePlanId } = await import("@shared/plans");
    const plan = getPlan(resolveEffectivePlanId(sub?.planId, sub?.status));
    const max = plan?.features.maxThreadsAccounts ?? 1;
    const maxLabel = max === -1 ? "無制限" : `${max}件`;
    const rest = max === -1 ? "無制限" : `${Math.max(0, max - active.length)}件`;
    const list = active.length > 0
      ? active.map((a: any, i: number) => `${i + 1}. @${a.threadsUsername}`).join("\n")
      : "（まだありません）";
    const full = max !== -1 && active.length >= max;
    return [textWithQuick(
      `いま連携しているThreadsアカウントです。\n\n${list}\n\n` +
      `ご契約のプラン：${plan?.name ?? "—"}（連携できる上限 ${maxLabel}）\n` +
      `あと ${rest} 追加できます。\n\n` +
      (full
        ? "上限に達しているため、追加するには不要なアカウントの連携を解除するか、上位プランへの変更が必要です。"
        : "追加する場合は、こちらを開いて「Threadsと連携する」を押してください。\n" +
          `${base}/threads-connect?openExternalBrowser=1&from=line\n\n` +
          "※ このリンクは、SafariやChromeなどいつものブラウザで自動的に開きます（Threads側の認証があるため、LINEの中のブラウザでは進めないことがあります）。\n" +
          "※ もしLINEの中で開いてしまった場合は、画面右下の「…」から「他のブラウザで開く」を選んでください。\n" +
          "※ 追加したいアカウントでThreadsにログインした状態で開くと、そのアカウントがつながります。\n" +
          "※ 連携が終わったら、画面の「LINEに戻る」からこのトークへ戻れます。"),
      MENU_HINT,
    )];
  } catch {
    return [textWithQuick(
      `Threadsアカウントの連携は、こちらから行えます。\n${base}/threads-connect?openExternalBrowser=1&from=line\n\n` +
      "※ いつものブラウザで開きます。LINEの中で開いた場合は、右下の「…」から「他のブラウザで開く」を選んでください。",
      MENU_HINT,
    )];
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
/** a= で指定されたアカウント（本人のもの限定）。指定が無ければ null */
async function ownedAccountOrNull(userId: number, a?: string): Promise<any | null> {
  if (!a) return null;
  const acct: any = await db.getThreadsAccountById(Number(a)).catch(() => null);
  return acct && acct.userId === userId ? acct : null;
}

/**
 * 「@xxx の」という接頭辞（複数アカウント運用のときだけ。1つなら空文字）。
 * どのアカウントの操作かが常に分かるようにするため。
 */
async function accountLabel(userId: number, accountId: number): Promise<string> {
  try {
    const accts = (await db.getThreadsAccountsByUserId(userId)).filter((a: any) => a.isActive !== false);
    if (accts.length < 2) return "";
    const a: any = accts.find((x: any) => Number(x.id) === Number(accountId));
    return a ? `@${a.threadsUsername || a.threadsUserId} の` : "";
  } catch { return ""; }
}

interface CounselingState {
  mode: "store" | "personal";
  /** どのアカウントの設定かの表示名（複数運用時のみ。質問の見出しに出す） */
  accountName?: string | null;
  step: number;
  answers: Record<string, string>;
  projectId: string;
  /** 確認画面から1問だけ直しているとき、その質問番号（0始まり）。直し終えたら確認画面へ戻る。 */
  editing?: number | null;
  /** どのThreadsアカウントの設定か（複数運用時。1つだけなら未設定） */
  accountId?: number | null;
  /**
   * 時間が空いたあとに送られてきた文章。
   * 「続きから再開する」を選ばれたら、いま出している質問への回答として使う。
   * （再開の確認をしている間、お客様が書いた文章を捨てないため）
   */
  pending?: string | null;
}

/**
 * 「はじめの設定」を続きから再開できる猶予。
 * これを過ぎたものは、設定の途中ではなく通常のご質問として扱う。
 */
const COUNSELING_RESUME_LIMIT_MIN = 60 * 24 * 14;

/**
 * 中断している「はじめの設定」があれば、その中身を返す。
 * いまの状態が別の操作で上書きされている場合は、控えの方を見る。
 */
async function unfinishedCounseling(lineUserId: string): Promise<CounselingState | null> {
  const live = await db.getLineChatStateIgnoringTtl(lineUserId);
  const raw = live?.state === "counseling" && live.payload
    ? live
    : await db.getLineChatStateIgnoringTtl(db.counselingBackupKey(lineUserId));
  if (!raw || raw.state !== "counseling" || !raw.payload) return null;
  if (raw.ageMin > COUNSELING_RESUME_LIMIT_MIN) return null;
  try {
    const cs: CounselingState = JSON.parse(raw.payload);
    // 1問も答えていないものは、失うものが無いので再開を持ち出さない
    if (!cs || typeof cs.step !== "number" || cs.step <= 0) return null;
    return cs;
  } catch {
    return null;
  }
}

/** 途中経過の控えを片づける（登録が終わった・やり直すと決めたとき） */
async function clearCounselingBackup(lineUserId: string): Promise<void> {
  try {
    await db.clearLineChatState(db.counselingBackupKey(lineUserId));
  } catch (e) {
    console.error("[LineChat] 途中経過の控えの削除に失敗:", e);
  }
}

/**
 * 「続きから再開しますか？」とお尋ねする。
 * ★お客様がいま書いた文章は payload に預かっておき、再開を選ばれたら回答として使う。
 */
async function offerCounselingResume(
  lineUserId: string,
  cs: CounselingState,
  pending?: string,
): Promise<unknown[]> {
  const qs = questionsFor(cs.mode);
  const done = Math.min(cs.step, qs.length);
  if (pending !== undefined) {
    cs.pending = pending.slice(0, 500);
  }
  // 控えの方に残っていた場合もあるので、いまの状態として書き戻しておく
  await db.setLineChatState(lineUserId, "counseling", JSON.stringify(cs));
  const atReview = cs.step >= qs.length;
  const where = atReview
    ? "最後の確認まで進んでいます。"
    : `${qs.length}問のうち ${done}問目まで、お答えいただいています。`;
  const kept = pending !== undefined && !atReview
    ? "\n\nいま送っていただいた文章は、お預かりしています。「続きから」を選んでいただくと、そのまま次の回答として使います。"
    : "";
  return [textWithQuick(
    "「はじめの設定」が途中のままになっています。\n" + where + kept +
    "\n\nどちらになさいますか？",
    [
      { label: "続きから", data: "c=resume" },
      { label: "最初からやり直す", data: `c=start&mode=${cs.mode}&fresh=1` },
      { label: "設定はやめる", data: "m=cancel" },
    ],
  )];
}

function questionsFor(mode: "store" | "personal") {
  return mode === "personal" ? applyPersonalOverrides(COUNSELING_QUESTIONS) : COUNSELING_QUESTIONS;
}

/** n問目を出す（選択肢はタップで送れるようにする） */
function askQuestion(st: CounselingState): unknown[] {
  const qs = questionsFor(st.mode);
  const q: any = qs[st.step];
  const total = qs.length;
  const editing = st.editing !== null && st.editing !== undefined;
  const who = st.accountName ? `${st.accountName} の設定　` : "";
  const head = editing
    ? `【${who}${st.step + 1}問目を直します】\n${q.prompt}`
    : `【${who}${st.step + 1}／${total}】\n${q.prompt}`;
  const hint = q.helper ? `\n\n${q.helper}` : "";
  const skip = q.required ? "" : "\n\n（なければ下の「スキップ」を押してください）";
  const back = editing
    ? "\n\n（直すのをやめる場合は下の「戻る」を押してください）"
    : st.step > 0
      ? "\n\n（1つ前の質問に戻る場合は下の「戻る」を押してください）"
      : "";
  const choices: string[] = [];
  if (Array.isArray(q.choices)) for (const c of q.choices) choices.push(c.label);
  else if (Array.isArray(q.suggestions)) choices.push(...q.suggestions);
  if (!q.required) choices.push("スキップ");
  if (editing || st.step > 0) choices.push("戻る");
  return [textWithChoices(head + hint + skip + back, choices)];
}

/**
 * 全問の回答を一覧で見せる確認画面。
 * ここから「◯番を直す」で1問だけ直せる（直したらまたこの画面に戻る）。
 */
function reviewCounseling(st: CounselingState): unknown[] {
  const qs = questionsFor(st.mode);
  const lines = qs.map((q: any, i: number) => {
    const v = (st.answers[q.id] ?? "").trim();
    const shown = v ? (v.length > 40 ? v.slice(0, 40) + "…" : v) : "（未記入）";
    // 質問文は1行目だけを見出しに使う（長い質問文をそのまま出すと読みにくいため）
    const title = String(q.prompt).split("\n")[0].replace(/[。？]$/, "").slice(0, 22);
    return `${i + 1}. ${title}\n　 ${shown}`;
  });
  return [
    { type: "text", text: "入力いただいた内容です。ご確認ください。\n\n" + lines.slice(0, 10).join("\n") },
    textWithQuick(
      lines.slice(10).join("\n") +
      "\n\nこの内容でよろしければ「登録する」を押してください。\n直したい項目がある場合は「直す」を押して、番号を送ってください。",
      [
        { label: "この内容で登録する", data: "c=save" },
        { label: "直す", data: "c=edit" },
      ],
    ),
  ];
}

/** 回答を受け取り、次の質問へ進む。全問終わったら確認画面を出す。 */
async function advanceCounseling(userId: number, lineUserId: string, st: CounselingState, answer: string): Promise<unknown[]> {
  const qs = questionsFor(st.mode);
  const q: any = qs[st.step];
  const a = answer.trim();
  if (/^(やめる|中止|キャンセル)$/.test(a)) {
    await db.clearLineChatState(lineUserId);
    await clearCounselingBackup(lineUserId);
    return [textWithQuick("はじめの設定を中断しました。「はじめの設定」からいつでも再開できます。", MENU_HINT)];
  }
  // ★「戻る」＝1つ前の質問へ（直している最中なら確認画面へ戻る）
  if (/^(戻る|もどる|ひとつ前|1つ前)$/.test(a)) {
    if (st.editing !== null && st.editing !== undefined) {
      st.editing = null;
      st.step = qs.length; // 確認画面の位置に戻す
      await db.setLineChatState(lineUserId, "counseling", JSON.stringify(st));
      return reviewCounseling(st);
    }
    if (st.step === 0) {
      await db.clearLineChatState(lineUserId);
      return startCounseling(lineUserId);
    }
    st.step -= 1;
    await db.setLineChatState(lineUserId, "counseling", JSON.stringify(st));
    return askQuestion(st);
  }
  const skipped = /^(スキップ|なし|特になし)$/.test(a);
  if (q.required && skipped) {
    return [{ type: "text", text: "こちらは必要な項目です。おおよそで構いませんので、お答えください。" }, ...askQuestion(st)];
  }
  let stored = skipped ? "" : a.slice(0, 500);
  if (Array.isArray(q.choices) && !skipped) {
    const hit = q.choices.find((c: any) => c.label === a || c.value === a);
    if (hit) stored = hit.value;
  }
  st.answers[q.id] = stored;

  // 確認画面から1問だけ直していた場合は、直したら確認画面に戻る
  if (st.editing !== null && st.editing !== undefined) {
    st.editing = null;
    st.step = qs.length; // ★確認画面の位置に戻す（戻さないと次の入力が質問の続きになる）
    await db.setLineChatState(lineUserId, "counseling", JSON.stringify(st));
    return [{ type: "text", text: `${q.prompt.split("\n")[0].slice(0, 20)} を直しました。` }, ...reviewCounseling(st)];
  }

  st.step += 1;
  await db.setLineChatState(lineUserId, "counseling", JSON.stringify(st));
  if (st.step < qs.length) return askQuestion(st);
  return reviewCounseling(st);
}

/** 確認画面から「登録する」で保存する */
async function saveCounselingFromChat(userId: number, lineUserId: string, st: CounselingState): Promise<unknown[]> {
  await db.clearLineChatState(lineUserId);
  await clearCounselingBackup(lineUserId);
  const res = await saveCounselingAnswers({
    userId, projectId: st.projectId, mode: st.mode, answers: st.answers as any,
  });
  // 指定のアカウントに、いま登録したお店の情報を結びつける（そのアカウントの投稿に使われる）
  if (res.ok && st.accountId) {
    try {
      await db.updateThreadsAccount(st.accountId, { defaultProjectId: st.projectId } as any);
    } catch (e) {
      console.error("[LineChat] アカウントと店舗情報の紐づけに失敗:", e);
    }
  }
  if (!res.ok) {
    return [textWithQuick("保存に失敗しました。時間をおいて「はじめの設定」からやり直してください。", MENU_HINT)];
  }
  // ★ここで「毎日投稿します」と言い切ってはいけない。
  //   Threads未連携／自動投稿のないプランでは実際には投稿されず、
  //   案内と実態が食い違って「動いていない」という問い合わせになる。
  //   いまの状態で本当に次に必要なことだけを案内する。
  let accounts: any[] = [];
  try { accounts = (await db.getThreadsAccountsByUserId(userId)) || []; } catch { accounts = []; }
  const { plan } = await planOf(userId);
  const maxPerDay = Number(plan?.features?.maxAutoPostsPerDay ?? 0);
  const base = process.env.APP_BASE_URL || "https://threads-studio.com";

  const head = "ありがとうございました。設定が終わりました。\n内容を直したくなったら、いつでも「お店の情報」から確認・修正できます。\n\n";

  if (accounts.length === 0) {
    return [textWithQuick(
      head +
      "次にやることが1つあります。\n" +
      "まだThreadsのアカウントとつながっていないため、このままでは投稿ができません。\n" +
      "下の「アカウント連携」から、Threadsとつないでください。",
      [{ label: "アカウント連携", data: "m=connect" }, ...MENU_HINT],
    )];
  }
  if (maxPerDay <= 0) {
    return [textWithQuick(
      head +
      "ご利用中のフリープランでは、毎日の自動投稿はご利用いただけません（手動での作成はお試しいただけます）。\n" +
      "毎日の自動投稿をご利用になる場合は、プランのご変更をお願いします。\n" +
      `${base}/pricing?openExternalBrowser=1`,
      [{ label: "プランを見る", data: "s=plan" }, ...MENU_HINT],
    )];
  }
  // ★契約中の方には、最後に「自動投稿を始めるか」をご本人に決めていただく。
  //   黙ってONで始めると、心の準備がないうちにお店の名前で投稿が公開される。
  //   逆に黙ってOFFだと「契約したのに何も起きない」になる。どちらも避ける。
  let curSettings: any = null;
  try { curSettings = await db.getAutoPostSettings(userId); } catch { curSettings = null; }
  const want = curSettings?.autoPostFrequency === "three_daily" ? 3
    : curSettings?.autoPostFrequency === "twice_daily" ? 2 : 1;
  const perDay = Math.min(want, maxPerDay);
  const approvalNote = curSettings?.autoPostRequireApproval
    ? "公開する前に、このトークで内容を確認できます。\n"
    : "確認なしでそのまま公開されます（「設定」で公開前の確認に変えられます）。\n";
  return [textWithQuick(
    head +
    "最後に1つだけ、お伺いします。\n\n" +
    "毎日の自動投稿を、いまから始めますか？\n\n" +
    `始めると、明日から1日${perDay}回、この内容をもとにAIが投稿を作ります。\n` +
    approvalNote +
    "\nあとから「設定」でいつでも切り替えられます。",
    [
      { label: "自動投稿を始める", data: "c=setupauto&v=on" },
      { label: "いまは始めない", data: "c=setupauto&v=off" },
    ],
  )];
}

/** はじめの設定を開始（まず目的を選んでもらう） */
async function startCounseling(lineUserId: string, accountId?: number | null): Promise<unknown[]> {
  const a = accountId ? `&a=${accountId}` : "";
  return [textWithQuick(
    "はじめの設定を始めます（10〜15分・全20問）。\n\n" +
    "まず、何のための発信かを選んでください。\n" +
    "・お店の集客：お客様に来てもらうための発信\n" +
    "・個人にファンをつける：ご自身の名前での発信\n\n" +
    "途中でやめたいときは「やめる」と送ってください。",
    [
      { label: "お店の集客", data: `c=start&mode=store${a}` },
      { label: "個人にファンをつける", data: `c=start&mode=personal${a}` },
    ],
  )];
}

/**
 * 文章の入力待ちのまま別のボタンを押されたときに、その待ち状態をやめる。
 * どの状態をやめるかの判断は shouldClearPendingInput（lineChat.ts）にある。
 */
async function clearPendingTextInput(lineUserId: string, q: Record<string, string>): Promise<void> {
  try {
    const st = await db.getLineChatState(lineUserId);
    if (shouldClearPendingInput(st?.state, q)) await db.clearLineChatState(lineUserId);
  } catch {
    // 状態を消せなくても、ボタンの処理そのものは続ける
  }
}

/**
 * postback（ボタン）を処理して返信メッセージを返す。
 */
export async function handlePostback(lineUserId: string, data: string): Promise<unknown[]> {
  const q = parsePostback(data);
  const user = await db.getUserByLineUserId(lineUserId);
  // 友だち追加だけの方へのご案内を止める（連携前でも押せる必要がある）
  if (q.f === "off") {
    await db.setLineFollowerOptOut(lineUserId, true);
    return [{ type: "text", text: "承知しました。ご案内は今後お送りしません。\nご利用になりたくなったら、いつでもこのトークからお進みいただけます。" }];
  }

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

  // ★文章の入力をお待ちしている途中で、別のボタンを押されたら、その待ち状態をやめる。
  //
  //   これが無いと、お客様が「NGワードを追加」を押したあと気が変わってメニューへ
  //   移られても待ち状態が残り、次に打たれた文章が言葉として登録されてしまう。
  //   実際に「プロプランは1日何回まで投稿できますか？」というご質問が、そのまま
  //   使わない言葉として登録される（＝以後の投稿がその言い回しを避ける）状態だった。
  //   公式LINEのURL待ちでも同じで、何を打っても「URLの形になっていない」と返り、
  //   「やめる」と打つまで抜け出せなかった。
  //
  //   「はじめの設定」(counseling) と連携の途中(link_email/signup_code)は、
  //   ボタン操作も含めて流れの一部なので消さない。
  await clearPendingTextInput(lineUserId, q);

  // ── メニュー ──
  if (q.m === "posts") return repliesForPosts(user.id, q.one ? "one" : q.all ? "all" : undefined);
  if (q.m === "stats") return repliesForStats(user.id);
  if (q.m === "profile") return repliesForProfile(user.id);
  if (q.m === "connect") return repliesForConnect(user.id);
  // ★「お店・アカウント」= 店舗情報とThreads連携の入口をまとめる。
  //   2つ目のアカウントをつなぐ導線が見つからない、という声への対応。
  if (q.m === "account") {
    const accounts = (await db.getThreadsAccountsByUserId(user.id)).filter((a: any) => a.isActive);
    const projects = await db.getProjectsByUserId(user.id);
    const list = accounts.length > 0
      ? accounts.map((a: any) => `・@${a.threadsUsername}`).join("\n")
      : "（まだ連携していません）";
    return [textWithQuick(
      "連携中のThreadsアカウント\n" + list +
      `\n\n登録済みのお店の情報：${projects?.length ?? 0}件\n\n` +
      "やりたいことを選んでください。",
      [
        { label: "Threadsアカウントを追加", data: "m=connect" },
        { label: "お店の情報を登録・やり直す", data: "m=setup" },
        { label: "公式LINEのURLを登録", data: "c=seturl" },
        { label: "登録内容を見る", data: "m=profile" },
      ],
    )];
  }
  if (q.m === "help") return [textWithQuick("よくあるご質問です。知りたいことの分類をお選びください。", helpQuick())];
  // 分類を選んだとき＝その分類の質問一覧を出す
  if (q.hc) {
    const { HELP_CATEGORIES, helpCategoryQuick } = await import("./lineChat");
    const c = HELP_CATEGORIES.find((x) => x.key === q.hc);
    if (!c) return [textWithQuick("その分類が見つかりませんでした。", helpQuick())];
    return [textWithQuick(`「${c.label}」でよくあるご質問です。`, helpCategoryQuick(c.key))];
  }
  if (q.m === "setup") {
    // ★複数アカウントを運用している場合、どのアカウントの設定かを先に選んでもらう。
    //   選ばないと1つ目のお店の情報を上書きしてしまうため。
    const accounts = (await db.getThreadsAccountsByUserId(user.id)).filter((a: any) => a.isActive);
    if (accounts.length >= 2) {
      return [textWithQuick(
        "どのアカウントの情報を登録しますか？\nアカウントごとに、別々のお店の情報を登録できます。",
        accounts.slice(0, 10).map((a: any) => ({ label: `@${a.threadsUsername}`, data: `c=acct&a=${a.id}` })),
      )];
    }
    return startCounseling(lineUserId, accounts[0]?.id ?? null);
  }
  if (q.c === "acct" && q.a) {
    // ★すでに登録済みのお店の情報があるなら、「それを使う」を先に出す。
    //   紐づけたいだけなのに20問やり直させるのは、無駄な手間になる。
    const usable = (await db.getUserProjects(user.id) || []).filter((pj: any) =>
      !String(pj.id).startsWith("demo_") &&
      pj.businessType && pj.area && pj.target && pj.mainProblem && pj.strength,
    );
    if (usable.length > 0) {
      const items = usable.slice(0, 8).map((pj: any) => ({
        label: `「${String(pj.storeName || pj.title || "登録済みの情報").slice(0, 12)}」を使う`,
        data: `c=pin&a=${q.a}&p=${pj.id}`,
      }));
      return [textWithQuick(
        "このアカウントで、どの情報を使いますか？\n" +
        "登録済みの情報をそのまま使えます。別の内容にしたい場合は「新しく登録する」を選んでください。",
        [...items, { label: "新しく登録する", data: `c=newpj&a=${q.a}` }],
      )];
    }
    return startCounseling(lineUserId, Number(q.a));
  }
  if (q.c === "newpj" && q.a) {
    return startCounseling(lineUserId, Number(q.a));
  }
  // はじめの設定の最後で「自動投稿を始めますか？」にお答えいただいたとき。
  if (q.c === "setupauto") {
    const on = q.v === "on";
    // 念のため、自動投稿が使えないプランでONにしない（案内と実態の食い違いを防ぐ）
    const { plan } = await planOf(user.id);
    const maxPerDay = Number(plan?.features?.maxAutoPostsPerDay ?? 0);
    if (on && maxPerDay <= 0) {
      const base = process.env.APP_BASE_URL || "https://threads-studio.com";
      return [textWithQuick(
        `ご利用中の${plan?.name ?? "プラン"}では、自動投稿はご利用いただけません。\n` +
        `毎日の自動投稿をご利用になるには、プランのご変更が必要です。\n${base}/pricing?openExternalBrowser=1`,
        MENU_HINT,
      )];
    }
    await db.updateAutoPostSettings(user.id, { autoPostEnabled: on });
    if (!on) {
      return [textWithQuick(
        "承知しました。自動投稿は始めずにおきます。\n\n" +
        "始めたくなったら「設定」からいつでもONにできます。\n" +
        "その場でお試しの投稿を作ることもできます。",
        [{ label: "やっぱり始める", data: "c=setupauto&v=on" }, ...MENU_HINT],
      )];
    }
    let s: any = null;
    try { s = await db.getAutoPostSettings(user.id); } catch { s = null; }
    const want = s?.autoPostFrequency === "three_daily" ? 3 : s?.autoPostFrequency === "twice_daily" ? 2 : 1;
    return [textWithQuick(
      `自動投稿を始めました。明日から1日${Math.min(want, maxPerDay)}回、投稿を作ります。\n` +
      "できあがった投稿は、このトークでお知らせします。\n\n" +
      "止めたくなったら「設定」からいつでもOFFにできます。",
      [{ label: "やっぱり止める", data: "c=setupauto&v=off" }, ...MENU_HINT],
    )];
  }
  if (q.c === "pin" && q.a && q.p) {
    const accounts = await db.getThreadsAccountsByUserId(user.id);
    const acc: any = accounts.find((a: any) => String(a.id) === String(q.a));
    if (!acc) return [textWithQuick("そのアカウントが見つかりませんでした。", MENU_HINT)];
    const projects = await db.getUserProjects(user.id) || [];
    const pj: any = projects.find((x: any) => String(x.id) === String(q.p));
    if (!pj) return [textWithQuick("その情報が見つかりませんでした。", MENU_HINT)];
    await db.updateThreadsAccount(acc.id, { defaultProjectId: pj.id } as any);
    return [textWithQuick(
      `@${acc.threadsUsername} には「${pj.storeName || pj.title}」の内容で投稿します。\n\n` +
      "内容を直したいときは「お店の情報」から確認・修正できます。",
      MENU_HINT,
    )];
  }
  if (q.c === "save" || q.c === "edit" || q.c === "pick") {
    const cur = await db.getLineChatState(lineUserId);
    if (cur?.state !== "counseling" || !cur.payload) {
      return [textWithQuick("入力の途中経過が見つかりませんでした。「はじめの設定」からやり直してください。", MENU_HINT)];
    }
    const cs: CounselingState = JSON.parse(cur.payload);
    if (q.c === "save") return saveCounselingFromChat(user.id, lineUserId, cs);
    if (q.c === "edit") {
      const qs = questionsFor(cs.mode);
      return [{
        type: "text",
        text: `直したい項目の番号（1〜${qs.length}）を送ってください。\n例：「3」と送ると3番目の質問をもう一度お聞きします。`,
      }];
    }
  }
  if (q.c === "resume") {
    const cs = await unfinishedCounseling(lineUserId);
    if (!cs) {
      return [textWithQuick("再開できる途中経過が見つかりませんでした。「はじめの設定」から始めてください。", MENU_HINT)];
    }
    // 期限を延ばしてから続ける（続けた直後にまた切れないように）
    await db.setLineChatState(lineUserId, "counseling", JSON.stringify(cs));
    await db.touchLineChatState(lineUserId);
    await clearCounselingBackup(lineUserId);
    const pending = cs.pending;
    cs.pending = null;
    await db.setLineChatState(lineUserId, "counseling", JSON.stringify(cs));
    const qs = questionsFor(cs.mode);
    if (cs.step >= qs.length) return reviewCounseling(cs);
    // 預かっていた文章があれば、それを回答として使う（書き直させない）
    if (pending) {
      return [
        { type: "text", text: "続きから再開します。" },
        ...(await advanceCounseling(user.id, lineUserId, cs, pending)),
      ];
    }
    return [{ type: "text", text: "続きから再開します。" }, ...askQuestion(cs)];
  }
  if (q.c === "start" && (q.mode === "store" || q.mode === "personal")) {
    // ★やり直すと、それまでの回答はすべて消える。
    //   消す前に必ずお尋ねする（「fresh=1」＝やり直すと選んでいただいた場合だけ消す）。
    if (!q.fresh) {
      const unfinished = await unfinishedCounseling(lineUserId);
      if (unfinished) return offerCounselingResume(lineUserId, unfinished);
    }
    await clearCounselingBackup(lineUserId);
    // ★どのお店の情報を書き換えるかを決める。
    //   アカウントが指定されていればそのアカウントに紐づく情報、無ければ既存の1件目。
    //   どちらも無ければ新規に作る（他のアカウントの情報を上書きしない）。
    const accountId = q.a ? Number(q.a) : null;
    let projectId: string | undefined;
    if (accountId) {
      const acct = await db.getThreadsAccountById(accountId);
      if (acct && acct.userId === user.id) projectId = (acct as any).defaultProjectId ?? undefined;
    }
    if (!projectId) {
      const projects = await db.getProjectsByUserId(user.id);
      projectId = accountId
        ? undefined                       // アカウント指定時は新規作成（上書き防止）
        : ((projects?.[0] as any)?.id ?? undefined);
    }
    if (!projectId) projectId = `line_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    // 複数アカウント運用なら、どのアカウントの設定かを毎回の質問に出す
    let accountName: string | null = null;
    if (accountId) {
      const lbl = await accountLabel(user.id, accountId);
      accountName = lbl ? lbl.replace(/ の$/, "") : null;
    }
    const st: CounselingState = { mode: q.mode, step: 0, answers: {}, projectId, accountId, accountName };
    await db.setLineChatState(lineUserId, "counseling", JSON.stringify(st));
    return [
      { type: "text", text: (accountName ? `${accountName} の設定として、` : "") + (q.mode === "personal" ? "「個人にファンをつける」で進めます。" : "「お店の集客」で進めます。") },
      ...askQuestion(st),
    ];
  }
  if (q.m === "menu") return [textWithQuick("どれをご覧になりますか？", MENU_HINT)];
  if (q.m === "cancel") {
    await db.clearLineChatState(lineUserId);
    // ★控えも消す。残したままだと、次に文章を送るたびに
    //   「設定が途中です」とお尋ねし続けてしまう。
    await clearCounselingBackup(lineUserId);
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
  if (q.m === "settings" || q.s === "common") {
    const s = (await db.getAutoPostSettings(user.id)) || {};
    const { plan } = await planOf(user.id);
    const maxPerDay = plan?.features.maxAutoPostsPerDay ?? 0;
    const notify = await db.isNextActionNotifyEnabled(user.id);
    // ★複数アカウント運用：まずアカウントごとの状態を一覧し、変える対象を選んでもらう。
    //   （共通設定だけ変えると、片方だけ止めたい・片方だけ確認ありにしたい、ができない）
    const accts = (await db.getThreadsAccountsByUserId(user.id)).filter((a: any) => a.isActive !== false);
    if (q.m === "settings" && accts.length >= 2 && maxPerDay > 0) {
      const { effectiveAccountSettings, FREQ_LABEL, LENGTH_LABEL } = await import("../shared/accountSettings");
      const lines = accts.map((a: any) => {
        const e = effectiveAccountSettings(s as any, a);
        const mark = Object.values(e.overridden).some(Boolean) ? "（個別設定あり）" : "（共通設定）";
        return `・@${a.threadsUsername}${mark}\n　自動投稿：${e.autoPostEnabled ? `ON・${FREQ_LABEL[e.autoPostFrequency]}` : "OFF"}／公開前の確認：${e.autoPostRequireApproval ? "する" : "しない"}／長さ：${LENGTH_LABEL[e.postLength]}`;
      });
      return [textWithQuick(
        (plan?.name ? `ご契約：${plan.name}\n\n` : "") +
        "いまの設定です（アカウントごと）。\n" + lines.join("\n") + "\n\n" +
        "変えたいアカウントを選んでください。全部まとめて変えるときは「共通の設定」を押してください。",
        [
          ...accts.slice(0, 6).map((a: any) => ({ label: `@${String(a.threadsUsername).slice(0, 14)} の設定`, data: `s=acct&a=${a.id}` })),
          { label: "共通の設定", data: "s=common" },
          { label: "NGワードを追加", data: "s=ng" },
        ],
      )];
    }
    return [textWithQuick(
      settingsSummary(s as any, { maxPerDay, planName: plan?.name, nextActionNotify: notify }),
      settingsQuick(s as any, maxPerDay, notify),
    )];
  }
  // ── アカウント別の設定画面 ──
  if (q.s === "acct" && q.a) {
    const acct: any = await db.getThreadsAccountById(Number(q.a));
    if (!acct || acct.userId !== user.id) return [textWithQuick("そのアカウントが見つかりませんでした。", MENU_HINT)];
    const s = (await db.getAutoPostSettings(user.id)) || {};
    const { effectiveAccountSettings, FREQ_LABEL, LENGTH_LABEL } = await import("../shared/accountSettings");
    const e = effectiveAccountSettings(s as any, acct);
    const src = (k: keyof typeof e.overridden) => (e.overridden[k] ? "個別" : "共通");
    const a = `&a=${acct.id}`;
    return [textWithQuick(
      `@${acct.threadsUsername} の設定です。\n` +
      `・自動投稿：${e.autoPostEnabled ? `ON・${FREQ_LABEL[e.autoPostFrequency]}` : "OFF"}（${src("autoPostEnabled")}）\n` +
      `・公開前の確認：${e.autoPostRequireApproval ? "する" : "しない"}（${src("autoPostRequireApproval")}）\n` +
      `・投稿の長さ：${LENGTH_LABEL[e.postLength]}（${src("postLength")}）\n\n` +
      "変えたいものを選んでください。このアカウントだけに効きます。\n（1日の回数はアプリの「設定」から変えられます）",
      [
        { label: e.autoPostEnabled ? "自動投稿を止める" : "自動投稿を始める", data: `s=auto&v=${e.autoPostEnabled ? "off" : "on"}${a}` },
        { label: e.autoPostRequireApproval ? "確認なしにする" : "公開前に確認する", data: `s=appr&v=${e.autoPostRequireApproval ? "off" : "on"}${a}` },
        { label: "短め にする", data: `s=len&v=short${a}` },
        { label: "長め にする", data: `s=len&v=long${a}` },
        { label: "共通設定に戻す", data: `s=inherit${a}` },
        { label: "設定に戻る", data: "m=settings" },
      ],
    )];
  }
  if (q.s === "inherit" && q.a) {
    const acct: any = await db.getThreadsAccountById(Number(q.a));
    if (!acct || acct.userId !== user.id) return [textWithQuick("そのアカウントが見つかりませんでした。", MENU_HINT)];
    await db.updateThreadsAccount(acct.id, { autoPostEnabled: null, autoPostRequireApproval: null, autoPostFrequency: null, postLength: null } as any);
    return [textWithQuick(`@${acct.threadsUsername} の個別設定を外し、共通設定に戻しました。`, [{ label: "設定に戻る", data: "m=settings" }, ...MENU_HINT])];
  }
  if (q.s === "plan") {
    const base = process.env.APP_BASE_URL || "https://threads-studio.com";
    return [textWithQuick(
      `プランのご確認・ご変更はこちらから行えます。\n${base}/pricing?openExternalBrowser=1`,
      MENU_HINT,
    )];
  }
  // ── 「次にやること」の案内のON/OFF ──
  if (q.n === "off") {
    await db.setNextActionNotifyEnabled(user.id, false);
    return [textWithQuick(
      "承知しました。次にやることのご案内は、今後お送りしません。\n" +
      "また受け取りたくなったら、「設定」からいつでも戻せます。",
      MENU_HINT,
    )];
  }
  if (q.n === "pinned") {
    // ★複数アカウント運用では「どのアカウントでピン留めしたか」を記録する。
    //   片方だけ済ませてもう片方が抜ける、を検知するため。
    const accts = (await db.getThreadsAccountsByUserId(user.id)).filter((a: any) => a.isActive !== false);
    if (!q.a && accts.length >= 2) {
      return [textWithQuick(
        "どのアカウントでピン留めしましたか？",
        accts.slice(0, 10).map((a: any) => ({ label: `@${a.threadsUsername}`, data: `n=pinned&a=${a.id}` })),
      )];
    }
    const target: any = q.a ? accts.find((a: any) => String(a.id) === String(q.a)) : accts[0];
    if (target) await db.confirmPinnedPostForAccount(Number(target.id));
    if (accts.length <= 1 || !q.a) await db.confirmPinnedPost(user.id);
    const who = target && accts.length >= 2 ? `@${target.threadsUsername} の` : "";
    return [textWithQuick(
      `ありがとうございます。${who}ピン留めを記録しました。\n` +
      "プロフィールを見に来た方が、最初にこの投稿を読む形になります。",
      MENU_HINT,
    )];
  }
  if (q.n === "pinhow") {
    const { pinGuideText } = await import("@shared/pinGuide");
    const a = q.a ? `&a=${q.a}` : "";
    return [textWithQuick(
      pinGuideText() + "\n\n終わったら、下の「ピン留めしました」を押してください。",
      [{ label: "ピン留めしました", data: `n=pinned${a}` }, ...MENU_HINT],
    )];
  }
  if (q.n === "on") {
    await db.setNextActionNotifyEnabled(user.id, true);
    return [textWithQuick(
      "次にやることのご案内を、またお送りします。",
      MENU_HINT,
    )];
  }

  if (q.m === "unlink") {
    await db.unlinkLineByLineUserId(lineUserId);
    const { resetToDefaultRichMenu, LINE_TEXTS } = await import("./lineNotify");
    await resetToDefaultRichMenu(lineUserId);
    return [{ type: "text", text: LINE_TEXTS.unlinked }];
  }
  // ── 固定投稿：作る → 内容を見る → 公開する まで、トークの中で終わらせる ──
  if (q.m === "makepin") {
    // ★複数アカウント運用では、先にどのアカウント用かを選んでもらう。
    //   固定投稿はアカウント（＝お店）ごとに必要で、黙って1つ目に作ると
    //   別のお店のプロフィールに違う店の入口が固定される事故になる。
    //   （「はじめの設定」の c=acct と同じ考え方）
    if (!q.a) {
      const accounts = (await db.getThreadsAccountsByUserId(user.id)).filter((a: any) => a.isActive !== false);
      if (accounts.length >= 2) {
        return [textWithQuick(
          "どのアカウントの固定投稿を作りますか？\nアカウントごとに、紐づいたお店の情報で作ります。",
          accounts.slice(0, 10).map((a: any) => ({ label: `@${a.threadsUsername}`, data: `m=makepin&a=${a.id}` })),
        )];
      }
    }
    // ★公式LINEのURLが未登録なら、先に登録を勧める（固定投稿はLINE誘導が本命のため）。
    //   URLなしでも作れるが、コメント欄のリンクが付かず効果が大きく落ちる。
    if (!q.nourl) {
      const pjsForUrl = ((await db.getUserProjects(user.id)) || []).filter((pj: any) => !String(pj.id).startsWith("demo_"));
      const { parseProjectLinks } = await import("../shared/projectLinks");
      const hasLine = pjsForUrl.some((pj: any) => parseProjectLinks(pj.links || null).some((l) => l.type === "line" && !!l.url));
      if (!hasLine && pjsForUrl.length > 0) {
        return [textWithQuick(
          "固定投稿を作る前に、公式LINEの友だち追加URLの登録をおすすめします。\n" +
          "固定投稿のコメント欄にこのURLが付き、集客の入口になります。",
          [
            { label: "URLを登録する", data: "c=seturl" },
            { label: "URLなしで作る", data: `m=makepin&nourl=1${q.a ? `&a=${q.a}` : ""}` },
            { label: "やめる", data: "m=menu" },
          ],
        )];
      }
    }
    const { createPinnedDraft } = await import("./pinnedPostFlow");
    const res = await createPinnedDraft(user.id, q.a ? Number(q.a) : null);
    if ("error" in res) {
      return [textWithQuick(res.error, MENU_HINT)];
    }
    return [
      { type: "text", text: `固定投稿の案ができました（@${res.accountUsername} 用）。内容をご確認ください。` },
      { type: "text", text: res.content },
      textWithQuick(
        "この内容でよろしければ「これで投稿する」を押してください。\n" +
        "押すとThreadsに公開されます。公開のあと、プロフィールへのピン留めが必要です。\n" +
        "ご自身で直したいときは「一部修正」を押してください。",
        [
          { label: "これで投稿する", data: `a=ok&i=${res.postId}` },
          { label: "一部修正", data: `a=selfedit&i=${res.postId}` },
          { label: "作り直す", data: `m=makepin&a=${res.accountId}` },
          { label: "やめる", data: "m=menu" },
        ],
      ),
    ];
  }
  if (q.m === "addstaff") return issueStaffLinkCode(user.id);
  if (q.m === "sendq" && q.q) {
    await db.clearLineChatState(lineUserId);
    const rec = await db.getSupportQuestionById(Number(q.q));
    const asked = String(rec?.question || "").trim();
    if (!asked) return [textWithQuick("ご質問を読み取れませんでした。お手数ですが、そのままメッセージでお送りください。", MENU_HINT)];
    return forwardToStaff(user.id, lineUserId, asked, Number(q.q));
  }
  if (q.m === "staff") {
    return startStaffHandoff(lineUserId, q.q ? Number(q.q) : undefined);
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
    // ★押し間違いに備えて取り消しを用意する（まだ公開前なら戻せる）
    const undo = [{ label: "取り消す", data: `a=undo&i=${q.i}` }, ...MENU_HINT];
    if (q.o) {
      const next = await replyOneWaiting(user.id, done + "\n（間違えた場合は「取り消す」を押してください）");
      return next;
    }
    // ★固定投稿を公開したときは、そのままピン留めまで案内する。
    //   公開しただけではプロフィールの入口にならないため、ここで切らさない。
    //   （まだ一度もピン留めの確認をしていない方にだけお伝えする）
    // ★固定投稿のときだけ案内する（通常投稿の承認で毎回ピン留めの話をしない）。
    //   複数アカウント運用では、その投稿のアカウントで未確認なら案内し、ボタンにアカウントを添える。
    let needPinGuide = false;
    const pinAcct = (post as any).threadsAccountId ? Number((post as any).threadsAccountId) : null;
    if ((post as any).angle === "pinned") {
      try {
        needPinGuide = pinAcct
          ? !(await db.isPinnedPostConfirmedForAccount(pinAcct))
          : !(await db.isPinnedPostConfirmed(user.id));
      } catch { needPinGuide = false; }
    }
    if (needPinGuide) {
      const { pinGuideText } = await import("@shared/pinGuide");
      const acctLabel = pinAcct ? await accountLabel(user.id, pinAcct) : "";
      return [
        textWithQuick(done + "\n\n間違えて押した場合は「取り消す」で元に戻せます。", undo),
        textWithQuick(
          // ★acctLabel は「@name の」という形なので、必ず後ろに名詞を置く。
          //   「@name の公開されたら」という壊れた日本語になっていた。
          `${acctLabel}固定投稿が公開されたら、最後にひとつだけお願いします。\n\n` +
          // ここは公開の手続きが済んだ直後なので、公開の手順は出さない
          pinGuideText({ withPublishSteps: false }) +
          "\n\n終わったら、下の「ピン留めしました」を押してください。",
          [{ label: "ピン留めしました", data: `n=pinned${pinAcct ? `&a=${pinAcct}` : ""}` }],
        ),
      ];
    }
    return [textWithQuick(done + "\n\n間違えて押した場合は「取り消す」で元に戻せます。", undo)];
  }
  // ★すべて承認（確認待ちを一度に公開予約へ）。1件ずつ押す手間をなくす。
  if (q.a === "okall") {
    const all = await db.getScheduledPostsByUserId(user.id);
    const waiting = all
      .filter((p: any) => p.status === "awaiting_approval")
      .sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    if (waiting.length === 0) return [textWithQuick("確認をお待ちしている投稿はありません。", MENU_HINT)];
    const now = new Date();
    const approvedIds: number[] = [];
    let hasPinned = false;
    const pinnedAccts = new Set<number>();
    for (const p of waiting as any[]) {
      const past = !p.scheduledAt || new Date(p.scheduledAt) <= now;
      await db.updateScheduledPost(Number(p.id), { status: "pending", ...(past ? { scheduledAt: now } : {}) });
      approvedIds.push(Number(p.id));
      if (p.angle === "pinned") { hasPinned = true; if (p.threadsAccountId) pinnedAccts.add(Number(p.threadsAccountId)); }
    }
    const times = (waiting as any[])
      .map((p) => (!p.scheduledAt || new Date(p.scheduledAt) <= now ? "まもなく" : fmtJst(p.scheduledAt)))
      .join(" / ");
    const done = `${approvedIds.length}件すべて承認しました。\n公開予定: ${times}`;
    // 取り消しは、まとめて元に戻せるようにIDを持たせる（LINEのpostbackは300字まで。5件なら十分）
    const undo = [{ label: "すべて取り消す", data: `a=undoall&ids=${approvedIds.slice(0, 20).join(",")}` }, ...MENU_HINT];
    const out: unknown[] = [textWithQuick(done + "\n\n間違えて押した場合は「すべて取り消す」で元に戻せます。", undo)];
    if (hasPinned) {
      const { pinGuideText } = await import("@shared/pinGuide");
      const targets: (number | null)[] = pinnedAccts.size > 0 ? Array.from(pinnedAccts) : [null];
      for (const acct of targets) {
        let needPinGuide = false;
        try {
          needPinGuide = acct ? !(await db.isPinnedPostConfirmedForAccount(acct)) : !(await db.isPinnedPostConfirmed(user.id));
        } catch { needPinGuide = false; }
        if (!needPinGuide) continue;
        const acctLabel = acct ? await accountLabel(user.id, acct) : "";
        out.push(textWithQuick(
          `${acctLabel}固定投稿も含まれています。公開されたら、最後にひとつだけお願いします。\n\n` +
          pinGuideText({ withPublishSteps: false }) +
          "\n\n終わったら、下の「ピン留めしました」を押してください。",
          [{ label: "ピン留めしました", data: `n=pinned${acct ? `&a=${acct}` : ""}` }],
        ));
      }
    }
    return out;
  }
  if (q.a === "undoall" && q.ids) {
    const ids = String(q.ids).split(",").map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
    let reverted = 0;
    let alreadyPosted = 0;
    for (const id of ids) {
      const post = await ownedPost(user.id, id);
      if (!post) continue;
      if (post.status === "posted") { alreadyPosted++; continue; }
      if (post.status !== "pending") continue;
      await db.updateScheduledPost(id, { status: "awaiting_approval" });
      reverted++;
    }
    const note = alreadyPosted > 0 ? `\n${alreadyPosted}件はすでに公開されていたため戻せません（Threadsアプリから削除できます）。` : "";
    return [textWithQuick(`${reverted}件を確認待ちに戻しました。${note}`, [{ label: "今日の投稿", data: "m=posts" }, ...MENU_HINT])];
  }
  if (q.a === "skip" && q.i) {
    const post = await ownedPost(user.id, Number(q.i));
    if (!post) return [{ type: "text", text: "その投稿が見つかりませんでした。" }];
    await db.updateScheduledPost(Number(q.i), { status: "canceled" });
    const done = "この投稿は見送りにしました。明日の投稿はまた新しく作ります。";
    const undo = [{ label: "取り消す", data: `a=undo&i=${q.i}` }, ...MENU_HINT];
    if (q.o) return replyOneWaiting(user.id, done + "\n（間違えた場合は「取り消す」を押してください）");
    return [textWithQuick(done + "\n\n間違えて押した場合は「取り消す」で元に戻せます。", undo)];
  }
  // ★承認・見送りの取り消し（未公開のものだけ確認待ちへ戻す）
  if (q.a === "undo" && q.i) {
    const post = await ownedPost(user.id, Number(q.i));
    if (!post) return [{ type: "text", text: "その投稿が見つかりませんでした。" }];
    if (post.status === "posted") {
      return [textWithQuick("この投稿はすでに公開されています。取り消す場合は、Threadsアプリから削除してください。", MENU_HINT)];
    }
    if (post.status !== "pending" && post.status !== "canceled") {
      return [textWithQuick("この投稿は取り消せる状態ではありません。", MENU_HINT)];
    }
    await db.updateScheduledPost(Number(q.i), { status: "awaiting_approval" });
    const [withName] = await withAccountNames(user.id, [(await db.getScheduledPostById(Number(q.i))) as any]);
    return [
      { type: "text", text: "取り消しました。もう一度ご確認ください。" },
      buildPostCards([withName]),
    ];
  }
  // ── 公式LINEのURL登録：LINEトークの中だけで誘導先を持てるようにする ──
  //   カウンセリング全20問にURLの質問が無く、LINE完結のお客様は誘導先を
  //   一度も登録できなかった（固定投稿のコメントにも入れられない）。
  if (q.c === "seturl") {
    const usable = ((await db.getUserProjects(user.id)) || []).filter((pj: any) =>
      !String(pj.id).startsWith("demo_") && pj.businessType,
    );
    if (usable.length === 0) {
      return [textWithQuick("先に「はじめの設定」でお店の情報をご登録ください。", [{ label: "はじめの設定", data: "m=setup" }, ...MENU_HINT])];
    }
    // 複数店舗なら、どのお店のURLかを選んでもらう
    if (usable.length >= 2 && !q.p) {
      return [textWithQuick(
        "どのお店の公式LINEのURLを登録しますか？",
        usable.slice(0, 10).map((pj: any) => ({ label: String(pj.storeName || pj.title || "お店").slice(0, 16), data: `c=seturl&p=${pj.id}` })),
      )];
    }
    const pj: any = q.p ? usable.find((x: any) => String(x.id) === String(q.p)) : usable[0];
    if (!pj) return [textWithQuick("そのお店の情報が見つかりませんでした。", MENU_HINT)];
    await db.setLineChatState(lineUserId, "set_line_url", String(pj.id));
    const { parseProjectLinks } = await import("../shared/projectLinks");
    const cur = parseProjectLinks(pj.links || null).find((l) => l.type === "line");
    return [
      { type: "text", text:
        (cur ? `いま登録されているのは\n${cur.url}\nです。新しいURLに置き換えます。\n\n` : "") +
        "公式LINEの友だち追加URLを、そのまま送ってください。\n" +
        "（例：https://lin.ee/xxxxx）\n\n" +
        "LINE公式アカウントの管理画面 →「友だち追加ガイド」→「URLを作成」でコピーできます。\n" +
        "やめる場合は「やめる」と送ってください。" },
    ];
  }
  // ── 一部修正：AIを通さず、ご自身で直した全文にそのまま置き換える ──
  //   「作り直す」(AI再生成)・「書き直す」(AIに指示)との違いは、
  //   ご本人の言葉がそのまま最終文になること。微調整したいだけの方向け。
  if (q.a === "selfedit" && q.i) {
    const post = await ownedPost(user.id, Number(q.i));
    if (!post) return [{ type: "text", text: "その投稿が見つかりませんでした。" }];
    if (post.status !== "awaiting_approval") {
      return [textWithQuick("この投稿はすでに確認が終わっています。", MENU_HINT)];
    }
    await db.setLineChatState(lineUserId, "self_edit", JSON.stringify({ i: Number(q.i), o: q.o ? 1 : 0 }));
    return [
      { type: "text", text: "下の全文を長押しでコピーし、直したい箇所を変えて、そのまま送り返してください。届いた文にまるごと置き換えます。" },
      { type: "text", text: post.postContent || "" },
      textWithQuick("やめる場合は「やめる」と送ってください。", [{ label: "やめる", data: "m=cancel" }]),
    ];
  }
  if (q.a === "rw" && q.i) {
    // ★先に投稿を確かめる。確かめずに指示待ちにすると、お客様が書き直しの希望を
    //   打ち込んだあとで「見つかりません」と返すことになる（「一部修正」は確認済み）。
    const post = await ownedPost(user.id, Number(q.i));
    if (!post) return [{ type: "text", text: "その投稿が見つかりませんでした。" }];
    if (post.status !== "awaiting_approval") {
      return [textWithQuick("この投稿はすでに確認が終わっています。", MENU_HINT)];
    }
    const items = Object.entries(REWRITE_KINDS).map(([k, v]) => ({ label: v.label, data: `a=rw2&i=${q.i}&k=${k}${q.o ? "&o=1" : ""}` }));
    await db.setLineChatState(lineUserId, "rewrite_free", JSON.stringify({ i: q.i, o: q.o ? 1 : 0 }));
    return [textWithQuick(
      "どんなふうに直しますか？\n下から選ぶか、ご希望をそのまま文章で送ってください（例：「クーポンの話を入れて」）。",
      [...items, { label: "やめる", data: "m=cancel" }],
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
    // ★自動投稿が使えないプランでONにさせない（ONにしても投稿されず、誤解を招くため）
    if (q.v === "on") {
      const { plan } = await planOf(user.id);
      if ((plan?.features.maxAutoPostsPerDay ?? 0) <= 0) {
        const base = process.env.APP_BASE_URL || "https://threads-studio.com";
        return [textWithQuick(
          `ご利用中の${plan?.name ?? "プラン"}では、自動投稿はご利用いただけません。\n` +
          `毎日の自動投稿をご利用になるには、プランのご変更が必要です。\n${base}/pricing?openExternalBrowser=1`,
          MENU_HINT,
        )];
      }
    }
    // ★a= があればそのアカウントだけ（複数アカウント運用のアカウント別設定）
    const target = await ownedAccountOrNull(user.id, q.a);
    if (q.a && !target) return [textWithQuick("そのアカウントが見つかりませんでした。", MENU_HINT)];
    if (target) await db.updateThreadsAccount(target.id, { autoPostEnabled: q.v === "on" } as any);
    else await db.updateAutoPostSettings(user.id, { autoPostEnabled: q.v === "on" });
    const who = target ? `@${target.threadsUsername} の` : "";
    const a = target ? `&a=${target.id}` : "";
    return [textWithQuick(
      (q.v === "on" ? `${who}自動投稿を始めました。明日から毎日投稿します。` : `${who}自動投稿を止めました。再開したいときは「設定」からどうぞ。`) +
      "\n\n間違えた場合は「元に戻す」を押してください。",
      [{ label: "元に戻す", data: `s=auto&v=${q.v === "on" ? "off" : "on"}${a}` }, ...MENU_HINT],
    )];
  }
  if (q.s === "appr") {
    const target = await ownedAccountOrNull(user.id, q.a);
    if (q.a && !target) return [textWithQuick("そのアカウントが見つかりませんでした。", MENU_HINT)];
    if (target) await db.updateThreadsAccount(target.id, { autoPostRequireApproval: q.v === "on" } as any);
    else await db.updateAutoPostSettings(user.id, { autoPostRequireApproval: q.v === "on" });
    const who = target ? `@${target.threadsUsername} は、` : "";
    const a = target ? `&a=${target.id}` : "";
    return [textWithQuick(
      who + (q.v === "on" ? "公開前に、このトークで確認できるようにしました。" : "確認なしで公開するようにしました。おまかせで毎日投稿されます。") +
      "\n\n間違えた場合は「元に戻す」を押してください。",
      [{ label: "元に戻す", data: `s=appr&v=${q.v === "on" ? "off" : "on"}${a}` }, ...MENU_HINT],
    )];
  }
  if (q.s === "len") {
    const target = await ownedAccountOrNull(user.id, q.a);
    if (q.a && !target) return [textWithQuick("そのアカウントが見つかりませんでした。", MENU_HINT)];
    const common = (await db.getAutoPostSettings(user.id)) || {};
    const { effectiveAccountSettings } = await import("../shared/accountSettings");
    const prev = target ? effectiveAccountSettings(common as any, target).postLength : ((common as any).postLength || "short");
    const v = q.v === "long" ? "long" : q.v === "alt" ? "alternate" : "short";
    if (target) await db.updateThreadsAccount(target.id, { postLength: v } as any);
    else await db.updateAutoPostSettings(user.id, { postLength: v });
    const jp = (x: string) => (x === "long" ? "長め" : x === "alternate" ? "交互" : "短め");
    const who = target ? `@${target.threadsUsername} の` : "";
    const a = target ? `&a=${target.id}` : "";
    return [textWithQuick(
      `${who}投稿の長さを「${jp(v)}」に変えました。\n\n間違えた場合は「元に戻す」を押してください。`,
      [{ label: `元に戻す（${jp(prev)}）`, data: `s=len&v=${prev === "alternate" ? "alt" : prev}${a}` }, ...MENU_HINT],
    )];
  }
  if (q.s === "ng") {
    await db.setLineChatState(lineUserId, "ngword");
    // ★「やめる」を必ず出す。これが無いと、気が変わって別のことを打った言葉が
    //   そのままNGワードとして登録されてしまう。
    return [textWithQuick(
      "投稿で使ってほしくない言葉を送ってください（いくつかある場合は、読点や改行で区切ってください）。",
      [{ label: "やめる", data: "m=cancel" }],
    )];
  }

  // ── ヘルプ ──
  if (q.h) {
    const t = HELP_TOPICS.find((x) => x.key === q.h);
    // ★選んだ時点でやることが決まっているものは、説明を挟まずそのまま実行する
    if (t?.directPostback) return handlePostback(lineUserId, t.directPostback);
    // 実行できるものは、その場で押せるボタンを先頭に置く（説明だけで終わらせない）
    if (t) return [textWithQuick(t.a, t.action ? [t.action, ...helpQuick()] : helpQuick())];
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
      return referralLink(lineUserId, text);
    }
    if (/^(連携|れんけい|連携する)$/.test(text.trim())) return startLinking(lineUserId);
    // ★紹介コードをそのまま送られることが多いので、メニューを押さなくても受け付ける。
    //   （英数字・ハイフン・アンダースコアだけの短い文字列＝コードの見た目）
    if (looksLikeReferralCode(text)) return referralLink(lineUserId, text);
    return notLinked();
  }

  const st = await db.getLineChatState(lineUserId);
  if (st?.state === "counseling" && st.payload) {
    try {
      const cs: CounselingState = JSON.parse(st.payload);
      // ★「続きから」を押さずに、そのまま次の文章を送られた場合。
      //   お預かりしていた文章は、いま届いた文章に置き換わる（同じ質問への答えなので）。
      //   消しておかないと、あとで「続きから」を押されたときに二重に反映される。
      if (cs.pending) {
        cs.pending = null;
        await db.setLineChatState(lineUserId, "counseling", JSON.stringify(cs));
      }
      const qs = questionsFor(cs.mode);
      // 全問終わって確認画面を出している状態で数字が来たら「その項目を直す」
      const atReview = cs.step >= qs.length && (cs.editing === null || cs.editing === undefined);
      const num = Number(text.trim());
      if (atReview && Number.isInteger(num) && num >= 1 && num <= qs.length) {
        cs.editing = num - 1;
        cs.step = num - 1;
        await db.setLineChatState(lineUserId, "counseling", JSON.stringify(cs));
        return askQuestion(cs);
      }
      if (atReview && /^(登録|登録する|これでOK|ok)$/i.test(text.trim())) {
        return saveCounselingFromChat(user.id, lineUserId, cs);
      }
      if (atReview) {
        return reviewCounseling(cs);
      }
      return await advanceCounseling(user.id, lineUserId, cs, text);
    } catch {
      await db.clearLineChatState(lineUserId);
      return [textWithQuick("設定の途中で問題が起きました。「はじめの設定」からやり直してください。", MENU_HINT)];
    }
  }
  if (st?.state === "staff_message") {
    await db.clearLineChatState(lineUserId);
    if (/^(やめる|中止|キャンセル)$/.test(text.trim())) {
      return [textWithQuick("承知しました。中止しました。", MENU_HINT)];
    }
    return forwardToStaff(user.id, lineUserId, text.slice(0, 2000), st.payload ? Number(st.payload) : undefined);
  }

  // ★入力待ちの途中で「やめる」と打たれたら、その言葉を内容として使わずに抜ける。
  //   （NGワード待ち・書き直し待ちでこれが無く、「やめる」がそのまま
  //     NGワードや書き直し指示として使われてしまっていた）
  if ((st?.state === "ngword" || st?.state === "rewrite_free" || st?.state === "self_edit" || st?.state === "set_line_url") &&
      /^(やめる|中止|キャンセル|戻る|終わり|終了)$/.test(text.trim())) {
    await db.clearLineChatState(lineUserId);
    return [textWithQuick("わかりました。中止しました。", MENU_HINT)];
  }
  // ── 公式LINEのURL登録：送られてきたURLを保存する ──
  if (st?.state === "set_line_url" && st.payload) {
    const projectId = String(st.payload);
    const raw = text.trim();
    let parsedUrl: URL | null = null;
    try { parsedUrl = new URL(raw); } catch { parsedUrl = null; }
    if (!parsedUrl || !/^https?:$/.test(parsedUrl.protocol)) {
      return [{ type: "text", text: "URLの形になっていないようです。https:// から始まるURLをそのまま送ってください。\nやめる場合は「やめる」と送ってください。" }];
    }
    await db.clearLineChatState(lineUserId);
    const pj: any = await db.getProjectById(projectId);
    if (!pj || pj.userId !== user.id) return [textWithQuick("お店の情報が見つかりませんでした。", MENU_HINT)];
    const { parseProjectLinks } = await import("../shared/projectLinks");
    const links = parseProjectLinks(pj.links || null);
    const existing = links.find((l) => l.type === "line");
    const next = existing
      ? links.map((l) => (l.type === "line" ? { ...l, url: raw } : l))
      : [...links, { id: `line_${Date.now().toString(36)}`, type: "line" as const, label: "LINE公式", url: raw, isDefault: true }];
    await db.updateProject(projectId, { links: JSON.stringify(next) } as any);
    return [textWithQuick(
      `公式LINEのURLを登録しました。\n${raw}\n\n` +
      "毎日の投稿の誘導と、固定投稿のコメント欄のリンクに使われます。",
      [{ label: "固定投稿を作る", data: "m=makepin" }, ...MENU_HINT],
    )];
  }
  // ── 一部修正：送られてきた全文で、そのまま置き換える ──
  if (st?.state === "self_edit" && st.payload) {
    let postId = 0, one = false;
    try { const p = JSON.parse(st.payload); postId = Number(p.i); one = !!p.o; } catch { postId = Number(st.payload); }
    const next = text.trim();
    // Threadsの1投稿上限（500字）。超えたら状態を保ったまま、削ってもらう
    if (Array.from(next).length > 500) {
      return [{ type: "text", text: `文字数が${Array.from(next).length}字あります。Threadsは1投稿500字までのため、${Array.from(next).length - 500}字ほど削って、もう一度お送りください。` }];
    }
    if (next.length < 10) {
      return [{ type: "text", text: "内容が短すぎるようです。全文をコピーして直したものをお送りください。やめる場合は「やめる」と送ってください。" }];
    }
    await db.clearLineChatState(lineUserId);
    const post = await ownedPost(user.id, postId);
    if (!post) return [{ type: "text", text: "その投稿が見つかりませんでした。" }];
    if (post.status !== "awaiting_approval") {
      return [textWithQuick("この投稿はすでに確認が終わっています。", MENU_HINT)];
    }
    await db.updateScheduledPost(postId, { postContent: next });
    return [
      { type: "text", text: "直しました。この内容でよろしければ「これで投稿する」を押してください。" },
      { type: "text", text: next },
      textWithQuick("さらに直す場合は「一部修正」を押してください。", [
        { label: "これで投稿する", data: `a=ok&i=${postId}${one ? "&o=1" : ""}` },
        { label: "一部修正", data: `a=selfedit&i=${postId}${one ? "&o=1" : ""}` },
        { label: "やめる", data: "m=cancel" },
      ]),
    ];
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
  if (/^(追加|ついか)$/.test(t)) return issueStaffLinkCode(user.id);
  // ★紹介コードをそのまま送られた場合は、その場で適用して料金ページへご案内する。
  if (looksLikeReferralCode(t)) return referralLink(lineUserId, t, user.id);

  // ★「はじめの設定」の途中で時間が空いた場合、この文章は回答の続きであることが多い。
  //   ご質問として扱ってしまうと、お客様が書いた回答がそのまま失われる。
  //   （実際に、5問答えた方の続きの回答が「お答えできないご質問」になっていた）
  {
    const unfinished = await unfinishedCounseling(lineUserId);
    if (unfinished) return offerCounselingResume(lineUserId, unfinished, t);
  }

  // ★文章でのご質問は、まず自動でお答えする。
  //   （以前は「料金」などの言葉に反応して料金ページのリンクを返すだけで、
  //     「プロプランは何アカウントまで？」のような具体的なご質問に答えられていなかった）
  //   自動で答えられなかったときだけ、下のキーワード案内にまわす。
  // ★投稿文の貼り付けは、ご質問として自動応答に回さない（的外れな返事・担当者への誤通知を防ぐ）
  if (isPastedContent(t)) return replyToRequest("pasted");

  if (looksLikeQuestion(t)) {
    const answered = await autoAnswer(user.id, lineUserId, t);
    if (answered) return answered;
  }

  // ★固定投稿は名指しでご依頼いただくことが多いので、そのまま作る画面へお通しする。
  if (/(固定投稿|ピン留め|ピン止め|プロフィールの一番上)/.test(t)) return handlePostback(lineUserId, "m=makepin");

  // ★「投稿して」「ネタ作って」のような短いご依頼は、ご質問の形をしていないため
  //   自動応答（looksLikeQuestion）を通らず、受け皿の一般的なご案内に落ちていた。
  //   ご依頼だと分かるものは、自動応答が動いたときと同じ内容をお返しする。
  {
    const req = requestKind(t);
    if (req) return replyToRequest(req);
  }

  // 短い言葉での操作指示・自動応答で答えられなかったときの受け皿。
  if (/(料金|価格|値段|いくら|プラン|課金|支払|請求)/.test(t)) return handlePostback(lineUserId, "s=plan");
  if (/(解約|退会|やめたい|停止|キャンセルしたい)/.test(t)) {
    const base = process.env.APP_BASE_URL || "https://threads-studio.com";
    return [textWithQuick(
      "ご解約は、アプリの設定画面からお手続きいただけます。\n" +
      `${base}/settings?openExternalBrowser=1\n\n` +
      "お手続きが分からない場合や、その前にご相談されたい場合は、下の「担当者に聞く」を押してください。",
      [{ label: "担当者に聞く", data: "m=staff" }, ...MENU_HINT],
    )];
  }
  if (/(連携|つなぐ|つながらない|アカウントを追加|Threads)/i.test(t)) return handlePostback(lineUserId, "m=connect");
  if (/(使い方|わからない|分からない|ヘルプ|help|教えて)/i.test(t)) return handlePostback(lineUserId, "m=help");
  if (/(投稿.{0,6}(来ない|されない|止ま)|動いてい?ない)/.test(t)) return handlePostback(lineUserId, "m=settings");
  if (/(はじめ|初期|最初).{0,4}(設定|登録)|お店の情報/.test(t)) return handlePostback(lineUserId, "m=setup");

  return [textWithQuick(
    "ご用件を下から選んでください。ご質問は文章のままお送りいただければ、こちらでお答えします。",
    [{ label: "担当者に聞く", data: "m=staff" }, ...MENU_HINT],
  )];
}

/**
 * 紹介コードらしい文字列か。
 * 英数字とハイフン・アンダースコアだけで、4〜32文字、かつ数字だけではないもの。
 * （「482913」のような数字だけは連携コードなので、ここでは拾わない）
 */
function looksLikeReferralCode(text: string): boolean {
  const t = toHalfWidthLocal(text).trim();
  if (!/^[A-Za-z0-9_-]{4,32}$/.test(t)) return false;
  if (/^[0-9]+$/.test(t)) return false;
  // ★英字だけの単語（Threads / instagram など）はコードではない。
  //   実際のコードは英字と数字が混ざる（SEMINAR2026・CPMONITOR2026 など）。
  //   ここを緩くすると、ふつうの単語に「コードが見つかりません」と返してしまう。
  if (!/[0-9]/.test(t)) return false;
  return /[A-Za-z]/.test(t);
}

/** 全角→半角（判定用の軽い変換） */
function toHalfWidthLocal(s: string): string {
  return String(s ?? "")
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ");
}

/**
 * 「ご質問」らしいかの判定。
 * 短いあいさつや相づちにまでAIを呼ぶとお待たせしてしまうので、ある程度の長さか
 * 疑問の形をしているものだけを対象にする。
 */
function looksLikeQuestion(t: string): boolean {
  if (t.length < 5) return false;
  if (/^(はい|いいえ|ありがとう|了解|おはよう|こんにちは|こんばんは|よろしく)/.test(t)) return false;
  return /[?？]$/.test(t) || /(ですか|でしょうか|ますか|できます|教えて|とは|どう|なぜ|いつ|どこ|いくら|何|方法|やり方)/.test(t) || t.length >= 12;
}

/**
 * 「ご質問」ではなく「ご依頼」のとき、その種類を返す。
 *
 * ★お客様が投稿の材料（実績・お客様のエピソード）を送ってこられたり、
 *   「こう投稿してほしい」と書かれることがある。これは質問ではないので、
 *   「お答えできないご質問でした」と返すと的外れになる。
 *   （2026-09-02、お客様が症例を3件送られたのに担当者送りになっていた）
 */
/**
 * 投稿用の文章をそのまま貼られたか。
 * ★長文・改行あり・疑問符なし（＋絵文字やハッシュタグが混じる）は、ご質問ではなく
 *   「投稿文の貼り付け」であることがほとんど。ご質問扱いにすると自動応答が的外れな
 *   返事をし、担当者にも「質問」として上がってくる（2026-09-03 に2件発生）。
 */
function isPastedContent(t: string): boolean {
  if (/[?？]/.test(t)) return false;
  const lines = t.split(/\r?\n/).filter((l) => l.trim()).length;
  // 絵文字（サロゲートペア）・記号・ハッシュタグ（サーバーのビルド対象がES5のため u フラグは使わない）
  const decorated = /[#＃]|[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|‼|⁉/.test(t);
  return (t.length >= 150 && lines >= 3) || (t.length >= 120 && decorated);
}

function requestKind(t: string): "post" | "material" | "pasted" | null {
  if (isPastedContent(t)) return "pasted";
  // 「投稿してほしい」「告知したい」「ネタを作ってほしい」など
  if (/(投稿|告知|発信|ポスト|ネタ)[^。！？\n]{0,12}(したい|して|作|つくっ|つくり|書い|書き|出し|載せ|上げ|流し)/.test(t)
      || /(作っ|つくっ|書い|流し|載せ)[^。！？\n]{0,6}(ほしい|欲しい|ください|下さい|たい)/.test(t) && /(投稿|告知|発信|ポスト|ネタ)/.test(t)) return "post";
  // 実績・症例・お客様のエピソードらしい文章（体験の記述で、依頼の形をしていない）
  if (t.length >= 25 && /(来院|来店|患者|お客様|お客さん|施術|症状|改善|回復|復帰|卒業|通われ|いらっしゃ)/.test(t)
      && !/[?？]$/.test(t)) return "material";
  return null;
}

/**
 * 「ご質問」ではなく「ご依頼」だったときの返し方。
 *
 * ★自動応答が動いたときも、動かなかったとき（短い一言のご依頼）も、
 *   同じ内容をお返しするために切り出している。
 */
function replyToRequest(req: "post" | "material" | "pasted", questionId?: number | string | null): unknown[] {
  const staff = { label: "担当者に聞く", data: `m=staff${questionId ? `&q=${questionId}` : ""}` };
  if (req === "pasted") {
    return [textWithQuick(
      "文章をお送りいただき、ありがとうございます。\n" +
      "このトークは、毎日の投稿の確認・承認と設定の操作にお使いいただけます（お送りいただいた文章がそのまま投稿されることはありません）。\n\n" +
      "・この文章をThreadsに投稿したい場合：アプリの「AI投稿を作る」で本文をこの文章に書き換えて投稿できます\n" +
      "・実績やお客様の声として今後の投稿に使いたい場合：「お店の情報」に登録してください\n" +
      "・担当者に伝えたい場合：「担当者に聞く」を押してください",
      [{ label: "お店の情報", data: "m=profile" }, staff, ...MENU_HINT],
    )];
  }
  if (req === "material") {
    return [textWithQuick(
      "ありがとうございます。実績やお客様のエピソードは、「お店の情報」に登録されたものだけをAIが投稿に使います" +
      "（登録されていない話を作ることはありません）。\n" +
      "いただいた内容を投稿で使えるようにするには、「お店の情報」に登録してください。\n\n" +
      "担当者に伝えたい場合は「担当者に聞く」を押してください。",
      [{ label: "お店の情報", data: "m=profile" }, staff, ...MENU_HINT],
    )];
  }
  return [textWithQuick(
    "投稿の内容についてのご依頼ですね。\n" +
    "毎日の投稿はAIが自動で作ります。今日の分の言い回しを変えたい場合は「今日の投稿」から「書き直す」で、ご希望をそのまま文章でお伝えいただけます。\n" +
    "プロフィールの一番上に置く固定投稿は、「固定投稿を作る」からこのトークで作れます。\n\n" +
    "この場でご相談されたい場合は「担当者に聞く」を押してください。",
    [
      { label: "今日の投稿", data: "m=posts" },
      { label: "固定投稿を作る", data: "m=makepin" },
      staff,
      ...MENU_HINT,
    ],
  )];
}

/**
 * ご質問に自動でお答えする。
 * 答えられた場合も「担当者に聞く」を必ず添えて、行き止まりにしない。
 */
async function autoAnswer(userId: number, lineUserId: string, question: string): Promise<unknown[] | null> {
  const { answerQuestion } = await import("./supportBot");
  const res = await answerQuestion({ question, userId, lineUserId, source: "line" });

  if (res.confident && res.answer) {
    return [textWithQuick(
      res.answer + "\n\n解決しない場合は「担当者に聞く」を押してください。",
      [
        { label: "担当者に聞く", data: `m=staff${res.questionId ? `&q=${res.questionId}` : ""}` },
        ...MENU_HINT,
      ],
    )];
  }

  // ★AIが「答えられない」と判断したご質問に、言葉の一致だけで別の案内を返すと
  //   的外れな返事になる（例：「資本金はいくらですか」に料金ページを出す）。
  //   判断できているときは、下手な当てずっぽうをせず担当者におつなぎする。
  if (res.available) {
    // ただし「ご質問」ではなく「こう投稿してほしい」というご依頼のことがある。
    // それに「お答えできないご質問でした」と返すのは的外れで、書いてくださった
    // 内容もそのまま失われる。何がどこに反映されるのかをお伝えする。
    const req = requestKind(question);
    if (req) return replyToRequest(req, res.questionId);
    return [textWithQuick(
      "申し訳ありません、こちらではお答えできないご質問でした。\n" +
      "担当者にお伝えしますので、下の「担当者に聞く」を押してください。",
      [
        { label: "担当者に聞く", data: `m=staff${res.questionId ? `&q=${res.questionId}` : ""}` },
        ...MENU_HINT,
      ],
    )];
  }

  // AI自体が使えなかったときだけ、従来のキーワード案内にまわす。
  return null;
}

/**
 * スタッフ追加用の6桁コードを、このトークの中で発行してお伝えする。
 *
 * ★以前は「アプリの設定画面でコードを発行してください」と案内していたが、
 *   それでは「追加」と送らせる意味がなく、案内のためだけの往復になっていた。
 *   コードはここで発行して、そのままお伝えする。
 */
async function issueStaffLinkCode(userId: number): Promise<unknown[]> {
  const cap = await db.getLineLinkCapacity(userId);
  if (!cap.canAdd) {
    const limitText = cap.limit < 0 ? "無制限" : `${cap.limit}人`;
    return [textWithQuick(
      `いま ${cap.used} 人の方が操作できる状態です。\n` +
      `ご契約のプランで操作できるのは ${limitText} までのため、これ以上は追加できません。\n` +
      "人数を増やすには、プランのご変更をお願いします。",
      [{ label: "プランを見る", data: "s=plan" }, ...MENU_HINT],
    )];
  }

  // 6桁のコードを発行（10分で失効）。既存コードは上書きされる。
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  try {
    await db.setLineLinkCode(userId, code, expiresAt);
  } catch (e) {
    console.error("[LineChat] スタッフ追加コードの発行に失敗:", e);
    return [textWithQuick("コードを発行できませんでした。時間をおいてもう一度お試しください。", MENU_HINT)];
  }

  const limitLabel = cap.limit < 0 ? "人数の制限なし" : `最大 ${cap.limit} 人`;
  const rest = cap.limit < 0 ? "無制限" : `あと ${cap.limit - cap.used} 人`;
  return [textWithQuick(
    `追加用のコードは【${code}】です（10分間有効）。\n\n` +
    "追加したい方に、次の2つをお伝えください。\n" +
    "1. Threads Studio の公式LINEを友だち追加する\n" +
    `2. そのトークに「${code}」とそのまま送る\n\n` +
    `これで、その方も投稿の確認や設定ができるようになります。\n` +
    `（ご契約のプランは${limitLabel}まで操作できます。いま${cap.used}人・${rest}追加できます）`,
    MENU_HINT,
  )];
}

/**
 * 担当者へのお問い合わせを受け付ける（次に届く文章を担当者へお届けする）。
 */
async function startStaffHandoff(lineUserId: string, questionId?: number): Promise<unknown[]> {
  // ★直前のご質問が分かっている場合は、書き直していただかずにそのままお送りできるようにする。
  //   （以前は必ず「もう一度お送りください」と書かせていて、無駄な往復になっていた）
  if (questionId) {
    const q = await db.getSupportQuestionById(questionId);
    const asked = String(q?.question || "").trim();
    if (asked) {
      await db.setLineChatState(lineUserId, "staff_message", String(questionId));
      return [textWithQuick(
        "担当者にお伝えします。\n\n" +
        `さきほどのご質問「${asked.slice(0, 60)}${asked.length > 60 ? "…" : ""}」を\n` +
        "そのままお送りする場合は、下の「このまま送る」を押してください。\n" +
        "補足があれば、そのままメッセージでお送りいただいても構いません。",
        [
          { label: "このまま送る", data: `m=sendq&q=${questionId}` },
          { label: "やめる", data: "m=cancel" },
        ],
      )];
    }
  }
  await db.setLineChatState(lineUserId, "staff_message");
  return [textWithQuick(
    "担当者にお伝えします。\nご質問・ご要望を、このままメッセージでお送りください。\n（お返事はこのトークにお送りします）",
    [{ label: "やめる", data: "m=cancel" }],
  )];
}

/**
 * 担当者へお問い合わせ内容をお届けする。
 */
async function forwardToStaff(userId: number, lineUserId: string, message: string, questionId?: number): Promise<unknown[]> {
  let user: any = null;
  try { user = await db.getUserById(userId); } catch { user = null; }
  let qid = questionId;
  if (!qid) {
    try {
      qid = await db.createSupportQuestion({
        userId, lineUserId, source: "line", question: message, needsHuman: 1, category: "その他",
      });
    } catch { qid = undefined; }
  } else {
    try {
      await db.updateSupportQuestion(qid, { needsHuman: 1, question: message });
    } catch { /* 記録に失敗しても、担当者への連絡は続ける */ }
  }

  const { notifyStaffOfQuestion } = await import("./supportNotify");
  const delivered = await notifyStaffOfQuestion({
    questionId: qid,
    userName: user?.name ?? null,
    userEmail: user?.email ?? null,
    lineUserId,
    message,
  });

  return [textWithQuick(
    delivered
      ? "担当者にお送りしました。確認のうえ、このトークにお返事します。\n（営業時間の都合で、お返事までお時間をいただく場合があります）"
      : "承りました。担当者が確認のうえ、このトークにお返事します。",
    MENU_HINT,
  )];
}

