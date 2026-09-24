/**
 * 見送りが続くお客様の徹底フォロー（2026-09-24 三上様指示・DB／LINE側）。
 * 判断そのものは shared/declineFollowup.ts。
 *
 * 毎晩20:30（JST）に動く。直近7日にご本人が3回以上見送ったアカウントごとに、
 *   1. 見送りの共通点・お聞きした理由をまとめる
 *   2. ホームページ（お店・アカウントの「ご案内先URL」の website／reservation）を読み、
 *      まだ登録にない材料と、登録と食い違う点を取り出す
 *   3. 三上様の公式LINEへ「足す／見送る」ボタン付きで送る
 * 三上様が「足す」を押したものだけ、お店の情報に足す（消さない・書き換えない・元に戻せる）。
 *
 * ★お客様には何も送らない。お客様の設定も、三上様が押すまで一切変えない。
 */
import { sql } from "drizzle-orm";
import * as db from "./db";
import {
  FOLLOWUP_DAYS, FOLLOWUP_MIN_DECLINES, FOLLOWUP_COOLDOWN_DAYS,
  EMPTY_PROPOSAL, dropAlreadyRegistered, mergeProposal, removeProposal, proposalMessage, proposalSize,
  type MaterialProposal,
} from "@shared/declineFollowup";

/** 3案をまとめて見送ったときの印（db.ts と同じ文） */
const CHOICE_ALL_SKIPPED_REASON = "3案すべてを見送り（本日は公開しない）";

/** ご本人の見送り（✕・見送る、3案のまとめて見送り）。3案は1回の判断として数える */
const DECLINE_WHERE = sql.raw(`status = 'canceled'
  AND (angle IS NULL OR angle NOT IN ('pinned','meta_ai_call'))
  AND (clientRating = 'bad' OR errorMessage = '${CHOICE_ALL_SKIPPED_REASON}')`);

export interface RepeatDecliner {
  accountId: number;
  userId: number;
  username: string;
  userName: string;
  declines: number;
  published: number;
}

/** 直近 FOLLOWUP_DAYS 日にご本人が FOLLOWUP_MIN_DECLINES 回以上見送ったアカウント */
export async function listRepeatDecliners(): Promise<RepeatDecliner[]> {
  const database = await db.getDb();
  if (!database) return [];
  const rows: any = await database.execute(sql`
    SELECT a.id AS accountId, a.userId, a.threadsUsername AS username, u.name AS userName,
      (SELECT COUNT(DISTINCT COALESCE(sp.choiceGroupId, CAST(sp.id AS CHAR))) FROM scheduledPosts sp
         WHERE sp.threadsAccountId = a.id AND ${DECLINE_WHERE}
           AND sp.updatedAt >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(FOLLOWUP_DAYS))} DAY)) AS declines,
      (SELECT COUNT(*) FROM scheduledPosts sp
         WHERE sp.threadsAccountId = a.id AND sp.status = 'posted' AND sp.source = 'auto'
           AND sp.postedAt >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(FOLLOWUP_DAYS))} DAY)) AS published
    FROM threadsAccounts a JOIN users u ON u.id = a.userId
    HAVING declines >= ${FOLLOWUP_MIN_DECLINES}
    ORDER BY declines DESC`);
  return (((rows as any)[0] ?? []) as any[]).map((r) => ({
    accountId: Number(r.accountId), userId: Number(r.userId), username: String(r.username ?? ""),
    userName: String(r.userName ?? ""), declines: Number(r.declines), published: Number(r.published),
  }));
}

/** そのアカウントの、直近 days 日の見送り回数（3案は1回として数える） */
export async function countRecentDeclines(accountId: number, days: number = FOLLOWUP_DAYS): Promise<number> {
  const database = await db.getDb();
  if (!database) return 0;
  const rows: any = await database.execute(sql`
    SELECT COUNT(DISTINCT COALESCE(choiceGroupId, CAST(id AS CHAR))) AS n FROM scheduledPosts
    WHERE threadsAccountId = ${accountId} AND ${DECLINE_WHERE}
      AND updatedAt >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(Math.max(1, Math.floor(days))))} DAY)`);
  return Number((rows as any)[0]?.[0]?.n ?? 0);
}

/** アカウントが使うお店の情報（紐づけが無ければ最初の1件） */
async function projectForAccount(accountId: number): Promise<any | null> {
  const acc: any = await db.getThreadsAccountById(accountId);
  if (!acc) return null;
  const projects: any[] = ((await db.getProjectsByUserId(acc.userId)) || []).filter((p: any) => !String(p.id).startsWith("demo_"));
  return projects.find((p) => p.id === acc.defaultProjectId) ?? projects[0] ?? null;
}

/** 読むページ：ご案内先URLのホームページ → 予約ページ の順 */
export function websiteUrlOf(project: any): string | null {
  let links: any[] = [];
  try { links = project?.links ? JSON.parse(project.links) : []; } catch { links = []; }
  const pick = (t: string) => links.find((l) => l?.type === t && /^https?:\/\//.test(String(l?.url ?? "")))?.url;
  return pick("website") ?? pick("reservation") ?? null;
}

/** 実例は「場面だけ」にする（結果を語る文は健康表現の検査に落ちるうえ、誤解のもと） */
const OUTCOME_WORDS = /(治(っ|り|る|せ)|完治|改善|消失|なくなり|無くなり|楽に|スッキリ|後遺症なく|問題なく|回復し|良くな)/;

/**
 * ホームページから「まだ登録にない材料」と「登録と食い違う点」を取り出す。
 * 読めなければ null（推測で埋めない）。
 */
export async function buildMaterialProposal(project: any, url: string): Promise<{ proposal: MaterialProposal; url: string } | { error: string }> {
  const { fetchWebsite, htmlToText } = await import("./websitePrefill");
  const fetched = await fetchWebsite(url);
  if (!fetched.ok) return { error: fetched.reason };
  const { title, description, text } = htmlToText(fetched.html);
  const page = [title, description, text].filter(Boolean).join("\n");
  if (page.replace(/\s/g, "").length < 80) return { error: "ページの文章が読み取れませんでした" };

  let cr: any = {};
  try { cr = project.counselingResult ? JSON.parse(project.counselingResult) : {}; } catch { cr = {}; }
  const registered = [
    `強み：${project.strength ?? ""}`, `実績：${project.proof ?? ""}`, `信条：${project.belief ?? ""}`,
    `N1顧客像：${project.n1Customer ?? ""}`, `独自性：${project.usp ?? ""}`,
    `メニュー：${(cr.menu ?? []).join("／")}`, `実績（設定）：${(cr.realProofs ?? []).join("／")}`,
    `実例（設定）：${(cr.realEpisodes ?? []).join("／")}`, `よくある質問：${(cr.faq ?? []).join("／")}`,
    `営業時間：${(cr.hoursInfo ?? []).join("／")}`,
  ].join("\n");

  const prompt =
    `以下は、あるお店のホームページの文章と、そのお店がすでに登録している内容です。\n` +
    `SNS投稿の材料として、ホームページに書かれていて、まだ登録されていないものを取り出してください。\n\n` +
    `【絶対のルール】\n` +
    `- ホームページに書いてあることだけ。推測で補わない。数字は書いてあるとおり。\n` +
    `- すでに登録されている内容と同じ意味のものは出さない。\n` +
    `- 実例（realEpisodes）は「誰が・どんな場面で来たか」だけを書く。治った・改善した・痛みが消えた等の結果は書かない。\n` +
    `- 料金・価格・クーポンは出さない。\n` +
    `- 登録内容とホームページで数字や事実が食い違うもの（例：登録「11年勤務」／ページ「10年以上勤務」）は、各項目に入れず discrepancies に「登録：〜／ページ：〜」の形で書く。\n` +
    `- 1件は60文字以内。各項目は最大6件。\n\n` +
    `【すでに登録されている内容】\n${registered.slice(0, 3000)}\n\n` +
    `【ホームページ】\n${page.slice(0, 7000)}`;
  const arr = { type: "array", items: { type: "string" } };
  const schema = {
    type: "json_schema",
    json_schema: {
      name: "material_proposal",
      schema: {
        type: "object",
        properties: { strength: arr, realEpisodes: arr, faq: arr, menu: arr, realProofs: arr, discrepancies: arr },
        required: ["strength", "realEpisodes", "faq", "menu", "realProofs", "discrepancies"],
        additionalProperties: false,
      },
      strict: true,
    },
  };
  try {
    const { invokeLLM } = await import("./_core/llm");
    const res: any = await invokeLLM({ messages: [{ role: "user", content: prompt }], response_format: schema as any });
    const raw = JSON.parse(res?.choices?.[0]?.message?.content ?? "{}");
    const regList = registered.split(/[\n／、]/);
    const clean = (xs: unknown) => dropAlreadyRegistered(Array.isArray(xs) ? xs.map(String) : [], regList);
    const proposal: MaterialProposal = {
      strength: clean(raw.strength),
      realEpisodes: clean(raw.realEpisodes).filter((x) => !OUTCOME_WORDS.test(x)),
      faq: clean(raw.faq),
      menu: clean(raw.menu).filter((x) => !/[0-9０-９,，]+\s*円/.test(x)),
      realProofs: clean(raw.realProofs),
      discrepancies: (Array.isArray(raw.discrepancies) ? raw.discrepancies.map(String) : []).slice(0, 5),
    };
    return { proposal, url: fetched.url };
  } catch (e) {
    console.error("[DeclineFollowup] ホームページの読み取りに失敗:", (e as Error)?.message);
    return { error: "内容の読み取りに失敗しました" };
  }
}

/** 管理者（三上様）の公式LINE */
async function adminLineIds(): Promise<string[]> {
  const database = await db.getDb();
  if (!database) return [];
  const rows: any = await database.execute(sql`SELECT id FROM users WHERE role = 'admin'`);
  const ids: string[] = [];
  for (const r of ((rows as any)[0] ?? []) as any[]) ids.push(...(await db.getLineUserIdsForUser(Number(r.id)).catch(() => [])));
  return Array.from(new Set(ids));
}

/**
 * 見送りが続くお客様のフォローを回す。
 * @param opts.accountId 1件だけ回す（夜間整備で、見つけたホームページのURLを渡すとき）
 * @param opts.url       読むページを指定する（登録に無いとき）
 * @param opts.dryRun    記録もLINEもしない（確かめ用）
 */
export async function runDeclineFollowup(opts: { accountId?: number; url?: string; dryRun?: boolean } = {}): Promise<{ checked: number; sent: number; messages: string[] }> {
  const database = await db.getDb();
  if (!database) return { checked: 0, sent: 0, messages: [] };
  let targets = await listRepeatDecliners();
  if (opts.accountId) {
    const one = targets.find((t) => t.accountId === opts.accountId);
    targets = one ? [one] : [];
    if (!one) {
      // 条件に届いていなくても、夜間整備が名指しした1件は回す
      const acc: any = await db.getThreadsAccountById(opts.accountId);
      const user: any = acc ? await db.getUserById(acc.userId) : null;
      if (acc) targets = [{ accountId: acc.id, userId: acc.userId, username: acc.threadsUsername, userName: user?.name ?? "", declines: await countRecentDeclines(acc.id), published: 0 }];
    }
  }
  const admins = opts.dryRun ? [] : await adminLineIds();
  const messages: string[] = [];
  let sent = 0;

  for (const t of targets) {
    try {
      const project = await projectForAccount(t.accountId);
      if (!project) continue;
      // 同じお店の情報に、7日以内に案を出していれば出し直さない（夜間整備がURLを渡したときは除く）
      if (!opts.url) {
        const recent: any = await database.execute(sql`
          SELECT COUNT(*) AS n FROM materialProposals WHERE projectId = ${project.id}
            AND createdAt >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(FOLLOWUP_COOLDOWN_DAYS))} DAY)`);
        if (Number((recent as any)[0]?.[0]?.n ?? 0) > 0) continue;
      }

      // 見送りの共通点とお聞きした理由
      const { extractDeclinedPatterns, SKIP_REASONS, isSkipReasonCode } = await import("@shared/declinedPatterns");
      const texts = await db.getRecentDeclinedContents(t.accountId, 21, 10).catch(() => [] as string[]);
      const pt = extractDeclinedPatterns(texts, [project.storeName, project.area, project.localTerms], {
        topics: [project.target, project.mainProblem, project.strength, project.usp, project.n1Customer, project.catchphrase, project.customerWords],
      });
      const reasons = (await db.getRecentSkipFeedback(t.accountId, 14).catch(() => [])).map((r: any) =>
        r.reason === "text" && r.reasonText ? `「${String(r.reasonText).slice(0, 60)}」` : (isSkipReasonCode(String(r.reason)) ? SKIP_REASONS[String(r.reason) as keyof typeof SKIP_REASONS].label : String(r.reason)));

      // ホームページ
      const url = opts.url ?? websiteUrlOf(project);
      let proposal: MaterialProposal | null = null;
      let note = "";
      let status = "no_url";
      let usedUrl: string | null = url;
      if (url) {
        const r = await buildMaterialProposal(project, url);
        if ("error" in r) { note = `ホームページ（${url}）を読めませんでした：${r.error}`; status = "no_url"; }
        else {
          proposal = r.proposal; usedUrl = r.url;
          status = proposalSize(r.proposal) > 0 ? "pending" : "no_new";
          if (status === "no_new") note = `ホームページ（${r.url}）に、まだ登録にない材料は見つかりませんでした。`;
        }
      } else {
        note = "ホームページが登録されていません。夜間整備で店名から探し、見つかれば案をお送りします。";
      }

      const message = proposalMessage({
        userName: t.userName, username: t.username, declines: t.declines, published: t.published,
        patterns: pt.top.slice(0, 5), reasons, sourceUrl: usedUrl, proposal, note,
      });
      messages.push(message);
      if (opts.dryRun) continue;

      const ins: any = await database.execute(sql`
        INSERT INTO materialProposals (userId, projectId, threadsAccountId, sourceUrl, proposal, status, declines)
        VALUES (${t.userId}, ${project.id}, ${t.accountId}, ${usedUrl}, ${JSON.stringify(proposal ?? EMPTY_PROPOSAL)}, ${status}, ${t.declines})`);
      const id = Number((ins as any)[0]?.insertId ?? 0);

      const { pushMessages } = await import("./lineNotify");
      const { textWithQuick } = await import("./lineChat");
      const buttons = status === "pending"
        ? [{ label: "足す", data: `adm=mp&id=${id}&v=apply` }, { label: "見送る", data: `adm=mp&id=${id}&v=skip` }]
        : [];
      for (const lineId of admins) {
        const ok = await pushMessages(lineId, [buttons.length ? textWithQuick(message, buttons) : { type: "text", text: message }]);
        if (ok) sent++;
      }
      console.log(`[DeclineFollowup] account=${t.accountId} 見送り${t.declines}回 → ${status}（案 #${id}）`);
    } catch (e) {
      console.error(`[DeclineFollowup] account=${t.accountId} のフォローに失敗:`, (e as Error)?.message);
    }
  }
  return { checked: targets.length, sent, messages };
}

/**
 * 三上様がLINEで押した「足す／見送る／元に戻す」を反映する。
 * 返り値はLINEでお返しする文。
 */
export async function decideProposal(id: number, action: "apply" | "skip" | "undo", adminUserId: number): Promise<string> {
  const database = await db.getDb();
  if (!database) return "いまは処理できませんでした。";
  const rows: any = await database.execute(sql`SELECT * FROM materialProposals WHERE id = ${id} LIMIT 1`);
  const row: any = (rows as any)[0]?.[0];
  if (!row) return "その案が見つかりませんでした。";

  if (action === "skip") {
    if (row.status !== "pending") return `この案はすでに「${row.status}」です。`;
    await database.execute(sql`UPDATE materialProposals SET status = 'skipped', decidedAt = NOW(), decidedBy = ${adminUserId} WHERE id = ${id}`);
    return "見送りました。お店の情報は変えていません。";
  }

  const projRows: any = await database.execute(sql`SELECT id, strength, counselingResult, updatedAt FROM projects WHERE id = ${row.projectId} LIMIT 1`);
  const project: any = (projRows as any)[0]?.[0];
  if (!project) return "お店の情報が見つかりませんでした。";

  if (action === "apply") {
    if (row.status !== "pending") return `この案はすでに「${row.status}」です。`;
    let proposal: MaterialProposal = EMPTY_PROPOSAL;
    try { proposal = { ...EMPTY_PROPOSAL, ...JSON.parse(row.proposal ?? "{}") }; } catch { /* 空のまま */ }
    const merged = mergeProposal({ strength: project.strength, counselingResult: project.counselingResult }, proposal);
    const before = JSON.stringify({ strength: project.strength, counselingResult: project.counselingResult });
    await database.execute(sql`UPDATE projects SET strength = ${merged.strength}, counselingResult = ${merged.counselingResult} WHERE id = ${project.id}`);
    await database.execute(sql`UPDATE materialProposals SET status = 'applied', beforeSnapshot = ${before}, decidedAt = NOW(), decidedBy = ${adminUserId} WHERE id = ${id}`);
    console.log(`[DeclineFollowup] 案 #${id} を反映（${merged.added}件を足した・project=${project.id}）`);
    return `お店の情報に${merged.added}件を足しました（今の登録は消していません）。\n翌朝6時の投稿から使われます。\n取り消す場合は「元に戻す」を押してください。`;
  }

  // undo
  if (row.status !== "applied" || !row.beforeSnapshot) return "この案は、元に戻せる状態ではありません。";
  // ★丸ごと書き戻さず、足した項目だけを外す。足したあとにお客様ご自身が直した・足した分は残る
  //   （以前は「足したあとに更新があれば戻さない」＝戻したいときに戻せなかった。2026-09-24）
  let proposal: MaterialProposal = EMPTY_PROPOSAL;
  try { proposal = { ...EMPTY_PROPOSAL, ...JSON.parse(row.proposal ?? "{}") }; } catch { /* 空のまま */ }
  const before = JSON.parse(row.beforeSnapshot);
  const r = removeProposal({ strength: project.strength, counselingResult: project.counselingResult }, before, proposal);
  await database.execute(sql`UPDATE projects SET strength = ${r.strength}, counselingResult = ${r.counselingResult} WHERE id = ${project.id}`);
  await database.execute(sql`UPDATE materialProposals SET status = 'undone', decidedAt = NOW(), decidedBy = ${adminUserId} WHERE id = ${id}`);
  console.log(`[DeclineFollowup] 案 #${id} を元に戻した（${r.removed}件を外した・project=${project.id}）`);
  return `元に戻しました（足した${r.removed}件を外しました。それ以外の登録には触れていません）。\n翌朝6時の投稿から、足す前の内容で作ります。`;
}

/** 夜の定例（20:30 JST） */
export async function runDeclineFollowupJob(): Promise<void> {
  const r = await runDeclineFollowup();
  console.log(`[DeclineFollowup] 対象${r.checked}件・三上様へ${r.sent}通`);
}
