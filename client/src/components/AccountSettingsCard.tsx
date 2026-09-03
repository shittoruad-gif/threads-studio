/**
 * アカウントごとの投稿設定（複数アカウント運用のときだけ表示）。
 *
 * 共通設定（上のカード）はすべてのアカウントに効く。ここではアカウント単位で
 * 「共通に従う／このアカウントだけ別の値」を選べる。
 * 例：整体院のアカウントは公開前に確認したいが、ピラティスのアカウントはおまかせにしたい。
 */
import { Card } from "@/components/ui/card";
import { Users } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLang } from "@/i18n";
import { effectiveAccountSettings } from "@shared/accountSettings";

type Choice<T> = { value: T | null; label: string };

function ChoiceRow<T extends string | boolean>({
  label, hint, current, effective, choices, onPick, disabled,
}: {
  label: string;
  hint?: string;
  /** アカウント側の生の値（null＝共通に従う） */
  current: T | null | undefined;
  /** いま実際に効いている値（表示用） */
  effective: string;
  choices: Choice<T>[];
  onPick: (v: T | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">
          {hint ? `${hint}　` : ""}いまの値：<span className="font-semibold text-foreground">{effective}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1 shrink-0">
        {choices.map((c) => {
          const active = (current ?? null) === c.value;
          return (
            <button
              key={String(c.value)}
              type="button"
              disabled={disabled}
              onClick={() => onPick(c.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                active ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AccountSettingsCard({ maxPerDay }: { maxPerDay: number }) {
  const { t } = useLang();
  const utils = trpc.useUtils();
  const { data: accounts } = trpc.threads.list.useQuery();
  const { data: common } = trpc.autoPost.getSettings.useQuery();
  const update = trpc.threads.updateAccountSettings.useMutation({
    onSuccess: () => { utils.threads.list.invalidate(); utils.support.setupSteps.invalidate(); toast.success(t("アカウントの設定を更新しました")); },
    onError: (e) => toast.error(e.message || t("更新に失敗しました")),
  });

  const active = (accounts || []).filter((a: any) => a.isActive !== false);
  if (active.length < 2) return null;

  const COMMON = t("共通に従う");
  const freqChoices: Choice<"daily" | "twice_daily" | "three_daily">[] = [
    { value: null, label: COMMON },
    { value: "daily", label: t("1日1回") },
    ...(maxPerDay >= 2 ? [{ value: "twice_daily" as const, label: t("1日2回") }] : []),
    ...(maxPerDay >= 3 ? [{ value: "three_daily" as const, label: t("1日3回") }] : []),
  ];

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-5 h-5 text-emerald-600" />
        <h2 className="text-lg font-semibold text-foreground">{t("アカウントごとの設定")}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {t("上の「投稿設定」はすべてのアカウントに効く共通設定です。ここでは、アカウントごとに別の値にできます（「共通に従う」を選ぶと共通設定どおりになります）。")}
      </p>
      <div className="space-y-5">
        {active.map((a: any) => {
          const eff = effectiveAccountSettings(common as any, a);
          const busy = update.isPending;
          const set = (patch: Record<string, unknown>) => update.mutate({ accountId: a.id, ...patch } as any);
          return (
            <div key={a.id} className="rounded-lg border border-border p-3">
              {/* ★長いアカウント名でも右のラベルが縦に折れないよう、折り返し可＋ラベルは1行固定 */}
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-sm font-bold text-foreground break-all">@{a.threadsUsername}</span>
                {Object.values(eff.overridden).some(Boolean) ? (
                  <span className="text-[10px] rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 shrink-0 whitespace-nowrap">{t("個別設定あり")}</span>
                ) : (
                  <span className="text-[10px] rounded-full bg-muted text-muted-foreground px-2 py-0.5 shrink-0 whitespace-nowrap">{t("共通設定")}</span>
                )}
              </div>
              <div className="divide-y divide-border/60">
                <ChoiceRow<boolean>
                  label={t("自動投稿")}
                  current={a.autoPostEnabled}
                  effective={eff.autoPostEnabled ? "ON" : "OFF"}
                  choices={[{ value: null, label: COMMON }, { value: true, label: "ON" }, { value: false, label: "OFF" }]}
                  onPick={(v) => set({ autoPostEnabled: v })}
                  disabled={busy || maxPerDay <= 0}
                />
                <ChoiceRow<boolean>
                  label={t("公開前に承認する")}
                  current={a.autoPostRequireApproval}
                  effective={eff.autoPostRequireApproval ? t("する") : t("しない")}
                  choices={[{ value: null, label: COMMON }, { value: true, label: t("する") }, { value: false, label: t("しない") }]}
                  onPick={(v) => set({ autoPostRequireApproval: v })}
                  disabled={busy}
                />
                <ChoiceRow<"daily" | "twice_daily" | "three_daily">
                  label={t("投稿頻度（1日あたり）")}
                  current={a.autoPostFrequency}
                  effective={eff.autoPostFrequency === "three_daily" ? t("1日3回") : eff.autoPostFrequency === "twice_daily" ? t("1日2回") : t("1日1回")}
                  choices={freqChoices}
                  onPick={(v) => set({ autoPostFrequency: v })}
                  disabled={busy}
                />
                <ChoiceRow<"short" | "long" | "alternate">
                  label={t("投稿の長さ")}
                  current={a.postLength}
                  effective={eff.postLength === "long" ? t("長め") : eff.postLength === "alternate" ? t("交互") : t("短め")}
                  choices={[{ value: null, label: COMMON }, { value: "short", label: t("短め") }, { value: "long", label: t("長め") }, { value: "alternate", label: t("交互") }]}
                  onPick={(v) => set({ postLength: v })}
                  disabled={busy}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
