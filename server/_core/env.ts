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
