export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/** ログイン後の戻り先にしてはいけない画面（戻り先にすると堂々巡りになる） */
const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/liff"];

/**
 * ログイン画面のURL。未ログインのまま何かの画面を開いた方を、
 * ★ログイン後に「開こうとしていた画面」へ戻すための ?redirect= を付ける。
 *
 * （2026-09-17 お客様のご指摘）LINEの「Threadsアカウントを追加」のリンクを
 * 未ログインのブラウザで開くと、ログイン画面 → ダッシュボード へ飛ばされ、
 * 肝心の「アカウントを追加」にたどり着けないままになっていた。
 * Login.tsx は以前から ?redirect= を見ているので、渡す側を直すだけで直る。
 */
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  // If OAuth is not configured, return a fallback login path
  if (!oauthPortalUrl) {
    if (typeof window === "undefined") return "/login";
    const { pathname, search } = window.location;
    if (pathname === "/" || AUTH_PATHS.some((p) => pathname.startsWith(p))) return "/login";
    return `/login?redirect=${encodeURIComponent(pathname + search)}`;
  }

  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
