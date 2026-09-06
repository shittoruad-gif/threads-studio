/**
 * Threadsプロフィールの点検と提案（2026-09-06 三上様指示）。
 * アカウントを作ったばかりで、名前・自己紹介・アイコン・リンクが整っていない方に、
 * 「何を入れればよいか」を登録内容（はじめの設定）からそのまま貼れる形で示す。
 * Threads APIにプロフィールを書き換える口は無いので、本人がThreadsアプリの
 * 「プロフィールを編集」に貼る前提。数字・実績は登録内容にあるものしか使わない。
 */
import { callAreaLabel } from './metaAiAsk';

export interface ProfileFacts {
  username: string;
  /** 表示名（Threads APIの name）。取れなければ空 */
  name?: string | null;
  biography?: string | null;
  hasPicture?: boolean;
  /** プロフィールのリンク欄（APIでは取れないので、登録済みのご案内先で代用） */
}
export interface ProfileProjectFacts {
  storeName?: string | null;
  businessType?: string | null;
  area?: string | null;
  localTerms?: string | null;
  target?: string | null;
  mainProblem?: string | null;
  strength?: string | null;
  /** ご案内先URL（登録済みなら） */
  linkUrl?: string | null;
  linkName?: string | null;
}

export type Mark = '○' | '△' | '✕';
export interface ProfileCheck { key: 'name' | 'username' | 'bio' | 'picture' | 'link'; label: string; mark: Mark; note: string }
export interface ProfileAdvice {
  checks: ProfileCheck[];
  /** そのまま貼れる表示名（30字以内） */
  nameSuggestion: string;
  /** そのまま貼れる自己紹介（150字以内） */
  bioSuggestion: string;
  /** ユーザー名の助言（例つき） */
  usernameAdvice: string;
  pictureAdvice: string;
  linkAdvice: string;
  /** 直すものが1つも無い */
  allGood: boolean;
}

const len = (s: string) => Array.from(s).length;
const cut = (s: string, n: number) => (len(s) <= n ? s : Array.from(s).slice(0, n).join(''));
const firstSentence = (s: string | null | undefined, n: number): string => {
  const t = String(s || '').replace(/\r/g, '').trim();
  if (!t) return '';
  const head = t.split(/[。\n！!？?]/)[0].trim().replace(/[、,]$/, '');
  return head && len(head) <= n ? head : '';
};
const service = (bt: string | null | undefined): string => {
  let s = String(bt || '').replace(/[（(][^）)]*[）)]/g, '').trim();
  s = s.split(/[・／/、,]/)[0].trim();
  return s && len(s) <= 14 ? s : '';
};

/** 表示名：「店名｜地域の業種」。店名だけのときは地域と業種を足すと検索で見つかる */
export function suggestDisplayName(p: ProfileProjectFacts): string {
  const store = String(p.storeName || '').replace(/\s*[\r\n]+\s*/g, '／').trim();
  const area = callAreaLabel(p.area, p.localTerms) || String(p.area || '').replace(/^.{2,3}[都道府県]/, '').trim();
  const svc = service(p.businessType);
  if (!store) return '';
  const tail = area && svc ? `${area}の${svc}` : svc || area;
  const full = tail ? `${store}｜${tail}` : store;
  return len(full) <= 30 ? full : cut(store, 30);
}

/** 自己紹介：150字以内。地域・業種・店名／強み／誰向け／誘導 の4行から、長ければ真ん中を落とす */
export function suggestBio(p: ProfileProjectFacts): string {
  const store = String(p.storeName || '').replace(/\s*[\r\n]+\s*/g, '／').trim();
  const area = callAreaLabel(p.area, p.localTerms) || String(p.area || '').trim();
  const svc = service(p.businessType);
  const l1 = [area && svc ? `${area}の${svc}` : svc || area, store ? `「${store}」` : ''].filter(Boolean).join('');
  const l2 = firstSentence(p.strength, 45);
  const tgt = firstSentence(p.target, 22);
  const prob = firstSentence(p.mainProblem, 20).split(/[、,・／/]/)[0];
  const l3 = tgt && prob ? `${prob}でお困りの${tgt}へ` : tgt ? `${tgt}へ` : '';
  const l4 = p.linkUrl ? `ご予約・ご相談は下のリンクから` : `ご予約・ご相談はDMから`;
  let lines = [l1, l2, l3, l4].filter(Boolean);
  const join = () => lines.join('\n');
  while (len(join()) > 150 && lines.length > 2) lines.splice(lines.length - 2, 1); // 真ん中（l3→l2）から落とす
  return cut(join(), 150);
}

export function suggestUsernameAdvice(username: string, p: ProfileProjectFacts): string {
  const u = String(username || '');
  const digits = /\d{3,}/.test(u);
  const base = u.replace(/[._]?\d{3,}.*$/, '').replace(/[._]+$/, '');
  const svc = service(p.businessType);
  const ex = base && base.length >= 3 ? `${base}${svc ? '_' + romanHint(svc) : ''}` : 'tenmei_seitai';
  if (!digits) return '';
  return `いまのユーザー名「@${u}」は数字の並びがあり、口頭で伝えにくく覚えてもらいにくいです。` +
    `Threadsアプリ→「プロフィールを編集」→「ユーザー名」で変えられます（Instagramと共通。英数字と . _ のみ）。` +
    `店名＋業種の形がおすすめです（例：@${ex}）。変えたあとは、名刺やLINEのリンクも新しい名前に直してください。`;
}
function romanHint(svc: string): string {
  const m: Record<string, string> = { 整体院: 'seitai', 整骨院: 'sekkotsu', 接骨院: 'sekkotsu', 鍼灸院: 'shinkyu', 鍼灸整骨院: 'shinkyu', エステ: 'esthe', エステサロン: 'esthe', 美容室: 'hair', 美容院: 'hair', ネイルサロン: 'nail', 整体: 'seitai', ピラティス: 'pilates', ピラティススタジオ: 'pilates', マシンピラティススタジオ: 'pilates', ジム: 'gym', パーソナルジム: 'gym', カフェ: 'cafe', 呉服店: 'kimono', 呉服小売店: 'kimono', 税理士事務所: 'tax', 歯科: 'dental', 歯科医院: 'dental' };
  return m[svc] || 'official';
}

export function buildProfileAdvice(f: ProfileFacts, p: ProfileProjectFacts): ProfileAdvice {
  const checks: ProfileCheck[] = [];
  const nameSuggestion = suggestDisplayName(p);
  const bioSuggestion = suggestBio(p);
  const usernameAdvice = suggestUsernameAdvice(f.username, p);
  const store = String(p.storeName || '').trim();
  const svc = service(p.businessType);
  const areaWord = callAreaLabel(p.area, p.localTerms) || String(p.area || '').replace(/^.{2,3}[都道府県]/, '').slice(0, 3);

  // 名前
  const name = String(f.name || '').trim();
  if (!name) checks.push({ key: 'name', label: '名前（表示名）', mark: '△', note: '取得できませんでした。店名と地域・業種が入っているかご確認ください' });
  else if (store && !name.includes(store.slice(0, 3))) checks.push({ key: 'name', label: '名前（表示名）', mark: '✕', note: `「${name}」に店名が入っていません。検索で見つけてもらえるよう店名＋地域・業種に` });
  else if ((areaWord && !name.includes(areaWord.slice(0, 2))) && (svc && !name.includes(svc.slice(0, 2)))) checks.push({ key: 'name', label: '名前（表示名）', mark: '△', note: `「${name}」に地域や業種が無いので、何のお店か一目で分かる形に` });
  else checks.push({ key: 'name', label: '名前（表示名）', mark: '○', note: `「${name}」` });
  // ユーザー名
  checks.push(usernameAdvice
    ? { key: 'username', label: 'ユーザー名', mark: '△', note: `@${f.username}：数字の並びは覚えにくい` }
    : { key: 'username', label: 'ユーザー名', mark: '○', note: `@${f.username}` });
  // 自己紹介
  const bio = String(f.biography || '').trim();
  if (!bio) checks.push({ key: 'bio', label: '自己紹介', mark: '✕', note: '空です。地域・業種・誰向け・誘導の4点を' });
  else if (len(bio) < 40) checks.push({ key: 'bio', label: '自己紹介', mark: '△', note: `${len(bio)}字と短めです。地域・誰向け・誘導を足すと問い合わせにつながります` });
  else if (areaWord && !bio.includes(areaWord.slice(0, 2)) && !bio.includes(String(p.area || '').slice(0, 3))) checks.push({ key: 'bio', label: '自己紹介', mark: '△', note: '地域名が入っていません。地元の方に見つけてもらうため地域を1つ' });
  else checks.push({ key: 'bio', label: '自己紹介', mark: '○', note: `${len(bio)}字` });
  // アイコン
  checks.push(f.hasPicture
    ? { key: 'picture', label: 'アイコン', mark: '○', note: '設定済み（お店の外観・ロゴ・施術者の顔のどれかが安心）' }
    : { key: 'picture', label: 'アイコン', mark: '✕', note: '未設定です。初期のままだと不安に見えます' });
  // リンク
  checks.push(p.linkUrl
    ? { key: 'link', label: 'リンク', mark: '○', note: `${p.linkName || 'ご案内先'}：${p.linkUrl}（プロフィールのリンク欄にも同じURLを）` }
    : { key: 'link', label: 'リンク', mark: '△', note: 'ご案内先URLが未登録です。公式LINEの「お店・アカウント」→「ご案内先URLを登録」から' });

  const pictureAdvice = 'アイコンは「お店の外観」「ロゴ」「施術者の顔写真」のどれか1枚。文字を入れた画像は小さくて読めないので避けてください。明るい・正面・背景がすっきりしたものが選ばれやすいです。';
  const linkAdvice = p.linkUrl
    ? `プロフィールの「リンク」欄に、ご案内先（${p.linkName || ''}）のURLを入れてください：${p.linkUrl}`
    : '公式LINE・予約ページ・ホームページのうち、いちばん来てほしい場所のURLを1つ、プロフィールの「リンク」欄に入れてください。';
  const allGood = checks.every((c) => c.mark === '○');
  return { checks, nameSuggestion, bioSuggestion, usernameAdvice, pictureAdvice, linkAdvice, allGood };
}

/** LINE・アプリ共通の説明文（点検結果） */
export function renderProfileAdviceText(a: ProfileAdvice, username: string): string {
  const lines = [`@${username} のプロフィール点検`, ''];
  for (const c of a.checks) lines.push(`${c.mark} ${c.label}：${c.note}`);
  lines.push('');
  lines.push(a.allGood
    ? '大きく直すところはありません。下の提案文は、より見つけてもらいやすい形の例です。'
    : '✕と△を直すと、投稿を見た人がプロフィールに来たとき「どこの何屋か」が一目で分かり、問い合わせにつながりやすくなります。');
  return lines.join('\n');
}
