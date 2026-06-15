export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  appUrl: process.env.VITE_APP_URL ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // ★Google Gemini 直接接続。GEMINI_API_KEY が設定されていれば、
  //   Manus(Forge)ゲートウェイを経由せず Google の OpenAI 互換エンドポイントを使う。
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  // 既定は Google の OpenAI 互換エンドポイント（必要なら上書き可）
  geminiBaseUrl: process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  threadsAppId: process.env.THREADS_APP_ID ?? "",
  threadsAppSecret: process.env.THREADS_APP_SECRET ?? "",
  threadsRedirectBaseUrl: process.env.THREADS_REDIRECT_BASE_URL ?? "",
  univapayStoreId: process.env.UNIVAPAY_STORE_ID ?? "",
  univapayJwtToken: process.env.UNIVAPAY_JWT_TOKEN ?? "",
  univapayWebhookSecret: process.env.UNIVAPAY_WEBHOOK_SECRET ?? "",
  resendFromDomain: process.env.RESEND_FROM_DOMAIN ?? "resend.dev",
  sentryDsn: process.env.SENTRY_DSN ?? "",
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? "",
};

export const env = ENV;

/**
 * Validate required environment variables on startup
 */
export function validateEnv() {
  const required: Array<{ key: keyof typeof ENV; name: string }> = [
    { key: "databaseUrl", name: "DATABASE_URL" },
    { key: "cookieSecret", name: "JWT_SECRET" },
  ];

  const missing: string[] = [];
  for (const { key, name } of required) {
    if (!ENV[key]) {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    console.error(`[ENV] Missing required environment variables: ${missing.join(", ")}`);
    console.error("[ENV] Please check your .env file. See .env.example for reference.");
    process.exit(1);
  }

  // Warn about insecure defaults
  if (ENV.cookieSecret === "dev-secret-key-change-in-production" && ENV.isProduction) {
    console.error("[ENV] CRITICAL: JWT_SECRET is set to default value in production!");
    process.exit(1);
  }

  if (!ENV.tokenEncryptionKey && ENV.isProduction) {
    console.warn("[ENV] WARNING: TOKEN_ENCRYPTION_KEY is not set. Access tokens will not be encrypted.");
  }

  console.log("[ENV] Environment variables validated successfully");
}
