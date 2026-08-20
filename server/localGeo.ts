/**
 * 地元の呼び方（最寄り駅・町名/エリア）を「実在の地図データ」から取得する。
 *
 * LLMの記憶に頼ると存在しない施設を作り出す（ハルシネーション）ため、AIは一切使わず、
 * 実在データのみを返す：
 *   1. Nominatim（OpenStreetMap）で エリア文字列 → 緯度経度 ＋ 住所内訳（町名候補）
 *   2. HeartRails Express（日本の駅API）で 座標 → 実在の最寄り駅（路線名つき）
 *
 * ランドマーク（お店・施設など）は、実在を機械的に保証しづらく誤りが致命的なため
 * 自動候補は出さない（ユーザーが知っている実在のものを手入力する想定）。
 *
 * いずれも無料・APIキー不要。Overpass等の重いPOI検索は使わない（遅延・不安定なため）。
 */

const UA = 'ThreadsStudio/1.0 (https://threads-studio.com; local-area suggestions)';

export interface LocalTermsResult {
  stations: string[];
  nicknames: string[];
  landmarks: string[]; // 自動候補は出さない（常に空。手入力用）
}

interface GeocodeResult {
  lat: number;
  lon: number;
  addressParts: string[]; // 町名・エリア名の候補（市区町村より細かい要素）
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Nominatim でエリア文字列を緯度経度に変換（日本国内に限定） */
async function geocode(area: string): Promise<GeocodeResult | null> {
  const url =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      q: area,
      format: 'jsonv2',
      limit: '1',
      countrycodes: 'jp',
      addressdetails: '1',
      'accept-language': 'ja',
    }).toString();
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } }, 8000);
  if (!res.ok) return null;
  const arr = (await res.json()) as any[];
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const hit = arr[0];
  const lat = parseFloat(hit.lat);
  const lon = parseFloat(hit.lon);
  if (!isFinite(lat) || !isFinite(lon)) return null;
  const a = hit.address || {};
  const addressParts = [a.neighbourhood, a.quarter, a.suburb, a.city_district, a.hamlet, a.town, a.village]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  return { lat, lon, addressParts };
}

/** HeartRails Express で座標から実在の最寄り駅を取得（路線名つき） */
async function fetchStations(lat: number, lon: number): Promise<string[]> {
  const url = `https://express.heartrails.com/api/json?method=getStations&x=${lon}&y=${lat}`;
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } }, 8000);
  if (!res.ok) return [];
  const data = (await res.json()) as any;
  const list: any[] = data?.response?.station ?? [];
  // 同名駅（複数路線）は1つにまとめ、路線名を併記。近い順を維持。
  const byName = new Map<string, { lines: Set<string>; dist: number }>();
  for (const s of list) {
    const name: string = (s?.name ?? '').toString().trim();
    if (!name) continue;
    const line: string = (s?.line ?? '').toString().trim();
    const dist = parseInt((s?.distance ?? '999999').toString(), 10) || 999999;
    const cur = byName.get(name);
    if (cur) {
      if (line) cur.lines.add(line);
      cur.dist = Math.min(cur.dist, dist);
    } else {
      byName.set(name, { lines: new Set(line ? [line] : []), dist });
    }
  }
  return Array.from(byName.entries())
    .sort((a, b) => a[1].dist - b[1].dist)
    .slice(0, 5)
    .map(([name, v]) => {
      const label = /駅$/.test(name) ? name : `${name}駅`;
      const walk = walkMinutesLabel(v.dist);
      const lines = Array.from(v.lines);
      const base = lines.length === 0
        ? label
        : `${label}（${lines.slice(0, 3).join('・')}${lines.length > 3 ? 'ほか' : ''}）`;
      return walk ? `${base} ${walk}` : base;
    });
}

function dedupe(arr: string[], n: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const k = s.trim();
    if (k && !seen.has(k)) { seen.add(k); out.push(k); }
    if (out.length >= n) break;
  }
  return out;
}

/**
 * エリア文字列から、実在の地元ワード候補を返す。
 * 取得できなければ空配列（UI 側は手入力にフォールバック）。
 */

/**
 * 直線距離（m）から「徒歩◯分」の概算ラベルを作る。
 *
 * ・不動産表示規約にならい 徒歩1分=80m で換算する（日本で通用する基準）。
 * ・APIが返すのは駅までの「直線距離」なので、実際の道のりはこれより長い。
 *   経験的な迂回係数 1.3 を掛けてから分に直す（過小表示を避けるため）。
 * ・25分を超えるものは徒歩圏として案内する意味が薄いので分数を出さない
 *   （その場合は駅名だけを候補にし、車で何分かは本人に入力してもらう）。
 * ・あくまで概算なので必ず「約」を付ける。正確な値は本人が確認して上書きする前提。
 */
function walkMinutesLabel(straightMeters: number): string | null {
  if (!Number.isFinite(straightMeters) || straightMeters <= 0 || straightMeters > 99000) return null;
  const routeMeters = straightMeters * 1.3;
  const walk = Math.ceil(routeMeters / 80);
  if (walk <= 25) return `から徒歩約${walk}分`;

  // 徒歩圏を超える駅は「車で約◯分」に切り替える（地方は車圏の店舗が多いため）。
  // 一般道の平均を時速25km（＝約417m/分）として概算する。
  const drive = Math.ceil(routeMeters / 417);
  if (drive > 30) return null; // これ以上遠い駅は商圏の手がかりにならない
  return `から車で約${drive}分`;
}

export async function fetchLocalTerms(area: string): Promise<LocalTermsResult> {
  const geo = await geocode(area);
  if (!geo) return { stations: [], nicknames: [], landmarks: [] };
  // 駅取得は失敗しても町名だけは返す
  let stations: string[] = [];
  try {
    stations = await fetchStations(geo.lat, geo.lon);
  } catch {
    stations = [];
  }
  return {
    stations,
    nicknames: dedupe(geo.addressParts, 6),
    landmarks: [], // 捏造防止のため自動候補なし（手入力）
  };
}

/**
 * 投稿文に使ってよい商圏ワードを返す。
 *
 * アプリが地図から自動推定しただけの商圏（＝本人未承認）は返さない。
 * 概算の徒歩分数がそのまま広告表示に出てしまうのを防ぐため、
 * 「アプリが提案 → 本人が確認 → 運用に反映」の順を必ず通す。
 */
export function approvedLocalTerms(project: any): string | undefined {
  if (!project?.localTerms) return undefined;
  if (!project?.localTermsConfirmedAt) return undefined; // 未承認は使わない
  return project.localTerms;
}
