import { useState, useEffect, useCallback } from "react";
import { X, ChevronRight, ChevronLeft, Link2, Sparkles, ToggleRight, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const STORAGE_KEY = "onboarding-completed";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  targetSelector?: string;
  highlightLabel: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "threads-connect",
    title: "Threadsアカウントを連携しましょう",
    description:
      "ようこそ！まずはThreadsアカウントを連携しましょう。連携すると、アプリから直接Threadsへ投稿できるようになります。",
    icon: <Link2 className="w-7 h-7 text-blue-500" />,
    targetSelector: '[data-tour="threads-connect"]',
    highlightLabel: "Threads連携",
  },
  {
    id: "ai-generate",
    title: "AI投稿生成",
    description:
      "AI投稿生成で、あなたの業種に合った投稿を自動作成します。テンプレートを選ぶだけで、集客に効果的な文章がすぐに完成します。",
    icon: <Sparkles className="w-7 h-7 text-amber-500" />,
    targetSelector: '[data-tour="ai-generate"]',
    highlightLabel: "AI投稿生成",
  },
  {
    id: "auto-post",
    title: "自動投稿をONに",
    description:
      "自動投稿をONにすると、毎日自動で投稿されます。忙しい日でも投稿を忘れる心配はありません。",
    icon: <ToggleRight className="w-7 h-7 text-emerald-500" />,
    targetSelector: '[data-tour="auto-post"]',
    highlightLabel: "自動投稿",
  },
  {
    id: "analytics",
    title: "投稿分析で効果を確認",
    description:
      "投稿分析で効果を確認できます。どの投稿が反応が良いかを把握して、次の投稿に活かしましょう。",
    icon: <BarChart3 className="w-7 h-7 text-purple-500" />,
    targetSelector: '[data-tour="analytics"]',
    highlightLabel: "投稿分析",
  },
];

interface OnboardingTourProps {
  open: boolean;
  onClose: () => void;
}

export default function OnboardingTour({ open, onClose }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const completeMutation = trpc.onboarding.complete.useMutation();

  const step = ONBOARDING_STEPS[currentStep];
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;
  const totalSteps = ONBOARDING_STEPS.length;

  const updateTargetRect = useCallback(() => {
    if (!step?.targetSelector) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(step.targetSelector);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [step]);

  useEffect(() => {
    if (!open) return;
    setCurrentStep(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    updateTargetRect();
    const handleResize = () => updateTargetRect();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [open, currentStep, updateTargetRect]);

  const handleComplete = async () => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
      await completeMutation.mutateAsync();
      toast.success("ツアーを完了しました！さっそく始めましょう");
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
    }
    onClose();
  };

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  if (!open || !step) return null;

  const padding = 12;
  const hasTarget = targetRect !== null;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Semi-transparent overlay with cutout */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: "none" }}
      >
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {hasTarget && (
              <rect
                x={targetRect.left - padding}
                y={targetRect.top - padding}
                width={targetRect.width + padding * 2}
                height={targetRect.height + padding * 2}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.55)"
          mask="url(#tour-mask)"
          style={{ pointerEvents: "auto" }}
          onClick={handleSkip}
        />
      </svg>

      {/* Highlight ring */}
      {hasTarget && (
        <div
          className="absolute border-2 border-amber-400 rounded-xl pointer-events-none animate-pulse"
          style={{
            left: targetRect.left - padding,
            top: targetRect.top - padding,
            width: targetRect.width + padding * 2,
            height: targetRect.height + padding * 2,
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="absolute z-10"
        style={
          hasTarget
            ? {
                left: Math.min(
                  Math.max(targetRect.left, 16),
                  window.innerWidth - 380
                ),
                top: targetRect.bottom + padding + 16,
                ...(targetRect.bottom + 280 > window.innerHeight
                  ? {
                      top: "auto" as any,
                      bottom:
                        window.innerHeight - targetRect.top + padding + 16,
                    }
                  : {}),
              }
            : {
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
              }
        }
      >
        <div className="bg-white rounded-2xl shadow-2xl border border-border/50 w-[360px] max-w-[calc(100vw-32px)] overflow-hidden">
          {/* Warm gradient header */}
          <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 px-6 pt-5 pb-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/80 shadow-sm flex items-center justify-center flex-shrink-0">
              {step.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-600 mb-0.5">
                ステップ {currentStep + 1}/{totalSteps}
              </p>
              <h3 className="text-base font-bold text-foreground leading-tight">
                {step.title}
              </h3>
            </div>
            <button
              onClick={handleSkip}
              className="text-muted-foreground/60 hover:text-muted-foreground transition-colors flex-shrink-0 -mt-2 -mr-1"
              aria-label="閉じる"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {step.description}
            </p>
          </div>

          {/* Step dots + buttons */}
          <div className="px-6 pb-5 flex items-center justify-between">
            <div className="flex gap-1.5">
              {ONBOARDING_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === currentStep
                      ? "w-6 bg-amber-500"
                      : i < currentStep
                      ? "w-1.5 bg-amber-300"
                      : "w-1.5 bg-muted"
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePrev}
                  className="text-muted-foreground hover:text-foreground h-8 px-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  前へ
                </Button>
              )}
              {!isLastStep && (
                <button
                  onClick={handleSkip}
                  className="text-xs text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-2 mr-1"
                >
                  スキップ
                </button>
              )}
              <Button
                size="sm"
                onClick={handleNext}
                className="bg-amber-500 hover:bg-amber-600 text-white h-8 px-4 shadow-sm"
              >
                {isLastStep ? "完了" : "次へ"}
                {!isLastStep && <ChevronRight className="w-3.5 h-3.5 ml-1" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
