/**
 * 地域トレンド収集：Threads公式のキーワード検索API（search_type=TOP）で、
 * その地域に関する「人気（反応の高い）投稿」を取得する。
 *
 * 重要な前提：
 *  - 他人の投稿の正確な「閲覧数」はAPIで取得できない（インサイトは自分の投稿専用）。
 *    そのため search_type=TOP（Threadsの人気順）を「反応が高い」の指標として使う。
 *  - keyword_search には `threads_keyword_search` 権限が必要で、Meta審査の承認が要る。
 *    未承認のトークンでは 400/403 が返るため、その旨を呼び出し側へ伝える。
 */

const THREADS_API_BASE_URL = 'https://graph.threads.net';

export interface RegionalPost {
  id: string;
  text: string;
  permalink: string | null;
  username: string | null;
  timestamp: string | null;
  keyword: string;
}

export interface RegionalSearchResult {
  posts: RegionalPost[];
  /** 権限未承認・トークン不正などで検索できなかったときの理由コード */
  errorCode?: 'permission' | 'auth' | 'unknown';
  errorMessage?: string;
}

/** 1キーワードをTOP検索。テキストのある投稿だけ返す。 */
async function searchOne(accessToken: string, keyword: string): Promise<RegionalSearchResult> {
  const fields = 'id,text,permalink,username,timestamp,is_reply';
  const url =
    `${THREADS_API_BASE_URL}/v1.0/keyword_search` +
    `?q=${encodeURIComponent(keyword)}&search_type=TOP&fields=${fields}` +
    `&access_token=${encodeURIComponent(accessToken)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // 権限不足のとき Threads は code 10 / OAuthException 等を返す
      const isPerm = /permission|keyword_search|scope|not.*authorized|code\":?\s*10/i.test(body);
      const isAuth = res.status === 401 || /invalid.*token|expired|code\":?\s*190/i.test(body);
      return {
        posts: [],
        errorCode: isPerm ? 'permission' : isAuth ? 'auth' : 'unknown',
        errorMessage: `status=${res.status} ${body.slice(0, 200)}`,
      };
    }
    const json: any = await res.json();
    const data: any[] = Array.isArray(json?.data) ? json.data : [];
    const posts: RegionalPost[] = data
      .filter((d) => d && typeof d.text === 'string' && d.text.trim().length > 0 && !d.is_reply)
      .map((d) => ({
        id: String(d.id),
        text: d.text,
        permalink: d.permalink ?? null,
        username: d.username ?? null,
        timestamp: d.timestamp ?? null,
        keyword,
      }));
    return { posts };
  } catch (e) {
    return { posts: [], errorCode: 'unknown', errorMessage: String(e) };
  }
}

/**
 * 複数の地域キーワードでTOP検索し、重複（同一投稿ID）を除いて返す。
 * どれか1つでも権限エラーなら errorCode を伝播（全滅時のみ）。
 */
export async function searchRegionalTopPosts(
  accessToken: string,
  keywords: string[],
  perKeywordLimit = 10,
): Promise<RegionalSearchResult> {
  const seen = new Set<string>();
  const out: RegionalPost[] = [];
  let lastError: RegionalSearchResult | null = null;
  let anySuccess = false;

  for (const kw of keywords.slice(0, 6)) {
    const r = await searchOne(accessToken, kw);
    if (r.errorCode) { lastError = r; continue; }
    anySuccess = true;
    for (const p of r.posts.slice(0, perKeywordLimit)) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }

  if (!anySuccess && lastError) {
    return { posts: [], errorCode: lastError.errorCode, errorMessage: lastError.errorMessage };
  }
  return { posts: out };
}

/**
 * 地域からTOP検索用のキーワード候補を作る。
 * 実在の地図データ（駅名・エリア名）を優先し、無ければ area 文字列から生成。
 */
export function buildRegionalKeywords(area: string, localTerms: string[]): string[] {
  const kws = new Set<string>();
  // 地図由来の駅名・通称（「〇〇駅」など）
  for (const t of localTerms) {
    const clean = t.replace(/（.*?）/g, '').trim();
    if (clean.length >= 2) kws.add(clean);
  }
  // 住所の末尾トークン（市区町村・町名）
  const parts = (area || '')
    .split(/[\s　]/)
    .flatMap((s) => s.split(/(?<=[市区町村])/))
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !/^(日本|[0-9０-９\-]+)$/.test(s));
  for (const p of parts) kws.add(p);
  return Array.from(kws).slice(0, 6);
}
