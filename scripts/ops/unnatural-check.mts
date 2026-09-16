/**
 * 「明らかに不自然な投稿・設定」を全クライアント分まとめて洗い出す（読み取りのみ・直さない）。
 *
 *   npx tsx scripts/ops/unnatural-check.mts [--days 3]
 *
 * 2026-09-17 三上様指示「今回のような感じで、他のクライアントに関しても
 * 明らかに不自然な投稿がある場合は、チェックを入れて、こちらの判断を仰ぐように」。
 *
 * ★このスクリプトは絶対に直さない。見つけたら三上様に報告し、指示を待つ。
 *   梅原様・髙木様の件で実際に起きたことを、そのまま検査項目にしている。
 *
 * 必要なenv: DATABASE_URL（本番はトンネル 127.0.0.1:13308）
 */
const days = Number((process.argv.find((a) => a.startsWith("--days"))?.split("=")[1]) ?? process.argv[process.argv.indexOf("--days") + 1] ?? 3) || 3;

const db = await import("../../server/db");
const d = await db.getDb();
const { sql } = await import("drizzle-orm");
if (!d) { console.error("DBに接続できません"); process.exit(1); }

type Finding = { level: "要判断" | "確認"; user: string; account: string; what: string; detail: string };
const found: Finding[] = [];

// ───────── 1. お店の情報とアカウントの対応 ─────────
const accts: any[] = (await d.execute(sql`
  SELECT a.id, a.userId, a.threadsUsername, a.defaultProjectId, a.isActive,
         u.name AS userName, p.storeName, p.area, p.mode, p.businessType
  FROM threadsAccounts a
  JOIN users u ON u.id = a.userId
  LEFT JOIN projects p ON p.id = a.defaultProjectId
  WHERE a.isActive <> 0 AND (u.isDemoMode IS NULL OR u.isDemoMode = 0)`))[0] as any;

const byUser = new Map<number, any[]>();
for (const a of accts) { const l = byUser.get(a.userId) ?? []; l.push(a); byUser.set(a.userId, l); }

for (const [userId, list] of byUser) {
  const who = `${list[0].userName}(${userId})`;
  if (list.length < 2) continue;

  // 1-a 複数アカウントなのに、お店の情報が紐づいていない（＝他店の情報で投稿される）
  for (const a of list.filter((x) => !x.defaultProjectId)) {
    found.push({ level: "要判断", user: who, account: `@${a.threadsUsername}`,
      what: "お店の情報が紐づいていない",
      detail: "他のアカウントの情報を使って投稿が作られます。梅原様・髙木様と同じ状態です。" });
  }
  // 1-b 複数アカウントが同じお店の情報を共有している（片方を直すと両方変わる）
  const share = new Map<string, string[]>();
  for (const a of list.filter((x) => x.defaultProjectId)) {
    const l = share.get(a.defaultProjectId) ?? []; l.push(a.threadsUsername); share.set(a.defaultProjectId, l);
  }
  for (const [pid, names] of share) {
    if (names.length >= 2) found.push({ level: "要判断", user: who, account: names.map((n) => "@" + n).join("・"),
      what: "複数アカウントが同じお店の情報を共有",
      detail: `${pid} を共有。片方を直すともう片方も変わります。` });
  }
}

// ───────── 2. 名乗り方・地域の設定 ─────────
for (const a of accts) {
  if (!a.storeName) continue;
  // 2-a 店名に敬称が入っている（自分を「◯◯先生は」と三人称で呼ぶ原因）
  if (/(先生|さん|様)$/.test(String(a.storeName))) {
    found.push({ level: "要判断", user: `${a.userName}(${a.userId})`, account: `@${a.threadsUsername}`,
      what: "登録名に敬称が入っている", detail: `店名「${a.storeName}」。自分を三人称で呼ぶ投稿になります。` });
  }
  // 2-b お店の集客モードなのに地域が「オンライン／全国」（「◯◯の◯◯です」が組み立たない）
  if (a.mode !== "personal" && /オンライン|全国/.test(String(a.area ?? ""))) {
    found.push({ level: "確認", user: `${a.userName}(${a.userId})`, account: `@${a.threadsUsername}`,
      what: "地域が地名になっていない", detail: `地域「${a.area}」。名乗りが不自然になります。` });
  }
}

// ───────── 3. 投稿の中身 ─────────
const posts: any[] = (await d.execute(sql`
  SELECT s.id, s.userId, s.status, s.postContent, a.threadsUsername, u.name AS userName,
         p.storeName, p.proof, p.strength, p.usp
  FROM scheduledPosts s
  JOIN threadsAccounts a ON a.id = s.threadsAccountId
  JOIN users u ON u.id = s.userId
  LEFT JOIN projects p ON p.id = a.defaultProjectId
  WHERE s.createdAt > NOW() - INTERVAL ${days} DAY
    AND s.status IN ('pending','awaiting_approval','posted')
    AND s.postContent IS NOT NULL`))[0] as any;

// 効果の断定・数値の実績（医療広告・景表法で問題になりやすい）
const CLAIM: Array<[RegExp, string]> = [
  [/改善率|治癒率|成功率/, "改善率などの割合"],
  [/\d+\s*(kg|キロ)\s*(痩せ|減|落ち)/, "◯キロ痩せるという数値"],
  [/必ず(痩せ|治|良くな)/, "必ず〜という断定"],
  [/(治ります|治る|完治)/, "治るという断定"],
  [/血圧が下が/, "血圧が下がるという効果"],
  [/\d{2,3}\s*%/, "パーセント表記"],
];
// 登録に無い可能性が高い「無料の申し出」
const OFFER = /(初回\s*\d+\s*分|無料\s*(個別)?(相談|カウンセリング|体験))/;

for (const s of posts) {
  const text = String(s.postContent);
  const who = `${s.userName}(${s.userId})`;
  const tag = s.status === "posted" ? "公開済み" : "未公開";

  // 3-a 自分を「◯◯先生は」と敬称つきの三人称で呼んでいる
  //     ★店舗が「Moveact玉島店は」と名乗るのは自然なので対象外。
  //       敬称が付いたときだけ（個人名を他人のように呼んでいる状態）拾う。
  if (/[ぁ-んァ-ヶ一-龥A-Za-zｦ-ﾟ]{2,12}(先生|さん|様)(は|が|より|も)/.test(text)) {
    const m = text.match(/[ぁ-んァ-ヶ一-龥A-Za-zｦ-ﾟ]{2,12}(先生|さん|様)(は|が|より|も)/)![0];
    // お客様を指す一般語（皆さん・お客様 等）は除く
    // 「Aさん」「Bさん」はお客様の例を伏せた書き方なので除く
    if (!/^(皆|みな|お客|患者|読者|先輩|後輩|奥|旦那)/.test(m) && !/^[A-Za-zＡ-Ｚ]さん/.test(m)) {
      found.push({ level: "要判断", user: who, account: `@${s.threadsUsername}`,
        what: `自分または他人を敬称つきの三人称で呼んでいる（${tag}）`, detail: `#${s.id}「${m}」…「${text.slice(0, 32)}」` });
    }
  }
  // 3-b 効果の断定・数値
  for (const [re, label] of CLAIM) {
    if (re.test(text)) {
      found.push({ level: "要判断", user: who, account: `@${s.threadsUsername}`,
        what: `${label}（${tag}）`, detail: `#${s.id}「${text.slice(0, 40)}」` });
      break;
    }
  }
  // 3-c 登録に無い無料の申し出
  if (OFFER.test(text)) {
    const reg = [s.proof, s.strength, s.usp].filter(Boolean).join(" ");
    if (!OFFER.test(reg)) {
      found.push({ level: "確認", user: who, account: `@${s.threadsUsername}`,
        what: `登録に無い無料の申し出（${tag}）`, detail: `#${s.id}「${(text.match(OFFER) || [""])[0]}」` });
    }
  }
}

// ───────── 出力 ─────────
if (found.length === 0) {
  console.log(`不自然な投稿・設定は見つかりませんでした（直近${days}日・アカウント${accts.length}件）。`);
  process.exit(0);
}
const order = { 要判断: 0, 確認: 1 } as const;
found.sort((a, b) => order[a.level] - order[b.level] || a.user.localeCompare(b.user));
console.log(`■ 不自然な投稿・設定 ${found.length}件（直近${days}日・アカウント${accts.length}件）\n`);
console.log("★ここでは直しません。三上様のご判断を仰いでから対応してください。\n");
let cur = "";
for (const f of found) {
  if (f.user !== cur) { console.log(`\n【${f.user}】`); cur = f.user; }
  console.log(`  [${f.level}] ${f.account}　${f.what}`);
  console.log(`         ${f.detail}`);
}
process.exit(0);
