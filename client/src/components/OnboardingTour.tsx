import { useState, useEffect } from "react";
import { X, ChevronRight, ChevronLeft, Sparkles, FileText, Calendar, Link2, CheckCircle, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  targetElement?: string;
  position: "center" | "top" | "bottom" | "left" | "right";
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Threads Studioへようこそ！",
    description: "このツアーでは、主要機能を簡単にご紹介します。3分程度で完了しますので、ぜひ最後までご覧ください。",
    icon: <Sparkles className="w-8 h-8 text-emerald-600" />,
    position: "center",
  },
  {
    id: "projects",
    title: "プロジェクトとは？",
    description: "プロジェクトは投稿をまとめる『フォルダ』のようなもの。例えば『新メニュー紹介』『お客様の声』など、テーマごとに投稿を整理できます。",
    icon: <FolderOpen className="w-8 h-8 text-orange-500" />,
    position: "center",
  },
  {
    id: "templates",
    title: "テンプレート選択",
    description: "業種や目的に合わせた豊富なテンプレートをご用意。整体院、美容サロン、飲食店など、店舗集客に特化したテンプレートから選択できます。",
    icon: <FileText className="w-8 h-8 text-blue-500" />,
    position: "center",
  },
  {
    id: "ai-generation",
    title: "AI生成機能",
    description: "テンプレートを選んで情報を入力するだけで、効果的なThreads投稿が数秒で完成。安全フィルタで広告規制も自動チェックします。",
    icon: <Sparkles className="w-8 h-8 text-pink-500" />,
    position: "center",
  },
  {
    id: "scheduled-posts",
    title: "予約投稿機能",
    description: "最適なタイミングで自動投稿。スケジュール管理で投稿を忘れる心配はありません。複数の投稿を事前に準備できます。",
    icon: <Calendar className="w-8 h-8 text-emerald-500" />,
    position: "center",
  },
  {
    id: "threads-connect",
    title: "Threads連携",
    description: "Threadsアカウントを連携すると、アプリから直接投稿できます。複数アカウントの管理も可能です。",
    icon: <Link2 className="w-8 h-8 text-blue-500" />,
    position: "center",
  },
  {
    id: "complete",
    title: "準備完了！",
    description: "これでThreads Studioの基本機能をご理解いただけました。さっそくテンプレートを選んで、最初の投稿を作成してみましょう！",
    icon: <CheckCircle className="w-8 h-8 text-emerald-500" />,
    position: "center",
  },
];

interface OnboardingTourProps {
  open: boolean;
  onClose: () => void;
}

export default function OnboardingTour({ open, onClose }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const completeMutation = trpc.onboarding.complete.useMutation();

  const currentStepData = ONBOARDING_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;
  const progress = ((currentStep + 1) / ONBOARDING_STEPS.length) * 100;

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = async () => {
    await handleComplete();
  };

  const handleComplete = async () => {
    try {
      await completeMutation.mutateAsync();
      toast.success("オンボーディングツアーを完了しました！");
      onClose();
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
      onClose();
    }
  };

  useEffect(() => {
    if (open) {
      setCurrentStep(0);
    }
  }, [open]);

  if (!open || !currentStepData) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleSkip}
      />

      {/* Tour Card */}
      <div className="relative z-10 w-full max-w-2xl mx-4">
        <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-2xl">
          {/* Close Button */}
          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="スキップ"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">
              {currentStep + 1} / {ONBOARDING_STEPS.length}
            </p>
          </div>

          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center">
              {currentStepData.icon}
            </div>
          </div>

          {/* Content */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              {currentStepData.title}
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              {currentStepData.description}
            </p>
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between gap-4">
            <Button
              variant="ghost"
              onClick={handlePrevious}
              disabled={isFirstStep}
              className="text-gray-500 hover:text-gray-700 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              前へ
            </Button>

            <div className="flex gap-2">
              {!isLastStep && (
                <Button
                  variant="ghost"
                  onClick={handleSkip}
                  className="text-gray-500 hover:text-gray-700"
                >
                  スキップ
                </Button>
              )}
              <Button
                onClick={handleNext}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8"
              >
                {isLastStep ? "完了" : "次へ"}
                {!isLastStep && <ChevronRight className="w-4 h-4 ml-2" />}
              </Button>
            </div>
          </div>

          {/* Step Indicators */}
          <div className="flex justify-center gap-2 mt-6">
            {ONBOARDING_STEPS.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  index === currentStep
                    ? "bg-emerald-500 w-8"
                    : index < currentStep
                    ? "bg-emerald-300"
                    : "bg-gray-200"
                }`}
                aria-label={`ステップ ${index + 1} に移動`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
