import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Pin, ArrowRight, X, Sparkles } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { useAuth } from '@/_core/hooks/useAuth';

const DISMISS_KEY = 'pinned-post-recommendation-dismissed';

/**
 * Highly visible banner that appears on the Dashboard until the user has
 * generated their first 固定投稿 (pinned profile post).
 *
 * Why this is the #1 thing a new user should do:
 * - The pinned post sits at the top of the Threads profile and is the only
 *   safe place to embed a LINE URL directly. Without it, every other post
 *   in the funnel has nowhere to convert visitors.
 * - Source video case studies show creators going from 0 → 月900件 LINE
 *   登録 with the pinned post alone.
 *
 * The banner is dismissible (per-browser via localStorage) and auto-hides
 * once the user has generated at least one pinned post.
 */
export function PinnedPostRecommendation() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  // Hydrate dismiss state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(DISMISS_KEY);
    setDismissed(stored === 'true');
  }, []);

  // Only fire the queries when actually logged in. Unauthenticated calls
  // surface as 401s in tRPC and can race with the auth flow during initial
  // hydration, causing transient render issues.
  const { data, isLoading } = trpc.project.hasPinnedPost.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: projects } = trpc.project.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // Hide while loading, if already created, or if user dismissed this session
  if (!isAuthenticated || isLoading || data?.hasPinnedPost || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, 'true');
  };

  const handleStart = () => {
    const firstProject = projects?.[0];
    if (firstProject) {
      window.location.href = `/ai-generate?project=${firstProject.id}&postType=pinned`;
    } else {
      toast.info('まずはプロジェクト（お店の情報）を登録しましょう');
      setLocation('/ai-project-create');
    }
  };

  return (
    <div className="mb-6 relative overflow-hidden rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-amber-50 to-orange-50 p-5 shadow-md">
      {/* Decorative pin icon backdrop */}
      <div className="absolute -right-6 -top-6 opacity-10 pointer-events-none">
        <Pin className="w-32 h-32 text-amber-700" />
      </div>

      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded hover:bg-amber-200/50 transition-colors text-amber-700"
        aria-label="このおすすめを閉じる"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="relative flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-500 flex items-center justify-center shadow-md">
          <Pin className="w-6 h-6 text-white fill-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-amber-700 bg-amber-200 px-2 py-0.5 rounded uppercase tracking-wider">
              最初に作るのがおすすめ
            </span>
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
          </div>

          <h3 className="text-lg font-bold text-amber-900 mb-2">
            まず「固定投稿」を作りましょう
          </h3>

          <p className="text-sm text-amber-900/80 mb-3 leading-relaxed">
            プロフィールの一番上に固定する「お店の入口」になる投稿です。
            <br />
            <strong>LINE登録のCV直結度が一番高い</strong>ので、これを作ってから他の投稿を始めると効果的です。
          </p>

          <ul className="text-xs text-amber-900/70 mb-4 space-y-1">
            <li>✓ プロフィール訪問者を見込み顧客に変える「入口ページ」</li>
            <li>✓ LINE URLを直接貼ってOKな唯一の場所</li>
            <li>✓ 1度作れば長期間使える（更新頻度は月1回程度でOK）</li>
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleStart}
              className="bg-amber-600 hover:bg-amber-700 text-white shadow"
            >
              <Pin className="w-4 h-4 mr-1.5" />
              固定投稿をAIで作る
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
            <Button
              variant="ghost"
              onClick={handleDismiss}
              className="text-amber-700 hover:bg-amber-100 hover:text-amber-900"
            >
              あとで
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PinnedPostRecommendation;
