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
/**
 * ★シェルに本番の DATABASE_URL が入ったまま（`eval "$(bash scripts/ops/prod-env.sh DATABASE_URL)"` の後など）
 *   テストを走らせると、本番にテストユーザーと有料の契約が作られる（2026-09-24 01:06 に11件発生）。
 *   本番へのトンネルは 127.0.0.1:13308 なので「localhost なら安全」では防げない。ポートまで見る。
 */
function isLocalTestDb(url: string): boolean {
  try {
    const u = new URL(url);
    const localHost = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    return localHost && (u.port === "" || u.port === "3306");
  } catch {
    return false;
  }
}
if (process.env.DATABASE_URL && !isLocalTestDb(process.env.DATABASE_URL)) {
  throw new Error(
    "[vitest] DATABASE_URL がローカル（localhost:3306）ではありません。本番DBでテストを走らせないため中止します。" +
      " `unset DATABASE_URL` してから実行してください。",
  );
}

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
    if (isLocalTestDb(dbUrl)) out.DATABASE_URL = dbUrl;
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
