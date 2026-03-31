import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw, Trash2 } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error.message, error.stack);
    // Send error to server for debugging
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      }),
    }).catch(() => {});
  }

  async clearCacheAndReload() {
    // Unregister service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
    }
    // Clear caches
    if ('caches' in window) {
      const names = await caches.keys();
      for (const name of names) {
        await caches.delete(name);
      }
    }
    // Clear localStorage
    localStorage.clear();
    // Hard reload
    window.location.reload();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-md p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl font-bold mb-2">予期しないエラーが発生しました</h2>
            <p className="text-sm text-muted-foreground mb-6 text-center">
              申し訳ございません。問題が解決しない場合は、キャッシュクリアをお試しください。
            </p>

            {/* Error details - open by default */}
            <details className="w-full mb-6" open>
              <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground font-medium">
                エラー詳細
              </summary>
              <div className="p-4 w-full rounded bg-muted overflow-auto mt-2 max-h-48">
                <pre className="text-xs text-destructive whitespace-break-spaces font-mono">
                  {this.state.error?.message}
                </pre>
                {this.state.error?.stack && (
                  <pre className="text-xs text-muted-foreground whitespace-break-spaces font-mono mt-2 border-t border-border pt-2">
                    {this.state.error.stack.split('\n').slice(1, 6).join('\n')}
                  </pre>
                )}
              </div>
            </details>

            <div className="flex flex-col items-center gap-3 w-full">
              <button
                onClick={() => this.clearCacheAndReload()}
                className={cn(
                  "flex items-center justify-center gap-2 px-4 py-2 rounded-lg w-full",
                  "bg-primary text-primary-foreground",
                  "hover:opacity-90 cursor-pointer"
                )}
              >
                <Trash2 size={16} />
                キャッシュクリアして再読み込み
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { window.location.href = '/login'; }}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg",
                    "bg-secondary text-secondary-foreground",
                    "hover:opacity-90 cursor-pointer"
                  )}
                >
                  ログインへ
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg",
                    "bg-secondary text-secondary-foreground",
                    "hover:opacity-90 cursor-pointer"
                  )}
                >
                  <RotateCcw size={16} />
                  再読み込み
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
