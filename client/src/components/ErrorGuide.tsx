import { AlertTriangle, RefreshCw, ExternalLink, HelpCircle, Link2, Sparkles, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type ErrorType =
  | "threads-disconnected"
  | "ai-generation-failed"
  | "post-failed"
  | "generic";

interface ErrorAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "ghost";
}

interface ErrorLink {
  label: string;
  href: string;
}

interface ErrorConfig {
  icon: React.ReactNode;
  title: string;
  description: string;
  actions: ErrorAction[];
  links: ErrorLink[];
  accentColor: string;
  bgColor: string;
  borderColor: string;
}

function getErrorConfig(
  type: ErrorType,
  onAction?: () => void,
  onRetry?: () => void,
  errorMessage?: string
): ErrorConfig {
  switch (type) {
    case "threads-disconnected":
      return {
        icon: <Link2 className="w-5 h-5 text-orange-500" />,
        title: "Threads連携が切れました",
        description:
          "Threadsとの接続が切れています。再連携すると、投稿機能が使えるようになります。",
        actions: [
          {
            label: "再連携する",
            onClick: onAction || (() => (window.location.href = "/threads-connect")),
          },
        ],
        links: [],
        accentColor: "text-orange-600",
        bgColor: "bg-orange-50",
        borderColor: "border-orange-200",
      };

    case "ai-generation-failed":
      return {
        icon: <Sparkles className="w-5 h-5 text-red-500" />,
        title: "AI生成に失敗しました",
        description: errorMessage
          ? `エラー内容: ${errorMessage}`
          : "AI投稿の生成中にエラーが発生しました。しばらく待ってからもう一度お試しください。",
        actions: [
          {
            label: "もう一度試す",
            onClick: onRetry || (() => {}),
          },
        ],
        links: [
          {
            label: "サポートに連絡",
            href: "mailto:support@threads-studio.com",
          },
        ],
        accentColor: "text-red-600",
        bgColor: "bg-red-50",
        borderColor: "border-red-200",
      };

    case "post-failed":
      return {
        icon: <Send className="w-5 h-5 text-red-500" />,
        title: "投稿に失敗しました",
        description:
          "Threadsへの投稿中にエラーが発生しました。Threadsの状態を確認してからもう一度お試しください。",
        actions: [
          {
            label: "再投稿する",
            onClick: onRetry || (() => {}),
          },
        ],
        links: [
          {
            label: "Threadsの状態を確認",
            href: "https://www.threads.net/",
          },
        ],
        accentColor: "text-red-600",
        bgColor: "bg-red-50",
        borderColor: "border-red-200",
      };

    case "generic":
    default:
      return {
        icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
        title: "エラーが発生しました",
        description: errorMessage || "予期しないエラーが発生しました。もう一度お試しください。",
        actions: onRetry
          ? [
              {
                label: "再試行する",
                onClick: onRetry,
              },
            ]
          : [],
        links: [],
        accentColor: "text-amber-600",
        bgColor: "bg-amber-50",
        borderColor: "border-amber-200",
      };
  }
}

interface ErrorGuideProps {
  type: ErrorType;
  /** Custom error message to display (overrides default description) */
  message?: string;
  /** Primary action handler (e.g., navigate to reconnect) */
  onAction?: () => void;
  /** Retry handler */
  onRetry?: () => void;
  /** Additional class names */
  className?: string;
  /** Compact mode for inline usage */
  compact?: boolean;
}

export default function ErrorGuide({
  type,
  message,
  onAction,
  onRetry,
  className = "",
  compact = false,
}: ErrorGuideProps) {
  const config = getErrorConfig(type, onAction, onRetry, message);

  if (compact) {
    return (
      <div
        className={`flex items-start gap-3 p-3 rounded-lg ${config.bgColor} border ${config.borderColor} ${className}`}
      >
        <div className="flex-shrink-0 mt-0.5">{config.icon}</div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${config.accentColor}`}>
            {config.title}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">{config.description}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {config.actions.map((action, i) => (
              <Button
                key={i}
                size="sm"
                variant={action.variant || "default"}
                onClick={action.onClick}
                className="h-7 text-xs px-3"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                {action.label}
              </Button>
            ))}
            {config.links.map((link, i) => (
              <a
                key={i}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
              >
                {link.label}
                <ExternalLink className="w-3 h-3" />
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card
      className={`overflow-hidden border ${config.borderColor} shadow-sm ${className}`}
    >
      <div className={`${config.bgColor} px-5 py-4`}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/80 flex items-center justify-center flex-shrink-0 shadow-sm">
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className={`font-bold text-sm ${config.accentColor}`}>
              {config.title}
            </h4>
            <p className="text-sm text-gray-600 mt-1 leading-relaxed">
              {config.description}
            </p>
          </div>
        </div>
      </div>

      {(config.actions.length > 0 || config.links.length > 0) && (
        <div className="px-5 py-3 flex items-center gap-3 flex-wrap bg-white">
          {config.actions.map((action, i) => (
            <Button
              key={i}
              size="sm"
              variant={action.variant || "default"}
              onClick={action.onClick}
              className="h-8 text-sm"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              {action.label}
            </Button>
          ))}
          {config.links.map((link, i) => (
            <a
              key={i}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              {link.label}
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}
