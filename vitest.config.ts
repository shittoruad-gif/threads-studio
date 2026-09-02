import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";

const templateRoot = path.resolve(import.meta.dirname);

/**
 * テスト用の環境変数。
 *
 * ★.env を丸ごと読み込むと、UnivaPay の本番トークンで実際の解約API が呼ばれる
 *   （univapay.test.ts は本物の API を叩く）。DB とローカル検証に必要なものだけ渡す。
 * ★DATABASE_URL はローカル（localhost / 127.0.0.1）のときだけ渡す。
 *   本番 DB を指した .env でテストを走らせて、本番にテストユーザーを作らないため。
 */
function testEnvFromDotenv(): Record<string, string> {
  const out: Record<string, string> = {
    QA_SAFE_MODE: "1",
    LINE_NOTIFY_CHANNEL_SECRET: process.env.LINE_NOTIFY_CHANNEL_SECRET || "dummy-local",
    LINE_NOTIFY_CHANNEL_ACCESS_TOKEN: process.env.LINE_NOTIFY_CHANNEL_ACCESS_TOKEN || "dummy-local",
  };
  const envPath = path.resolve(templateRoot, ".env");
  if (!fs.existsSync(envPath)) return out;
  const vars: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const ALLOW = ["JWT_SECRET", "VITE_APP_ID", "THREADS_APP_ID", "THREADS_APP_SECRET", "THREADS_REDIRECT_BASE_URL"];
  for (const k of ALLOW) if (vars[k] && !process.env[k]) out[k] = vars[k];
  const dbUrl = vars.DATABASE_URL;
  if (dbUrl && !process.env.DATABASE_URL) {
    try {
      const host = new URL(dbUrl).hostname;
      if (host === "localhost" || host === "127.0.0.1") out.DATABASE_URL = dbUrl;
    } catch { /* 形が変なら渡さない */ }
  }
  return out;
}

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    env: testEnvFromDotenv(),
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
  },
});
