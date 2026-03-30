import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Button } from '@/components/ui/button';
import { Download, X, Smartphone } from 'lucide-react';
import { useState, useEffect } from 'react';

export function PWAInstallBanner() {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Check if user previously dismissed the banner
    const wasDismissed = localStorage.getItem('pwa-banner-dismissed');
    if (wasDismissed) {
      const dismissedAt = parseInt(wasDismissed, 10);
      // Show again after 7 days
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) {
        setDismissed(true);
        return;
      }
    }

    // Delay showing the banner for better UX
    if (isInstallable && !isInstalled) {
      const timer = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [isInstallable, isInstalled]);

  const handleDismiss = () => {
    setDismissed(true);
    setShow(false);
    localStorage.setItem('pwa-banner-dismissed', Date.now().toString());
  };

  const handleInstall = async () => {
    const success = await install();
    if (success) {
      setShow(false);
    }
  };

  if (!show || dismissed || isInstalled) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-2xl shadow-xl border border-border/50 p-4 flex items-start gap-3">
        <div className="flex-shrink-0 w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
          <Smartphone className="w-6 h-6 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm">
            アプリをインストール
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            ホーム画面に追加して、より快適にご利用いただけます
          </p>
          <div className="flex items-center gap-2 mt-2.5">
            <Button
              size="sm"
              className="bg-emerald-500 hover:bg-emerald-600 text-white h-8 px-4 text-xs font-medium rounded-lg"
              onClick={handleInstall}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              インストール
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground/60 hover:text-foreground h-8 px-3 text-xs"
              onClick={handleDismiss}
            >
              後で
            </Button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors p-0.5"
          aria-label="閉じる"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
