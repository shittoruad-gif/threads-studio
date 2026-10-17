import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, httpLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { applyFontScale, getStoredFontScale } from "./hooks/useFontScale";
import "./index.css";
import { clearStaleChunkFlag, isStaleChunkError, reloadOnceForStaleChunk } from "./lib/staleChunk";

// デプロイ跨ぎで旧チャンクが読めなくなったら、1回だけ自動で再読み込みする
window.addEventListener("vite:preloadError", (event) => {
  if (reloadOnceForStaleChunk()) event.preventDefault();
});
window.addEventListener("unhandledrejection", (event) => {
  if (isStaleChunkError(event.reason) && reloadOnceForStaleChunk()) event.preventDefault();
});
// 正常に立ち上がったら、次回のために「再読み込み済み」フラグを消す
window.setTimeout(clearStaleChunkFlag, 10_000);

// 「文字を大きく」設定を描画前に復元（ちらつき防止）
applyFontScale(getStoredFontScale());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry auth errors
        if (error instanceof TRPCClientError && error.message === UNAUTHED_ERR_MSG) return false;
        return failureCount < 2;
      },
      staleTime: 30 * 1000, // 30 seconds
    },
    mutations: {
      retry: false,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const SLOW_PATHS = new Set(["threads.getComments"]);
const includeCredentials = (input: RequestInfo | URL, init?: RequestInit) =>
  globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });

const trpcClient = trpc.createClient({
  links: [
    // ★Threads API を順に何十回も呼ぶ遅い問い合わせは、ほかとまとめて送らない（2026-10-17 夜間整備）。
    //   画面の枠（DashboardLayout）がコメント数のバッジに threads.getComments を呼んでおり、
    //   auth.me と同じ束で送られていたため、連携済みの方はどの画面も約5秒、読み込み中の枠のままだった。
    splitLink({
      condition: (op) => SLOW_PATHS.has(op.path),
      true: httpLink({ url: "/api/trpc", transformer: superjson, fetch: includeCredentials }),
      false: httpBatchLink({ url: "/api/trpc", transformer: superjson, fetch: includeCredentials }),
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
