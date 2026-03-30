import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";
import { Link } from "wouter";

const COOKIE_CONSENT_KEY = "ts-cookie-consent";

export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      // Small delay to avoid flash on page load
      const timer = setTimeout(() => setShow(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-in slide-in-from-bottom-5 duration-300">
      <div className="max-w-3xl mx-auto bg-background border border-border rounded-xl shadow-lg p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-start gap-3 flex-1">
          <Cookie className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            当サイトでは、サービスの提供およびユーザー体験の向上のためにCookieを使用しています。
            サイトの利用を続けることで、
            <Link href="/privacy">
              <span className="text-primary hover:underline cursor-pointer">プライバシーポリシー</span>
            </Link>
            に同意したものとみなされます。
          </p>
        </div>
        <Button
          onClick={handleAccept}
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap flex-shrink-0"
        >
          同意する
        </Button>
      </div>
    </div>
  );
}
