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
  /**
   * 契約の「いまの」扱い（2026-10-04 点検）。
   *  ended＝ご契約終了／grace＝今いるフリーの方の猶予（10/31まで）／dunning＝お支払いの確認中
   */
  state?: 'ended' | 'grace' | 'dunning' | null;
  /** 実際のご契約プラン名（ended・dunning のとき。実効プランは「お申し込み前」になるため） */
  contractPlanName?: string | null;
  /** プランID（free・agency_client の見分けに使う） */
  planId?: string | null;
  /** UnivaPay などの決済の契約があるか（無い trialing はクーポン＝お支払いなし） */
  hasPaymentContract?: boolean;
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
  if (c?.state === 'ended') {
    return `ご契約：終了しています${c.contractPlanName ? `（${c.contractPlanName}）` : ''}\nお支払いはございません。\n` +
      "再開をご希望の場合は、料金プランからもう一度お申し込みいただけます。登録したお店の情報と連携はそのまま残っています。";
  }
  if (c?.state === 'grace') {
    return "ご契約：フリープラン（10月31日まで）\nお支払いはございません。\n" +
      "11月1日からは、投稿づくりと毎日の自動投稿はお申し込み（最初の7日間は無料）からのご利用になります。";
  }
  if (c?.state === 'dunning') {
    return `ご契約：${c.contractPlanName ?? '有料プラン'}\nお支払いの確認ができていません。カード情報を更新いただくと、すぐに再開します（予約ずみの投稿はそのまま公開されます）。`;
  }
  if (!c || !c.planName || c.planId === "free") {
    return "ご契約：お申し込み前（7日間無料で始められます）\nお支払いはございません。";
  }
  // ★代理店から発行されたアカウント・クーポン（決済の契約なし）は、お支払いが無い（2026-10-04 点検：
  //   代理店のクライアントに「お申し込み前」、期限なしクーポンの方に「月額9,800円・次回の請求日は確認中」と出ていた）
  if (c.planId === "agency_client") {
    return `ご契約：${c.planName}\n料金は代理店のご契約に含まれています（お支払いはございません）。`;
  }
  if (c.status === "trialing" && c.hasPaymentContract === false) {
    const end = formatJpDate(c.trialEndsAt);
    return end
      ? `ご契約：${c.planName}（無料の体験・${end}まで）\nお支払いはございません。期間が終わると止まります（課金はありません）。`
      : `ご契約：${c.planName}（期限なし・無料）\nお支払いはございません。`;
  }
  const price = typeof c.priceMonthly === "number" ? c.priceMonthly : null;
  if (price === 0) {
    return "ご契約：お申し込み前（7日間無料で始められます）\nお支払いはございません。";
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
    // ★規約 第6条7項のとおり、4回目のお支払いから通常価格に切り替わる（「無料に戻ります」は誤りだった・2026-10-04 点検）
    lines.push("※ キャンペーン価格でのご契約です（3回分のお支払いまでキャンペーン価格で、4回目から通常価格に切り替わります。切り替えの前にメールでお知らせします）。");
  }
  return lines.join("\n");
}
