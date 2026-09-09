/**
 * お店のホームページ（ホットペッパー・Instagram等でも可）のURLから、
 * 「はじめの設定」の答えを先に読み取る。
 *
 * 三上様指示（2026-09-10）：最初にURLを貼ってもらえれば大体の情報はつかめる。
 * 優先順位の高い順に、最初は5つだけ（URL＋4問）で終える。
 *
 * ★プロフィールからの先読み（counselingPrefill.ts）と同じ土台：
 *   ページに書いてあることしか使わない。実績・数字はページにあるものだけ。
 *   読み取れない項目は空にして、ふつうに質問する。
 * ★取得できないとき（JSだけのページ・ブロック・タイムアウト）は正直に「読み取れませんでした」と返し、
 *   従来どおり質問する。推測で埋めない。
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { invokeLLM } from "./_core/llm";
import { PREFILL_FIELDS, sanitizePrefill, type Prefill } from "./counselingPrefill";

export interface WebsitePrefillResult {
  ok: boolean;
  answers: Prefill;
  /** 案内文に出す出どころ（例：「ホームページ（example.com）」） */
  source: string;
  /** ok=false のときの理由（お客様向けの短い文） */
  reason?: string;
  /** 正規化したURL（保存用） */
  url?: string;
}

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 1_500_000;
const MAX_TEXT_CHARS = 8000;
const MIN_TEXT_CHARS = 80;

/** 文章の中からURLを1つ取り出す（前後の日本語や「です」が付いていても拾う） */
export function extractUrl(text: string): string | null {
  const m = String(text ?? "").match(/https?:\/\/[^\s　「」『』()（）<>"']+/i);
  if (m) return m[0].replace(/[。、．，!！?？]+$/, "");
  // スキームなしの「example.com/...」も受ける（www. か、末尾が .jp/.com などのとき）
  const bare = String(text ?? "").match(/(?:^|\s)((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s　「」]*)?)/i);
  if (bare && /\.(jp|com|net|org|info|biz|me|co|io|app|site|shop|jp\/|com\/)/i.test(bare[1])) return `https://${bare[1]}`;
  return null;
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("::ffff:");
}

/** 社内ネットワークやローカルを指すURLは読みに行かない */
export async function isSafePublicUrl(u: URL): Promise<boolean> {
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (isIP(host)) return !isPrivateIp(host);
  if (!host.includes(".")) return false;
  try {
    const addrs = await lookup(host, { all: true });
    if (addrs.length === 0) return false;
    return addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ""; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; } });
}

/** HTMLから、人が読む文章だけを取り出す（見出し・本文・メタ説明）。依存ライブラリなし。 */
export function htmlToText(html: string): { title: string; description: string; text: string } {
  const src = String(html ?? "");
  const pick = (re: RegExp) => { const m = src.match(re); return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : ""; };
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    pick(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i) ||
    pick(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i);
  let body = src
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|template)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|footer)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|dd|dt|td|th|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  body = decodeEntities(body)
    .split("\n").map((l) => l.replace(/[ \t　]+/g, " ").trim()).filter(Boolean).join("\n")
    .replace(/\n{2,}/g, "\n");
  return { title, description, text: body.slice(0, MAX_TEXT_CHARS) };
}

/** ページを取りに行く（リダイレクトは3回まで。移動先も社内向けでないことを確かめる） */
export async function fetchWebsite(inputUrl: string): Promise<{ ok: true; url: string; html: string } | { ok: false; reason: string }> {
  let u: URL;
  try { u = new URL(inputUrl); } catch { return { ok: false, reason: "URLの形が読み取れませんでした" }; }
  for (let hop = 0; hop < 4; hop++) {
    if (!(await isSafePublicUrl(u))) return { ok: false, reason: "このURLは読みに行けません" };
    let res: Response;
    try {
      res = await fetch(u.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "accept-language": "ja,en;q=0.5",
        },
      });
    } catch {
      return { ok: false, reason: "ページに時間内につながりませんでした" };
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { ok: false, reason: "ページの移動先が分かりませんでした" };
      try { u = new URL(loc, u); } catch { return { ok: false, reason: "ページの移動先が読み取れませんでした" }; }
      continue;
    }
    if (!res.ok) return { ok: false, reason: `ページが開けませんでした（${res.status}）` };
    const ct = String(res.headers.get("content-type") || "");
    if (ct && !/html|xml|text\/plain/i.test(ct)) return { ok: false, reason: "文章のページではありませんでした" };
    const buf = new Uint8Array(await res.arrayBuffer());
    const html = new TextDecoder(/charset=shift_jis|charset=sjis|charset=windows-31j/i.test(ct) ? "shift_jis" : /charset=euc-jp/i.test(ct) ? "euc-jp" : "utf-8").decode(buf.subarray(0, MAX_BYTES));
    // HTML側の charset 宣言が Shift_JIS のとき（古いホームページに多い）
    if (!/charset=/i.test(ct) && /charset=["']?(shift_jis|sjis|windows-31j)/i.test(html.slice(0, 2000))) {
      return { ok: true, url: u.toString(), html: new TextDecoder("shift_jis").decode(buf.subarray(0, MAX_BYTES)) };
    }
    return { ok: true, url: u.toString(), html };
  }
  return { ok: false, reason: "ページの移動が多すぎました" };
}

const FIELD_GUIDE: Record<(typeof PREFILL_FIELDS)[number], string> = {
  businessTypeRaw: "業種（例：呉服店、整体院、カフェ）。短い業種名で",
  areaRaw: "所在地（都道府県・市区町村・町名まで。住所欄やアクセス欄から）",
  storeNameRaw: "お店の名前・屋号（正式名称）",
  targetRaw: "来てほしいお客さん像。「〜の方へ」「〜でお悩みの方」など、ページに書いてある場合だけ",
  mainProblemRaw: "お客さんの悩み。ページに書いてある症状・困りごとだけ（読点区切り・60文字以内）",
  strengthRaw: "強み・こだわり。ページの言い回しをそのまま（60文字以内）",
  uspRaw: "選ぶ理由を一言で。ページに書いてある場合だけ",
  menuRaw: "メニュー・商品名。ページにあるものだけ（読点区切り・10個まで）",
  hoursInfoRaw: "営業時間・定休日・予約方法。書いてある場合だけ",
  realProofsRaw: "数字の実績（創業〇年・のべ〇人など）。ページにある数字だけ",
  ctaAssetsRaw: "初回の特典・無料相談・割引など。書いてある場合だけ",
};

/**
 * URLからページを読み、答えを先に埋める。
 * @returns ok=false のときは reason にお客様向けの理由（「取得できず」を正直に伝える）
 */
export async function buildPrefillFromWebsite(inputUrl: string): Promise<WebsitePrefillResult> {
  const fetched = await fetchWebsite(inputUrl);
  if (!fetched.ok) return { ok: false, answers: {}, source: "", reason: fetched.reason };
  const { title, description, text } = htmlToText(fetched.html);
  let host = "";
  try { host = new URL(fetched.url).hostname.replace(/^www\./, ""); } catch { host = ""; }
  const source = host ? `ホームページ（${host}）` : "ホームページ";
  const combined = [title, description, text].filter(Boolean).join("\n");
  if (combined.replace(/\s/g, "").length < MIN_TEXT_CHARS) {
    return { ok: false, answers: {}, source, url: fetched.url, reason: "ページの文章が読み取れませんでした（画像やアプリ表示だけのページの可能性）" };
  }

  const prompt =
    `以下は、あるお店のホームページの文章です。\n` +
    `ここに書いてあることだけを根拠に、各項目を日本語で埋めてください。\n\n` +
    `【絶対のルール】\n` +
    `- 書いてないことは書かない。推測で補わない。読み取れない項目は空文字 "" にする。\n` +
    `- 数字（年数・人数・料金）は、文章にある数字だけを使う。\n` +
    `- 文章の言い回しをできるだけそのまま使う（要約しすぎない）。各項目は60文字以内。\n` +
    `- 予約サイトや広告の定型文（「クーポン一覧」「口コミを見る」など）は無視する。\n` +
    `- businessTypeRaw は「呉服店」「整体院」「カフェ」のように短い業種名にする。\n\n` +
    `【項目】\n` + PREFILL_FIELDS.map((k) => `- ${k}: ${FIELD_GUIDE[k]}`).join("\n") + `\n\n` +
    `【ページタイトル】${title.slice(0, 200)}\n【説明文】${description.slice(0, 400)}\n【本文】\n${text}`;

  const schema = {
    type: "json_schema",
    json_schema: {
      name: "website_prefill",
      schema: {
        type: "object",
        properties: Object.fromEntries(PREFILL_FIELDS.map((k) => [k, { type: "string" }])),
        required: [...PREFILL_FIELDS],
        additionalProperties: false,
      },
      strict: true,
    },
  };
  try {
    const res: any = await invokeLLM({ messages: [{ role: "user", content: prompt }], response_format: schema as any });
    const raw = res?.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || !raw.trim()) return { ok: false, answers: {}, source, url: fetched.url, reason: "内容の読み取りに失敗しました" };
    const answers = sanitizePrefill(JSON.parse(raw));
    if (Object.keys(answers).length === 0) return { ok: false, answers: {}, source, url: fetched.url, reason: "お店の情報にあたる文章が見つかりませんでした" };
    return { ok: true, answers, source, url: fetched.url };
  } catch (e) {
    console.error("[WebsitePrefill] 読み取りに失敗:", (e as Error)?.message);
    return { ok: false, answers: {}, source, url: fetched.url, reason: "内容の読み取りに失敗しました" };
  }
}
