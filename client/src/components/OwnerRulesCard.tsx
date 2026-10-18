/**
 * 「書き方の決まり」（2026-10-18）。お客様が自分で「うちはこう書く」を入れる欄。
 *  アカウントごと・1行1つ・最大10件。手直しの学習がたまるのを待たずに、次の生成から守らせる。
 *  公式LINEで「決まり：〜」と送っても同じ欄に足される。
 */
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PenLine } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLang } from "@/i18n";
import { OWNER_RULES, parseOwnerRules } from "@shared/ownerRules";

const EXAMPLES = [
  "最後は必ず「ご相談はLINEから」で締める",
  "「患者さん」ではなく「お客さま」と書く",
  "1行目は質問で始めない",
  "店名は「〇〇整体院」ではなく「〇〇」とだけ書く",
];

function RulesEditor({ accountId, username, initial }: { accountId: number; username: string; initial: string }) {
  const { t } = useLang();
  const utils = trpc.useUtils();
  const [text, setText] = useState(initial);
  useEffect(() => setText(initial), [initial]);
  const update = trpc.threads.updateAccountSettings.useMutation({
    onSuccess: () => { utils.threads.list.invalidate(); toast.success(t("書き方の決まりを保存しました。次の生成から守ります")); },
    onError: (e) => toast.error(e.message || t("保存に失敗しました")),
  });
  const rules = parseOwnerRules(text);
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const tooLong = lines.filter((l) => Array.from(l).length > OWNER_RULES.maxLen).length;
  const over = Math.max(0, lines.length - OWNER_RULES.maxRules);
  const dirty = text !== initial;
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-sm font-bold text-foreground break-all">@{username}</span>
        <span className="text-[10px] rounded-full bg-muted text-muted-foreground px-2 py-0.5 shrink-0 whitespace-nowrap">
          {rules.length > 0 ? t("{n}件の決まり").replace("{n}", String(rules.length)) : t("まだありません")}
        </span>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(10, Math.max(4, lines.length + 1))}
        placeholder={t("例：") + t(EXAMPLES[0])}
        className="text-sm"
      />
      {rules.length === 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("例：")}{EXAMPLES.slice(1).map((e) => t(e)).join(" ／ ")}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-[11px] text-muted-foreground mr-auto">
          {t("1行に1つ。{max}件まで・1つ{len}字まで。").replace("{max}", String(OWNER_RULES.maxRules)).replace("{len}", String(OWNER_RULES.maxLen))}
          {tooLong > 0 ? ` ${t("{n}行が長すぎるため保存されません。").replace("{n}", String(tooLong))}` : ""}
          {over > 0 ? ` ${t("{n}行が上限を超えるため保存されません。").replace("{n}", String(over))}` : ""}
        </p>
        <Button size="sm" onClick={() => update.mutate({ accountId, ownerRules: text })} disabled={!dirty || update.isPending}>
          {update.isPending ? t("保存中...") : t("保存する")}
        </Button>
      </div>
    </div>
  );
}

export function OwnerRulesCard() {
  const { t } = useLang();
  const { data: accounts } = trpc.threads.list.useQuery();
  const active = (accounts || []).filter((a: any) => a.isActive !== false);
  if (active.length === 0) return null;
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-1">
        <PenLine className="w-5 h-5 text-emerald-600" />
        <h2 className="text-lg font-semibold text-foreground">{t("書き方の決まり")}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {t("「うちはこう書く」を入れておくと、次に作る投稿から毎回守ります。投稿を直したときに自動で見つける決まりと同じ強さで、ほかの指示より優先します。公式LINEで「決まり：〇〇」と送っても、ここに足されます。")}
      </p>
      <div className="space-y-4">
        {active.map((a: any) => (
          <RulesEditor key={a.id} accountId={a.id} username={String(a.threadsUsername || "")} initial={String(a.ownerRules || "")} />
        ))}
      </div>
    </Card>
  );
}
