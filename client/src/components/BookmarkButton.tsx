import { useState } from "react";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Star, Share, Plus, MoreVertical, Smartphone } from "lucide-react";
import { useLang } from "@/i18n";

// 端末の判定（案内文の出し分け用）。UA判定は完璧ではないが手順案内には十分。
function detectPlatform(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/**
 * ログイン画面をすぐ開けるように保存するボタン。
 * - PWAインストールが使える端末（主にAndroid Chrome）ではワンタップで「ホーム画面に追加」。
 * - それ以外（iPhone / パソコン）は、ブラウザではJSからブックマークを追加できないため、
 *   端末に合わせた手順を分かりやすく案内する。
 */
export function BookmarkButton() {
  const { t } = useLang();
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [open, setOpen] = useState(false);
  const platform = detectPlatform();

  // すでにアプリとしてインストール済みなら、そもそも保存不要なので何も出さない
  if (isInstalled) return null;

  const handleClick = async () => {
    // ネイティブの「ホーム画面に追加」が使えるなら即実行
    if (isInstallable) {
      const ok = await install();
      if (ok) return; // 成功したらダイアログは不要
    }
    // 使えない／断られた場合は手順を案内
    setOpen(true);
  };

  const isMac =
    typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || navigator.userAgent);
  const shortcut = isMac ? "⌘（command）＋ D" : "Ctrl ＋ D";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleClick}
      >
        <Star className="w-4 h-4 mr-2 text-amber-500" />
        {t("この画面をすぐ開けるように保存")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-600" />
              {t("ログイン画面を保存する方法")}
            </DialogTitle>
            <DialogDescription>
              {t("次からワンタップで開けるようになります。お使いの端末に合わせて操作してください。")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {platform === "ios" && (
              <ol className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs">1</span>
                  <span>{t("画面下の")} <Share className="inline w-4 h-4 mx-0.5 align-text-bottom" />{t("（共有ボタン）を押します")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs">2</span>
                  <span>{t("メニューを下にスクロールして")} <Plus className="inline w-4 h-4 mx-0.5 align-text-bottom" />「<b>{t("ホーム画面に追加")}</b>{t("」を選びます")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs">3</span>
                  <span>{t("右上の「")}<b>{t("追加")}</b>{t("」を押せば完了です")}</span>
                </li>
              </ol>
            )}

            {platform === "android" && (
              <ol className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs">1</span>
                  <span>{t("画面右上の")} <MoreVertical className="inline w-4 h-4 mx-0.5 align-text-bottom" />{t("（メニュー）を押します")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs">2</span>
                  <span>「<b>{t("ホーム画面に追加")}</b>{t("」または「")}<b>{t("アプリをインストール")}</b>{t("」を選びます")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs">3</span>
                  <span>「<b>{t("追加")}</b>{t("」を押せば完了です")}</span>
                </li>
              </ol>
            )}

            {platform === "desktop" && (
              <div className="space-y-2">
                <p>
                  {t("キーボードで")} <b className="px-1.5 py-0.5 rounded bg-muted">{shortcut}</b> を押すと、
                  この画面をお気に入り（ブックマーク）に保存できます。
                </p>
                <p className="text-muted-foreground text-xs">
                  {t("次回からはブラウザのお気に入り一覧からすぐ開けます。")}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
