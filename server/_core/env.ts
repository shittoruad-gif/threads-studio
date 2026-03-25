export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
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
};

export const env = ENV;
