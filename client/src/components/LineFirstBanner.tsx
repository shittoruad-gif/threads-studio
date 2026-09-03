/**
 * 「公式LINEでの運用をおすすめします」の帯。
 *
 * ログイン後の全画面の上部（DashboardLayout）に出す。
 * Threads Studio は、設定から毎日の投稿の確認までLINEのトークの中で終わる作りで、
 * アプリの画面を開いてもらう必要が本来ない。ところが登録後にアプリだけを触って
 * 止まってしまう方が多いため、どの画面にいても LINE への導線が見えるようにする
 * （2026-09-03 三上様指示）。
 *
 * 表示条件: 公式LINEとまだ連携していない方だけ。連携済みの方には出さない（邪魔になるだけ）。
 * 閉じたら7日間は出さない（毎回出すと読まれなくなる）。
 */
import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLang } from "@/i18n";

const DISMISS_KEY = "ts-line-first-dismissed-at";
const DISMISS_DAYS = 7;

function dismissedRecently(): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    return Date.now() - Number(v) < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
}

export function LineFirstBanner() {
  const { t } = useLang();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [hidden, setHidden] = useState<boolean>(() => dismissedRecently());
  const status = trpc.lineNotify.getStatus.useQuery(undefined, { enabled: isAuthenticated, retry: false });

  if (!isAuthenticated || hidden) return null;
  if (!status.data || status.data.linked) return null;
  const addUrl: string | null = (status.data as any).addFriendUrl ?? null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* 保存できなくても閉じるだけ */ }
    setHidden(true);
  };

  return (
    <div className="relative bg-emerald-50 border-b border-emerald-200 px-4 py-2.5 pr-10">
      {/* 閉じるは右上に固定（スマホでボタン列の下に落ちないように） */}
      <button type="button" onClick={dismiss} aria-label={t("閉じる")} className="absolute top-2 right-2 p-1 rounded hover:bg-emerald-100 text-emerald-700">
        <X className="h-4 w-4" />
      </button>
      <div className="container mx-auto max-w-7xl flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <MessageCircle className="h-4 w-4 text-emerald-700 flex-shrink-0 mt-0.5" />
          <p className="text-xs sm:text-[13px] text-emerald-900 leading-relaxed">
            <span className="font-semibold">{t("公式LINEでの運用をおすすめします。")}</span>
            {t("はじめの設定から毎日の投稿の確認まで、LINEのトークの中だけで終わります。アプリの画面を開く必要はありません。")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          {addUrl && (
            <a
              href={addUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center whitespace-nowrap rounded-md bg-[#06c755] px-2.5 py-1.5 text-xs font-bold text-white hover:opacity-90"
            >
              {t("LINEを友だち追加")}
            </a>
          )}
          <button
            type="button"
            onClick={() => setLocation("/settings")}
            className="inline-flex items-center whitespace-nowrap rounded-md border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
          >
            {t("連携のしかた")}
          </button>
        </div>
      </div>
    </div>
  );
}
