/**
 * 「お店の情報を足してください」のお願い（2026-09-18 三上様指示）。
 *
 * 岩根様（㈱津の国や本店）で、契約3件のうち1件が3日にわたって届かなかった。
 * 原因は文章の質ではなく、書く材料が尽きていたこと。強みと選ばれる理由が
 * 同じことを言っていて、大切にしている考え・お客様の言葉・地元の言葉は空欄。
 * 何を書いても同じ言い回しに戻り、重複検査で枠が消えていた。
 *
 * 「追記してください」だけでは動いていただけないので、
 *   ① 本日いったい何が起きたか（書き直した回数・届かなかった件数）
 *   ② だから登録内容が少ないと、どうしても似た投稿が続く
 *   ③ ここを足してください（そのまま答えられる聞き方）
 * の順で出す。数えた事実だけを書き、推測は書かない。
 *
 * 出す場所: ダッシュボードと、お店の情報の編集画面の上。
 */
import { useState } from "react";
import { AlertTriangle, Lightbulb, X, PencilLine } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLang } from "@/i18n";

const DISMISS_KEY = "ts-material-depth-dismissed";
/** 閉じても翌日にはまたお伝えする（本数に直接ひびく話なので、長くは黙らない） */
const DISMISS_HOURS = 20;

function dismissedRecently(accountId: number): boolean {
  try {
    const v = localStorage.getItem(`${DISMISS_KEY}-${accountId}`);
    if (!v) return false;
    return Date.now() - Number(v) < DISMISS_HOURS * 3600000;
  } catch {
    return false;
  }
}

export function MaterialDepthNotice({ projectId }: { projectId?: string }) {
  const { t } = useLang();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [closed, setClosed] = useState<number[]>([]);
  const { data } = trpc.support.materialDepth.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (!isAuthenticated || !data || data.length === 0) return null;

  // お店の情報の編集画面では、その店の分だけ出す
  const items = (data as any[])
    .filter((d) => (projectId ? d.projectId === projectId : true))
    .filter((d) => !closed.includes(d.accountId) && !dismissedRecently(d.accountId));
  if (items.length === 0) return null;

  const dismiss = (accountId: number) => {
    try { localStorage.setItem(`${DISMISS_KEY}-${accountId}`, String(Date.now())); } catch { /* 保存できなくても閉じるだけ */ }
    setClosed((c) => [...c, accountId]);
  };

  return (
    <div className="space-y-3">
      {items.map((d) => {
        const warn = d.severity === "warn";
        return (
          <div
            key={d.accountId}
            className={`relative rounded-lg border p-4 pr-10 ${warn ? "border-amber-300 bg-amber-50" : "border-sky-200 bg-sky-50"}`}
          >
            <button
              type="button"
              onClick={() => dismiss(d.accountId)}
              aria-label={t("閉じる")}
              className={`absolute top-2 right-2 rounded p-1 ${warn ? "text-amber-700 hover:bg-amber-100" : "text-sky-700 hover:bg-sky-100"}`}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-start gap-2">
              {warn
                ? <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                : <Lightbulb className="mt-0.5 h-5 w-5 flex-shrink-0 text-sky-600" />}
              <div className="min-w-0 flex-1">
                {/* ★スマホ375pxではみ出さないこと。ユーザー名は英字の長い連続なので、
                    折り返しを許さないと横スクロールが出る（2026-09-18） */}
                <p className={`text-sm font-bold break-words ${warn ? "text-amber-900" : "text-sky-900"}`}>
                  {t(d.title)}
                  {d.threadsUsername && (
                    <span className="ml-2 text-xs font-normal opacity-70 break-all">@{d.threadsUsername}</span>
                  )}
                </p>

                {/* ① 本日、実際に起きたこと */}
                {d.evidence && (
                  <p className={`mt-1.5 text-[13px] leading-relaxed break-words ${warn ? "text-amber-900" : "text-sky-900"}`}>
                    {d.evidence}
                  </p>
                )}

                {/* ② なぜ似てくるのか */}
                <p className={`mt-1.5 text-[13px] leading-relaxed break-words ${warn ? "text-amber-800" : "text-sky-800"}`}>
                  {d.reason}
                </p>

                {/* 強みと選ばれる理由が同じことを言っている場合 */}
                {d.samePair && (
                  <p className={`mt-1.5 text-[13px] leading-relaxed break-words ${warn ? "text-amber-800" : "text-sky-800"}`}>
                    {d.samePair}
                  </p>
                )}

                {/* ③ 追記のお願い */}
                {d.asks?.length > 0 && (
                  <ul className={`mt-2.5 space-y-1 text-[13px] ${warn ? "text-amber-900" : "text-sky-900"}`}>
                    {d.asks.map((a: string, i: number) => (
                      <li key={i} className="flex gap-1.5">
                        <span aria-hidden className="select-none">・</span>
                        <span className="leading-relaxed break-words">{a}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  onClick={() => setLocation(d.projectId ? `/ai-counseling?project=${encodeURIComponent(d.projectId)}` : "/ai-generate")}
                  className={`mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold text-white ${warn ? "bg-amber-600 hover:bg-amber-700" : "bg-sky-600 hover:bg-sky-700"}`}
                >
                  <PencilLine className="h-3.5 w-3.5" />
                  {t("お店の情報を足す")}
                </button>
                <p className={`mt-2 text-[11px] leading-relaxed ${warn ? "text-amber-700" : "text-sky-700"}`}>
                  {t("公式LINEのトークに「追記」とお送りいただければ、こちらでお伺いして代わりに入れることもできます。")}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
