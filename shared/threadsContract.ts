/**
 * UnivaPay の契約が Threads Studio のものか（管理画面「契約」の一覧用）。
 *
 * ストアは他事業（コンサル・交通事故対応ルーム・Instagram広告運用代行など）と共用。
 * 以前は「アプリに登録されたメールと一致すれば Threads」としていたため、Threads を使っている
 * お客様が別事業で結んだ契約（660,000円・16,500円・11,000円）まで一覧に出ていた
 * （2026-09-25 三上様「絶対に違うもの。スレッズに関係ないものは入れないで」）。
 *
 * Threads と判断するのは次のどれか。メールの一致だけでは入れない。
 *   1. 決済リンクの名前に【Threads】がある
 *   2. アプリに保存してあるそのお客様の契約番号（subscriptions.univapaySubscriptionId）と一致する
 *   3. アプリのお客様で、金額が Threads のプランの月額のどれかと同じ
 *      （セミナー価格のリンクは名前に【Threads】が付いていない：「※プロプラン 8,800円→9,800円」など）
 */
import { PLANS } from "./plans";

const THREADS_PRICES = new Set(
  Object.values(PLANS).map((p: any) => Number(p.priceMonthly)).filter((n) => n > 0),
);

export function isThreadsContract(r: {
  id: string;
  amount: number | null | undefined;
  linkDescription?: string | null;
  isAppUser: boolean;
  appSubscriptionId?: string | null;
}): boolean {
  if (String(r.linkDescription ?? "").includes("【Threads】")) return true;
  if (r.appSubscriptionId && r.appSubscriptionId === r.id) return true;
  return r.isAppUser && THREADS_PRICES.has(Number(r.amount));
}
