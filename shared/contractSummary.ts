/**
 * ご契約内容（プラン・金額・次回の請求日）の文面。
 *
 * LINEで「来月の請求額は？」「次回の請求日は？」と聞かれたときに、
 * その方ご自身の契約をお返しするために使う。
 * 以前は料金ページのURLを送るだけで、ご自分の金額が分からなかった。
 */
export interface ContractInfo {
  planName?: string;
  /** 月額（税込・円）。フリーは0 */
  priceMonthly?: number;
  /** 'trialing' | 'active' | 'canceled' など */
  status?: string | null;
  /** 無料お試しの終了日 */
  trialEndsAt?: Date | string | null;
  /** 今の期間の終わり（＝次回の請求日） */
  currentPeriodEnd?: Date | string | null;
  /** 期間の終わりで解約予定か */
  cancelAtPeriodEnd?: boolean | null;
  /** キャンペーン（3回課金で終了）か */
  isCampaign?: boolean;
  /**
   * 次回の決済日（JST・YYYY-MM-DD）。UnivaPay の next_payment が正（server/nextPayment.ts）。
   * ★currentPeriodEnd は UnivaPay の次回決済日より1日遅く入っているため、これがあれば必ずこちらを使う（2026-09-25）
   */
  nextPaymentDate?: string | null;
  /** 次回の金額（円・税込） */
  nextPaymentAmount?: number | null;
}

/** 「2026年10月2日（金）」（YYYY-MM-DD から。タイムゾーンに左右されない） */
export function formatDueDate(ymd: string | null | undefined): string | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  const w = "日月火水木金土"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}年${m}月${d}日（${w}）`;
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatJpDate(v: Date | string | null | undefined): string | null {
  const d = toDate(v);
  if (!d) return null;
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tokyo" });
}

export function contractSummary(c: ContractInfo | null | undefined): string {
  if (!c || !c.planName) {
    return "ご契約：フリープラン（無料）\nお支払いはございません。";
  }
  const price = typeof c.priceMonthly === "number" ? c.priceMonthly : null;
  if (price === 0) {
    return "ご契約：フリープラン（無料）\nお支払いはございません。";
  }

  const lines: string[] = [`ご契約：${c.planName}`];
  if (price !== null) lines.push(`月額：${price.toLocaleString("ja-JP")}円（税込）`);

  const trialEnd = formatJpDate(c.trialEndsAt);
  const periodEnd = formatJpDate(c.currentPeriodEnd);

  if (c.status === "trialing" && trialEnd) {
    // お試し中は「いつから有料になるか」がいちばん知りたいこと
    lines.push(`無料でお試しいただける期間：${trialEnd}まで`);
    lines.push(`初回のお支払い：${trialEnd}の翌日から`);
  } else if (c.cancelAtPeriodEnd && periodEnd) {
    lines.push(`解約のお手続き済みです。${periodEnd}までお使いいただけます。`);
    lines.push("以降のお支払いはございません。");
  } else if (formatDueDate(c.nextPaymentDate)) {
    const amount = typeof c.nextPaymentAmount === "number" ? `（${c.nextPaymentAmount.toLocaleString("ja-JP")}円・税込）` : "";
    lines.push(`次回のご請求日：${formatDueDate(c.nextPaymentDate)}${amount}`);
  } else if (periodEnd) {
    lines.push(`次回のご請求日：${periodEnd}`);
  } else {
    // 日付が取れないことがある（お支払いの記録がまだ届いていないときなど）。
    // 適当な日付を作らず、分からないと正直に書く。
    lines.push("次回のご請求日：確認中です。少しお時間をいただく場合は担当者からご連絡します。");
  }

  if (c.isCampaign) {
    lines.push("※ キャンペーン価格でのご契約です（3回のお支払いで終了し、無料に戻ります）。");
  }
  return lines.join("\n");
}
