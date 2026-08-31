/**
 * LINEトーク内チャット操作のハンドラ（postback・テキストを解釈して返信を組み立てる）。
 * ここで返した messages を webhook が reply API でそのまま返す（通数を消費しない）。
 *
 * 方針: Webビューを開かせない。承認・書き直し・見送り・設定変更・成績確認まで
 * すべてトーク内の往復で完結させる。
 */
import * as db from "./db";
import {
  buildPostCards, textWithQuick, parsePostback, fmtJst, REWRITE_KINDS,
  MENU_ITEMS, HELP_TOPICS, helpQuick, settingsQuick, settingsSummary,
} from "./lineChat";

const MENU_HINT: { label: string; data: string }[] = MENU_ITEMS;

/** 未連携ユーザーへの案内（連携前は何もできないため） */
function notLinked(): unknown[] {
  return [{
    type: "text",
    text:
      "はじめまして。まだアカウントと連携できていません。\n\n" +
      "アプリの設定画面で表示される6桁のコードを、このトークにそのまま送ってください。連携が終わると、投稿の確認や設定の変更がこのトークだけでできるようになります。",
  }];
}

/** 承認待ちの投稿を出す（無ければ次の予定を伝える） */
async function repliesForPosts(userId: number): Promise<unknown[]> {
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
  return [
    { type: "text", text: `確認をお待ちしている投稿が${waiting.length}件あります。内容を見て、下のボタンを押してください。` },
    buildPostCards(waiting as any),
  ];
}

/** 投稿の所有者チェック付き取得 */
async function ownedPost(userId: number, postId: number) {
  const post = await db.getScheduledPostById(postId);
  if (!post || post.userId !== userId) return null;
  return post;
}

/** 書き直し（AIに指示を渡して作り直す） */
async function rewritePost(userId: number, postId: number, instruction: string): Promise<unknown[]> {
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
    return [
      { type: "text", text: "書き直しました。こちらでよろしければ「これで投稿する」を押してください。" },
      buildPostCards([updated as any]),
    ];
  } catch {
    return [textWithQuick("うまく書き直せませんでした。もう一度お試しいただくか、別の言い方でお伝えください。", MENU_HINT)];
  }
}

/** 直近7日の成績（数字だけをテキストで返す） */
async function repliesForStats(userId: number): Promise<unknown[]> {
  try {
    const all = await db.getScheduledPostsByUserId(userId);
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const posted = all.filter((p: any) => p.status === "posted" && p.postedAt && new Date(p.postedAt).getTime() >= since);
    if (posted.length === 0) {
      return [textWithQuick("この7日間に公開された投稿はまだありません。", MENU_HINT)];
    }
    return [textWithQuick(
      `この7日間で${posted.length}件の投稿を公開しました。\n\n` +
      "反応の数字（表示回数・いいね）は、投稿ごとの集計が届きしだいこのトークでもお伝えできるようにしています。いまは詳しい数字が必要なときだけアプリの「投稿分析」をご覧ください。",
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
      return [textWithQuick("まだお店の情報が登録されていません。最初の登録だけはアプリの画面からお願いします。", MENU_HINT)];
    }
    const lines = [
      p.businessType ? `・業種：${p.businessType}` : null,
      p.area ? `・エリア：${p.area}` : null,
      p.target ? `・届けたい方：${String(p.target).slice(0, 40)}` : null,
      p.strength ? `・強み：${String(p.strength).slice(0, 60)}` : null,
    ].filter(Boolean);
    return [textWithQuick(
      "登録されている内容です。\n\n" + lines.join("\n") +
      "\n\n直したいところがあれば、この続きにそのまま書いて送ってください（例：「強みを、女性スタッフのみの安心感に変えて」）。",
      MENU_HINT,
    )];
  } catch {
    return [textWithQuick("お店の情報を読み込めませんでした。", MENU_HINT)];
  }
}

/**
 * postback（ボタン）を処理して返信メッセージを返す。
 */
export async function handlePostback(lineUserId: string, data: string): Promise<unknown[]> {
  const user = await db.getUserByLineUserId(lineUserId);
  if (!user) return notLinked();
  const q = parsePostback(data);

  // ── メニュー ──
  if (q.m === "posts") return repliesForPosts(user.id);
  if (q.m === "stats") return repliesForStats(user.id);
  if (q.m === "profile") return repliesForProfile(user.id);
  if (q.m === "help") return [textWithQuick("よくあるご質問です。知りたいものを選んでください。", helpQuick())];
  if (q.m === "menu") return [textWithQuick("どれをご覧になりますか？", MENU_HINT)];
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
    return [textWithQuick(`承認しました。${when}公開されます。`, MENU_HINT)];
  }
  if (q.a === "skip" && q.i) {
    const post = await ownedPost(user.id, Number(q.i));
    if (!post) return [{ type: "text", text: "その投稿が見つかりませんでした。" }];
    await db.updateScheduledPost(Number(q.i), { status: "canceled" });
    return [textWithQuick("この投稿は見送りにしました。明日の投稿はまた新しく作ります。", MENU_HINT)];
  }
  if (q.a === "rw" && q.i) {
    const items = Object.entries(REWRITE_KINDS).map(([k, v]) => ({ label: v.label, data: `a=rw2&i=${q.i}&k=${k}` }));
    await db.setLineChatState(lineUserId, "rewrite_free", q.i);
    return [textWithQuick(
      "どんなふうに直しますか？\n下から選ぶか、ご希望をそのまま文章で送ってください（例：「クーポンの話を入れて」）。",
      items,
    )];
  }
  if (q.a === "rw2" && q.i && q.k) {
    await db.clearLineChatState(lineUserId);
    const kind = REWRITE_KINDS[q.k];
    if (!kind) return [{ type: "text", text: "選択を読み取れませんでした。" }];
    return rewritePost(user.id, Number(q.i), kind.instruction);
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
  if (!user) return null; // 未連携は既存の案内に任せる

  const st = await db.getLineChatState(lineUserId);
  if (st?.state === "rewrite_free" && st.payload) {
    await db.clearLineChatState(lineUserId);
    return rewritePost(user.id, Number(st.payload), text.slice(0, 200));
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
