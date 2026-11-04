/**
 * 公式LINEに届くお問い合わせのうち「設定で解決できるもの」を見分ける（2026-11-04 三上様
 * 「今後、このような問い合わせが来たら、自動的に対応するように変更してください」）。
 *
 * 3つの種類を、規則だけで見分ける（DBに触らない。流れは server/settingRequestFlow.ts）。
 *   1. 通知を止めたい／戻したい（「投稿結果を送らないで」「交流の案内はいらない」「また送って」）
 *   2. ホームページのURL＋「これを元に投稿を」（ページの見出しから話題を拾い、ネタ帳に入れる）
 *   3. 自動投稿の時刻（「自動は12時に」「15時の予約を12時に」「5日の12時にお願いします」）
 *
 * 決めごと（shared/contentRequest.ts と同じ）
 *  - 取りこぼしより横取りの害が大きい。言葉がそろった短い文だけに当てる。困りごと・やり方のお尋ねには当てない。
 *  - 当たっても勝手に変えない。必ずお客様に確認のボタンを押していただく。
 *  - サーバーのビルド対象の都合で、正規表現に u フラグは使わない。
 *
 * 判定を変えるときは server/settingRequest.test.ts の当たる文・当たらない文も合わせて直す。
 */
import { parsePostRequest } from "./linePostRequest";
import { checkHealthClaims } from "./healthClaimGuard";

function len(s: string): number {
  return Array.from(s).length;
}

/** 全角の数字・記号を半角に（「５日(木)12：00」→「5日(木)12:00」） */
export function normalizeText(s: string): string {
  return String(s ?? "").normalize("NFKC").trim();
}

// ───────────────────────── 記録の印 ─────────────────────────

/** supportQuestions.category */
export const SETTING_CATEGORY = {
  notice: "通知の設定",
  topics: "ネタ帳（ホームページ）",
  postTime: "投稿の時刻",
} as const;
export type SettingKind = keyof typeof SETTING_CATEGORY;

/** supportQuestions.handledBy（「自動で対応済み」と分かるように、頭は必ず「自動」） */
export const SETTING_HANDLED_BY = {
  noticeOff: "自動（通知を止めた）",
  noticeOn: "自動（通知を戻した）",
  noticeInfo: "自動（止められない通知のご案内）",
  topics: "自動（ネタ帳に登録）",
  fixedHours: "自動（自動投稿の時刻を決めた）",
  movePost: "自動（予約の時刻を動かした）",
  moveRefused: "自動（動かせない理由をご案内）",
  declined: "自動（お客様が見送り）",
} as const;

// ───────────────────────── 1. 通知 ─────────────────────────

export type NoticeKey = "daily_result" | "next_action" | "engagement" | "meta_ai" | "newsletter" | "email";

/** 止められる通知（列は users のもの・読み物は newsletterOptOuts）。code はボタンの data に入れる短い名前 */
export const NOTICE_CATALOG: Record<NoticeKey, { code: string; label: string; keeps: string }> = {
  daily_result: { code: "dr", label: "朝のまとめの「昨日の投稿結果」", keeps: "朝のまとめのほかの中身（お知らせ・承認待ちの件数）は届きます。" },
  next_action: { code: "na", label: "「次にやること」の案内", keeps: "仕組みが変わったときのお知らせは届きます。" },
  engagement: { code: "ec", label: "毎日5分の「交流」の案内", keeps: "" },
  meta_ai: { code: "ma", label: "朝10時の「Meta AI呼びかけ投稿」", keeps: "呼びかけ投稿の分は、ふつうの自動投稿になります。" },
  newsletter: { code: "nl", label: "週1回の読み物", keeps: "" },
  email: { code: "em", label: "ご案内のメール", keeps: "お手続き・お支払いに関するメールは届きます。" },
};

export const NOTICE_KEYS = Object.keys(NOTICE_CATALOG) as NoticeKey[];

export function noticeKeyFromCode(code: string): NoticeKey | null {
  return NOTICE_KEYS.find((k) => NOTICE_CATALOG[k].code === code) ?? null;
}
export function noticeCodes(keys: readonly NoticeKey[]): string {
  return keys.map((k) => NOTICE_CATALOG[k].code).join(".");
}
export function noticeKeysFromCodes(s: string | undefined | null): NoticeKey[] {
  return String(s ?? "").split(".").map(noticeKeyFromCode).filter((k): k is NoticeKey => Boolean(k));
}

/** 止められない連絡（承認カード・お支払い・お手続き） */
export const UNSTOPPABLE_NOTE = "承認カード（公開前の確認）・お支払い・お手続きのご連絡は、止められません。";

const NOTICE_WORDS: Array<{ key: NoticeKey | "morning"; re: RegExp; not?: RegExp }> = [
  { key: "daily_result", re: /(投稿結果|投稿の結果|昨日の結果|前日の結果|結果の(お知らせ|報告|通知|連絡|LINE|ライン|まとめ)|結果報告|表示回数の(お知らせ|報告|通知)|件数の(お知らせ|報告|通知))/i },
  { key: "next_action", re: /(次にやること|次やること|やることの(案内|お知らせ|通知)|次の(案内|お知らせ)|設定の案内|自動にしませんか)/ },
  { key: "engagement", re: /(交流)/ },
  { key: "meta_ai", re: /(meta\s*ai|メタ\s*ai|メタエーアイ|呼びかけ投稿|呼びかけ文|呼びかけの(お知らせ|通知|LINE|ライン)|10時の(お知らせ|通知|LINE|ライン|呼びかけ))/i, not: /(返信|コメント|非表示|付いた|ついた|ブロック|ミュート|町名|地域|答え)/ },
  { key: "newsletter", re: /(読み物|ニュースレター|メルマガ)/ },
  { key: "email", re: /(メール)/, not: /(承認|確認|請求|領収|お支払|支払|決済|手続)/ },
  { key: "morning", re: /((朝|毎朝)の?(まとめ|お知らせ|通知|LINE|ライン|連絡|メッセージ)|朝イチの(お知らせ|LINE))/i },
];

const UNSTOPPABLE_RE = /(承認カード|確認カード|承認の(お知らせ|通知|依頼|LINE)|確認の(お知らせ|通知|メール|LINE)|承認待ちの(お知らせ|通知|メール|LINE)|(承認|確認)のメール|お支払|支払い|請求|決済|領収|お手続き|手続き|契約)/;
const GENERIC_RE = /(通知|お知らせ|案内|LINE|ライン|連絡|メッセージ)/i;

const NOTICE_STOP_RE =
  /(いらない|要らない|いりません|要りません|不要|送らないで|送らなくて(いい|良い|大丈夫|結構)|送ってこないで|送ってほしくない|送って欲しくない|ほしくない|欲しくない|止めて|とめて|停止|オフに|OFFに|やめて|止めたい|とめたい|やめたい|止められ|やめられ|来なくて(いい|良い|大丈夫|結構)|来ないように|届かなくて(いい|良い|大丈夫|結構)|届かないように|なくて(いい|良い|大丈夫|結構)|受け取らない|受け取りたくない|配信停止|解除して|なしで|無しで|なしに|無しに)/i;
const NOTICE_RESUME_RE =
  /(また送って|また届けて|もう一度送って|もう1度送って|再開|戻して|もどして|元に戻|受け取りたい|受け取るように|また受け取|届けてほしい|届けて欲しい|届けてください|送ってほしい|送って欲しい|送ってください|送ってもらいたい|オンに|ONに|復活)/i;
/** 困りごと（届かない・来なくなった）・やり方のお尋ね。止めたい／戻したいではない */
const NOTICE_TROUBLE_RE =
  /(届かな(い|く)(?!て(いい|良い|大丈夫|結構))(?!ように)|届きません|来な(い|く)(?!て(いい|良い|大丈夫|結構))(?!ように)|来ません|エラー|どうやって|どうすれば|どうしたら|どこで|どこから|どこに|やり方|方法|なぜ|なんで|何時に|いつ届)/;

export type NoticeRequest = {
  action: "off" | "on";
  /** 止める／戻す通知。空なら「どの通知か」をお選びいただく */
  keys: NoticeKey[];
  /** 止められない連絡に触れていたか */
  unstoppable: boolean;
};

/**
 * 「投稿結果を送らないで」「交流の案内はいらない」「また送って」などを読む。当たらなければ null。
 *   通知の名前（どれか）と、止めたい／戻したいの言葉が両方そろったときだけ当てる。
 */
export function detectNoticeRequest(text: string): NoticeRequest | null {
  const s = normalizeText(text);
  if (!s || len(s) > 80) return null;
  if (s.split(/\n/).filter((l) => l.trim()).length > 3) return null;
  if (NOTICE_TROUBLE_RE.test(s)) return null;
  // 「自動投稿を止めて」「投稿を止めて」は投稿そのもののこと（別の受け口）
  if (/(自動投稿|自動の投稿|投稿(を|は)?(止|と|やめ|停止|一時停止|休))/.test(s) && !/(投稿結果|投稿の結果|呼びかけ投稿)/.test(s)) return null;
  const off = NOTICE_STOP_RE.test(s);
  const on = !off && NOTICE_RESUME_RE.test(s);
  if (!off && !on) return null;
  const keys: NoticeKey[] = [];
  for (const w of NOTICE_WORDS) {
    if (!w.re.test(s) || (w.not && w.not.test(s))) continue;
    if (w.key === "morning") {
      for (const k of ["daily_result", "next_action"] as NoticeKey[]) if (!keys.includes(k)) keys.push(k);
    } else if (!keys.includes(w.key)) keys.push(w.key);
  }
  // 「〜結果」だけの短い言い方（「結果はいらない」「結果を送らないで」）
  if (keys.length === 0 && /^(昨日の|毎日の|毎朝の)?結果(は|を|も)?/.test(s)) keys.push("daily_result");
  const unstoppable = UNSTOPPABLE_RE.test(s);
  if (keys.length === 0 && !unstoppable) {
    // 「通知はいらない」「LINEのお知らせを止めて」：どれかをお選びいただく
    if (GENERIC_RE.test(s) && len(s) <= 40) return { action: off ? "off" : "on", keys: [], unstoppable: false };
    return null;
  }
  return { action: off ? "off" : "on", keys, unstoppable };
}

/** 止める／戻す確認の文 */
export function noticeConfirmText(req: { action: "off" | "on"; keys: readonly NoticeKey[] }, already: readonly NoticeKey[] = []): string {
  const todo = req.keys.filter((k) => !already.includes(k));
  const names = todo.map((k) => NOTICE_CATALOG[k].label).join("と");
  const lines: string[] = [];
  if (req.action === "off") {
    lines.push(`${names}を止めます。よろしいですか。`);
    const keeps = todo.map((k) => NOTICE_CATALOG[k].keeps).filter(Boolean);
    if (keeps.length) lines.push("", ...Array.from(new Set(keeps)));
    lines.push("", UNSTOPPABLE_NOTE, "あとから戻したいときは「設定」→「お知らせの受け取り」で戻せます。");
  } else {
    lines.push(`${names}を、また受け取るようにします。よろしいですか。`);
  }
  if (already.length) {
    lines.push("", `（${already.map((k) => NOTICE_CATALOG[k].label).join("と")}は、すでに${req.action === "off" ? "止めています" : "受け取る設定です"}）`);
  }
  return lines.join("\n");
}

// ───────────────────────── 2. ホームページから話題 ─────────────────────────

/** 文章の中のURL（1つだけのときだけ使う） */
export function urlsIn(text: string): string[] {
  return (String(text ?? "").match(/https?:\/\/[^\s　「」『』()（）<>"']+/gi) ?? []).map((u) => u.replace(/[。、．，!！?？]+$/, ""));
}

const TOPIC_URL_INTENT_RE =
  /((元|もと|基)に|参考に|使って|見て|読んで|内容で|の内容|内容を|内容から|から)[^\n]{0,20}(投稿|記事|ネタ|話題|発信|文章|ポスト|書い|作)|(投稿|記事|ネタ|話題|発信)[^\n]{0,8}(作|書|して|にして|お願い|作成|使|に入れ|にでき)/;
/** ご案内先（誘導先）のURLの登録や、固定投稿のリンクのことは別の受け口 */
const TOPIC_URL_NOT_RE = /(ご案内先|案内先|誘導|リンク先|リンクを|予約ページ|予約のURL|LINEのURL|公式LINE|固定投稿|プロフィール|貼って|貼り|載せて|エラー|開けない|開きません|できません|表示されない)/;

/** 「https://… このページの内容を元に投稿を作って」なら URL を返す */
export function detectTopicUrlRequest(text: string): { url: string } | null {
  const raw = String(text ?? "").trim();
  if (!raw || len(raw) > 300) return null;
  const urls = urlsIn(raw);
  if (urls.length !== 1) return null;
  const rest = normalizeText(raw.replace(urls[0], " ")).replace(/\s+/g, " ").trim();
  if (len(rest) < 4) return null; // URLだけはご案内先の登録の受け口へ
  if (TOPIC_URL_NOT_RE.test(rest)) return null;
  if (!TOPIC_URL_INTENT_RE.test(rest)) return null;
  return { url: urls[0] };
}

/** 一度にお出しする話題の数 */
export const MAX_TOPICS = 5;

/** 話題にしない見出し（どのページにもある案内の見出し） */
const NAV_HEADING_RE =
  /^(ホーム|トップ|トップページ|home|top|menu|メニュー|料金|料金表|料金案内|価格|アクセス|access|地図|マップ|お問い?合わせ|お問合せ|contact|会社概要|院内紹介|店内紹介|スタッフ紹介|スタッフ|院長紹介|院長あいさつ|代表あいさつ|プロフィール|profile|ご予約|予約|ご予約はこちら|営業時間|診療時間|受付時間|施術時間|お知らせ|news|ニュース|ブログ|blog|新着情報|最新情報|プライバシーポリシー|個人情報|サイトマップ|よくある質問|faq|q&a|コラム|カテゴリー?|関連記事|人気記事|最新記事|おすすめ記事|検索|search|share|シェア|sns|instagram|line|facebook|twitter|x|youtube|口コミ|お客様の声|求人|採用|リクルート|リンク|目次|ページトップ|戻る|次へ|前へ|もっと見る|詳しくはこちら|一覧|メニュー一覧|症状一覧|対応症状|当院について|当店について|about|about us|ギャラリー|gallery)$/i;
const NAV_INCLUDES_RE = /(©|copyright|cookie|クッキー|javascript|ログイン|会員登録|カート|ご予約はこちら|お電話|電話番号|tel|〒|住所|駐車場|無料相談|LINE予約|ネット予約|WEB予約|クーポン)/i;

/** 健康・医療系のお店では外す話題（心の病気・薬や手術をやめる勧め・病名の治療・効果の断定） */
const MENTAL_RE = /(うつ|鬱|メンタル|心の(不調|病|病気|問題|ケア|疲れ)|こころの(不調|病|病気)|精神|パニック|不安障害|適応障害|発達障害|統合失調|双極|自律神経失調|心療|不登校|ひきこもり|引きこもり|PTSD|トラウマ|摂食障害|依存症|自殺|希死)/i;
const STOP_MEDICINE_RE = /(薬|服薬|投薬|手術|注射|病院|通院|ステロイド|湿布)[^。\n]{0,10}(やめ|止め|不要|いらない|要らない|頼らな|頼らず|しなくて|せずに|せず|なしで|無しで|卒業|減らせ|減らす|手放)/;
const DISEASE_RE = /(ヘルニア|坐骨神経痛|脊柱管狭窄|狭窄症|がん|癌|糖尿|高血圧|リウマチ|喘息|アトピー|不妊|椎間板|側弯|骨粗|認知症|パーキンソン|脳梗塞|顔面神経|突発性難聴|メニエール|偏頭痛|片頭痛|変形性|半月板|神経痛|頸椎症|胸郭出口|ばね指|腱鞘炎|五十肩|四十肩|ストレートネック|顎関節症|逆流性|過敏性腸)/;
const CURE_RE = /(治療|治す|治る|治り|治せ|完治|根治|根本改善|改善|解消|克服|撃退|効く|効果|専門)/;

export type TopicVerdict = { ok: true } | { ok: false; reason: "mental" | "stop_medicine" | "disease_cure" | "claim" };

/** 健康・医療系のお店で、この話題を使ってよいか */
export function healthTopicVerdict(topic: string): TopicVerdict {
  const t = normalizeText(topic);
  if (MENTAL_RE.test(t)) return { ok: false, reason: "mental" };
  if (STOP_MEDICINE_RE.test(t)) return { ok: false, reason: "stop_medicine" };
  if (DISEASE_RE.test(t) && CURE_RE.test(t)) return { ok: false, reason: "disease_cure" };
  if (!checkHealthClaims(t).ok) return { ok: false, reason: "claim" };
  return { ok: true };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ""; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; } });
}

/** 見出しの文を話題の形にそろえる（番号・飾り・サイト名を外す）。使えなければ null */
export function cleanHeading(raw: string): string | null {
  let s = normalizeText(decodeEntities(String(raw ?? "").replace(/<[^>]+>/g, " "))).replace(/\s+/g, " ").trim();
  s = s.replace(/\s*[|｜]\s*[^|｜]*$/, "").trim(); // 「肩こり｜〇〇整体院」
  s = s.replace(/^(step\s*\d+|point\s*\d+|no\.?\s*\d+|q\d*\.?|\d{1,2}[.)．、:]?|[①-⑳]|[■□●○◆◇▼▽★☆※・\-–—>＞])\s*/i, "").trim();
  s = s.replace(/^[【\[「『]([^】\]」』]+)[】\]」』]$/, "$1").trim();
  s = s.replace(/[。．!！]+$/, "").trim();
  const n = len(s);
  if (n < 3 || n > 40) return null;
  if (!/[ぁ-んァ-ヶ一-龠]/.test(s)) return null;
  if (NAV_HEADING_RE.test(s) || NAV_INCLUDES_RE.test(s)) return null;
  if (/^(こんな|このような|こういった)(お悩み|方|症状)/.test(s) && n <= 12) return null;
  if (/[?？]$/.test(s) && n <= 6) return null;
  return s;
}

function topicKey(s: string): string {
  return normalizeText(s).replace(/[\s、。・!！?？「」『』（）()]/g, "").toLowerCase();
}

/**
 * 話題の候補を整える（重複を外し・健康系は決まりに触れやすいものを外し・最大5件）。
 * @returns topics＝お出しする話題／dropped＝健康の決まりで外した話題
 */
export function filterTopics(candidates: readonly string[], opts: { health: boolean; existing?: readonly string[] }): { topics: string[]; dropped: string[]; duplicate: string[] } {
  const seen = new Set<string>();
  const have = new Set((opts.existing ?? []).map(topicKey));
  const topics: string[] = [];
  const dropped: string[] = [];
  const duplicate: string[] = [];
  for (const c of candidates) {
    const t = cleanHeading(c);
    if (!t) continue;
    const key = topicKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    if (opts.health && !healthTopicVerdict(t).ok) { dropped.push(t); continue; }
    if (have.has(key)) { duplicate.push(t); continue; }
    if (topics.length < MAX_TOPICS) topics.push(t);
  }
  return { topics, dropped, duplicate };
}

/** ページの見出し（h1〜h4）を、ページの順に取り出す。ナビ・フッターの中は見ない */
export function headingsFromHtml(html: string): string[] {
  const src = String(html ?? "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const out: string[] = [];
  const re = /<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[2]);
  return out;
}

/** 話題の確認の文。話題は1行ずつ「」で囲む（押す時点で預かりが切れていても、この文から読み戻せるように） */
export function topicsConfirmText(p: { topics: readonly string[]; dropped: readonly string[]; duplicate?: readonly string[]; multiProject?: boolean }): string {
  return [
    `ページを読みました。投稿の話題として、次の${p.topics.length}件をネタ帳に登録します。よろしいですか。`,
    "",
    ...p.topics.map((t) => `「${t}」`),
    "",
    "登録すると、これから作る投稿で、ひとつずつ主役にします（同じ話題は3週間ほどあけて使います）。ページの文章をそのまま写すことはしません。",
    ...(p.dropped.length ? [`健康の広告の決まりに触れやすい話題（${p.dropped.length}件）は外しました。`] : []),
    ...(p.duplicate?.length ? [`すでにネタ帳にある話題（${p.duplicate.length}件）は外しました。`] : []),
    p.multiProject ? "どのお店のネタ帳に入れるか、下から選んでください。" : "",
  ].filter((l, i, a) => !(l === "" && i === a.length - 1)).join("\n");
}

/** 確認の文から話題を読み戻す */
export function parseTopicsFromConfirm(text: string | null | undefined): string[] {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim().match(/^「(.+)」$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => m[1].trim())
    .filter((t) => len(t) >= 2 && len(t) <= 60)
    .slice(0, MAX_TOPICS);
}

// ───────────────────────── 3. 自動投稿の時刻 ─────────────────────────

export type TimeToken = { hour: number; minute: number; index: number; end: number };

/** 文の中の時刻（「12時」「12:00」「午後3時」「12時半」「正午」）。「2時間」は時刻ではない */
export function timeTokens(text: string): TimeToken[] {
  const s = normalizeText(text);
  const out: TimeToken[] = [];
  const re = /(午前|午後|朝|夜|夕方|昼|お昼)?\s*(\d{1,2})\s*(?:時(?!間)\s*(?:(半)|(\d{1,2})\s*分)?|:(\d{2}))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    // 「11/5」の後ろの数字や「1日2回」の数字は時刻ではない（時・: が付いたものだけを見ている）
    let hour = Number(m[2]);
    const minute = m[3] ? 30 : m[4] ? Number(m[4]) : m[5] ? Number(m[5]) : 0;
    if (hour < 12 && /(午後|夜|夕方)/.test(m[1] ?? "")) hour += 12;
    if (hour > 23 || minute > 59) continue;
    out.push({ hour, minute, index: m.index, end: m.index + m[0].length });
  }
  if (out.length === 0) {
    const noon = s.match(/(正午|お昼)(?!\s*\d)/);
    if (noon && noon.index !== undefined) out.push({ hour: 12, minute: 0, index: noon.index, end: noon.index + noon[0].length });
  }
  return out;
}

/** 文の中の日付（YYYY-MM-DD・JST）。「1日2回」「3日間」は日付ではない */
export function dayIn(text: string, now: number = Date.now()): string | undefined {
  const s = normalizeText(text);
  const j = new Date(now + 9 * 3600_000);
  const y = j.getUTCFullYear(), m = j.getUTCMonth(), d = j.getUTCDate();
  const iso = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd)).toISOString().slice(0, 10);
  const md = s.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?/);
  if (md) {
    const mm = Number(md[1]) - 1, dd = Number(md[2]);
    if (mm >= 0 && mm <= 11 && dd >= 1 && dd <= 31) return iso(mm < m - 6 ? y + 1 : y, mm, dd);
  }
  const dOnly = s.match(/(?<![\d\/月])(\d{1,2})\s*日(?!\s*(\d|間|ごと|おき|置き|に\s*\d|一回|二回|三回|1回|2回|3回))/);
  if (dOnly) {
    const dd = Number(dOnly[1]);
    if (dd >= 1 && dd <= 31) return dd >= d ? iso(y, m, dd) : iso(y, m + 1, dd);
  }
  if (/(明後日|あさって)/.test(s)) return iso(y, m, d + 2);
  if (/(明日|あした)/.test(s)) return iso(y, m, d + 1);
  if (/(今日|本日)/.test(s)) return iso(y, m, d);
  return undefined;
}

export type PostTimeRequest =
  /** これからの自動投稿の時刻を決める（threadsAccounts.fixedPostHours） */
  | { kind: "fixed"; hours: number[] }
  /** 予約済みの投稿の時刻を動かす。from＝今の時刻（分かれば）・day＝その日・to＝動かす先 */
  | { kind: "move"; from?: { hour: number; minute: number }; day?: string; to: { hour: number; minute: number }; bare: boolean }
  /** 「投稿は12時にして」：これからずっとか、次の1本だけか分からない → 両方のボタンを出す */
  | { kind: "either"; to: { hour: number; minute: number } };

const POST_TIME_NOT_RE =
  /(zoom|ズーム|ずーむ|来店|ご来店|営業|休診|休業|定休|臨時|診療|受付|閉め|開け|開店|閉店|オープン|セミナー|イベント|説明会|打ち合わせ|打合せ|面談|電話|お電話|折り返|案を|案が|案の(時間|届)|確認カード|カードが|届く時間|届く時刻|確認する時間|見る時間|meta|メタ|呼びかけ|10時の)/i;
const POST_TIME_QUESTION_RE = /(何時|いつ(?!も)|なぜ|なんで|どうして|どうやって|どうすれば|どこで|ですか[?？]?$|でしょうか|ますか[?？]$|[?？]$)/;
const POST_TIME_POLITE_ASK_RE = /(できますか|できませんか|られますか|られませんか|もらえますか|もらえませんか|いただけますか|いただけませんか|頂けますか|お願いできますか)[?？。]?$/;
const RECUR_RE = /(自動|毎日|いつも|毎回|今後|これから|基本|普段|ふだん|固定|定時|決まった時間|時間帯|(\d)\s*(回|本|件)\s*(目|に(なったら|なれば|なる時|なるとき)|の(とき|時|場合|日)|なら|だったら|の時は|の日は))/;
const POST_WORD_RE = /(投稿|予約|ポスト|公開|配信|アップ|出す|出して)/;
const ASK_VERB_RE =
  /(して|変更|変えて|かえて|ずらして|移して|動かして|直して|お願い|おねがい|ほしい|欲しい|ください|下さい|できますか|できませんか|もらえ|いただけ|頂け|希望|固定|統一|そろえ|揃え|決めて|設定)/;

/**
 * 自動投稿の時刻のご依頼を読む。当たらなければ null。
 *   本文つきの「この投稿を12時にお願いします」は parsePostRequest（送られた文章の予約）が先に取るので、ここでは当てない。
 */
export function detectPostTimeRequest(text: string, now: number = Date.now()): PostTimeRequest | null {
  const s = normalizeText(text);
  if (!s || len(s) > 100) return null;
  if (s.split(/\n/).filter((l) => l.trim()).length > 3) return null;
  if (parsePostRequest(String(text ?? ""), now)) return null;
  if (POST_TIME_NOT_RE.test(s)) return null;
  if (POST_TIME_QUESTION_RE.test(s) && !POST_TIME_POLITE_ASK_RE.test(s)) return null;
  if (/(できない|できません|されない|されません|ずれる|ずれた|ずれて|違う時間|ちがう時間|勝手に|エラー)/.test(s)) return null;
  if (!ASK_VERB_RE.test(s) && !/(時|:\d{2})に?$/.test(s)) return null;
  const toks = timeTokens(s);
  if (toks.length === 0 || toks.length > 5) return null;
  // 「12時〜15時」「12時から15時の間」は時間帯で、どちらの時刻か決められない
  if (toks.length >= 2 && /(の間|あいだ|までの|まで|ごろまで|〜|~|ー|-)/.test(s.slice(toks[0].end, toks[toks.length - 1].index + 1))) return null;

  // ① 「15時の予約を12時に」「15:00で予約になっているものを12:00に」：今の時刻→動かす先
  if (toks.length === 2) {
    const between = s.slice(toks[0].end, toks[1].index);
    if (/(を|は|から|→|->|⇒|⇨)/.test(between) && !/(と|、|,|・|や)$/.test(between.trim()) && !RECUR_RE.test(between)) {
      if (!POST_WORD_RE.test(s) && !/(もの|分|やつ|の)を/.test(between)) return null;
      return { kind: "move", from: { hour: toks[0].hour, minute: toks[0].minute }, day: dayIn(s, now), to: { hour: toks[1].hour, minute: toks[1].minute }, bare: false };
    }
  }

  // ② 「自動は12時に」「12時と15時に」「3回になったら12時と15時」：これからの自動投稿の時刻
  if (RECUR_RE.test(s) || /投稿(の)?(時間|時刻)|投稿時間|投稿時刻/.test(s)) {
    if (toks.some((t) => t.minute !== 0)) return null; // 分の指定はできない（担当者へ）
    const appear = toks.map((t) => t.hour);
    const hours = Array.from(new Set(appear)).sort((a, b) => a - b);
    if (hours.length > 5) return null;
    // 「1本なら21時、2本なら12時と15時」のように、前から使う形にならない言い方は決められない
    if (/(なったら|なれば|なら|の時|のとき|の場合)/.test(s) && appear[0] !== hours[0]) return null;
    const day = dayIn(s, now);
    // 「明日の投稿を12時に」は1回だけのこと（下の③）。「明日から自動は12時に」はこれから
    if (!day || /から/.test(s) || /自動/.test(s)) return { kind: "fixed", hours };
  }

  // ③ 「5日(木)12:00にお願いします」「明日の投稿を12時に」：その日の予約を動かす
  const day = dayIn(s, now);
  if (day && toks.length === 1) {
    const rest = (s.slice(0, toks[0].index) + s.slice(toks[0].end)).replace(/\(.\)/g, "");
    const bare = !POST_WORD_RE.test(s);
    // 本文の無い「5日12時にお願いします」は、日時とお願いの言葉だけでできているときだけ
    if (bare && len(rest.replace(/(今日|本日|明日|あした|明後日|あさって|\d{1,2}\s*[\/月]\s*\d{1,2}\s*日?|\d{1,2}\s*日|の|に|で|は|を|へ|お願い(します|いたします|致します)?|おねがいします|頼みます|希望です|希望します|して(ください|下さい|ほしい)|[\s、。!！()（）])/g, "")) > 4) return null;
    return { kind: "move", day, to: { hour: toks[0].hour, minute: toks[0].minute }, bare };
  }

  // ④ 「投稿は12時にしてほしい」：ずっとか、次の1本だけか分からない
  if (toks.length === 1 && POST_WORD_RE.test(s)) return { kind: "either", to: { hour: toks[0].hour, minute: toks[0].minute } };
  return null;
}

export function hm(h: number, m: number): string {
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** 「11/5（木）15:12」（JST） */
export function jstLabel(at: Date | string | number): string {
  const d = new Date(new Date(at).getTime() + 9 * 3600_000);
  const W = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${W[d.getUTCDay()]}）${hm(d.getUTCHours(), d.getUTCMinutes())}`;
}

/** YYYY-MM-DD（JST） */
export function jstDay(at: Date | string | number): string {
  return new Date(new Date(at).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** その日（JST）の h:m */
export function jstAt(day: string, h: number, m: number): Date {
  return new Date(Date.parse(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+09:00`));
}

/** ボタンの data に入れる時刻（YYYYMMDDHHmm・JST） */
export function encodeJst(at: Date): string {
  const d = new Date(at.getTime() + 9 * 3600_000);
  return d.toISOString().slice(0, 16).replace(/[-T:]/g, "");
}
export function decodeJst(s: string | undefined | null): Date | null {
  const m = String(s ?? "").match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const at = new Date(Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`));
  return Number.isFinite(at.getTime()) ? at : null;
}

/** 自動投稿の時刻を決める確認の文 */
export function fixedHoursConfirmText(hours: readonly number[], opts?: { account?: string | null; multiAccount?: boolean }): string {
  const list = hours.map((h) => `${h}:00`).join("、");
  return [
    `${opts?.account ? `@${opts.account} の` : ""}これからの自動投稿の時刻を「${list}」に決めます。よろしいですか。`,
    "",
    hours.length >= 2
      ? `1日に出す本数は今の設定のままで、1本の日は${hours[0]}:00、2本の日は${hours.slice(0, 2).map((h) => `${h}:00`).join("と")}、のように前から順に使います。`
      : `1日に出す本数は今の設定のままです。2本以上の日は、${hours[0]}:00のほかは今まで通りの時間帯に出します。`,
    "明日以降に作る投稿から変わります。すでに予約済みの投稿の時刻は変わりません（動かしたいときは「15時の予約を12時に」のように送ってください）。",
    opts?.multiAccount ? "どのアカウントの時刻にするか、下から選んでください。" : "",
  ].filter((l, i, a) => !(l === "" && i === a.length - 1)).join("\n");
}

/** 予約の時刻を動かす確認の文 */
export function moveConfirmText(p: { from: Date; to: Date; account?: string | null; manual: boolean; awaiting: boolean; head: string; bare: boolean }): string {
  return [
    `${p.account ? `@${p.account} の` : ""}${jstLabel(p.from)} に予約している投稿を、${jstLabel(p.to)} に動かします。よろしいですか。`,
    "",
    `「${p.head}」`,
    ...(p.manual ? ["", "この投稿は、ご自身で決めて予約した投稿です。時刻だけを動かし、文章は変えません。"] : []),
    ...(p.awaiting ? ["", "公開前の確認が入っている投稿です。確認の設定はそのまま、新しい時刻で公開します。"] : []),
    ...(p.bare ? ["", "投稿の時刻のことではない場合（Zoomの日程のお返事など）は、「ちがう」を押してください。"] : []),
  ].join("\n");
}

/** 担当者へ回したときのお返し（自動で読み取れなかった設定のご希望） */
export const SETTING_ESCALATED_TEXT =
  "設定のご希望として、担当者にお伝えしました。設定を変えたら、このトークでお知らせします。";
