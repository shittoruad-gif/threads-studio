/**
 * 投稿設定の「共通」と「アカウント別」の合成。
 *
 * 設定は users（共通）に持ち、threadsAccounts 側の同名の列が NULL でなければそれを優先する。
 * 複数アカウント運用で「片方は確認あり・片方はおまかせ」「片方だけ止める」ができるようにするため
 * （2026-09-03 三上様指示）。1アカウント運用ではアカウント側がすべて NULL なので従来どおり。
 */
export type PostFrequency = "daily" | "twice_daily" | "three_daily";
export type PostLengthSetting = "short" | "long" | "alternate";

export type CommonPostSettings = {
  autoPostEnabled?: boolean | null;
  autoPostRequireApproval?: boolean | null;
  autoPostFrequency?: string | null;
  postLength?: string | null;
};

export type AccountPostOverrides = {
  autoPostEnabled?: boolean | null;
  autoPostRequireApproval?: boolean | null;
  autoPostFrequency?: string | null;
  postLength?: string | null;
};

export type EffectivePostSettings = {
  autoPostEnabled: boolean;
  autoPostRequireApproval: boolean;
  autoPostFrequency: PostFrequency;
  postLength: PostLengthSetting;
  /** どの項目がアカウント別に上書きされているか（表示用） */
  overridden: { autoPostEnabled: boolean; autoPostRequireApproval: boolean; autoPostFrequency: boolean; postLength: boolean };
};

const FREQS: PostFrequency[] = ["daily", "twice_daily", "three_daily"];
const LENS: PostLengthSetting[] = ["short", "long", "alternate"];

export function effectiveAccountSettings(
  common: CommonPostSettings | null | undefined,
  account: AccountPostOverrides | null | undefined,
): EffectivePostSettings {
  const c = common || {};
  const a = account || {};
  const pick = <T,>(av: T | null | undefined, cv: T | null | undefined, fallback: T): { v: T; o: boolean } =>
    av !== null && av !== undefined ? { v: av, o: true } : { v: cv !== null && cv !== undefined ? cv : fallback, o: false };
  const en = pick<boolean>(a.autoPostEnabled, c.autoPostEnabled, true);
  const ap = pick<boolean>(a.autoPostRequireApproval, c.autoPostRequireApproval, false);
  const fq = pick<string>(a.autoPostFrequency, c.autoPostFrequency, "daily");
  const ln = pick<string>(a.postLength, c.postLength, "short");
  return {
    autoPostEnabled: Boolean(en.v),
    autoPostRequireApproval: Boolean(ap.v),
    autoPostFrequency: (FREQS.includes(fq.v as PostFrequency) ? fq.v : "daily") as PostFrequency,
    postLength: (LENS.includes(ln.v as PostLengthSetting) ? ln.v : "short") as PostLengthSetting,
    overridden: { autoPostEnabled: en.o, autoPostRequireApproval: ap.o, autoPostFrequency: fq.o, postLength: ln.o },
  };
}

export const FREQ_LABEL: Record<PostFrequency, string> = { daily: "1日1回", twice_daily: "1日2回", three_daily: "1日3回" };
export const LENGTH_LABEL: Record<PostLengthSetting, string> = { short: "短め", long: "長め", alternate: "交互" };
